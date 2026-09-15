import { apply, type Game } from "../../shared/game.js";
import { publicRoom } from "../../shared/visibility.js";
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { Queries, Mutations } from "../../shared/protocol.js";
import type { GameView } from "../../shared/room.js";
import { starterDeck } from "../../shared/practice.js";
import { cards } from "../../shared/cards.js";

export async function query<K extends keyof Queries>(
  request: APIRequestContext,
  name: K,
  ...args: Parameters<Queries[K]>
): Promise<ReturnType<Queries[K]>> {
  const response = await request.post(`/api/query/${name}`, { data: { args } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).result;
}
export async function mutate<K extends keyof Mutations>(
  request: APIRequestContext,
  name: K,
  ...args: Parameters<Mutations[K]>
): Promise<ReturnType<Mutations[K]>> {
  const response = await request.post(`/api/mutation/${name}`, {
    data: { args },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result: ReturnType<Mutations[K]> = (await response.json()).result;
  expect(result.error).toBeUndefined();
  return result;
}
export async function idle(page: Page) {
  await expect(page.locator(".arena-shell")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
export async function game(
  request: APIRequestContext,
  code: string,
): Promise<GameView> {
  const room = await query(request, "room", code);
  expect(room?.status).not.toBe("waiting");
  if (!room || room.status === "waiting")
    throw Error("Expected an active match");
  return room.state;
}
export async function match(
  browser: Browser,
  baseURL: string,
  run: (contexts: BrowserContext[], code: string) => Promise<void>,
  memberCount = 3,
) {
  const contexts = await Promise.all(
    Array.from({ length: memberCount }, () =>
      browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }),
    ),
  );
  try {
    for (const [i, context] of contexts.entries()) {
      const response = await context.request.post("/api/auth/guest", {
        data: { name: `Browser ${i}` },
      });
      expect(response.ok()).toBeTruthy();
    }
    const deck = (element: string) => {
      const pool = [...cards.values()]
        .filter((c) => c.kind === "unit")
        .sort((a, b) => a.stats.cost - b.stats.cost);
      const main = pool.filter((c) => c.types.includes(element)).slice(0, 10),
        rest = pool.filter((c) => !main.includes(c)).slice(0, 5);
      return {
        ...starterDeck(element),
        cardIds: [...main, ...rest].flatMap((c) => [c.id, c.id]),
      };
    };
    const a = await mutate(contexts[0].request, "saveDeck", deck("agua")),
      b = await mutate(contexts[1].request, "saveDeck", deck("fogo"));
    const created = await mutate(contexts[0].request, "createRoom", a.deck!.id),
      code = created.room!.code;
    await mutate(contexts[1].request, "joinRoom", code, b.deck!.id, false);
    if (contexts[2])
      await mutate(contexts[2].request, "joinRoom", code, undefined, true);
    await run(contexts, code);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
export async function start(contexts: BrowserContext[], code: string) {
  const opponent = (await contexts[1].request.get("/api/auth")).json();
  await mutate(contexts[0].request, "lobbyCommand", code, {
    type: "seat",
    seat: 1,
    userId: (await opponent).userId,
  });
  await mutate(contexts[0].request, "lobbyCommand", code, { type: "start" });
  for (const seat of [0, 1])
    await mutate(
      contexts[seat].request,
      "gameCommand",
      code,
      { type: "ready", y: seat ? 4 : 2 },
      0,
    );
}
export async function openRoom(page: Page, code: string) {
  await page.goto(`/?sala=${code}`);
  await page.getByRole("button", { name: new RegExp(code) }).click();
}

/** Deterministic UI scenarios run the real engine behind an isolated transport. */
export async function scenario(page: Page, state: Game, code = "UXTEST") {
  const snapshot = () =>
    publicRoom(
      {
        code,
        hostId: "a",
        status: "playing",
        state,
        spectators: [
          { id: "a", name: "Você" },
          { id: "b", name: "Oponente" },
        ],
      },
      "a",
    );
  let send = () => {};
  await page.routeWebSocket("**/socket", (socket) => {
    send = () =>
      socket.send(JSON.stringify({ type: "room", room: snapshot() }));
    socket.onMessage(send);
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth")
      return route.fulfill({
        json: {
          userId: "a",
          displayName: "Você",
          isAuthenticated: true,
          isLoading: false,
        },
      });
    if (path.endsWith("/myRooms"))
      return route.fulfill({ json: { result: [{ code, status: "playing" }] } });
    if (path.endsWith("/room"))
      return route.fulfill({ json: { result: snapshot() } });
    if (path.endsWith("/gameCommand")) {
      const [, command] = route.request().postDataJSON().args;
      const error = apply(state, 0, command);
      if (!error) state.revision = (state.revision || 0) + 1;
      return route.fulfill({ json: { result: { error, room: snapshot() } } });
    }
    return route.fulfill({ json: { result: [] } });
  });
  return () => send();
}
