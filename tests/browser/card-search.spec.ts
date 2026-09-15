import { test, expect } from "@playwright/test";
import { freshGame, apply } from "../../shared/game.js";
import { starterDeck } from "../../shared/practice.js";
import { publicRoom } from "../../shared/visibility.js";
import { layout } from "../../shared/arena-layout.js";
import { summonEffects } from "../../shared/rules/units.js";
import { makeUnit } from "../../shared/rules/core.js";
import { spawnCurse } from "../../shared/rules/curses.js";
import { idle } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("Curador search is private, inspectable, responsive and puts the chosen card in hand", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const g = freshGame("a", "b", starterDeck("fogo"), starterDeck("agua"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 1;
  g.phaseOwner = g.priority = 0;
  g.players[0].pe = 10;
  g.players[0].hand = ["taodu-curador"];
  g.players[0].library = [
    "taodu-katana",
    "taodu-ferreiro",
    "taodu-katana",
    "taodu-corrupto",
    "lobo-branco",
  ];
  const snapshot = () =>
    publicRoom(
      {
        code: "SEARCH",
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
        json: { result: [{ code: "SEARCH", status: "playing" }] },
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
  await page.getByRole("button", { name: /SEARCH/ }).click();
  await idle(page);
  await page.getByRole("button", { name: /^Selecionar Taodu Curador/ }).click();
  const spot = layout(1440, 1000).point(0, 0);
  await page.mouse.click(spot.x, spot.y);
  const dialog = page.getByRole("dialog", { name: "Busca de Taodu Curador" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".choice-card")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "Escolha uma carta", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: /Escolher Taodu Katana/ })
    .click({ button: "right" });
  await expect(
    page.getByRole("dialog", { name: "Taodu Katana", exact: true }),
  ).toContainText("Pular");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await mkdir(".sited/qa-search", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await dialog
      .getByRole("button", { name: /Escolher Taodu Ferreiro/ })
      .click();
    const confirm = dialog.getByRole("button", {
      name: "Adicionar Taodu Ferreiro à mão",
    });
    await confirm.scrollIntoViewIfNeeded();
    const bounds = (await confirm.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const heading = (await dialog.getByRole("heading").boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(0);
    const art = (await dialog
      .getByRole("button", { name: /Escolher Taodu Katana/ })
      .boundingBox())!;
    expect(art.y + art.height).toBeLessThan(bounds.y);
    await page.screenshot({ path: `.sited/qa-search/choice-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "Adicionar Taodu Ferreiro à mão" })
    .click();
  await expect(dialog).toHaveCount(0);
  await idle(page);
  expect(g.players[0].hand).toEqual(["taodu-ferreiro"]);
  await expect(
    page.getByRole("button", { name: /^Selecionar Taodu Ferreiro/ }),
  ).toBeVisible();
  g.players[0].library = ["lobo-branco"];
  summonEffects(g, makeUnit(g, 0, "taodu-curador", 0, 4));
  g.revision!++;
  send();
  await expect(dialog).toContainText("Não há cartas compatíveis");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  g.players[1].library = ["taodu-katana"];
  summonEffects(g, makeUnit(g, 1, "taodu-curador", 6, 4));
  g.revision!++;
  send();
  await expect(page.locator(".duel-context h1")).toContainText(
    "buscando uma carta",
  );
  await expect(page.locator(".search-choice")).toHaveCount(0);
  expect(
    apply(g, 1, {
      type: "search",
      promptId: g.searches![0].id,
      choice: "skip",
    }),
  ).toBeUndefined();
  const curse = spawnCurse(g, 0, 2);
  g.revision!++;
  send();
  await expect(page.locator(".arena-shell")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await idle(page);
  const curseSpot = layout(1440, 1000).point(curse.x, curse.y);
  await page.mouse.move(curseSpot.x, curseSpot.y);
  await expect(page.locator(".arena-hover")).toBeVisible();
  await page.keyboard.press("f");
  await expect(page.locator(".card-focus")).toContainText("Maldição · Nível 2");
  await page.screenshot({ path: ".sited/qa-search/curse.png" });
  await page.keyboard.press("Escape");
  g.phase = 4;
  g.priority = g.phaseOwner = 0;
  g.players[0].hand = [
    "suineko-o-gato-aquatico",
    "serpente-de-gelo",
    "gishikido-n-7-cura-da-agua",
    "besouro-pescador",
    "cabra-dos-alpes",
    "mamoru-n-5-transferencia-espiritual",
  ];
  g.revision!++;
  send();
  const discard = page.getByRole("dialog", {
    name: "Converter cartas em reserva",
  });
  await expect(discard).toBeVisible();
  const choice = discard.locator(".choice-art").first();
  await choice.click();
  await choice.click({ button: "right" });
  await expect(page.locator(".card-focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(discard.locator(".choice-zoom, .choice-check")).toHaveCount(0);
    await page.screenshot({ path: `.sited/qa-search/discard-${width}.png` });
  }
  await discard.getByRole("button", { name: /Descartar 1 carta/ }).click();
  expect(g.players[0].permanentPe).toBe(1);
  expect(g.players[0].hand).not.toContain("suineko-o-gato-aquatico");
  expect(errors).toEqual([]);
});
