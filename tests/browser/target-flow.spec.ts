import { test, expect } from "@playwright/test";
import { freshGame, apply, kw } from "../../shared/game.js";
import { makeUnit } from "../../shared/rules/core.js";
import { starterDeck } from "../../shared/practice.js";
import { layout } from "../../shared/arena-layout.js";
import { scenario, idle } from "./fixtures.js";

test("multi-step spells reset old choices and submit the selected units or cells", async ({
  page,
}) => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.turn = 4;
  g.phase = 3;
  g.phaseOwner = g.priority = 0;
  g.players[0].pe = 20;
  g.players[0].hand = ["gishiki-n-9-mimetismo", "ventos-favoraveis"];
  const donor = makeUnit(g, 1, "taodu-katana", 2, 2);
  const receiver = makeUnit(g, 0, "lobo-branco", 2, 3);
  donor.summonedTurn = receiver.summonedTurn = 1;
  g.units.push(donor, receiver);
  const send = await scenario(page, g);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: /UXTEST/ }).click();
  await idle(page);
  const click = async (x: number, y: number) => {
    const p = layout(1920, 1080).point(x, y);
    await page.mouse.click(p.x, p.y);
  };
  await page.getByRole("button", { name: /^Selecionar Gishiki/ }).click();
  await click(2, 2);
  await page
    .getByRole("combobox", { name: "Keyword", exact: true })
    .selectOption("Pular");
  await expect(
    page.getByRole("button", { name: "Conjurar · 3 PE" }),
  ).toBeDisabled();
  await click(2, 3);
  await expect(page.locator(".action-target")).toHaveCount(2);
  await page.getByRole("button", { name: /^Selecionar Ventos/ }).click();
  await expect(page.locator(".action-target")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Conjurar · 4 PE" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Selecionar Gishiki/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Keyword", exact: true }),
  ).toHaveValue("");
  await click(2, 2);
  await click(2, 3);
  await page
    .getByRole("combobox", { name: "Keyword", exact: true })
    .selectOption("Pular");
  await page.getByRole("button", { name: "Conjurar · 3 PE" }).click();
  expect(g.stack[0]).toMatchObject({
    targetId: donor.id,
    targetId2: receiver.id,
    choice: "Pular",
  });
  expect(apply(g, 1, { type: "pass" })).toBeUndefined();
  expect(apply(g, 0, { type: "pass" })).toBeUndefined();
  g.revision!++;
  send();
  await idle(page);
  expect(kw(receiver, "Pular")).toBe(1);
  expect(kw(donor, "Pular")).toBe(0);
  await page.getByRole("button", { name: /^Selecionar Ventos/ }).click();
  await click(3, 4);
  await expect(
    page.getByRole("button", { name: "Conjurar · 4 PE" }),
  ).toBeDisabled();
  await click(4, 4);
  await page.getByRole("button", { name: "Conjurar · 4 PE" }).click();
  expect(g.stack[0]).toMatchObject({ x: 3, y: 4, x2: 4, y2: 4 });
});
