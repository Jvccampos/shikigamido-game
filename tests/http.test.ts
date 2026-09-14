import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/main.js";
import { starterDeck } from "../shared/practice.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";
test("HTTP sessions, SQLite persistence, WebSocket privacy and atomic commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shiki-http-")),
    database = join(dir, "game.db");
  let app = await createServer({ database, logger: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as any;
  async function login(name: string) {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/guest",
      payload: { name },
    });
    assert.equal(r.statusCode, 200);
    return r.cookies[0].value;
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
    const r = await app.inject({
      method: "POST",
      url: `/api/${kind}/${name}`,
      cookies: { shiki_session: token },
      payload: { args },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().result;
  }
  const da = (await call(a, "mutation", "saveDeck", starterDeck("agua"))).deck,
    db = (await call(b, "mutation", "saveDeck", starterDeck("fogo"))).deck;
  assert(da?.id && db?.id);
  const code = (await call(a, "mutation", "createRoom", da.id)).room.code;
  await call(b, "mutation", "joinRoom", code, db.id, false);
  await call(c, "mutation", "joinRoom", code, undefined, true);
  const uid = (
    await app.inject({ url: "/api/auth", cookies: { shiki_session: b } })
  ).json().userId;
  await call(a, "mutation", "lobbyCommand", code, {
    type: "seat",
    seat: 1,
    userId: uid,
  });
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/socket`, {
    headers: { Cookie: `shiki_session=${c}` },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const messages: any[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  socket.send(JSON.stringify({ room: code }));
  const started = await call(a, "mutation", "lobbyCommand", code, {
    type: "start",
  });
  assert(!started.error);
  assert.equal(started.room.state.players[0].hand.length, 6);
  assert.equal(started.room.state.players[1].hand.length, 0);
  await new Promise((r) => setTimeout(r, 50));
  const snapshot = messages.at(-1).room;
  assert(snapshot.state.players);
  assert.deepEqual(
    snapshot.state.players.map((p: any) => p.hand),
    [[], []],
  );
  assert.deepEqual(
    snapshot.state.players.map((p: any) => p.library),
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
  const csrf = await app.inject({
    method: "POST",
    url: "/api/auth/guest",
    headers: { origin: "https://evil.example" },
    payload: { name: "evil" },
  });
  assert.equal(csrf.statusCode, 403);
  socket.close();
  await new Promise((r) => socket.once("close", r));
  await app.close();
  app = await createServer({ database, logger: false });
  const persisted = await call(a, "query", "room", code);
  assert.equal(persisted.state.revision, state.revision);
  assert.equal(persisted.state.players[0].hand.length, 7);
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("loading assets on a shared connection does not rate-limit game commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shiki-assets-"));
  const app = await createServer({
    database: join(dir, "game.db"),
    logger: false,
  });
  try {
    for (let i = 0; i < 305; i++) {
      const r = await app.inject({ url: "/assets/cards/omionji-agua.png" });
      assert.notEqual(r.statusCode, 429);
    }
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/guest",
      payload: { name: "Shared connection" },
    });
    assert.equal(login.statusCode, 200);
    let last;
    for (let i = 0; i < 301; i++) last = await app.inject({ url: "/api/auth" });
    assert.equal(last!.statusCode, 429, "the API allowance remains enforced");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
