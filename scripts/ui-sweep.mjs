import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_URL || "http://localhost:5175";
await page.goto(base);
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: ".sited/qa/sanctuary.png", fullPage: true });
await page.getByRole("button", { name: "Baralhos", exact: true }).click();
await page.getByRole("button", { name: "Usar baralho inicial" }).click();
await page.screenshot({ path: ".sited/qa/deckbuilder.png", fullPage: true });
await page.getByRole("button", { name: "Santuário", exact: true }).click();
await page.getByRole("button", { name: "Jogar treino local" }).click();
await page.locator("canvas").waitFor();
await page.waitForTimeout(2500);
for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [390, 844],
  [844, 390],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `.sited/qa/arena-${width}x${height}.png` });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) errors.push(`overflow ${width}x${height}`);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole("button", { name: "Manter estas cartas" }).click();
await page.getByRole("button", { name: "Começar neste selo" }).click();
await page.waitForTimeout(2500);
for (let i = 0; i < 2; i++) {
  if (await page.locator(".opening-hand").count())
    await page.locator(".choice-back").click();
  else {
    await page.getByRole("button", { name: "Menu da partida" }).click();
    await page
      .getByRole("button", { name: "Voltar ao santuário", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(1000);
}
await browser.close();
console.log({ errors });
if (errors.length) process.exitCode = 1;
