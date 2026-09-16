import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { idle } from "./fixtures.js";

test("opening, card reading and arena controls fit desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("textbox", { name: "Seu nome" }).fill("Browser guest");
  await page.getByRole("button", { name: "Entrar e jogar" }).click();
  await expect(page.locator(".login-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await mkdir(".sited/qa-choice-clean", { recursive: true });
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".choice-art").first()).toBeVisible();
    await expect(page.locator(".choice-zoom, .choice-check")).toHaveCount(0);
    for (const card of await page.locator(".choice-card").all()) {
      const image = await card.locator("img").boundingBox(),
        button = await card.locator(".choice-art").boundingBox();
      expect(button!.height - image!.height).toBeLessThanOrEqual(5);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `.sited/qa-choice-clean/opening-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const firstChoice = page.locator(".choice-art").first();
  await firstChoice.click({ button: "right" });
  await expect(firstChoice).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".card-focus")).toBeVisible();
  await page.getByRole("button", { name: "Fechar carta", exact: true }).click();
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  await expect(page.locator(".position-guide")).toHaveCount(0);
  await idle(page);
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const card = page.locator(".fan-card").nth(2);
    // Cards overlap in the fan; hover the exposed edge.
    await card.locator(".fan-art").hover({ position: { x: 14, y: 70 } });
    await expect(card.locator(".fan-zoom")).toBeVisible();
    await card.locator(".fan-zoom").click();
    await expect(page.locator(".card-focus")).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar carta", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
