import type { SqlDriver } from "./database.js";

/** A Durable Object's SQLite storage. */
export function durableSqliteDriver(storage: DurableObjectStorage): SqlDriver {
  const sql = storage.sql;
  return {
    exec: (query) => void sql.exec(query),
    prepare: (query) => ({
      all: (...params) => sql.exec(query, ...params).toArray(),
      get: (...params) => sql.exec(query, ...params).toArray()[0],
      run(...params) {
        sql.exec(query, ...params);
        return {
          changes: sql.exec<{ n: number }>("SELECT changes() AS n").one().n,
        };
      },
    }),
    transaction: (fn) => storage.transactionSync(fn),
  };
}
