import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("deck drafts survive navigation and a new practice match starts cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "Baralhos", exact: true }).click();
  await page.getByRole("button", { name: "Usar baralho inicial" }).click();
  const count = await page.locator(".deck-progress").innerText();
  const first = page.locator(".catalog-card").first();
  await first.locator(".art-button").hover();
  const gap = await first.evaluate((element) => {
    const art = element.querySelector(".card-face")!.getBoundingClientRect();
    const zoom = element.querySelector(".zoom-cue")!.getBoundingClientRect();
    return zoom.top - art.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(-1);
  await page.keyboard.press("f");
  await expect(page.locator(".card-focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await mkdir(".sited/qa-session", { recursive: true });
  await page.screenshot({ path: ".sited/qa-session/deck-builder.png" });
  await page.getByRole("button", { name: "Santuário", exact: true }).click();
  await page.getByRole("button", { name: "Baralhos", exact: true }).click();
  await expect(page.locator(".deck-progress")).toHaveText(count, {
    useInnerText: true,
  });
  await page.getByRole("button", { name: "Santuário", exact: true }).click();
  for (let run = 0; run < 2; run++) {
    await page.getByRole("button", { name: "Jogar treino local" }).click();
    await expect(page.locator(".choice-art")).toHaveCount(6);
    await page.getByRole("button", { name: "Manter estas cartas" }).click();
    await page.getByRole("button", { name: "Começar neste selo" }).click();
    await expect(page.locator(".position-guide")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Menu da partida", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Voltar ao santuário", exact: true })
      .click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".arena-notice")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
