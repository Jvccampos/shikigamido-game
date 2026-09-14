import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.env.TEST_URL || "http://localhost:5175",
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync(".sited/qa", { recursive: true });
const sizes = [
  [1440, 1000],
  [1366, 768],
  [1024, 768],
  [390, 844],
  [844, 390],
];
const overlaps = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1 &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1;
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Baralhos", exact: true }).click();
  await page.getByRole("button", { name: "Usar baralho inicial" }).click();
  const catalog = page.locator(".catalog-card").first();
  await catalog.locator(".art-button").hover();
  if (
    overlaps(
      await catalog.locator(".card-face").boundingBox(),
      await catalog.locator(".zoom-cue").boundingBox(),
    )
  )
    throw Error("Catalog expand covers card");
  await page.getByRole("button", { name: "Santuário", exact: true }).click();
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(1200);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    for (const choice of await page.locator(".choice-card").all()) {
      if (
        overlaps(
          await choice.locator("img").boundingBox(),
          await choice.locator(".choice-zoom").boundingBox(),
        )
      )
        throw Error(`Opening expand overlaps image ${width}x${height}`);
    }
    await page.screenshot({
      path: `.sited/qa/readability-opening-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".choice-zoom").first().click();
  await expect(page.locator(".card-focus")).toBeVisible();
  await page.getByRole("button", { name: "Fechar carta", exact: true }).click();
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  await page.waitForTimeout(3500);
  const metrics = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const n = await page.locator(".fan-card").count(),
      card = page.locator(".fan-card").nth(Math.floor(n / 2));
    await card.locator(".fan-art").hover();
    await page.waitForTimeout(250);
    if (
      overlaps(
        await card.locator(".fan-art img").boundingBox(),
        await card.locator(".fan-zoom").boundingBox(),
      )
    )
      throw Error(`Hand expand overlaps image ${width}`);
    const fonts = await page.evaluate(() =>
      Object.fromEntries(
        [
          ".player-resources span",
          ".player-resources b",
          ".phase-steps span",
          ".phase-instruction",
        ].map((s) => [
          s,
          parseFloat(getComputedStyle(document.querySelector(s)).fontSize),
        ]),
      ),
    );
    if (
      fonts[".player-resources span"] <
        (width < 760 ? 11 : height < 560 ? 12 : 13) ||
      fonts[".phase-instruction"] < (height < 560 ? 12 : width < 760 ? 13 : 15)
    )
      throw Error(`Undersized HUD ${JSON.stringify(fonts)}`);
    await page.screenshot({ path: `.sited/qa/readability-arena-${width}.png` });
    const exposed = await card.locator(".fan-zoom").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    });
    if (!exposed) throw Error(`Expand blocked by another control ${width}`);
    await card.locator(".fan-zoom").click();
    await expect(page.locator(".card-focus")).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar carta", exact: true })
      .click();
    await page.mouse.move(0, 0);
    metrics.push({ width, height, fonts });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Horizontal overflow");
  }
  console.log(
    JSON.stringify({ expandedWithoutCovering: true, metrics, errors }, null, 2),
  );
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
