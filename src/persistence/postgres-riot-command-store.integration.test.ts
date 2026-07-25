import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import type { CommandAuditEvent } from "../commands/command-handler.ts";
import { PostgresRiotCommandStore } from "./postgres-riot-command-store.ts";
import { PersistenceError } from "./postgres-persistence.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
let pool: Pool;
let store: PostgresRiotCommandStore;

before(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 4 });
  await pool.query("select 1");
  store = new PostgresRiotCommandStore(pool);
});

after(async () => {
  await pool?.end();
});

test("pending approval, active PUUID conflict and audit failure are atomic", { skip: !enabled }, async () => {
  const at = new Date("2026-07-25T05:00:00Z");
  assert.equal(await request("request-op-1", "request-1", "첫계정", at), "created");
  assert.equal(await request("request-op-duplicate", "request-duplicate", "첫계정", at), "already_pending");
  assert.deepEqual(
    (await store.list({ discordUserId: "actor", includePending: true })).map((item) => item.kind),
    ["pending"],
  );

  assert.equal(await approve("approve-op-1", "request-1", "link-1", "same-puuid", at), "approved");
  assert.equal(await request("request-op-2", "request-2", "둘째계정", at), "created");
  assert.equal(
    await approve("approve-op-conflict", "request-2", "link-2", "same-puuid", at),
    "puuid_conflict",
  );
  const conflict = await pool.query<{ status: string; reason_code: string }>(`
    select request.status, audit.reason_code
      from riot_account_link_request request
      join audit_event audit on audit.event_id = 'approve-op-conflict'
     where request.request_id = 'request-2'
  `);
  assert.deepEqual(conflict.rows, [{
    status: "pending_admin_approval",
    reason_code: "riot_active_puuid_conflict",
  }]);

  assert.equal(await request("request-op-3", "request-3", "거절계정", at), "created");
  assert.equal(
    await store.rejectRequestWithAudit({
      operationId: "reject-stale-op",
      requestId: "request-3",
      expectedVersion: 9,
      administratorId: "administrator",
      decidedAt: at,
      audit: audit("reject-stale-op", at),
    }),
    "stale",
  );
  assert.equal(
    await store.rejectRequestWithAudit({
      operationId: "reject-op",
      requestId: "request-3",
      expectedVersion: 0,
      administratorId: "administrator",
      decidedAt: at,
      audit: audit("reject-op", at),
    }),
    "rejected",
  );
  assert.equal(
    await store.rejectRequestWithAudit({
      operationId: "reject-duplicate-decision-op",
      requestId: "request-3",
      expectedVersion: 0,
      administratorId: "administrator",
      decidedAt: at,
      audit: audit("reject-duplicate-decision-op", at),
    }),
    "request_unavailable",
  );
  await store.recordAdminAudit({
    ...audit("permission-denied-op", at),
    commandName: "라이엇계정 승인",
    outcome: "denied",
    reasonCode: "administrator_required",
  });
  const decisions = await pool.query<{
    status: string;
    version: string;
    stale_reason: string;
    denied_outcome: string;
  }>(`
    select
      request.status,
      request.version::text,
      (select reason_code from audit_event where event_id = 'reject-stale-op') stale_reason,
      (select outcome from audit_event where event_id = 'permission-denied-op') denied_outcome
    from riot_account_link_request request
    where request.request_id = 'request-3'
  `);
  assert.deepEqual(decisions.rows, [{
    status: "rejected",
    version: "1",
    stale_reason: "riot_link_request_stale",
    denied_outcome: "denied",
  }]);

  await pool.query(`
    create function reject_riot_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'audit-failure-op' then
        raise exception 'synthetic audit failure';
      end if;
      return new;
    end
    $$;
    create trigger reject_riot_audit_fixture
      before insert on audit_event
      for each row execute function reject_riot_audit_fixture()
  `);
  try {
    await assert.rejects(
      request("audit-failure-op", "audit-failure-request", "감사실패계정", at),
      PersistenceError,
    );
    const rollback = await pool.query<{ operations: string; requests: string }>(`
      select
        (select count(*)::text from operation_ledger
          where operation_id = 'audit-failure-op') operations,
        (select count(*)::text from riot_account_link_request
          where request_id = 'audit-failure-request') requests
    `);
    assert.deepEqual(rollback.rows, [{ operations: "0", requests: "0" }]);
  } finally {
    await pool.query(`
      drop trigger reject_riot_audit_fixture on audit_event;
      drop function reject_riot_audit_fixture()
    `);
  }
});

function request(
  operationId: string,
  requestId: string,
  gameName: string,
  at: Date,
) {
  return store.requestLinkWithAudit({
    operationId,
    requestId,
    discordUserId: "actor",
    platformId: "KR",
    gameName,
    tagLine: "KR1",
    requestedAt: at,
    audit: audit(operationId, at),
  });
}

function approve(
  operationId: string,
  requestId: string,
  linkId: string,
  puuid: string,
  at: Date,
) {
  return store.approveRequestWithAudit({
    operationId,
    requestId,
    expectedVersion: 0,
    linkId,
    puuid,
    administratorId: "administrator",
    decidedAt: at,
    audit: audit(operationId, at),
  });
}

function audit(eventId: string, occurredAt: Date): CommandAuditEvent {
  return {
    eventId,
    correlationId: `correlation:${eventId}`,
    occurredAt,
    actorId: "actor",
    guildId: "guild",
    channelId: "channel",
    commandName: "라이엇계정 연결",
    outcome: "success",
    reasonCode: "fixture",
  };
}
