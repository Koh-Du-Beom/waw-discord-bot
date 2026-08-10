import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, QueryResult } from "pg";

import { PostgresKboRetentionStore } from "./postgres-kbo-retention-store.ts";
import { PersistenceError } from "./postgres-persistence.ts";

test("invokes only the bounded database-owned KBO retention function", async () => {
  let captured: { text: string; values?: readonly unknown[] } | undefined;
  const store = new PostgresKboRetentionStore({
    async query(text: string, values?: readonly unknown[]) {
      captured = { text, ...(values === undefined ? {} : { values }) };
      return result([{ purged: 2 }]);
    },
  } as unknown as Pool);
  const observedAt = new Date("2026-08-10T04:00:00.000Z");
  assert.equal(await store.purgeExpired(observedAt, 25), 2);
  assert.deepEqual(captured, {
    text: "select purge_expired_kbo_accounts($1, $2) purged",
    values: [observedAt, 25],
  });
  await assert.rejects(store.purgeExpired(observedAt, 101), PersistenceError);
});

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows };
}
