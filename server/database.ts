import type { Deck, SavedRoom, StoredRow } from "../shared/room.js";
type WithoutMetadata<T> = T extends StoredRow
  ? Omit<T, keyof StoredRow>
  : never;
type Patch<T> = T extends StoredRow ? Partial<Omit<T, keyof StoredRow>> : never;
export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;
/** The few SQLite operations the game needs, on Node or in a Durable Object. */
export type SqlDriver = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: SqlValue[]): SqlRow[];
    get(...params: SqlValue[]): SqlRow | undefined;
    run(...params: SqlValue[]): { changes: number };
  };
  transaction<T>(fn: () => T): T;
  close?(): void;
};
function readRows<T>(db: SqlDriver, sql: string, ...args: string[]): T[] {
  return db
    .prepare(sql)
    .all(...args)
    .map((row) => JSON.parse(row.body as string) as T);
}
function records<T extends StoredRow>(db: SqlDriver, table: "decks" | "rooms") {
  return {
    insert(value: WithoutMetadata<T>): T {
      const now = new Date().toISOString(),
        row = {
          ...value,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        } as unknown as T;
      db.prepare(`INSERT INTO ${table}(id,body) VALUES (?,?)`).run(
        row.id,
        JSON.stringify(row),
      );
      return row;
    },
    update(id: string, patch: Patch<T>): T {
      const row = readRows<T>(
        db,
        `SELECT body FROM ${table} WHERE id=?`,
        id,
      )[0];
      if (!row) throw Error("Registro não encontrado.");
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      db.prepare(`UPDATE ${table} SET body=? WHERE id=?`).run(
        JSON.stringify(row),
        id,
      );
      return row;
    },
  };
}
export function openDatabase(db: SqlDriver) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE INDEX IF NOT EXISTS deck_owner ON decks(json_extract(body,'$.ownerId'));CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS room_code ON rooms(json_extract(body,'$.code'));CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);`,
  );
  const decks = {
    ...records<Deck>(db, "decks"),
    list: (ownerId: string) =>
      readRows<Deck>(
        db,
        "SELECT body FROM decks WHERE json_extract(body, '$.ownerId')=? ORDER BY json_extract(body, '$.updatedAt') DESC",
        ownerId,
      ),
    getOwned: (id: string, ownerId: string): Deck | undefined =>
      readRows<Deck>(
        db,
        "SELECT body FROM decks WHERE id=? AND json_extract(body, '$.ownerId')=?",
        id,
        ownerId,
      )[0],
    deleteOwned: (id: string, ownerId: string) =>
      db
        .prepare(
          "DELETE FROM decks WHERE id=? AND json_extract(body, '$.ownerId')=?",
        )
        .run(id, ownerId).changes > 0,
  };
  const rooms = {
    ...records<SavedRoom>(db, "rooms"),
    recent: () =>
      readRows<SavedRoom>(
        db,
        "SELECT body FROM rooms ORDER BY json_extract(body, '$.updatedAt') DESC",
      ),
    byCode: (code: string): SavedRoom | undefined =>
      readRows<SavedRoom>(
        db,
        "SELECT body FROM rooms WHERE json_extract(body, '$.code')=?",
        code,
      )[0],
  };
  return {
    raw: db,
    transaction<T>(
      fn: (tx: { decks: typeof decks; rooms: typeof rooms }) => T,
    ): T {
      return db.transaction(() => fn({ decks, rooms }));
    },
    close: () => db.close?.(),
  };
}
export type GameDatabase = ReturnType<typeof openDatabase>;
export type Context = {
  auth: { userId: string | null; displayName: string };
  db: Pick<GameDatabase, "transaction">;
};
