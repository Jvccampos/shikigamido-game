import { test, expect } from "@playwright/test";
import { layout } from "../../shared/arena-layout.js";
import { idle } from "./fixtures.js";

test("right-clicking a board card opens its details without the native context menu", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  await expect(page.locator(".position-guide")).toHaveCount(0);
  await idle(page);
  await page.evaluate(() => {
    const results: boolean[] = [];
    Object.assign(window, { contextMenuResults: results });
    window.addEventListener("contextmenu", (event) => {
      queueMicrotask(() => results.push(event.defaultPrevented));
    });
  });
  const point = layout(1440, 1000).point(0, 2);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(
    page.getByRole("dialog", { name: "Takaya Isen", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { contextMenuResults: boolean[] })
          .contextMenuResults,
    ),
  ).toEqual([true]);
  await page.keyboard.press("Escape");
  await page
    .locator(".fan-art")
    .first()
    .click({ button: "right", position: { x: 14, y: 70 } });
  await expect(page.locator(".card-focus")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { contextMenuResults: boolean[] })
          .contextMenuResults,
    ),
  ).toEqual([true, true]);
});

test("choice cards can be read by keyboard or touch without changing selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  const card = page.locator(".choice-art").first();
  await card.click();
  await card.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.locator(".card-focus")).toBeVisible();
  await expect(page.locator(".card-dialog:modal")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fechar carta" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await card.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: 20,
    clientY: 20,
  });
  await expect(page.locator(".card-focus")).toBeVisible();
  await card.dispatchEvent("pointerup", { pointerType: "touch" });
  await page.keyboard.press("Escape");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  // Scrolling a row of cards must cancel inspection.
  await page.clock.install();
  await card.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: 20,
    clientY: 20,
  });
  await card.dispatchEvent("pointermove", {
    pointerType: "touch",
    clientX: 20,
    clientY: 80,
  });
  await page.clock.fastForward(600);
  await expect(page.locator(".card-focus")).toHaveCount(0);
  await card.dispatchEvent("pointercancel", { pointerType: "touch" });
});
