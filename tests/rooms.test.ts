import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import app from "../server/index.js";
import { openDatabase, type Context } from "../server/database.js";
import { starterDeck } from "../shared/practice.js";
function fixture(t: TestContext) {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  const ctx = (id: string | null): Context => ({
    auth: { userId: id, displayName: id || "" },
    db: database,
  });
  const snapshot = () =>
    database.transaction((tx) => ({
      rooms: tx.rooms.all(),
      decks: tx.decks.all(),
    }));
  const call = (user: string | null, name: string, ...args: any[]) =>
    (app.mutations as any)[name](ctx(user), ...args);
  const query = (user: string | null, name: string, ...args: any[]) =>
    (app.queries as any)[name](ctx(user), ...args);
  const da = call("a", "saveDeck", starterDeck("agua")).deck,
    db = call("b", "saveDeck", starterDeck("fogo")).deck,
    dc = call("c", "saveDeck", starterDeck("terra")).deck;
  const r = call("a", "createRoom", da.id).room;
  return { call, query, snapshot, da, db, dc, code: r.code };
}
test("joining creates lobby membership without starting match", (t) => {
  const f = fixture(t);
  const r = f.call("b", "joinRoom", f.code, f.db.id, false).room;
  assert.equal(r.status, "waiting");
  assert.equal(r.members.length, 2);
  assert.equal(r.state.players, undefined);
});
test("only host can assign seats and start; host may spectate", (t) => {
  const f = fixture(t);
  f.call("b", "joinRoom", f.code, f.db.id, false);
  f.call("c", "joinRoom", f.code, f.dc.id, false);
  assert(f.call("b", "lobbyCommand", f.code, { type: "start" }).error);
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 0, userId: "b" });
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 1, userId: "c" });
  const r = f.call("a", "lobbyCommand", f.code, { type: "start" }).room;
  assert.equal(r.status, "playing");
  assert.equal(r.seat, -1);
  assert.deepEqual(
    r.state.players.map((p: any) => p.hand),
    [[], []],
  );
});
test("rejoining active room never resets game or duplicates member", (t) => {
  const f = fixture(t);
  f.call("b", "joinRoom", f.code, f.db.id, false);
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 1, userId: "b" });
  f.call("a", "lobbyCommand", f.code, { type: "start" });
  const before = structuredClone(f.snapshot().rooms[0].state);
  const r = f.call("b", "joinRoom", f.code, f.db.id, false).room;
  assert.deepEqual(f.snapshot().rooms[0].state, before);
  assert.equal(r.members.length, 2);
});
test("all query and mutation responses redact private state", (t) => {
  const f = fixture(t);
  f.call("b", "joinRoom", f.code, f.db.id, false);
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 1, userId: "b" });
  const start = f.call("a", "lobbyCommand", f.code, { type: "start" }).room;
  assert.equal(start.state.players[1].hand.length, 0);
  assert.equal(start.state.players[0].library.length, 0);
  const response = f.call(
    "a",
    "gameCommand",
    f.code,
    { type: "ready", y: 2 },
    0,
  ).room;
  assert.equal(response.state.players[1].hand.length, 0);
  assert.equal(f.query(null, "room", f.code).state.players[0].hand.length, 0);
});
test("stale duplicate commands and spectator actions are rejected atomically", (t) => {
  const f = fixture(t);
  f.call("b", "joinRoom", f.code, f.db.id, false);
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 1, userId: "b" });
  f.call("a", "lobbyCommand", f.code, { type: "start" });
  f.call("a", "gameCommand", f.code, { type: "ready", y: 2 }, 0);
  const before = structuredClone(f.snapshot().rooms[0]);
  assert(f.call("a", "gameCommand", f.code, { type: "ready", y: 4 }, 0).error);
  assert(f.call("c", "gameCommand", f.code, { type: "concede" }, 1).error);
  assert.deepEqual(f.snapshot().rooms[0], before);
});
test("saved decks enforce ownership and update existing record", (t) => {
  const f = fixture(t);
  assert(
    f.call("b", "saveDeck", { ...starterDeck("agua"), id: f.da.id }).error,
  );
  const result = f.call("a", "saveDeck", {
    ...starterDeck("agua"),
    id: f.da.id,
    name: "Atualizado",
  });
  assert.equal(result.deck.name, "Atualizado");
  assert.equal(f.snapshot().decks.length, 3);
});
test("simultaneous setup confirmations do not require a second click", (t) => {
  const f = fixture(t);
  f.call("b", "joinRoom", f.code, f.db.id, false);
  f.call("a", "lobbyCommand", f.code, { type: "seat", seat: 1, userId: "b" });
  f.call("a", "lobbyCommand", f.code, { type: "start" });
  assert(!f.call("a", "gameCommand", f.code, { type: "ready", y: 2 }, 0).error);
  assert(!f.call("b", "gameCommand", f.code, { type: "ready", y: 4 }, 0).error);
  const room = f.snapshot().rooms[0];
  assert.equal(room.status, "playing");
  assert.equal(room.state.setup, false);
});
