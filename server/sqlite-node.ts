import { DatabaseSync } from "node:sqlite";
import type { SqlDriver, SqlRow } from "./database.js";

/** Node's built-in SQLite, used by the tests. */
export function nodeSqliteDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;");
  return {
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        all: (...params) => statement.all(...params) as SqlRow[],
        get: (...params) => statement.get(...params) as SqlRow | undefined,
        run: (...params) => ({
          changes: Number(statement.run(...params).changes),
        }),
      };
    },
    transaction(fn) {
      if (db.isTransaction) return fn();
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
