import assert from "node:assert/strict";
import test from "node:test";

import type { QueryResult } from "pg";

import { PostgresCommandAuditSink } from "./command-audit-store.ts";

test("persists only the command audit allowlist and excludes option/message values", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const sink = new PostgresCommandAuditSink({
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 } as unknown as QueryResult<Record<string, unknown>>;
    },
  });
  await sink.append({
    eventId: "event",
    correlationId: "correlation",
    occurredAt: new Date("2026-07-25T00:00:00Z"),
    actorId: "actor",
    guildId: "guild",
    channelId: "channel",
    commandName: "요약",
    outcome: "success",
    reasonCode: "completed",
  });
  assert.deepEqual(calls[0]?.values, [
    "event",
    new Date("2026-07-25T00:00:00Z"),
    "actor",
    "success",
    "completed",
    "correlation",
    "guild",
    "channel",
    "요약",
  ]);
  assert.equal(JSON.stringify(calls).includes("원문"), false);
  assert.equal(JSON.stringify(calls).includes("옵션값"), false);
});
