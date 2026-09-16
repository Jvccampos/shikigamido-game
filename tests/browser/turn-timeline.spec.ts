import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { freshGame } from "../../shared/game.js";
import { starterDeck } from "../../shared/practice.js";
import { makeUnit } from "../../shared/rules/core.js";
import { resolveSpell } from "../../shared/rules/spells.js";
import { startTurn } from "../../shared/rules/turns.js";
import { idle, scenario } from "./fixtures.js";

test("turn timeline shows milestones and updates spell deadlines on desktop and mobile", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.phase = 3;
  g.phaseOwner = g.priority = 0;
  const u = makeUnit(g, 0, "lobo-branco", 2, 2);
  g.units.push(u);
  resolveSpell(g, 0, { cardId: "kogeki-n-1-fireball", targetId: u.id });
  const send = await scenario(page, g, "TURNS");
  await page.goto("/");
  await page.getByRole("button", { name: /TURNS/ }).click();
  await idle(page);
  const toggle = page.getByRole("button", {
    name: "Linha do tempo de turnos",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Linha do tempo de turnos" });
  await mkdir(".sited/qa-timeline", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await toggle.click();
    await expect(dialog).toBeVisible();
    const third = dialog.locator(".timeline-turn").filter({
      has: page.getByRole("heading", { name: "Turno 3", exact: true }),
    });
    for (const label of [
      "Mana máxima +1 · 2 PE",
      "Abertura do centro",
      "Surgem 2 maldições",
      "Fireball termina",
    ])
      await expect(third).toContainText(label);
    await expect(third).toContainText("Vigora até o fim do turno 2");
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `.sited/qa-timeline/timeline-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await page.screenshot({ path: `.sited/qa-timeline/arena-${width}.png` });
  }
  await toggle.click();
  await dialog.getByRole("button", { name: "Ver mais 6 turnos" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Turno 13", exact: true }),
  ).toBeVisible();
  g.turn = 3;
  startTurn(g);
  g.revision = (g.revision || 0) + 1;
  send();
  await expect(dialog).not.toContainText("Fireball termina");
  await expect(dialog.locator('[aria-current="step"]')).toContainText(
    "Turno 3",
  );
  await expect(dialog.locator('[aria-current="step"]')).toContainText(
    "já ocorreu",
  );
});
