import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import type { AdminCommandRequest } from "../contracts/admin-command-ipc.ts";
import { AdminCommandApplication } from "../ipc/admin-command-application.ts";
import { PersistenceError } from "./postgres-persistence.ts";
import { PostgresRiotCommandStore } from "./postgres-riot-command-store.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
const at = new Date("2026-07-26T06:00:00.000Z");
const actorId = "123456789012345678";
const guildId = "223456789012345678";
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

test("application persists pagination and every terminal decision atomically", { skip: !enabled }, async () => {
  await seedPending("admin-request-01", "seed-operation-01", "Alpha", at);
  await seedPending("admin-request-02", "seed-operation-02", "Bravo", new Date(at.getTime() + 1_000));
  await seedPending("admin-request-03", "seed-operation-03", "Charlie", new Date(at.getTime() + 2_000));

  const application = createApplication();
  const first = await application.execute(command(
    "riot_link_request_list",
    { limit: 2 },
    "admin-list-operation-01",
  ));
  assert.equal(first.outcome, "success");
  assert.equal(first.result.kind, "riot_link_request_page");
  assert.equal(first.result.requests.length, 2);
  assert.ok(first.result.nextCursor);
  const second = await application.execute(command(
    "riot_link_request_list",
    { limit: 2, cursor: first.result.nextCursor },
    "admin-list-operation-02",
  ));
  assert.equal(second.outcome, "success");
  assert.equal(second.result.kind, "riot_link_request_page");
  assert.equal(second.result.requests[0]?.requestId, "admin-request-03");

  const stale = await application.execute(command(
    "riot_link_request_approve",
    approval("admin-request-01", 9, "admin-link-01", "A".repeat(64)),
    "admin-stale-operation",
  ));
  assert.equal(stale.outcome, "conflict");
  assert.equal(stale.reasonCode, "riot_link_request_stale");

  const approvedRequest = command(
    "riot_link_request_approve",
    approval("admin-request-01", 0, "admin-link-01", "A".repeat(64)),
    "admin-approve-operation",
  );
  const approved = await application.execute(approvedRequest);
  assert.equal(approved.outcome, "success");
  const duplicate = await application.execute(approvedRequest);
  assert.equal(duplicate.outcome, "success");
  assert.equal(duplicate.result.kind, "operation_status");
  assert.equal(duplicate.result.status, "success");

  const conflict = await application.execute(command(
    "riot_link_request_approve",
    approval("admin-request-02", 0, "admin-link-02", "A".repeat(64)),
    "admin-conflict-operation",
  ));
  assert.equal(conflict.outcome, "conflict");
  assert.equal(conflict.reasonCode, "riot_active_puuid_conflict");

  const removedRequest = command(
    "riot_link_remove",
    {
      linkId: "link:admin-approve-operation",
      expectedVersion: 0,
      confirmation: true,
    },
    "admin-remove-operation",
  );
  const removed = await application.execute(removedRequest);
  assert.equal(removed.outcome, "success");
  assert.equal(removed.result.kind, "riot_link_removal");
  const removedDuplicate = await application.execute(removedRequest);
  assert.equal(removedDuplicate.outcome, "success");
  assert.equal(removedDuplicate.result.kind, "operation_status");
  assert.equal(
    (
      await pool.query<{ version: string }>(
        `select version::text
           from riot_account_link
          where link_id = 'link:admin-approve-operation'`,
      )
    ).rows[0]?.version,
    "1",
  );

  const unavailable = await createApplication(true).execute(command(
    "riot_link_request_approve",
    approval("admin-request-03", 0, "admin-link-03", "B".repeat(64)),
    "admin-validator-operation",
  ));
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(unavailable.reasonCode, "validator_unavailable");

  const terminalRows = await pool.query<{ operation_id: string }>(
    `select operation_id from admin_command_result
      where operation_id in (
        'admin-list-operation-01','admin-list-operation-02',
        'admin-stale-operation','admin-approve-operation','admin-remove-operation',
        'admin-conflict-operation','admin-validator-operation'
      )`,
  );
  assert.equal(terminalRows.rowCount, 7);

  await pool.query(`
    create function fail_task2_audit() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'admin-atomic-operation' then
        raise exception 'forced audit failure';
      end if;
      return new;
    end $$;
    create trigger fail_task2_audit before insert on audit_event
      for each row execute function fail_task2_audit()
  `);
  await assert.rejects(
    application.execute(command(
      "riot_link_request_reject",
      { requestId: "admin-request-03", expectedVersion: 0 },
      "admin-atomic-operation",
    )),
    PersistenceError,
  );
  const rollback = await pool.query<{ status: string; operation: string | null; result: string | null }>(
    `select request.status,
            operation.operation_id as operation,
            result.operation_id as result
       from riot_account_link_request request
       left join operation_ledger operation
         on operation.operation_id = 'admin-atomic-operation'
       left join admin_command_result result
         on result.operation_id = 'admin-atomic-operation'
      where request.request_id = 'admin-request-03'`,
  );
  assert.deepEqual(rollback.rows, [{
    status: "pending_admin_approval",
    operation: null,
    result: null,
  }]);
  await pool.query("drop trigger fail_task2_audit on audit_event; drop function fail_task2_audit()");
});

test("current-role denial is terminal and occurs before target lookup", { skip: !enabled }, async () => {
  const denied = new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "operator" };
      },
    },
    validator: {
      async validate() {
        throw new Error("must not be reached");
      },
    },
    store,
    now: () => at,
  });
  const response = await denied.execute(command(
    "riot_link_request_approve",
    approval("missing-target", 0, "missing-link", "C".repeat(64)),
    "admin-denied-operation",
  ));
  assert.equal(response.outcome, "denied");
  const persisted = await store.findAdminCommandResult("admin-denied-operation");
  assert.equal(persisted?.reasonCode, "administrator_required");
});

function createApplication(validatorUnavailable = false) {
  return new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "administrator" };
      },
    },
    validator: {
      async resolve() {
        if (validatorUnavailable) throw new Error("validator unavailable");
        return { kind: "valid" as const, normalizedPuuid: "A".repeat(64) };
      },
      async validate(input) {
        if (validatorUnavailable) throw new Error("validator unavailable");
        return { kind: "valid", normalizedPuuid: input.puuid };
      },
    },
    store,
    now: () => at,
  });
}

function command(
  commandName: AdminCommandRequest["command"],
  payload: AdminCommandRequest["payload"],
  operationId: string,
): AdminCommandRequest {
  return {
    version: 1,
    requestId: `request_${operationId}`,
    operationId,
    actorId,
    guildId,
    requestedAt: new Date(at.getTime() - 5_000),
    expiresAt: new Date(at.getTime() + 5_000),
    command: commandName,
    payload,
  } as AdminCommandRequest;
}

function approval(requestId: string, expectedVersion: number, linkId: string, puuid: string) {
  return { requestId, expectedVersion, linkId, puuid };
}

async function seedPending(
  requestId: string,
  operationId: string,
  gameName: string,
  requestedAt: Date,
) {
  await pool.query(
    `insert into operation_ledger
       (operation_id, actor_id, accepted_at, outcome, reason_code)
     values ($1,$2,$3,'accepted','accepted')`,
    [operationId, actorId, requestedAt],
  );
  await pool.query(
    `insert into riot_account_link_request
       (request_id, operation_id, discord_user_id, platform_id, game_name,
        tag_line, status, requested_at)
     values ($1,$2,$3,'KR',$4,'KR1','pending_admin_approval',$5)`,
    [requestId, operationId, actorId, gameName, requestedAt],
  );
}
