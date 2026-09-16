import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { freshGame } from "../../shared/game.js";
import { starterDeck } from "../../shared/practice.js";
import { makeUnit } from "../../shared/rules/core.js";
import { resolveSpell } from "../../shared/rules/spells.js";
import { startTurn } from "../../shared/rules/turns.js";
import { layout } from "../../shared/arena-layout.js";
import { idle, scenario } from "./fixtures.js";

test("horizontal timeline exposes colored milestones by hover, focus and touch and follows the current turn", async ({
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
  const bar = page.getByRole("complementary", {
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
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(bar).toBeVisible();
    await expect(bar.locator('[aria-current="step"]')).toContainText("T1");
    const box = (await bar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const topRow = layout(width, height).point(3, 0);
    if (width > height && height < 560)
      expect(box.x + box.width).toBeLessThan(
        layout(width, height).point(0, 0).x - 8,
      );
    else expect(box.y + box.height).toBeLessThanOrEqual(topRow.y - 8);
    const third = bar.getByRole("button", { name: /^Turno 3\./ });
    await third.scrollIntoViewIfNeeded();
    const firstBox = (await bar
      .locator(".timeline-node")
      .first()
      .boundingBox())!;
    const thirdBox = (await third.boundingBox())!;
    expect(thirdBox.x).toBeGreaterThan(firstBox.x);
    expect(thirdBox.y).toBe(firstBox.y);
    expect(await third.locator(".timeline-markers i").count()).toBe(4);
    const colors = await third
      .locator(".timeline-markers i")
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).color));
    expect(new Set(colors).size).toBe(4);
    await page.screenshot({
      path: `.sited/qa-timeline/horizontal-${width}.png`,
    });
    if (width === 390) await third.click();
    else await third.hover();
    await expect(tooltip).toBeVisible();
    for (const label of [
      "Mana máxima +1 · 2 PE",
      "Abertura do centro",
      "Surgem 2 maldições",
      "Fireball termina",
      "Vigora até o fim do turno 2",
    ])
      await expect(tooltip).toContainText(label);
    const tip = (await tooltip.boundingBox())!;
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(width);
    expect(tip.y + tip.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `.sited/qa-timeline/hover-${width}.png` });
    if (width === 1440) {
      await tooltip.hover();
      await expect(tooltip).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(tooltip).toHaveCount(0);
    }
    await toggle.click();
    await expect(dialog).toBeVisible();
    const dialogThird = dialog.getByRole("button", { name: /^Turno 3\./ });
    await dialogThird.focus();
    await expect(dialog.getByRole("tooltip")).toContainText("Fireball termina");
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("tooltip")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
  await toggle.click();
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
  await expect(dialog.getByRole("tooltip")).not.toContainText(
    "Fireball termina",
  );
  await expect(dialog.getByRole("tooltip")).toContainText("já ocorreu");
  await expect(dialog.locator('[aria-current="step"]')).toBeInViewport();
});
