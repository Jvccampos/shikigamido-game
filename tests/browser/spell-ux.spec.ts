import { test, expect } from "@playwright/test";
import { freshGame, apply } from "../../shared/game.js";
import { makeUnit } from "../../shared/rules/core.js";
import { starterDeck } from "../../shared/practice.js";
import { layout } from "../../shared/arena-layout.js";
import { idle, scenario } from "./fixtures.js";
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
  const send = await scenario(page, g, "SPELLS");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: /SPELLS/ }).click();
  await idle(page);
  await page.getByRole("button", { name: /^Selecionar Gishikido/ }).click();
  const om = layout(1920, 1080).point(0, 2),
    target = layout(1920, 1080).point(2, 2);
  await page.mouse.click(om.x, om.y);
  await expect(
    page.getByText("Alvo 1: Takaya Isen", { exact: true }),
  ).toHaveCount(0);
  expect(g.players[0].hand).toHaveLength(2);
  await page.mouse.click(target.x, target.y);
  await mkdir(".sited/qa-spell-ux", { recursive: true });
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
    [1600, 900],
  ]) {
    await page.setViewportSize({ width, height });
    const dock = page.getByRole("region", { name: "Ação da carta" });
    await expect(dock).toBeVisible();
    await page.screenshot({ path: `.sited/qa-spell-ux/target-${width}.png` });
    const box = (await dock.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.x).toBeGreaterThan(layout(width, height).point(6.85, 3).x);
    const point = layout(width, height).point(2, 2);
    expect(
      point.x < box.x ||
        point.x > box.x + box.width ||
        point.y < box.y ||
        point.y > box.y + box.height,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: "Conjurar · 2 PE" }).click();
  await expect(page.locator(".stack-card")).toHaveCount(1);
  await page.getByRole("button", { name: /^Selecionar Mamoru/ }).click();
  const selectedBox = (await page.locator(".action-dock").boundingBox())!;
  const stackBox = (await page.locator(".arena-stack-panel").boundingBox())!;
  const passBox = (await page.locator(".arena-pass").boundingBox())!;
  expect(selectedBox.y + selectedBox.height).toBeLessThanOrEqual(stackBox.y);
  expect(stackBox.y + stackBox.height).toBeLessThanOrEqual(passBox.y);
  expect(selectedBox.x).toBe(stackBox.x);
  await page.screenshot({ path: ".sited/qa-spell-ux/sidebar-stack.png" });
  await page.getByRole("button", { name: "Cancelar seleção" }).click();
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
  const k = layout(1920, 1080).point(3, 3);
  await page.mouse.click(k.x, k.y, { button: "right" });
  await page.getByRole("button", { name: "Pular", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "horizontal ou vertical",
  );
  await page.screenshot({ path: ".sited/qa-spell-ux/keyword.png" });
  await page.getByRole("button", { name: "Fechar carta" }).click();
  g.players[0].pe = 0;
  g.players[0].hand = [
    "gishikido-n-7-cura-da-agua",
    "mamoru-n-18-pele-de-ourico",
  ];
  g.revision!++;
  send();
  const unavailable = page.getByRole("button", {
    name: /^Selecionar Gishikido/,
  });
  await expect(unavailable).toHaveAttribute("aria-label", /Faltam/);
  await page.mouse.move(100, 600);
  await unavailable.hover();
  const positions = await page.evaluate(async () => {
    const positions: { x: number; y: number }[] = [];
    const start = performance.now();
    while (performance.now() - start < 400) {
      const hint = document.querySelector(".hand-action-hint")!;
      const r = hint.getBoundingClientRect();
      positions.push({ x: r.x, y: r.y });
      await new Promise(requestAnimationFrame);
    }
    return positions;
  });
  expect(
    Math.max(...positions.map((p) => p.x)) -
      Math.min(...positions.map((p) => p.x)),
  ).toBeLessThan(1);
  expect(
    Math.max(...positions.map((p) => p.y)) -
      Math.min(...positions.map((p) => p.y)),
  ).toBeLessThan(1);
  expect(Math.min(...positions.map((p) => p.x))).toBeGreaterThan(
    layout(1920, 1080).point(6.85, 3).x,
  );
  await expect(page.locator(".hand-action-hint")).toContainText("Faltam 2 PE");
  await page.screenshot({ path: ".sited/qa-spell-ux/fixed-hand-feedback.png" });
});
