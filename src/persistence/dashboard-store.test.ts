import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool, PoolClient, QueryResult } from "pg";

import { PostgresDashboardStore } from "./dashboard-store.ts";

type Call = { text: string; values?: readonly unknown[] };

test("dashboard store reads settings and allowlisted audit DTOs", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("from dashboard_setting")) {
        return result([{ summary_enabled: false, version: "7" }]);
      }
      return result([
        {
          event_id: "event-1",
          occurred_at: new Date("2026-07-26T00:00:00.000Z"),
          actor_id: "123456789012345678",
          outcome: "success",
          reason_code: "updated",
        },
      ]);
    },
  } as unknown as Pool;
  const store = new PostgresDashboardStore(pool);

  assert.deepEqual(await store.readSettings(), {
    summaryEnabled: false,
    version: 7,
  });
  assert.deepEqual(await store.readAudit(), {
    events: [
      {
        id: "event-1",
        occurredAt: "2026-07-26T00:00:00.000Z",
        actorId: "123456789012345678",
        action: "settings.summary.update",
        outcome: "success",
        reasonCode: "updated",
      },
    ],
  });
  assert.deepEqual(calls[1]?.values, [50]);
});

test("dashboard setting update and audit commit in one transaction", async () => {
  const calls: Call[] = [];
  const client = transactionClient(calls, true);
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const store = new PostgresDashboardStore(pool, () => "event-1");
  const updated = await store.updateSettings({
    actorId: "123456789012345678",
    operationId: "operation-1",
    request: { summaryEnabled: true, expectedVersion: 7 },
  });

  assert.deepEqual(updated, {
    kind: "updated",
    settings: { summaryEnabled: true, version: 8 },
  });
  assert.equal(calls[0]?.text, "begin");
  assert.match(calls[1]?.text ?? "", /update dashboard_setting/);
  assert.deepEqual(calls[1]?.values, [true, 7]);
  assert.match(calls[2]?.text ?? "", /insert into operation_ledger/);
  assert.match(calls[3]?.text ?? "", /insert into audit_event/);
  assert.equal(calls[4]?.text, "commit");
});

test("dashboard setting version conflict is denied and audited without applying", async () => {
  const calls: Call[] = [];
  const client = transactionClient(calls, false);
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const store = new PostgresDashboardStore(pool, () => "event-conflict");
  assert.deepEqual(
    await store.updateSettings({
      actorId: "123456789012345678",
      operationId: "operation-conflict",
      request: { summaryEnabled: false, expectedVersion: 2 },
    }),
    { kind: "conflict" },
  );
  assert.deepEqual(calls[2]?.values, [
    "operation-conflict",
    "123456789012345678",
    "denied",
    "version_conflict",
  ]);
  assert.equal(calls.at(-1)?.text, "commit");
});

function transactionClient(calls: Call[], updates: boolean): PoolClient {
  return {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("update dashboard_setting")) {
        return updates
          ? result([{ summary_enabled: true, version: "8" }])
          : result([]);
      }
      return result([]);
    },
    release() {},
  } as unknown as PoolClient;
}

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return {
    command: "",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}
