import { test, expect } from "@playwright/test";
import { random, randomState } from "../../shared/random.js";
import { layout } from "../../shared/arena-layout.js";
import { idle } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("legal actions, movement previews and unit explanations stay usable across viewports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await expect(crystal).toHaveAttribute("title", "Magia lenta · fase de Magia");
  await page.keyboard.press("Escape");
  const snake = page.getByRole("button", {
    name: /^Selecionar Serpente de Gelo/,
  });
  await snake.click();
  const point = layout(1440, 1000).point(0, 0);
  await page.mouse.move(point.x, point.y);
  await expect(
    page.getByRole("region", { name: "Prévia da ação" }),
  ).toContainText("Invocar");
  await expect(page.locator(".preview-cost")).toContainText("1 PE");
  await page.mouse.click(point.x, point.y);
  await idle(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".arena-hover")).toContainText("Invocado");
  await page.keyboard.press("f");
  await expect(
    page.getByRole("dialog", { name: "Serpente de Gelo" }),
  ).toContainText("Movimento liberado no próximo turno");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Concluir invocações" }).click();
  await expect(
    page.getByRole("button", { name: "Concluir movimentos" }),
  ).toBeEnabled({ timeout: 20000 });
  await idle(page);
  const from = layout(1440, 1000).point(0, 2),
    to = layout(1440, 1000).point(0, 3);
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(to.x, to.y);
  await expect(page.locator(".preview-cost")).toContainText("Sem custo");
  await expect(page.locator(".action-preview")).toContainText("Destino A4");
  await mkdir(".sited/qa-tactics", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const aim = layout(width, height).point(0, 3);
    await page.mouse.move(aim.x, aim.y);
    await expect(page.locator(".action-preview")).toBeVisible();
    await page.screenshot({ path: `.sited/qa-tactics/preview-${width}.png` });
    const preview = (await page
        .locator(".arena-action-preview")
        .boundingBox())!,
      button = (await page.locator(".arena-pass").boundingBox())!;
    expect(
      preview.y + preview.height <= button.y ||
        preview.x + preview.width <= button.x ||
        button.x + button.width <= preview.x ||
        button.y + button.height <= preview.y,
      "Preview must not cover the phase action",
    ).toBe(true);
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
  await expect(page.locator(".action-preview")).toContainText("Vida 1 → 2");
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
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(to.x, to.y);
  await expect(page.locator(".action-preview")).toContainText("contra-ataque");
  await page.screenshot({ path: ".sited/qa-tactics/combat-preview.png" });
  await page.mouse.click(to.x, to.y);
  await expect(page.locator(".duel-context h1")).toHaveText(
    "Resposta de Oponente",
  );
  await expect(
    page.locator(".arena-stack-panel .action-preview"),
  ).toContainText("Combate anunciado");
  await page.screenshot({ path: ".sited/qa-tactics/combat-response.png" });
  expect(apply(g, 1, { type: "pass" })).toBeUndefined();
  expect(apply(g, 0, { type: "pass" })).toBeUndefined();
  g.revision = (g.revision || 0) + 1;
  send();
  await idle(page);
  await page.mouse.move(to.x, to.y);
  await page.keyboard.press("f");
  await expect(page.getByRole("dialog", { name: "Lobo Branco" })).toContainText(
    "Redução permanente causada por Serpente de Gelo",
  );
  await page.screenshot({ path: ".sited/qa-tactics/unit-source.png" });
});
