import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { starterDeck } from "../../shared/practice.js";
import { cards, summonCells, type Game } from "../../shared/game.js";
import { layout } from "../../shared/arena-layout.js";

async function idle(page: Page) {
  await expect(page.locator(".arena-shell")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function api(
  context: BrowserContext,
  kind: string,
  name: string,
  ...args: unknown[]
) {
  const response = await context.request.post(`/api/${kind}/${name}`, {
    data: { args },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = (await response.json()).result;
  expect(result?.error).toBeUndefined();
  return result;
}
async function login(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/auth/guest", {
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
}

test("opening, card reading and arena controls fit desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
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

test("multiplayer keeps new socket state when an older HTTP reply arrives; reconnect and drag work", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  await pages[2].addInitScript(() => {
    const NativeSocket = window.WebSocket;
    (window as any).testSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).testSockets.push(this);
      }
    };
  });
  const errors: string[] = [];
  pages.forEach((page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  try {
    await pages[0].goto("/");
    await pages[0].getByRole("button", { name: "Entrar", exact: true }).click();
    await pages[0]
      .getByRole("textbox", { name: "Seu nome" })
      .fill("Browser host");
    await pages[0].getByRole("button", { name: "Entrar e jogar" }).click();
    await expect(pages[0].locator(".login-dialog")).toHaveCount(0);
    await login(contexts[1], "Browser opponent");
    await login(contexts[2], "Browser spectator");
    // A legal all-creature deck guarantees a usable opening within the first turns.
    const deck = (element: string) => {
      const pool = [...cards.values()]
        .filter((c) => c.kind === "unit")
        .sort((a, b) => a.stats.cost - b.stats.cost);
      const main = pool.filter((c) => c.types.includes(element)).slice(0, 10);
      const rest = pool.filter((c) => !main.includes(c)).slice(0, 5);
      return {
        ...starterDeck(element),
        cardIds: [...main, ...rest].flatMap((c) => [c.id, c.id]),
      };
    };
    const a = (await api(contexts[0], "mutation", "saveDeck", deck("agua")))
      .deck;
    const b = (await api(contexts[1], "mutation", "saveDeck", deck("fogo")))
      .deck;
    const code = (await api(contexts[0], "mutation", "createRoom", a.id)).room
      .code;
    await api(contexts[1], "mutation", "joinRoom", code, b.id, false);
    await api(contexts[2], "mutation", "joinRoom", code, undefined, true);
    const opponent = (await (await contexts[1].request.get("/api/auth")).json())
      .userId;
    await api(contexts[0], "mutation", "lobbyCommand", code, {
      type: "seat",
      seat: 1,
      userId: opponent,
    });

    // Hold an actual lobby response while newer snapshots arrive over WebSocket.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured!: () => void;
    const capturedResponse = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await pages[2].route(
      "**/api/query/room",
      async (route) => {
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    for (const page of pages) {
      await page.goto(`/?sala=${code}`);
      await page.getByRole("button", { name: new RegExp(code) }).click();
    }
    await capturedResponse;
    await pages[0].getByRole("button", { name: "Iniciar batalha" }).click();
    await Promise.all(
      pages.map((page) => expect(page.locator("canvas")).toBeVisible()),
    );
    release();
    for (const page of pages.slice(0, 2)) {
      await page.getByRole("button", { name: "Manter estas cartas" }).click();
      await page.getByRole("button", { name: "Começar neste selo" }).click();
    }
    await expect(pages[2].locator(".lobby")).toHaveCount(0);
    await expect(pages[2].locator(".fan-card")).toHaveCount(0);
    await Promise.all(pages.map(idle));
    await contexts[2].setOffline(true);
    await pages[2].evaluate(() =>
      (window as any).testSockets.forEach((socket: WebSocket) =>
        socket.close(),
      ),
    );
    await expect(pages[2].locator(".arena-connection")).toBeVisible();
    await contexts[2].setOffline(false);
    await expect(pages[2].locator(".arena-connection")).toHaveCount(0);

    let room = await api(contexts[0], "query", "room", code),
      current = 0,
      index = -1;
    // Advance legally when a shuffled opening has no affordable creature.
    for (let turn = 0; turn < 40; turn++) {
      current = room.state.priority;
      room = await api(contexts[current], "query", "room", code);
      const g = room.state as Game,
        player = g.players[current];
      index =
        g.phase === 1
          ? player.hand.findIndex(
              (id) =>
                cards.get(id)!.stats.cost <= player.pe + player.permanentPe &&
                id !== "anubis-o-gato-da-morte",
            )
          : -1;
      if (index >= 0) break;
      const seat = g.centerPending
        ? Object.hasOwn(g.centerChoices || {}, 0)
          ? 1
          : 0
        : current;
      room = (
        await api(
          contexts[seat],
          "mutation",
          "gameCommand",
          code,
          { type: g.centerPending ? "center" : "pass" },
          g.revision,
        )
      ).room;
    }
    expect(index).toBeGreaterThanOrEqual(0);
    const page = pages[current],
      g = room.state as Game;
    await idle(page);
    const cardId = g.players[current].hand[index],
      point = summonCells(g, current as 0 | 1)[0];
    const before = g.units.filter((u) => u.cardId === cardId).length;
    const card = page.locator(".fan-card").nth(index).locator(".fan-art");
    await card.hover();
    await expect(card).toBeVisible();
    const box = await card.boundingBox(),
      target = layout(1440, 1000).point(point.x, point.y);
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 45);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 20 });
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (
            await api(contexts[current], "query", "room", code)
          ).state.units.filter((u: any) => u.cardId === cardId).length,
      )
      .toBe(before + 1);
    await idle(page);
    await expect(pages[2].locator(".arena-accessibility button")).toHaveCount(
      (await api(contexts[current], "query", "room", code)).state.units.length,
    );
    const summoned = (
      await api(contexts[current], "query", "room", code)
    ).state.units.find((u: any) => u.cardId === cardId && u.owner === current);
    const summonedPoint = layout(1440, 1000).point(summoned.x, summoned.y);
    await page.mouse.move(summonedPoint.x, summonedPoint.y);
    await expect(page.locator(".arena-hover")).toBeVisible();
    await page.keyboard.press("f");
    await expect(page.locator(".card-focus")).toBeVisible();
    await page.keyboard.press("Escape");
    let movement = await api(contexts[current], "query", "room", code);
    while (movement.state.phase === 1) {
      const seat = movement.state.priority;
      await idle(pages[seat]);
      await pages[seat]
        .getByRole("button", { name: "Concluir invocações" })
        .click();
      await expect
        .poll(
          async () =>
            (await api(contexts[seat], "query", "room", code)).state.revision,
        )
        .toBeGreaterThan(movement.state.revision);
      movement = await api(contexts[seat], "query", "room", code);
    }
    const mover = movement.state.priority,
      moverPage = pages[mover];
    const leader = movement.state.units.find(
      (u: any) => u.kind === "omionji" && u.owner === mover,
    );
    await idle(moverPage);
    const start = layout(1440, 1000).point(leader.x, leader.y),
      end = layout(1440, 1000).point(leader.x, 3);
    await moverPage.mouse.move(start.x, start.y);
    await moverPage.mouse.down();
    await moverPage.mouse.move(end.x, end.y, { steps: 20 });
    await moverPage.mouse.up();
    await expect
      .poll(
        async () =>
          (await api(contexts[mover], "query", "room", code)).state.units.find(
            (u: any) => u.id === leader.id,
          ).y,
      )
      .toBe(3);
    await idle(page);
    await page.getByRole("button", { name: "Menu da partida" }).click();
    await page
      .getByRole("button", { name: "Conceder partida", exact: true })
      .click();
    await page.getByRole("button", { name: "Conceder", exact: true }).click();
    await Promise.all(
      pages.map((page) => expect(page.locator(".arena-victory")).toBeVisible()),
    );
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
