import { test, expect } from "@playwright/test";
import { idle } from "./fixtures.js";
import { random, randomState } from "../../shared/random.js";

test("practice opponent notices allow reading and fade before removal", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await expect(page.locator(".opening-hand")).toBeVisible();
  await page.evaluate(() => {
    const records: {
      title: string;
      start: number;
      duration?: number;
      faded: boolean;
      fadeOpacity?: number;
    }[] = [];
    let current: (typeof records)[number] | undefined;
    new MutationObserver(() => {
      const notice = document.querySelector(".arena-notice");
      const title = notice?.querySelector("strong")?.textContent || "";
      if (current && current.title !== title) {
        current.duration = performance.now() - current.start;
        current = undefined;
      }
      if (title && !current) {
        current = { title, start: performance.now(), faded: false };
        records.push(current);
      }
      if (current && notice?.classList.contains("leaving") && !current.faded) {
        current.faded = true;
        const observed = current;
        setTimeout(() => {
          if (notice.isConnected)
            observed.fadeOpacity = parseFloat(getComputedStyle(notice).opacity);
        }, 180);
      }
    }).observe(document.querySelector(".arena-shell")!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    Object.assign(window, { noticeRecords: records });
  });
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  // The player can confirm before the bot is ready. Wait for setup to finish
  // before deciding whether we need to pass the player's invocation phase.
  await expect(page.locator(".arena-shell")).not.toHaveClass(
    /preparing-position/,
  );
  await idle(page);
  if (await page.locator(".arena-phase.active").count())
    await page.getByRole("button", { name: "Concluir invocações" }).click();
  const finished = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          noticeRecords: {
            title: string;
            duration?: number;
            faded: boolean;
            fadeOpacity?: number;
          }[];
        }
      ).noticeRecords.find(
        (n) => n.title.includes("Guardião") && n.duration !== undefined,
      ),
    );
  await expect.poll(finished, { timeout: 20000 }).toBeTruthy();
  const notice = (await finished())!;
  expect(notice.duration, notice.title).toBeGreaterThanOrEqual(3900);
  expect(notice.duration, notice.title).toBeLessThan(5000);
  expect(notice.fadeOpacity).toBeGreaterThan(0);
  expect(notice.fadeOpacity).toBeLessThan(1);
  expect(notice.faded, "Notice should fade out before it leaves the DOM").toBe(
    true,
  );
});

test("discard choices follow the opponent notice without an extra pause or a deferred player notice", async ({
  page,
}) => {
  await page.goto("/");
  // Seed 2 puts the bot first with three spells to convert on turn one.
  const source = randomState(2);
  await page.evaluate(
    (values) => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (
          array instanceof Uint32Array &&
          array.length === 1 &&
          values.length
        ) {
          array[0] = values.shift()!;
          return array;
        }
        return original(array);
      };
    },
    Array.from({ length: 100 }, () => random(source) * 0x100000000),
  );
  await page.getByRole("button", { name: "Jogar treino local" }).click();
  await page.getByRole("button", { name: "Manter estas cartas" }).click();
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  for (const phase of ["invocações", "movimentos", "magias"])
    await page
      .getByRole("button", { name: `Concluir ${phase}` })
      .click({ timeout: 20000 });
  const notice = page.locator(".arena-notice");
  await expect(notice).toContainText("Guardião do santuário · Descarte");
  await page.mouse.click(5, 500);
  await expect(notice).toHaveCount(0, { timeout: 1200 });
  await expect(
    page.getByRole("heading", { name: "Transforme cartas em energia" }),
  ).toBeVisible({ timeout: 1000 });
  await page.getByRole("button", { name: "Ver tabuleiro" }).click();
  // Returning to the board must not replay an announcement hidden by the dialog.
  await page.waitForTimeout(700);
  expect(await notice.count()).toBe(0);
  await page.getByRole("button", { name: "Converter cartas" }).click();
  await expect(
    page.getByRole("heading", { name: "Transforme cartas em energia" }),
  ).toBeVisible();
});

test.describe("dismissible phase notices", () => {
  test.use({ hasTouch: true });
  for (const gesture of ["click", "touch"] as const) {
    test(`${gesture} dismisses a notice immediately through its fade animation`, async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Jogar treino local" }).click();
      await page.getByRole("button", { name: "Manter estas cartas" }).click();
      await page.getByRole("button", { name: "Começar neste selo" }).click();
      const notice = page.locator(".arena-notice");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("Clique ou toque para dispensar");
      // Use empty space outside the banner to verify screen-wide dismissal.
      if (gesture === "touch") await page.touchscreen.tap(5, 500);
      else await page.mouse.click(5, 500);
      await expect(notice).toHaveClass(/leaving/);
      await expect
        .poll(() =>
          notice.evaluateAll((elements) =>
            elements[0]?.isConnected
              ? Number(getComputedStyle(elements[0]).opacity)
              : 0,
          ),
        )
        .toBeLessThan(1);
      await expect(notice).toHaveCount(0, { timeout: 1200 });
    });
  }
});
