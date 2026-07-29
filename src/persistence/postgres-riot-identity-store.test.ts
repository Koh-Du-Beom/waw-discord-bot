import assert from "node:assert/strict";
import test from "node:test";

import { PostgresRiotIdentityStore } from "./postgres-riot-identity-store.ts";

test("updates only a changed active link at the expected PUUID and version", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const store = new PostgresRiotIdentityStore({
    async query(text: string, values: readonly unknown[]) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 };
    },
  } as never);
  await store.updateIdentity({
    linkId: "link",
    puuid: "A".repeat(64),
    platformId: "KR",
    version: 7,
    gameName: "새 이름",
    tagLine: "NEW",
  });
  assert.match(calls[0]!.text, /removed_at is null/u);
  assert.match(calls[0]!.text, /version = version \+ 1/u);
  assert.match(calls[0]!.text, /is distinct from/u);
  assert.deepEqual(calls[0]!.values.slice(0, 5), [
    "link", "A".repeat(64), 7, "새 이름", "NEW",
  ]);
});
