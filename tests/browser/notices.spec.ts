import { test, expect } from "@playwright/test";
import { idle } from "./fixtures.js";

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
  expect(notice.duration, notice.title).toBeGreaterThanOrEqual(2600);
  expect(notice.fadeOpacity).toBeGreaterThan(0);
  expect(notice.fadeOpacity).toBeLessThan(1);
  expect(notice.faded, "Notice should fade out before it leaves the DOM").toBe(
    true,
  );
});
