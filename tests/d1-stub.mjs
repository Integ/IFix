import { DatabaseSync } from "node:sqlite";

// Minimal D1 stand-in backed by a real in-memory SQLite, so the SQL the Worker
// sends is actually executed.
export function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => {
      const result = sqlite.prepare(sql).run(...params);
      return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } };
    },
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      const results = [];
      for (const item of statements) results.push(await item.run());
      return results;
    },
  };
}
