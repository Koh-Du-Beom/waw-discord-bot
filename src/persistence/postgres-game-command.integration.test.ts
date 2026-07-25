import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { PostgresFeatureStore } from "./feature-store.ts";
import { PersistenceError } from "./postgres-persistence.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
let pool: Pool;
let store: PostgresFeatureStore;

before(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 4 });
  store = new PostgresFeatureStore(pool);
  await pool.query(`
    insert into riot_game (game_key, platform_id, game_id, queue_id, started_at)
    values ('KR:command-game', 'KR', 'command-game', 420, '2026-07-25T00:00:00Z');
    insert into game_observation (
      observation_id, game_key, discord_user_id, source, state,
      observed_at, evidence_code, generation
    ) values
      ('command-riot-1', 'KR:command-game', 'command-member',
       'riot_spectator', 'active', '2026-07-25T00:06:00Z', 'spectator_active', 1),
      ('command-discord-1', 'KR:command-game', 'command-member',
       'discord_voice', 'inactive', '2026-07-25T00:06:00Z', 'voice_state_event', 1);
    insert into game_incident (
      incident_id, game_key, discord_user_id, status, comparison_state,
      policy_version, version, created_at, updated_at
    ) values (
      'command-incident', 'KR:command-game', 'command-member', 'open',
      'violation', 1, 0, '2026-07-25T00:06:00Z', '2026-07-25T00:06:00Z'
    )
  `);
});

after(async () => {
  await pool?.end();
});

test(
  "reads separate evidence and makes incident revision plus audit atomic",
  { skip: !enabled },
  async () => {
    const status = await store.listStatus("command-member");
    assert.equal(status[0]?.riotState, "active");
    assert.equal(status[0]?.goLiveState, "inactive");
    assert.equal(status[0]?.comparisonState, "violation");

    assert.equal(
      await store.mutateWithAudit(mutation("stale-command-op", 9, "correct")),
      "conflict",
    );
    assert.equal(
      await store.mutateWithAudit(mutation("correct-command-op", 0, "correct")),
      "updated",
    );
    const committed = await pool.query<{
      status: string;
      version: string;
      action: string;
      reason_code: string;
    }>(`
      select incident.status, incident.version::text, revision.action, audit.reason_code
        from game_incident incident
        join game_incident_revision revision
          on revision.incident_id = incident.incident_id
        join audit_event audit
          on audit.operation_id = revision.operation_id
       where incident.incident_id = 'command-incident'
    `);
    assert.deepEqual(committed.rows, [{
      status: "corrected",
      version: "1",
      action: "correct",
      reason_code: "correct_completed",
    }]);

    await pool.query(`
      update game_incident
         set status = 'open', version = 2
       where incident_id = 'command-incident';
      create function reject_game_audit_fixture() returns trigger language plpgsql as $$
      begin
        if new.event_id = 'incident:audit-failure-game-op' then
          raise exception 'synthetic audit failure';
        end if;
        return new;
      end
      $$;
      create trigger reject_game_audit_fixture
        before insert on audit_event
        for each row execute function reject_game_audit_fixture()
    `);
    try {
      await assert.rejects(
        store.mutateWithAudit(mutation("audit-failure-game-op", 2, "cancel")),
        PersistenceError,
      );
      const rollback = await pool.query<{
        status: string;
        version: string;
        operations: string;
        revisions: string;
      }>(`
        select status, version::text,
          (select count(*)::text from operation_ledger
            where operation_id = 'audit-failure-game-op') operations,
          (select count(*)::text from game_incident_revision
            where operation_id = 'audit-failure-game-op') revisions
        from game_incident where incident_id = 'command-incident'
      `);
      assert.deepEqual(rollback.rows, [{
        status: "open",
        version: "2",
        operations: "0",
        revisions: "0",
      }]);
    } finally {
      await pool.query(`
        drop trigger reject_game_audit_fixture on audit_event;
        drop function reject_game_audit_fixture()
      `);
    }
  },
);

function mutation(
  operationId: string,
  expectedVersion: number,
  action: "correct" | "cancel",
) {
  return {
    operationId,
    incidentId: "command-incident",
    expectedVersion,
    actorId: "administrator",
    authorizationTier: "administrator" as const,
    action,
    reason: "API 장애로 인한 오탐",
    occurredAt: new Date("2026-07-25T01:00:00Z"),
  };
}
