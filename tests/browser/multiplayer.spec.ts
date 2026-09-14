import { test, expect } from "@playwright/test";
import { cards, summonCells } from "../../shared/game.js";
import { layout } from "../../shared/arena-layout.js";
import {
  match,
  start,
  game,
  query,
  mutate,
  idle,
  openRoom,
} from "./fixtures.js";

test("multiplayer host assigns seats in the lobby and starts the battle", async ({
  browser,
  baseURL,
}) => {
  await match(browser, baseURL!, async (contexts, code) => {
    const page = await contexts[0].newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openRoom(page, code);
    const lobby = await query(contexts[0].request, "room", code);
    expect(lobby?.status).toBe("waiting");
    const opponent = (await (await contexts[1].request.get("/api/auth")).json())
      .userId;
    await page.locator(".lobby select").nth(1).selectOption(opponent);
    await page.getByRole("button", { name: "Iniciar batalha" }).click();
    await expect(page.locator(".opening-hand")).toBeVisible();
    const spectator = await game(contexts[2].request, code);
    expect(spectator.players.map((p) => p.hand)).toEqual([[], []]);
    expect(errors).toEqual([]);
  });
});

test("multiplayer spectator ignores an older HTTP response and reconnects to the current revision", async ({
  browser,
  baseURL,
}) => {
  await match(browser, baseURL!, async (contexts, code) => {
    const page = await contexts[2].newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const Original = window.WebSocket;
      const sockets: WebSocket[] = [];
      Object.assign(window, {
        disconnectTestSockets: () => sockets.forEach((s) => s.close()),
      });
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          sockets.push(this);
        }
      };
    });
    let release!: () => void, captured!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      capturedResponse = new Promise<void>((resolve) => {
        captured = resolve;
      });
    await page.route(
      "**/api/query/room",
      async (route) => {
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    try {
      await openRoom(page, code);
      await capturedResponse;
      await start(contexts, code);
      await expect(page.locator("canvas")).toBeVisible();
      release();
      await idle(page);
      await expect(page.locator(".lobby")).toHaveCount(0);
      await expect(page.locator(".fan-card")).toHaveCount(0);
      await contexts[2].setOffline(true);
      await page.evaluate(() =>
        (
          window as unknown as Window & { disconnectTestSockets: () => void }
        ).disconnectTestSockets(),
      );
      await expect(page.locator(".arena-connection")).toBeVisible();
      const before = await game(contexts[0].request, code);
      await mutate(
        contexts[before.priority].request,
        "gameCommand",
        code,
        { type: "concede" },
        before.revision || 0,
      );
      await contexts[2].setOffline(false);
      await expect(page.locator(".arena-connection")).toHaveCount(0);
      await expect(page.locator(".arena-victory")).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
});

test("multiplayer player summons, reads and moves pieces by dragging", async ({
  browser,
  baseURL,
}) => {
  await match(browser, baseURL!, async (contexts, code) => {
    await start(contexts, code);
    let g = await game(contexts[0].request, code),
      index = -1;
    for (let i = 0; i < 40; i++) {
      g = await game(contexts[g.priority].request, code);
      const p = g.players[g.priority];
      index =
        g.phase === 1
          ? p.hand.findIndex(
              (id) =>
                cards.get(id)!.stats.cost <= p.pe + p.permanentPe &&
                id !== "anubis-o-gato-da-morte",
            )
          : -1;
      if (index >= 0) break;
      const seat = g.centerPending
        ? Object.hasOwn(g.centerChoices || {}, 0)
          ? 1
          : 0
        : g.priority;
      await mutate(
        contexts[seat].request,
        "gameCommand",
        code,
        { type: g.centerPending ? "center" : "pass" },
        g.revision || 0,
      );
      g = await game(contexts[0].request, code);
    }
    expect(index).toBeGreaterThanOrEqual(0);
    const seat = g.priority,
      page = await contexts[seat].newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openRoom(page, code);
    await idle(page);
    const cardId = g.players[seat].hand[index],
      cell = summonCells(g, seat)[0],
      target = layout(1440, 1000).point(cell.x, cell.y);
    const card = page.locator(".fan-card").nth(index).locator(".fan-art");
    await card.hover();
    const box = (await card.boundingBox())!;
    await test.step("Drag a hand card to a summon seal", async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + 45);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 3 });
      await page.mouse.up();
      await expect
        .poll(async () =>
          (await game(contexts[seat].request, code)).units.some(
            (u) => u.cardId === cardId && u.x === cell.x && u.y === cell.y,
          ),
        )
        .toBe(true);
      await idle(page);
    });
    await page.mouse.move(target.x, target.y);
    await expect(page.locator(".arena-hover")).toBeVisible();
    await page.keyboard.press("f");
    await expect(page.locator(".card-focus")).toBeVisible();
    await page.keyboard.press("Escape");
    g = await game(contexts[seat].request, code);
    while (g.phase === 1 || g.priority !== seat) {
      if (g.priority === seat) {
        await idle(page);
        await page.getByRole("button", { name: "Concluir invocações" }).click();
        await expect
          .poll(async () => (await game(contexts[seat].request, code)).revision)
          .toBeGreaterThan(g.revision || 0);
      } else
        await mutate(
          contexts[g.priority].request,
          "gameCommand",
          code,
          { type: "pass" },
          g.revision || 0,
        );
      g = await game(contexts[seat].request, code);
    }
    const leader = g.units.find(
      (u) => u.kind === "omionji" && u.owner === seat,
    )!;
    const from = layout(1440, 1000).point(leader.x, leader.y),
      to = layout(1440, 1000).point(leader.x, 3);
    await idle(page);
    await test.step("Drag the Omionji along a board path", async () => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 3 });
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await game(contexts[seat].request, code)).units.find(
              (u) => u.id === leader.id,
            )?.y,
        )
        .toBe(3);
      const spectator = await game(contexts[2].request, code);
      expect(spectator.units.find((u) => u.id === leader.id)?.y).toBe(3);
      expect(spectator.players.map((p) => p.hand)).toEqual([[], []]);
    });
    await idle(page);
    await page.getByRole("button", { name: "Menu da partida" }).click();
    await page
      .getByRole("button", { name: "Conceder partida", exact: true })
      .click();
    await page.getByRole("button", { name: "Conceder", exact: true }).click();
    await expect(page.locator(".arena-victory")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
