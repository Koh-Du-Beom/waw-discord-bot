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

test("dashboard store reads active Riot links with their optimistic version", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return result([{
        link_id: "link-1",
        display_label: "등록 사용자",
        platform_id: "KR",
        game_name: "표시 이름",
        tag_line: "KR1",
        is_primary: false,
        version: "4",
      }]);
    },
  } as unknown as Pool;

  assert.deepEqual(
    await new PostgresDashboardStore(pool).readActiveRiotLinks(),
    {
      links: [{
        linkId: "link-1",
        expectedVersion: 4,
        requesterLabel: "등록 사용자",
        platformId: "KR",
        gameName: "표시 이름",
        tagLine: "KR1",
        isPrimary: false,
      }],
    },
  );
  assert.match(calls[0]?.text ?? "", /link\.version::text/);
  assert.doesNotMatch(calls[0]?.text ?? "", /link\.puuid/);
});

test("game dashboard reads confirmed stacks without exposing member identifiers", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return result([{ display_label: "등록 사용자", stack: "2" }]);
    },
  } as unknown as Pool;

  assert.deepEqual(await new PostgresDashboardStore(pool).readGameStacks(), {
    entries: [{ memberLabel: "등록 사용자", stack: 2 }],
  });
  assert.match(calls[0]?.text ?? "", /incident\.status = 'confirmed'/);
  assert.doesNotMatch(calls[0]?.text ?? "", /select users\.discord_user_id/);
});

test("active game read keeps evidence separate and omits ambiguous Riot accounts", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return result([gameRow({
        riot_platform_id: null,
        riot_game_name: null,
        riot_tag_line: null,
        go_live_observed_at: new Date("2026-08-01T00:04:00.000Z"),
      })]);
    },
  } as unknown as Pool;

  assert.deepEqual(
    await new PostgresDashboardStore(pool).readActiveGameObservations(),
    {
      entries: [{
        incidentId: "incident-1",
        memberLabel: "등록 사용자",
        riotId: null,
        gameKey: "KR:game-1",
        riotState: "active",
        riotObservedAt: "2026-08-01T00:05:00.000Z",
        goLiveState: "inactive",
        goLiveObservedAt: "2026-08-01T00:04:00.000Z",
        comparisonState: "violation",
        incidentStatus: "confirmed",
        expectedVersion: 3,
        gameStartedAt: "2026-08-01T00:00:00.000Z",
      }],
    },
  );
  assert.match(calls[0]?.text ?? "", /game\.ended_at is null/);
  assert.match(calls[0]?.text ?? "", /having count\(\*\) = 1/);
  assert.doesNotMatch(calls[0]?.text ?? "", /puuid/);
});

test("incident history uses a stable updated-at and incident-id cursor", async () => {
  const calls: Call[] = [];
  let query = 0;
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      query += 1;
      return query === 1
        ? result([
            gameRow({ incident_id: "incident-2" }),
            gameRow({ incident_id: "incident-1" }),
          ])
        : result([]);
    },
  } as unknown as Pool;
  const store = new PostgresDashboardStore(pool);

  const first = await store.readGameIncidentHistory({
    limit: 1,
    status: "confirmed",
    memberLabel: "등록 사용자",
  });
  assert.equal(first.entries.length, 1);
  assert.ok(first.nextCursor);
  assert.deepEqual(calls[0]?.values, [
    null,
    null,
    "confirmed",
    "등록 사용자",
    2,
  ]);

  await store.readGameIncidentHistory({ limit: 1, cursor: first.nextCursor });
  assert.deepEqual(calls[1]?.values?.slice(0, 2), [
    "2026-08-01T00:06:00.000Z",
    "incident-2",
  ]);
  assert.match(calls[0]?.text ?? "", /\(incident\.updated_at, incident\.incident_id\) < \(\$1, \$2\)/);
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

test("administrator pre-dispatch audit stores only correlation metadata", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return result([]);
    },
  } as unknown as Pool;
  const store = new PostgresDashboardStore(pool);
  await store.recordAdminCommandDispatch({
    eventId: "dispatch-event-01",
    operationId: "dispatch-operation-01",
    occurredAt: new Date("2026-07-26T07:00:00.000Z"),
    actorId: "123456789012345678",
    guildId: "223456789012345678",
    commandName: "riot_link_request_approve",
  });
  assert.match(calls[0]?.text ?? "", /dashboard\.admin_command\.dispatch/);
  assert.deepEqual(calls[0]?.values, [
    "dispatch-event-01",
    new Date("2026-07-26T07:00:00.000Z"),
    "123456789012345678",
    "dispatch-operation-01",
    "223456789012345678",
    "riot_link_request_approve",
  ]);
});

test("command log includes only Discord chat commands and their stored nickname", async () => {
  const calls: Call[] = [];
  const pool = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return result([{
        occurred_at: new Date("2026-07-29T00:00:00.000Z"),
        event_id: "discord:interaction-1",
        command_name: "도움말",
        display_label: "서버 닉네임",
        outcome: "success",
        reason_code: "completed",
      }]);
    },
  } as unknown as Pool;

  assert.equal(
    (await new PostgresDashboardStore(pool).readCommandLog({})).entries[0]?.actorLabel,
    "서버 닉네임",
  );
  assert.match(calls[0]?.text ?? "", /a\.channel_id <> 'dashboard'/);
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

function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    incident_id: "incident-1",
    display_label: "등록 사용자",
    riot_platform_id: "KR",
    riot_game_name: "계정",
    riot_tag_line: "KR1",
    game_key: "KR:game-1",
    riot_state: "active",
    riot_observed_at: new Date("2026-08-01T00:05:00.000Z"),
    go_live_state: "inactive",
    go_live_observed_at: new Date("2026-08-01T00:05:00.000Z"),
    comparison_state: "violation",
    incident_status: "confirmed",
    incident_version: "3",
    game_started_at: new Date("2026-08-01T00:00:00.000Z"),
    game_ended_at: null,
    incident_updated_at: new Date("2026-08-01T00:06:00.000Z"),
    ...overrides,
  };
}
