import { test, expect } from "@playwright/test";
import { random, randomState } from "../../shared/random.js";
import { layout } from "../../shared/arena-layout.js";
import { idle } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("legal actions and movement remain clear without redundant panels across viewports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  const source = randomState(1);
  await page.evaluate(
    (values) => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (
          array instanceof Uint32Array &&
          array.length === 1 &&
          values.length
        ) {
          array[0] = values.shift()!;
          return array;
        }
        return original(array);
      };
    },
    Array.from({ length: 100 }, () => random(source) * 0x100000000),
  );
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  await expect(page.locator(".arena-shell")).not.toHaveClass(
    /preparing-position/,
  );
  await idle(page);
  await expect(page.locator(".context-origin")).toContainText(
    "Invocação · Você",
  );
  const crystal = page.getByRole("button", {
    name: /^Selecionar Cristal Primordial/,
  });
  await crystal.click();
  await expect(
    page.getByRole("button", { name: "Conjurar · 3 PE" }),
  ).toBeDisabled();
  await expect(page.locator(".action-requirement")).toContainText(
    "Magia lenta · fase de Magia",
  );
  await expect(crystal).toHaveAttribute(
    "aria-label",
    /Magia lenta · fase de Magia/,
  );
  await crystal.hover();
  await expect(page.locator(".hand-action-hint")).toBeVisible();
  await expect(async () => {
    const hint = (await page.locator(".hand-action-hint").boundingBox())!;
    for (const art of await page.locator(".fan-art").all()) {
      const card = (await art.boundingBox())!;
      expect(
        hint.y + hint.height <= card.y ||
          hint.x + hint.width <= card.x ||
          hint.x >= card.x + card.width,
      ).toBe(true);
    }
  }).toPass();
  await mkdir(".sited/qa-tactics", { recursive: true });
  await page.screenshot({ path: ".sited/qa-tactics/unavailable-card.png" });
  await page.keyboard.press("Escape");
  const snake = page.getByRole("button", {
    name: /^Selecionar Serpente de Gelo/,
  });
  // Aim at the exposed left edge of the fanned card, not its covered center.
  await snake.click({ position: { x: 14, y: 70 } });
  const point = layout(1920, 1080).point(0, 0);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".action-preview")).toHaveCount(0);
  await page.mouse.click(point.x, point.y);
  await idle(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".arena-hover")).toContainText("Serpente de Gelo");
  await expect(page.locator(".arena-hover")).not.toContainText("Invocado");
  await page.keyboard.press("f");
  await expect(
    page.getByRole("dialog", { name: "Serpente de Gelo" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Concluir invocações" }).click();
  await expect(
    page.getByRole("button", { name: "Concluir movimentos" }),
  ).toBeEnabled({ timeout: 20000 });
  await idle(page);
  const from = layout(1920, 1080).point(0, 2),
    to = layout(1920, 1080).point(0, 3);
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(to.x, to.y);
  await expect(page.locator(".action-preview")).toHaveCount(0);
  await mkdir(".sited/qa-tactics", { recursive: true });
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
    [1600, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".arena-canvas canvas")).toHaveAttribute(
      "width",
      String(width),
    );
    await page.mouse.move(1, height / 2);
    const aim = layout(width, height).point(0, 3);
    await page.mouse.move(aim.x, aim.y);
    await expect(page.locator(".action-preview")).toHaveCount(0);
    await page.screenshot({ path: `.sited/qa-tactics/preview-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("spell outcomes, pending combat and status sources are readable in a controlled duel", async ({
  page,
}) => {
  await mkdir(".sited/qa-tactics", { recursive: true });
  // Use the real engine behind an isolated transport to reach combat without
  // depending on a random opening hand or creating extra online accounts.
  const { freshGame, apply } = await import("../../shared/game.js");
  const { makeUnit } = await import("../../shared/rules/core.js");
  const { starterDeck } = await import("../../shared/practice.js");
  const { publicRoom } = await import("../../shared/visibility.js");
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 3;
  g.phaseOwner = 0;
  g.priority = 0;
  g.players[0].pe = 5;
  g.players[0].hand = ["gishikido-n-3-cura-da-agua"];
  const snake = makeUnit(g, 0, "serpente-de-gelo", 2, 2),
    enemy = makeUnit(g, 1, "lobo-branco", 3, 2);
  snake.summonedTurn = 1;
  snake.hp = 1;
  enemy.summonedTurn = 1;
  enemy.hp = 9;
  enemy.maxHp = 9;
  enemy.speed = 1;
  g.units.push(snake, enemy);
  const snapshot = () =>
    publicRoom(
      {
        code: "UXTEST",
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
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth")
      return route.fulfill({
        json: {
          userId: "a",
          displayName: "Você",
          isAuthenticated: true,
          isLoading: false,
        },
      });
    if (url.pathname.endsWith("/myRooms"))
      return route.fulfill({
        json: { result: [{ code: "UXTEST", status: "playing" }] },
      });
    if (url.pathname.endsWith("/room"))
      return route.fulfill({ json: { result: snapshot() } });
    if (url.pathname.endsWith("/gameCommand")) {
      const [, cmd] = route.request().postDataJSON().args;
      const error = apply(g, 0, cmd);
      if (!error) g.revision = (g.revision || 0) + 1;
      return route.fulfill({ json: { result: { error, room: snapshot() } } });
    }
    return route.fulfill({ json: { result: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /UXTEST/ }).click();
  await idle(page);
  await page.getByRole("button", { name: /^Selecionar Gishikido/ }).click();
  await expect(
    page.getByRole("button", { name: "Conjurar · 1 PE" }),
  ).toBeDisabled();
  const from = layout(1440, 1000).point(2, 2),
    to = layout(1440, 1000).point(3, 2);
  await page.mouse.click(from.x, from.y);
  await expect(page.locator(".action-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Conjurar · 1 PE" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Conjurar · 1 PE" }).click();
  await idle(page);
  expect(snake.hp).toBe(2);
  await page.getByRole("button", { name: "Abrir histórico" }).click();
  await expect(
    page.getByRole("dialog", { name: "Histórico da partida" }),
  ).toContainText("Vida 1 → 2");
  await page.getByRole("button", { name: "Fechar histórico" }).click();
  g.phase = 2;
  g.revision = (g.revision || 0) + 1;
  send();
  await expect(page.locator(".context-origin")).toContainText(
    "Movimento · Você",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(to.x, to.y);
  await expect(
    page.getByRole("region", { name: "Prévia do combate" }),
  ).toContainText("Derrotado");
  await expect(page.locator(".forecast-fighter")).toHaveCount(2);
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const aim = layout(width, height).point(3, 2);
    await page.mouse.move(aim.x, aim.y);
    const forecast = page.getByRole("region", { name: "Prévia do combate" });
    await expect(async () => {
      // Pixi resizes on the next frame; aim again after the viewport settles.
      await page.mouse.move(aim.x + 3, aim.y);
      await page.mouse.move(aim.x, aim.y);
      await expect(forecast).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await expect(forecast).toHaveCSS("pointer-events", "none");
    const box = (await forecast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    const button = (await page.locator(".arena-pass").boundingBox())!;
    expect(
      box.x + box.width <= button.x ||
        box.y + box.height <= button.y ||
        box.x >= button.x + button.width ||
        box.y >= button.y + button.height,
      "Forecast must not cover the phase action",
    ).toBe(true);
    // The comparison should leave the two actual pieces visible on the board.
    for (const x of [2, 3]) {
      const piece = layout(width, height).point(x, 2);
      expect(
        piece.x < box.x ||
          piece.x > box.x + box.width ||
          piece.y < box.y ||
          piece.y > box.y + box.height,
      ).toBe(true);
    }
    await page.screenshot({
      path: `.sited/qa-tactics/combat-preview-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(to.x, to.y);
  await expect(page.locator(".duel-context h1")).toHaveText(
    "Resposta de Oponente",
  );
  await expect(page.locator(".combat-forecast")).toContainText(
    "Combate anunciado",
  );
  await page.screenshot({ path: ".sited/qa-tactics/combat-response.png" });
  expect(apply(g, 1, { type: "pass" })).toBeUndefined();
  expect(apply(g, 0, { type: "pass" })).toBeUndefined();
  g.revision = (g.revision || 0) + 1;
  send();
  await idle(page);
  await page.mouse.move(to.x, to.y);
  await expect(page.locator(".arena-hover")).toContainText("Velocidade −1");
  await page.keyboard.press("f");
  await page
    .getByRole("button", { name: "Velocidade −1", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Redução permanente causada por Serpente de Gelo",
  );
  await page.screenshot({ path: ".sited/qa-tactics/unit-source.png" });
  await page.keyboard.press("Escape");
  const waiting = makeUnit(g, 0, "taodu-katana", 1, 3);
  const moved = makeUnit(g, 0, "india-do-norte", 2, 3);
  moved.summonedTurn = 1;
  g.moved.push(moved.id);
  g.units.push(waiting, moved);
  g.revision = (g.revision || 0) + 1;
  send();
  await idle(page);
  await page.mouse.move(100, 400);
  await page.screenshot({ path: ".sited/qa-tactics/piece-states.png" });
});
