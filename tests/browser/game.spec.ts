import { test, expect } from "@playwright/test";
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
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".choice-zoom").first()).toBeVisible();
    for (const card of await page.locator(".choice-card").all()) {
      const image = await card.locator("img").boundingBox(),
        read = await card.locator(".choice-zoom").boundingBox();
      expect(read!.y).toBeGreaterThanOrEqual(image!.y + image!.height - 1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".choice-zoom").first().click();
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
    await card.locator(".fan-art").hover();
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
