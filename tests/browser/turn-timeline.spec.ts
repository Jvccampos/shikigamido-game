import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { freshGame } from "../../shared/game.js";
import { starterDeck } from "../../shared/practice.js";
import { makeUnit } from "../../shared/rules/core.js";
import { resolveSpell } from "../../shared/rules/spells.js";
import { startTurn } from "../../shared/rules/turns.js";
import { idle, scenario } from "./fixtures.js";
import { layout } from "../../shared/arena-layout.js";

test("upcoming turns stay visible beside the board and open a timeline that explains each icon", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.phase = 3;
  g.phaseOwner = g.priority = 0;
  g.players[0].hand = ["kogeki-n-1-fireball"];
  g.players[0].pe = 20;
  const u = makeUnit(g, 0, "lobo-branco", 2, 2);
  g.units.push(u);
  resolveSpell(g, 0, { cardId: "kogeki-n-1-fireball", targetId: u.id });
  const send = await scenario(page, g, "TURNS");
  await page.goto("/");
  await page.getByRole("button", { name: /TURNS/ }).click();
  await idle(page);
  await page.keyboard.press("Escape");
  const track = page.getByRole("complementary", {
    name: "Linha do tempo",
    exact: true,
  });
  const toggle = page.getByRole("button", {
    name: "Linha do tempo de turnos",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Linha do tempo de turnos" });
  const tooltip = page.getByRole("tooltip");
  await mkdir(".sited/qa-timeline", { recursive: true });
  for (const [width, height] of [
    [1920, 1080],
    [1440, 1000],
    [1440, 1200],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    if (width >= 760 && height >= 560) {
      // The next turns stay visible between the players, clear of the board.
      await expect(track).toBeVisible();
      const box = (await track.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(
        layout(width, height).point(-0.85, 3).x,
      );
      for (const panel of [".duelist-opponent", ".duelist-self"]) {
        const other = (await page.locator(panel).boundingBox())!;
        expect(
          box.y >= other.y + other.height || box.y + box.height <= other.y,
          `${panel} must not overlap the turn track`,
        ).toBe(true);
      }
      await expect(track.locator('[aria-current="step"]')).toContainText("T1");
      await track
        .getByRole("button", { name: "Mana no turno 3", exact: true })
        .hover();
      await expect(tooltip).toContainText("Mana máxima +1");
      const tip = (await tooltip.boundingBox())!;
      expect(tip.x + tip.width).toBeLessThanOrEqual(width);
      await page.mouse.move(width / 2, height - 5);
      await expect(tooltip).toHaveCount(0);
    } else {
      await expect(track).toBeHidden();
    }
    await page.screenshot({ path: `.sited/qa-timeline/compact-${width}.png` });
    await toggle.click();
    await expect(dialog).toBeVisible();
    const mana = dialog.getByRole("button", {
      name: "Mana no turno 3",
      exact: true,
    });
    if (width === 390) await mana.click();
    else await mana.focus();
    await expect(tooltip).toContainText("Mana máxima +1");
    const tip = (await tooltip.boundingBox())!;
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(width);
    expect(tip.y + tip.height).toBeLessThanOrEqual(height);
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The track opens the same full timeline as the toolbar.
  await track.getByRole("button", { name: "Ampliar linha do tempo" }).click();
  await dialog.getByRole("button", { name: "Ver mais 6 turnos" }).click();
  await dialog
    .getByRole("button", { name: /^Turno 13\./ })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: /^Turno 13\./ }),
  ).toBeInViewport();
  g.turn = 3;
  startTurn(g);
  g.revision = (g.revision || 0) + 1;
  send();
  await expect(dialog.locator('[aria-current="step"]')).toContainText("T3");
  await dialog.locator('[aria-current="step"]').focus();
  await expect(tooltip).not.toContainText("Fireball termina");
  await expect(tooltip).toContainText("já ocorreu");
  await expect(dialog.locator('[aria-current="step"]')).toBeInViewport();
});
