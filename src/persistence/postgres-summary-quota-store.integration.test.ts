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

test("concurrent attempts reserve once per user per rolling hour", { skip: !enabled }, async () => {
  const at = new Date("2026-07-27T14:59:59.000Z");
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    store.reserve({
      operationId: `quota-concurrent-${index}`,
      guildId: "quota-guild",
      discordUserId: "quota-user",
      receivedAt: at,
    }),
  ));
  assert.equal(results.filter((result) => result.kind === "reserved").length, 1);
  assert.equal(results.filter((result) => result.kind === "cooldown").length, 19);

  const reservedIndex = results.findIndex((result) => result.kind === "reserved");
  const duplicate = await store.reserve({
    operationId: `quota-concurrent-${reservedIndex}`,
    guildId: "quota-guild",
    discordUserId: "quota-user",
    receivedAt: at,
  });
  assert.equal(duplicate.kind, "duplicate");

  const tooSoon = await store.reserve({
    operationId: "quota-too-soon",
    guildId: "quota-guild",
    discordUserId: "quota-user",
    receivedAt: new Date(at.getTime() + 3_599_999),
  });
  assert.equal(tooSoon.kind, "cooldown");

  const nextHour = await store.reserve({
    operationId: "quota-next-hour",
    guildId: "quota-guild",
    discordUserId: "quota-user",
    receivedAt: new Date(at.getTime() + 3_600_000),
  });
  assert.equal(nextHour.kind, "reserved");

  const otherUser = await store.reserve({
    operationId: "quota-other-user",
    guildId: "quota-guild",
    discordUserId: "quota-user-2",
    receivedAt: at,
  });
  assert.equal(otherUser.kind, "reserved");
});
