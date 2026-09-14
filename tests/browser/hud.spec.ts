import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { match, start, game, mutate, idle, openRoom } from "./fixtures.js";

test("mana, phase announcements and elemental reference remain readable during a duel", async ({
  browser,
  baseURL,
}) => {
  await match(
    browser,
    baseURL!,
    async (contexts, code) => {
      await start(contexts, code);
      const page = await contexts[0].newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openRoom(page, code);
      await idle(page);
      await expect(page.locator(".arena-notice")).toContainText("Invocação");
      await expect(page.locator(".duelist-self .mana-total b")).toHaveText("1");
      await mkdir(".sited/qa", { recursive: true });
      for (const [width, height] of [
        [1440, 1000],
        [1024, 768],
        [390, 844],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await page
          .getByRole("button", { name: "Vantagens elementais", exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Vantagens elementais",
        });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(".bonus")).toContainText("Água → Vazio");
        await expect(dialog.locator(".penalty")).toContainText("Água → Terra");
        await dialog.getByRole("button", { name: "Atacar com Fogo" }).click();
        await expect(dialog.locator(".bonus")).toContainText("Fogo → Terra");
        await expect(dialog.locator(".penalty")).toContainText("Fogo → Água");
        await page.screenshot({ path: `.sited/qa/elements-${width}.png` });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole("button", {
            name: "Vantagens elementais",
            exact: true,
          }),
        ).toBeFocused();
        const mana = page.locator(".duelist-self .mana-total b");
        expect(
          await mana.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
          ),
        ).toBeGreaterThanOrEqual(27);
        await page.screenshot({ path: `.sited/qa/hud-${width}.png` });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      let g = await game(contexts[0].request, code);
      for (let i = 0; i < 20 && g.turn < 3; i++) {
        await mutate(
          contexts[g.priority].request,
          "gameCommand",
          code,
          { type: "pass" },
          g.revision || 0,
        );
        g = await game(contexts[0].request, code);
      }
      expect(g.turn).toBe(3);
      await expect(page.locator(".curse-notice")).toContainText(
        "Uma maldição foi invocada!",
        { timeout: 20000 },
      );
      await page.screenshot({ path: ".sited/qa/curse-notice.png" });
      await idle(page);
      await expect(page.locator(".notice-mana")).toContainText(
        "Mana máxima aumentou para 2 PE!",
      );
      await page.screenshot({ path: ".sited/qa/mana-notice.png" });
      await expect(page.locator(".duelist-self .mana-total b")).toHaveText("2");
      expect(errors).toEqual([]);
      await mutate(
        contexts[0].request,
        "gameCommand",
        code,
        { type: "concede" },
        g.revision || 0,
      );
    },
    2,
  );
});
