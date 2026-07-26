import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { PostgresSummaryQuotaStore } from "./postgres-summary-quota-store.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
let pool: Pool;
let store: PostgresSummaryQuotaStore;

before(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 24 });
  store = new PostgresSummaryQuotaStore(pool);
});

after(async () => pool?.end());

test("twenty concurrent attempts reserve exactly the default ten", { skip: !enabled }, async () => {
  const at = new Date("2026-07-27T14:59:59.000Z");
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    store.reserve({
      operationId: `quota-concurrent-${index}`,
      guildId: "quota-guild",
      discordUserId: "quota-user",
      receivedAt: at,
    }),
  ));
  assert.equal(results.filter((result) => result.kind === "reserved").length, 10);
  assert.equal(results.filter((result) => result.kind === "exhausted").length, 10);

  const reservedIndex = results.findIndex((result) => result.kind === "reserved");
  const duplicate = await store.reserve({
    operationId: `quota-concurrent-${reservedIndex}`,
    guildId: "quota-guild",
    discordUserId: "quota-user",
    receivedAt: at,
  });
  assert.equal(duplicate.kind, "duplicate");
  const count = await pool.query<{ used: number }>(
    `select used from summary_quota_counter
      where guild_id='quota-guild' and discord_user_id='quota-user'`,
  );
  assert.equal(count.rows[0]?.used, 10);
});
