import { test, expect } from "@playwright/test";
import { freshGame } from "../../shared/game.js";
import { resolveSpell } from "../../shared/rules/spells.js";
import { starterDeck } from "../../shared/practice.js";
import { scenario, idle } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

test("journal shows spell cancellation and missing targets from structured events", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.phase = 3;
  g.stack.push({
    type: "cast",
    seat: 1,
    cardId: "mamoru-n-18-pele-de-ourico",
    targetId: "gone",
  });
  resolveSpell(g, 0, { cardId: "mamoru-n-12-negacao" });
  resolveSpell(g, 1, {
    cardId: "gishikido-n-7-cura-da-agua",
    targetId: "gone",
  });
  await scenario(page, g);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: /UXTEST/ }).click();
  await idle(page);
  await page
    .getByRole("button", { name: "Abrir histórico", exact: true })
    .click();
  const journal = page.getByRole("dialog", { name: "Histórico da partida" });
  await expect(journal).toContainText("Magia anulada.");
  await expect(journal).toContainText("Sem efeito: o alvo saiu do campo.");
  await expect(journal.locator(".event-spell-result")).toHaveCount(2);
  await mkdir(".sited/qa-journal", { recursive: true });
  await page.screenshot({ path: ".sited/qa-journal/outcomes-1920.png" });
  await page.getByRole("button", { name: "Fechar histórico" }).click();
  await expect(journal).not.toBeVisible();
});
