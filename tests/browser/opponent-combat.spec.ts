import { test, expect } from "@playwright/test";
import { freshGame, apply } from "../../shared/game.js";
import { makeUnit } from "../../shared/rules/core.js";
import { starterDeck } from "../../shared/practice.js";
import { layout } from "../../shared/arena-layout.js";
import { idle, scenario } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("opponent combat stays visible while a selected defender is aimed elsewhere", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 2;
  g.phaseOwner = g.priority = 1;
  const defender = makeUnit(g, 0, "serpente-de-gelo", 2, 2);
  const attacker = makeUnit(g, 1, "lobo-branco", 3, 2);
  defender.summonedTurn = attacker.summonedTurn = 1;
  g.units.push(defender, attacker);
  const send = await scenario(page, g, "UXTEST");
  await page.goto("/");
  await page.getByRole("button", { name: /UXTEST/ }).click();
  await idle(page);
  const d = layout(1440, 1000).point(2, 2);
  await page.mouse.click(d.x, d.y);
  expect(
    apply(g, 1, { type: "move", unitId: attacker.id, x: 2, y: 2 }),
  ).toBeUndefined();
  g.revision = (g.revision || 0) + 1;
  send();
  await expect(page.locator(".duel-context h1")).toHaveText("Sua resposta");
  for (const point of [layout(1440, 1000).point(4, 4), { x: 120, y: 400 }, d]) {
    await page.mouse.move(point.x, point.y);
    await expect(
      page.getByRole("region", { name: "Prévia do combate" }),
    ).toBeVisible();
  }
  g.players[0].hand = ["mamoru-n-18-pele-de-ourico"];
  g.players[0].pe = 5;
  expect(
    apply(g, 0, {
      type: "cast",
      cardId: g.players[0].hand[0],
      handIndex: 0,
      targetId: defender.id,
    }),
  ).toBeUndefined();
  g.revision = (g.revision || 0) + 1;
  send();
  await expect(page.locator(".stack-card")).toContainText("Pele de Ouriço");
  await expect(page.locator(".combat-forecast")).toContainText(
    "Magias pendentes",
  );
  await idle(page);
  await mkdir(".sited/qa-tactics", { recursive: true });
  await page.screenshot({ path: ".sited/qa-tactics/opponent-pending.png" });
});
