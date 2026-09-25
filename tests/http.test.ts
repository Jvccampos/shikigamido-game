import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, type Member, type Sockets } from "../server/app.js";
import { openDatabase } from "../server/database.js";
import { nodeSqliteDriver } from "../server/sqlite-node.js";
import { starterDeck } from "../shared/practice.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const origin = "http://game.test";
/** Records what each subscribed socket would receive. */
function hub() {
  const subscribers: (Member & { code: string; messages: any[] })[] = [];
  const sockets: Sockets = {
    broadcast(code, render) {
      for (const s of subscribers)
        if (s.code === code) s.messages.push(JSON.parse(render(s)));
    },
    disconnect(userId) {
      subscribers.splice(
        0,
        subscribers.length,
        ...subscribers.filter((s) => s.userId !== userId),
      );
    },
  };
  return { subscribers, sockets };
}
function open(path: string, sockets = hub().sockets) {
  const db = openDatabase(nodeSqliteDriver(path));
  return { db, app: createApp({ db, publicUrl: origin, sockets }) };
}
function request(
  path: string,
  init: {
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(`${origin}${path}`, {
    method: init.body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Cookie: `shiki_session=${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

test("HTTP sessions, SQLite persistence, socket privacy and atomic commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shiki-http-")),
    database = join(dir, "game.db");
  const sockets = hub();
  let { db: store, app } = open(database, sockets.sockets);
  async function login(name: string) {
    const r = await app.fetch(
      request("/api/auth/guest", { body: { name } }),
      "1.1.1.1",
    );
    assert.equal(r.status, 200);
    const [cookie] = r.headers.getSetCookie();
    assert.match(cookie, /^shiki_session=[\w-]{43}; Max-Age=2592000; /);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/, "plain HTTP public URL");
    return cookie.split(";")[0].split("=")[1];
  }
  const a = await login("A"),
    b = await login("B"),
    c = await login("Spectator");
  async function call(
    token: string,
    kind: string,
    name: string,
    ...args: any[]
  ) {
    const r = await app.fetch(
      request(`/api/${kind}/${name}`, { token, body: { args } }),
      "1.1.1.1",
    );
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    return body.result;
  }
  const me = await (
    await app.fetch(request("/api/auth", { token: b }), "1.1.1.1")
  ).json();
  assert.equal(me.displayName, "B");
  assert.equal(me.isAuthenticated, true);
  const da = (await call(a, "mutation", "saveDeck", starterDeck("agua"))).deck,
    db = (await call(b, "mutation", "saveDeck", starterDeck("fogo"))).deck;
  assert(da?.id && db?.id);
  const code = (await call(a, "mutation", "createRoom", da.id)).room.code;
  await call(b, "mutation", "joinRoom", code, db.id, false);
  await call(c, "mutation", "joinRoom", code, undefined, true);
  await call(a, "mutation", "lobbyCommand", code, {
    type: "seat",
    seat: 1,
    userId: me.userId,
  });
  const spectator = await (
    await app.fetch(request("/api/auth", { token: c }), "1.1.1.1")
  ).json();
  const subscriber = {
    code,
    userId: spectator.userId,
    expires: Date.now() + 86400000,
    messages: [] as any[],
  };
  sockets.subscribers.push(subscriber);
  const started = await call(a, "mutation", "lobbyCommand", code, {
    type: "start",
  });
  assert(!started.error);
  assert.equal(started.room.state.players[0].hand.length, 6);
  assert.equal(started.room.state.players[1].hand.length, 0);
  const snapshot = subscriber.messages.at(-1);
  assert.equal(snapshot.type, "room");
  assert(snapshot.room.state.players);
  assert.deepEqual(
    snapshot.room.state.players.map((p: any) => p.hand),
    [[], []],
  );
  assert.deepEqual(
    snapshot.room.state.players.map((p: any) => p.library),
    [[], []],
  );
  const [ra, rb] = await Promise.all([
    call(a, "mutation", "gameCommand", code, { type: "ready", y: 2 }, 0),
    call(b, "mutation", "gameCommand", code, { type: "ready", y: 4 }, 0),
  ]);
  assert(!ra.error && !rb.error);
  const state = (await call(a, "query", "room", code)).state;
  assert.equal(state.setup, false);
  assert.equal(state.players[0].hand.length, 7);
  const denied = await call(
    c,
    "mutation",
    "gameCommand",
    code,
    { type: "concede" },
    state.revision,
  );
  assert(denied.error);
  const csrf = await app.fetch(
    request("/api/auth/guest", {
      body: { name: "evil" },
      headers: { Origin: "https://evil.example" },
    }),
    "1.1.1.1",
  );
  assert.equal(csrf.status, 403);
  assert.equal((await csrf.json()).error, "Origem inválida.");
  const logout = await app.fetch(
    request("/api/auth/logout", { token: c, body: {} }),
    "1.1.1.1",
  );
  assert.match(logout.headers.getSetCookie()[0], /^shiki_session=; Max-Age=0/);
  assert.equal(sockets.subscribers.length, 0, "logout closes the sockets");
  store.close();
  ({ db: store, app } = open(database));
  const persisted = await call(a, "query", "room", code);
  assert.equal(persisted.state.revision, state.revision);
  assert.equal(persisted.state.players[0].hand.length, 7);
  const stale = await call(
    a,
    "mutation",
    "gameCommand",
    code,
    { type: "pass" },
    state.revision - 1,
  );
  assert.match(stale.error, /atualizada/);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("only API requests consume the per-address allowance", async () => {
  const { db, app } = open(":memory:");
  try {
    for (let i = 0; i < 305; i++) {
      const r = await app.fetch(
        request("/assets/cards/omionji-agua.png"),
        "2.2.2.2",
      );
      assert.notEqual(r.status, 429);
    }
    const login = await app.fetch(
      request("/api/auth/guest", { body: { name: "Shared connection" } }),
      "2.2.2.2",
    );
    assert.equal(login.status, 200);
    let last;
    for (let i = 0; i < 301; i++)
      last = await app.fetch(request("/api/auth"), "2.2.2.2");
    assert.equal(last!.status, 429, "the API allowance remains enforced");
    assert.equal(
      (await app.fetch(request("/api/auth"), "3.3.3.3")).status,
      200,
      "other addresses keep their own allowance",
    );
    for (let i = 0; i < 12; i++)
      await app.fetch(
        request("/api/auth/guest", { body: { name: `Guest ${i}` } }),
        "4.4.4.4",
      );
    const flood = await app.fetch(
      request("/api/auth/guest", { body: { name: "Guest" } }),
      "4.4.4.4",
    );
    assert.equal(flood.status, 429, "12 guest logins per minute");
  } finally {
    db.close();
  }
});
