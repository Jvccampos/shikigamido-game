import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { freshGame } from "../../shared/game.js";
import { starterDeck } from "../../shared/practice.js";
import { makeUnit } from "../../shared/rules/core.js";
import { resolveSpell } from "../../shared/rules/spells.js";
import { startTurn } from "../../shared/rules/turns.js";
import { layout } from "../../shared/arena-layout.js";
import { idle, scenario } from "./fixtures.js";

test("compact timeline stays outside the board and explains each icon without a permanent legend", async ({
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
    [1920, 1080],
    [1440, 1000],
    [1440, 1200],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    if (width >= 760 && height >= 560) {
      await expect(bar).toBeVisible();
      const box = (await bar.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(320);
      expect(box.height).toBeLessThanOrEqual(280);
      expect(box.x).toBeGreaterThan(layout(width, height).point(7, 3).x + 20);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const pass = (await page.locator(".arena-pass").boundingBox())!;
      expect(box.x).toBeCloseTo(pass.x, 0);
      expect(box.width).toBeCloseTo(pass.width, 0);
      expect(box.y + box.height).toBeLessThanOrEqual(pass.y);
      const lastIcon = (await bar
        .locator(".timeline-stop")
        .nth(2)
        .locator(".timeline-icon")
        .last()
        .boundingBox())!;
      expect(lastIcon.x + lastIcon.width).toBeLessThanOrEqual(
        box.x + box.width,
      );
      if (box.width >= 276) {
        expect(
          await bar
            .locator(".timeline-turn-label")
            .first()
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThanOrEqual(14);
        expect(
          (await bar.locator(".timeline-icon svg").first().boundingBox())!
            .width,
        ).toBeGreaterThanOrEqual(22);
      }
      expect(
        await bar.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgba(0, 0, 0, 0)");
      expect(
        await bar.evaluate((el) => getComputedStyle(el).borderTopWidth),
      ).toBe("0px");
      await expect(bar.locator(".timeline-legend")).toHaveCount(0);
      await expect(bar.locator('[aria-current="step"]')).toContainText("T1");
      const first = (await bar
        .locator(".timeline-node")
        .first()
        .boundingBox())!;
      const third = (await bar
        .getByRole("button", { name: /^Turno 3\./ })
        .boundingBox())!;
      expect(third.y).toBeGreaterThan(first.y);
      expect(third.x).toBe(first.x);
      for (const [kind, text] of [
        ["Mana", "Mana máxima +1"],
        ["Maldições", "Surgem 2 maldições"],
        ["Centro", "Abertura do centro"],
        ["Magias", "Fireball termina"],
      ]) {
        await bar
          .getByRole("button", { name: `${kind} no turno 3`, exact: true })
          .hover();
        await expect(tooltip).toContainText(text);
        if (kind === "Mana")
          await expect(tooltip).not.toContainText("Surgem 2 maldições");
        if (kind === "Magias")
          await expect(tooltip).toContainText("Vigora até o fim do turno 2");
      }
      await tooltip.hover();
      await expect(tooltip).toBeVisible();
      await page.screenshot({
        path: `.sited/qa-timeline/compact-hover-${width}.png`,
      });
      await page.mouse.move(1, 1);
      await expect(tooltip).toHaveCount(0);
    } else {
      await expect(bar).toBeHidden();
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
  await page.getByRole("button", { name: /^Selecionar Kogeki/ }).click();
  const dock = (await page.locator(".action-dock").boundingBox())!;
  const compact = (await bar.boundingBox())!;
  expect(compact.y).toBeGreaterThanOrEqual(dock.y + dock.height);
  await page.getByRole("button", { name: "Cancelar seleção" }).click();
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
  await expect(tooltip).not.toContainText("Fireball termina");
  await expect(tooltip).toContainText("já ocorreu");
  await expect(dialog.locator('[aria-current="step"]')).toBeInViewport();
});
