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
      rooms: tx.rooms.recent(),
      decks: ["a", "b", "c"].flatMap((id) => tx.decks.list(id)),
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
test("deck deletion and lookup enforce ownership", (t) => {
  const f = fixture(t);
  assert.equal(f.call("b", "deleteDeck", f.da.id).deleted, false);
  assert(f.call("b", "createRoom", f.da.id).error);
  assert.equal(f.query("a", "myDecks")[0].id, f.da.id);
  assert.equal(f.call("a", "deleteDeck", f.da.id).deleted, true);
  assert.deepEqual(f.query("a", "myDecks"), []);
  assert.equal(f.call("a", "deleteDeck", f.da.id).deleted, false);
  assert.equal(f.query("b", "myDecks")[0].id, f.db.id);
});
test("deck lists sort by update time and failed transactions roll back", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  const [older, newer] = database.transaction(({ decks }) =>
    ["Older", "Newer"].map((name) =>
      decks.insert({
        ...starterDeck("agua"),
        ownerId: "a",
        name,
      }),
    ),
  );
  database.raw
    .prepare(
      "UPDATE decks SET body=json_set(body, '$.updatedAt', ?) WHERE id=?",
    )
    .run("2000-01-01T00:00:00.000Z", older.id);
  assert.deepEqual(
    database.transaction(({ decks }) => decks.list("a").map((d) => d.id)),
    [newer.id, older.id],
  );
  assert.throws(
    () =>
      database.transaction(({ decks }) => {
        decks.deleteOwned(newer.id, "a");
        decks.update(older.id, { name: "Changed" });
        throw Error("Rollback");
      }),
    /Rollback/,
  );
  assert.equal(
    database.transaction(({ decks }) => decks.getOwned(older.id, "a"))?.name,
    "Older",
  );
  assert.equal(
    database.transaction(({ decks }) => decks.getOwned(newer.id, "a"))?.name,
    "Newer",
  );
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
