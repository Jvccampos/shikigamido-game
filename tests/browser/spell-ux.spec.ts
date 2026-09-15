import { test, expect } from "@playwright/test";
import { freshGame, apply } from "../../shared/game.js";
import { makeUnit } from "../../shared/rules/core.js";
import { starterDeck } from "../../shared/practice.js";
import { publicRoom } from "../../shared/visibility.js";
import { layout } from "../../shared/arena-layout.js";
import { idle } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("spell targeting rejects Omionjis and exposes granted effects on the affected card", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 3;
  g.phaseOwner = g.priority = 0;
  g.players[0].pe = 10;
  g.players[0].hand = [
    "gishikido-n-7-cura-da-agua",
    "mamoru-n-18-pele-de-ourico",
  ];
  const snake = makeUnit(g, 0, "serpente-de-gelo", 2, 2);
  snake.summonedTurn = 1;
  snake.hp = 1;
  g.units.push(snake);
  const snapshot = () =>
    publicRoom(
      {
        code: "SPELLS",
        hostId: "a",
        status: "playing",
        state: g,
        spectators: [
          { id: "a", name: "Você" },
          { id: "b", name: "Oponente" },
        ],
      },
      "a",
    );
  let send = () => {};
  await page.routeWebSocket("**/socket", (socket) => {
    send = () =>
      socket.send(JSON.stringify({ type: "room", room: snapshot() }));
    socket.onMessage(send);
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth")
      return route.fulfill({
        json: {
          userId: "a",
          displayName: "Você",
          isAuthenticated: true,
          isLoading: false,
        },
      });
    if (path.endsWith("/myRooms"))
      return route.fulfill({
        json: { result: [{ code: "SPELLS", status: "playing" }] },
      });
    if (path.endsWith("/room"))
      return route.fulfill({ json: { result: snapshot() } });
    if (path.endsWith("/gameCommand")) {
      const [, cmd] = route.request().postDataJSON().args;
      const error = apply(g, 0, cmd);
      if (!error) g.revision = (g.revision || 0) + 1;
      return route.fulfill({ json: { result: { error, room: snapshot() } } });
    }
    return route.fulfill({ json: { result: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /SPELLS/ }).click();
  await idle(page);
  await page.getByRole("button", { name: /^Selecionar Gishikido/ }).click();
  const om = layout(1440, 1000).point(0, 2),
    target = layout(1440, 1000).point(2, 2);
  await page.mouse.click(om.x, om.y);
  await expect(
    page.getByText("Alvo 1: Takaya Isen", { exact: true }),
  ).toHaveCount(0);
  expect(g.players[0].hand).toHaveLength(2);
  await page.mouse.click(target.x, target.y);
  await mkdir(".sited/qa-spell-ux", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const dock = page.getByRole("region", { name: "Ação da carta" });
    await expect(dock).toBeVisible();
    await page.screenshot({ path: `.sited/qa-spell-ux/target-${width}.png` });
    const box = (await dock.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const point = layout(width, height).point(2, 2);
    expect(
      point.x < box.x ||
        point.x > box.x + box.width ||
        point.y < box.y ||
        point.y > box.y + box.height,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Conjurar · 2 PE" }).click();
  await expect(page.locator(".stack-card")).toHaveCount(1);
  await expect(page.locator(".stack-card")).toHaveCount(1);
  expect(apply(g, 1, { type: "pass" })).toBeUndefined();
  expect(apply(g, 0, { type: "pass" })).toBeUndefined();
  g.revision!++;
  send();
  await expect(page.locator(".stack-card")).toHaveCount(0);
  await idle(page);
  expect(snake.statuses?.healSplash).toBeTruthy();
  await page.getByRole("button", { name: /^Selecionar Mamoru/ }).click();
  await page.mouse.click(target.x, target.y);
  await page.getByRole("button", { name: "Conjurar · 2 PE" }).click();
  await expect(page.locator(".stack-card")).toHaveCount(1);
  expect(apply(g, 1, { type: "pass" })).toBeUndefined();
  expect(apply(g, 0, { type: "pass" })).toBeUndefined();
  g.revision!++;
  send();
  await expect(page.locator(".stack-card")).toHaveCount(0);
  await idle(page);
  expect(snake.statuses?.devolver).toBe(2);
  await page.mouse.move(target.x, target.y);
  await expect(page.locator(".arena-hover")).toContainText("Devolver 2");
  await page.screenshot({ path: ".sited/qa-spell-ux/board-effects.png" });
  await page.mouse.click(target.x, target.y, { button: "right" });
  await expect(page.locator(".card-focus")).toContainText("Devolver 2");
  await mkdir(".sited/qa-spell-ux", { recursive: true });
  await page.getByRole("button", { name: "Devolver 2", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("+2 de ataque");
  await page.screenshot({ path: ".sited/qa-spell-ux/effects.png" });
  await page.getByRole("button", { name: "Fechar carta" }).click();
  const katana = makeUnit(g, 0, "taodu-katana", 3, 3);
  g.units.push(katana);
  g.revision!++;
  send();
  await idle(page);
  await expect(
    page.getByRole("button", { name: /Taodu Katana:.*vida em/ }),
  ).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const k = layout(1440, 1000).point(3, 3);
  await page.mouse.click(k.x, k.y, { button: "right" });
  await page.getByRole("button", { name: "Pular", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "horizontal ou vertical",
  );
  await page.screenshot({ path: ".sited/qa-spell-ux/keyword.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("button", { name: "Pular", exact: true }).click();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const box = (await tooltip.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: ".sited/qa-spell-ux/keyword-mobile.png" });
  await page.getByRole("button", { name: "Fechar carta" }).click();
  await expect(tooltip).toHaveCount(0);
});
