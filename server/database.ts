import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const TABLES = new Set(["decks", "rooms"]);
export class Repository {
  private filters: [string, unknown][] = [];
  private order: [string, string] | null = null;
  constructor(
    private db: Database.Database,
    private table: string,
  ) {
    if (!TABLES.has(table)) throw Error("Unknown table");
  }
  where(key: string, value: unknown) {
    const q = new Repository(this.db, this.table);
    q.filters = [...this.filters, [key, value]];
    q.order = this.order;
    return q;
  }
  orderBy(key: string, direction: string) {
    const q = new Repository(this.db, this.table);
    q.filters = this.filters;
    q.order = [key, direction];
    return q;
  }
  private clause() {
    return this.filters.length
      ? " WHERE " +
          this.filters
            .map(([key]) => {
              if (!/^[a-zA-Z]+$/.test(key)) throw Error("Invalid field");
              return `json_extract(body, '$.${key}') = ?`;
            })
            .join(" AND ")
      : "";
  }
  all(): any[] {
    const values = this.filters.map(([, v]) => v);
    const rows = this.db
      .prepare(`SELECT body FROM ${this.table}${this.clause()}`)
      .all(...values)
      .map((r: any) => JSON.parse(r.body));
    if (this.order) {
      const [key, dir] = this.order;
      rows.sort(
        (a, b) =>
          String(a[key]).localeCompare(String(b[key])) *
          (dir === "desc" ? -1 : 1),
      );
    }
    return rows;
  }
  get(id: string): any {
    return this.where("id", id).all()[0] || null;
  }
  insert(value: any) {
    const now = new Date().toISOString(),
      row = {
        ...value,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
    this.db
      .prepare(`INSERT INTO ${this.table}(id,body) VALUES (?,?)`)
      .run(row.id, JSON.stringify(row));
    return row;
  }
  update(id: string, patch: any) {
    const row = this.get(id);
    if (!row) throw Error("Registro não encontrado.");
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    this.db
      .prepare(`UPDATE ${this.table} SET body=? WHERE id=?`)
      .run(JSON.stringify(row), id);
    return row;
  }
  delete(id: string) {
    if (!this.get(id)) return false;
    return (
      this.db.prepare(`DELETE FROM ${this.table} WHERE id=?`).run(id).changes >
      0
    );
  }
}
export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode=WAL");
  db.pragma("foreign_keys=ON");
  db.pragma("busy_timeout=5000");
  db.exec(
    `CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE INDEX IF NOT EXISTS deck_owner ON decks(json_extract(body,'$.ownerId'));CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS room_code ON rooms(json_extract(body,'$.code'));CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,google_sub TEXT UNIQUE);CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);`,
  );
  return {
    raw: db,
    transaction<T>(fn: (tx: { decks: Repository; rooms: Repository }) => T): T {
      return db.transaction(() =>
        fn({
          decks: new Repository(db, "decks"),
          rooms: new Repository(db, "rooms"),
        }),
      )();
    },
    close: () => db.close(),
  };
}
export type GameDatabase = ReturnType<typeof openDatabase>;
export type Context = {
  auth: { userId: string | null; displayName: string };
  db: Pick<GameDatabase, "transaction">;
};
