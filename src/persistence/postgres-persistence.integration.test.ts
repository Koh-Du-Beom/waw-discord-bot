import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import {
  applyMigration,
  applyPendingMigrations,
  MigrationAlreadyAppliedError,
  MigrationChecksumMismatchError,
  PostgresPersistence,
  PersistenceError,
  readDatabaseSize,
} from "./postgres-persistence.ts";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "../..");
const migrationOnePath = path.join(projectRoot, "migrations/0001_auth_and_operations.sql");
const migrationTwoPath = path.join(projectRoot, "migrations/0002_application_persistence.sql");
const migrationOneSql = await readFile(migrationOnePath, "utf8");
const migrationTwoSql = await readFile(migrationTwoPath, "utf8");

let clusterDirectory = "";
let socketDirectory = "";
let adminPool: Pool;

async function createPool(user = process.env.USER ?? "postgres"): Promise<Pool> {
  const pool = new Pool({
    host: socketDirectory,
    database: "postgres",
    user,
    max: 4,
  });
  await pool.query("select 1");
  return pool;
}

before(async () => {
  clusterDirectory = await mkdtemp(path.join(tmpdir(), "waw-postgres-task1-"));
  socketDirectory = path.join(clusterDirectory, "socket");
  await execFileAsync("mkdir", [socketDirectory]);
  await execFileAsync("initdb", [
    "-D",
    path.join(clusterDirectory, "data"),
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  await execFileAsync("pg_ctl", [
    "-D",
    path.join(clusterDirectory, "data"),
    "-l",
    path.join(clusterDirectory, "postgres.log"),
    "-o",
    `-F -k ${socketDirectory} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  adminPool = await createPool();
});

after(async () => {
  await adminPool?.end();
  if (clusterDirectory.length > 0) {
    await execFileAsync("pg_ctl", [
      "-D",
      path.join(clusterDirectory, "data"),
      "-m",
      "fast",
      "-w",
      "stop",
    ]).catch(() => undefined);
    await rm(clusterDirectory, { recursive: true, force: true });
  }
});

test("applies migration transactionally, records version, and rejects reapplication", async () => {
  await applyMigration(adminPool, {
    version: 1,
    name: "auth_and_operations",
    sql: migrationOneSql,
  });
  await applyMigration(adminPool, {
    version: 2,
    name: "application_persistence",
    sql: migrationTwoSql,
  });

  const version = await adminPool.query<{ version: number }>(
    "select version from app_schema_version order by version",
  );
  assert.deepEqual(version.rows, [{ version: 1 }, { version: 2 }]);

  await assert.rejects(
    applyMigration(adminPool, {
      version: 2,
      name: "application_persistence",
      sql: migrationTwoSql,
    }),
    MigrationAlreadyAppliedError,
  );

  await assert.rejects(
    applyMigration(adminPool, {
      version: 3,
      name: "broken",
      sql: "create table should_rollback (id integer); select missing_column from should_rollback;",
    }),
  );
  const rolledBack = await adminPool.query<{ exists: string | null }>(
    "select to_regclass('public.should_rollback')::text as exists",
  );
  assert.equal(rolledBack.rows[0]?.exists, null);
});

test("adopts the exact production legacy version 1 before applying version 2", async () => {
  const databaseName = "waw_legacy_version_one_fixture";
  await adminPool.query(`create database ${databaseName}`);
  const legacyPool = new Pool({
    host: socketDirectory,
    database: databaseName,
    user: process.env.USER ?? "postgres",
    max: 1,
  });
  try {
    await legacyPool.query(migrationOneSql);
    await applyMigration(legacyPool, {
      version: 1,
      name: "auth_and_operations",
      sql: migrationOneSql,
    });
    await applyMigration(legacyPool, {
      version: 2,
      name: "application_persistence",
      sql: migrationTwoSql,
    });

    const versions = await legacyPool.query<{ version: number }>(
      "select version from app_schema_version order by version",
    );
    const ledger = await legacyPool.query<{ version: number }>(
      "select version from waw_schema_migration order by version",
    );
    assert.deepEqual(versions.rows, [{ version: 1 }, { version: 2 }]);
    assert.deepEqual(ledger.rows, [{ version: 1 }, { version: 2 }]);
    assert.equal(
      (
        await legacyPool.query(
          "select to_regclass('public.oauth_state')::text as relation",
        )
      ).rows[0]?.relation,
      "oauth_state",
    );
  } finally {
    await legacyPool.end();
    await adminPool.query(`drop database ${databaseName}`);
  }
});

test("refuses baseline adoption when the legacy fingerprint differs", async () => {
  const databaseName = "waw_legacy_mismatch_fixture";
  await adminPool.query(`create database ${databaseName}`);
  const legacyPool = new Pool({
    host: socketDirectory,
    database: databaseName,
    user: process.env.USER ?? "postgres",
    max: 1,
  });
  try {
    await legacyPool.query(migrationOneSql);
    await legacyPool.query("alter table app_session add column unexpected text");
    await assert.rejects(
      applyMigration(legacyPool, {
        version: 1,
        name: "auth_and_operations",
        sql: migrationOneSql,
      }),
      PersistenceError,
    );
    assert.equal(
      (
        await legacyPool.query(
          "select to_regclass('public.waw_schema_migration')::text as relation",
        )
      ).rows[0]?.relation,
      null,
    );
  } finally {
    await legacyPool.end();
    await adminPool.query(`drop database ${databaseName}`);
  }
});

test("resumes a migration sequence and rejects a changed applied checksum", async () => {
  const migrations = [
    { version: 1, name: "auth_and_operations", sql: migrationOneSql },
    { version: 2, name: "application_persistence", sql: migrationTwoSql },
  ] as const;
  assert.deepEqual(await applyPendingMigrations(adminPool, migrations), []);
  await assert.rejects(
    applyPendingMigrations(adminPool, [
      { ...migrations[0], sql: `${migrationOneSql}\n-- changed` },
      migrations[1],
    ]),
    MigrationChecksumMismatchError,
  );
});

test("enforces RLS and workload grants for web and bot roles", async () => {
  const rls = await adminPool.query<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity
       from pg_class
      where relname in (
        'app_session',
        'oauth_state',
        'role_cache',
        'operation_ledger',
        'audit_event'
      )
      order by relname`,
  );
  assert.equal(rls.rows.length, 5);
  assert.equal(rls.rows.every((row) => row.relrowsecurity), true);
  const foreignKeys = await adminPool.query<{ constraint_name: string }>(
    `select constraint_name
       from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'audit_event'
        and constraint_type = 'FOREIGN KEY'`,
  );
  assert.equal(foreignKeys.rowCount, 1);

  await adminPool.query(`
    create role waw_web_test login;
    grant waw_web to waw_web_test;
    create role waw_bot_test login;
    grant waw_bot to waw_bot_test;
  `);

  const webPool = await createPool("waw_web_test");
  const botPool = await createPool("waw_bot_test");
  try {
    await webPool.query("select session_id_hash from app_session");
    await webPool.query("select actor_id from role_cache");
    const webPersistence = new PostgresPersistence(webPool);
    await webPersistence.saveSession({
      sessionIdHash: "web-role-session-hash",
      actorId: "web-role-actor",
      authorizationTier: "operator",
      createdAt: new Date("2026-07-23T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-23T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-07-24T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
    });
    assert.equal(
      (await webPersistence.findSession("web-role-session-hash"))?.actorId,
      "web-role-actor",
    );
    await botPool.query("select actor_id from role_cache");
    await botPool.query(
      `insert into role_cache (actor_id, authorization_tier, verified_at)
       values ('bot-role-fixture', 'operator', '2026-07-23T00:00:00Z')`,
    );

    await assert.rejects(botPool.query("select session_id_hash from app_session"), /permission denied/);
    await assert.rejects(
      botPool.query(
        `insert into audit_event (
          event_id, occurred_at, event_type, actor_id, outcome, reason_code, correlation_id
        ) values (
          'bot-forbidden-audit', now(), 'fixture', null, 'success', 'fixture', 'fixture'
        )`,
      ),
      /permission denied/,
    );
    await assert.rejects(webPool.query("create table forbidden_by_runtime (id integer)"), /permission denied/);
  } finally {
    await webPool.end();
    await botPool.end();
  }
});

test("persists session rotation, bounded idle touch, OAuth state, and role cache", async () => {
  const persistence = new PostgresPersistence(adminPool);
  const createdAt = new Date("2026-07-23T00:00:00.000Z");
  await persistence.saveSession({
    sessionIdHash: "old-session-hash",
    actorId: "actor-1",
    authorizationTier: "operator",
    createdAt,
    lastSeenAt: createdAt,
    idleExpiresAt: new Date("2026-07-24T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
  });

  await persistence.rotateSession(
    "old-session-hash",
    {
      sessionIdHash: "new-session-hash",
      actorId: "actor-1",
      authorizationTier: "administrator",
      createdAt: new Date("2026-07-23T01:00:00.000Z"),
      lastSeenAt: new Date("2026-07-23T01:00:00.000Z"),
      idleExpiresAt: new Date("2026-07-24T01:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-07-30T01:00:00.000Z"),
    },
    new Date("2026-07-23T01:00:00.000Z"),
  );
  assert.equal((await persistence.findSession("old-session-hash"))?.revokedAt?.toISOString(), "2026-07-23T01:00:00.000Z");
  assert.equal((await persistence.findSession("new-session-hash"))?.authorizationTier, "administrator");

  await persistence.touchSession(
    "new-session-hash",
    new Date("2026-07-24T00:30:00.000Z"),
    new Date("2026-07-31T12:00:00.000Z"),
  );
  assert.equal(
    (await persistence.findSession("new-session-hash"))?.idleExpiresAt.toISOString(),
    "2026-07-30T01:00:00.000Z",
  );

  await persistence.createOAuthState({
    stateHash: "oauth-state-hash",
    expiresAt: new Date("2026-07-23T00:10:00.000Z"),
  });
  assert.equal(
    await persistence.consumeOAuthState(
      "oauth-state-hash",
      new Date("2026-07-23T00:05:00.000Z"),
    ),
    true,
  );
  assert.equal(
    await persistence.consumeOAuthState(
      "oauth-state-hash",
      new Date("2026-07-23T00:06:00.000Z"),
    ),
    false,
  );

  await persistence.createOAuthState({
    stateHash: "expired-oauth-state-hash",
    expiresAt: new Date("2026-07-23T00:10:00.000Z"),
  });
  assert.equal(
    await persistence.consumeOAuthState(
      "expired-oauth-state-hash",
      new Date("2026-07-23T00:10:00.000Z"),
    ),
    false,
  );

  await persistence.upsertRoleCache({
    actorId: "actor-1",
    authorizationTier: "operator",
    verifiedAt: new Date("2026-07-23T00:00:00.000Z"),
  });
  assert.equal(
    (await persistence.findFreshRoleCache("actor-1", new Date("2026-07-23T00:05:00.000Z")))
      ?.authorizationTier,
    "operator",
  );
  assert.equal(
    await persistence.findFreshRoleCache("actor-1", new Date("2026-07-23T00:05:00.001Z")),
    undefined,
  );
});

test("claims one concurrent operation and rolls back operation when audit append fails", async () => {
  const persistence = new PostgresPersistence(adminPool);
  const attempts = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      persistence.recordOperationWithAudit({
        operationId: "concurrent-operation",
        actorId: "actor-1",
        acceptedAt: new Date("2026-07-23T02:00:00.000Z"),
        operationOutcome: "accepted",
        operationReasonCode: "accepted",
        audit: {
          eventId: `concurrent-event-${index}`,
          occurredAt: new Date("2026-07-23T02:00:00.000Z"),
          eventType: "setting.update",
          actorId: "actor-1",
          outcome: "success",
          reasonCode: "updated",
          correlationId: `correlation-${index}`,
        },
      }),
    ),
  );
  assert.equal(attempts.filter(Boolean).length, 1);

  await assert.rejects(
    persistence.recordOperationWithAudit({
      operationId: "rolled-back-operation",
      actorId: "actor-1",
      acceptedAt: new Date("2026-07-23T03:00:00.000Z"),
      operationOutcome: "accepted",
      operationReasonCode: "accepted",
      audit: {
        eventId: "rolled-back-event",
        occurredAt: new Date("2026-07-23T03:00:00.000Z"),
        eventType: "setting.update",
        actorId: "actor-1",
        outcome: "not-an-allowed-outcome",
        reasonCode: "fixture",
        correlationId: "rolled-back-correlation",
      },
    }),
    PersistenceError,
  );
  const operation = await adminPool.query(
    "select operation_id from operation_ledger where operation_id = 'rolled-back-operation'",
  );
  assert.equal(operation.rowCount, 0);
});

test("reports non-secret database size and redacts provider failures", async () => {
  const snapshot = await readDatabaseSize(adminPool, 500_000_000);
  assert.equal(snapshot.databaseBytes > 0, true);
  assert.equal(snapshot.quotaBytes, 500_000_000);
  assert.equal(snapshot.usagePercent > 0, true);
  assert.equal(["ok", "warning", "critical"].includes(snapshot.status), true);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "databaseBytes",
    "observedAt",
    "quotaBytes",
    "status",
    "usagePercent",
  ]);

  const secretCanaries = [
    "database-password-canary",
    "raw-session-canary",
    "oauth-token-canary",
  ] as const;
  const failingPool = new Pool({
    host: "127.0.0.1",
    port: 1,
    database: "unavailable",
    user: "fixture",
    password: secretCanaries[0]!,
    connectionTimeoutMillis: 250,
  });
  const persistence = new PostgresPersistence(failingPool);
  let failure: unknown;
  try {
    await persistence.findSession(secretCanaries[1]);
  } catch (error) {
    failure = error;
  } finally {
    await failingPool.end();
  }
  assert.equal(failure instanceof PersistenceError, true);
  const serialized = JSON.stringify(failure);
  for (const canary of secretCanaries) {
    assert.equal(serialized.includes(canary), false);
  }
});
