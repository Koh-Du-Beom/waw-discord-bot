import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createAuthService } from "../auth/auth-service.ts";
import { parseAuthConfiguration } from "../auth/oauth-configuration.ts";
import { hashOpaqueSessionId } from "./session-store.ts";
import { PostgresFeatureStore } from "./feature-store.ts";
import { RiotAccountLinkService } from "../riot/account-link.ts";
import { PostgresRiotCommandStore } from "./postgres-riot-command-store.ts";
import { PostgresDiscordMemberLabelStore } from "./discord-member-label-store.ts";
import { PostgresRiotIdentityStore } from "./postgres-riot-identity-store.ts";
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
const migrationThreePath = path.join(projectRoot, "migrations/0003_session_recent_auth.sql");
const migrationFourPath = path.join(projectRoot, "migrations/0004_dashboard_settings.sql");
const migrationFivePath = path.join(projectRoot, "migrations/0005_summary_riot_game.sql");
const migrationSixPath = path.join(projectRoot, "migrations/0006_admin_command_result.sql");
const migrationSevenPath = path.join(projectRoot, "migrations/0007_summary_daily_quota.sql");
const migrationEightPath = path.join(projectRoot, "migrations/0008_summary_hourly_cooldown.sql");
const migrationNinePath = path.join(projectRoot, "migrations/0009_riot_link_version.sql");
const migrationTenPath = path.join(projectRoot, "migrations/0010_riot_link_removal_result.sql");
const migrationElevenPath = path.join(projectRoot, "migrations/0011_game_observation_source_time.sql");
const migrationOneSql = await readFile(migrationOnePath, "utf8");
const migrationTwoSql = await readFile(migrationTwoPath, "utf8");
const migrationThreeSql = await readFile(migrationThreePath, "utf8");
const migrationFourSql = await readFile(migrationFourPath, "utf8");
const migrationFiveSql = await readFile(migrationFivePath, "utf8");
const migrationSixSql = await readFile(migrationSixPath, "utf8");
const migrationSevenSql = await readFile(migrationSevenPath, "utf8");
const migrationEightSql = await readFile(migrationEightPath, "utf8");
const migrationNineSql = await readFile(migrationNinePath, "utf8");
const migrationTenSql = await readFile(migrationTenPath, "utf8");
const migrationElevenSql = await readFile(migrationElevenPath, "utf8");

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
  await mkdir(socketDirectory);
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
  await applyMigration(adminPool, {
    version: 3,
    name: "session_recent_auth",
    sql: migrationThreeSql,
  });
  await applyMigration(adminPool, {
    version: 4,
    name: "dashboard_settings",
    sql: migrationFourSql,
  });
  await applyMigration(adminPool, {
    version: 5,
    name: "summary_riot_game",
    sql: migrationFiveSql,
  });
  await applyMigration(adminPool, {
    version: 6,
    name: "admin_command_result",
    sql: migrationSixSql,
  });
  await applyMigration(adminPool, {
    version: 7,
    name: "summary_daily_quota",
    sql: migrationSevenSql,
  });
  await applyMigration(adminPool, {
    version: 8,
    name: "summary_hourly_cooldown",
    sql: migrationEightSql,
  });
  await adminPool.query(
    `insert into riot_account_link (
       link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
       verification_method, approved_by, created_at
     ) values (
       'pre-version-link','pre-version-member','pre-version-puuid','KR',
       'name','KR1','admin_approved_unverified','admin',now()
     )`,
  );
  await applyMigration(adminPool, {
    version: 9,
    name: "riot_link_version",
    sql: migrationNineSql,
  });
  await applyMigration(adminPool, {
    version: 10,
    name: "riot_link_removal_result",
    sql: migrationTenSql,
  });
  await applyMigration(adminPool, {
    version: 11,
    name: "game_observation_source_time",
    sql: migrationElevenSql,
  });

  const version = await adminPool.query<{ version: number }>(
    "select version from app_schema_version order by version",
  );
  assert.deepEqual(version.rows, [
    { version: 1 },
    { version: 2 },
    { version: 3 },
    { version: 4 },
    { version: 5 },
    { version: 6 },
    { version: 7 },
    { version: 8 },
    { version: 9 },
    { version: 10 },
    { version: 11 },
  ]);

  const linkVersion = await adminPool.query<{
    column_default: string | null;
    is_nullable: string;
  }>(
    `select column_default, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'riot_account_link'
        and column_name = 'version'`,
  );
  assert.equal(linkVersion.rows[0]?.column_default, "0");
  assert.equal(linkVersion.rows[0]?.is_nullable, "NO");
  assert.equal(
    (
      await adminPool.query<{ version: string }>(
        "select version::text from riot_account_link where link_id = 'pre-version-link'",
      )
    ).rows[0]?.version,
    "0",
  );
  await assert.rejects(
    adminPool.query(
      `insert into riot_account_link (
         link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
         verification_method, approved_by, created_at, version
       ) values (
         'negative-version-link','member','negative-version-puuid','KR',
         'name','KR1','admin_approved_unverified','admin',now(),-1
       )`,
    ),
    /check constraint/u,
  );

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

test("enforces Riot 1:N ownership and platform/game deduplication in PostgreSQL", async () => {
  const service = new RiotAccountLinkService(new PostgresFeatureStore(adminPool));
  const base = {
    platformId: "KR",
    gameName: "표시 이름",
    tagLine: "KR1",
    administratorId: "administrator",
    createdAt: new Date("2026-07-25T00:00:00Z"),
  };
  await service.approve({
    ...base,
    linkId: "pg-link-1",
    discordUserId: "discord-1",
    puuid: "pg-puuid-1",
  });
  await service.approve({
    ...base,
    linkId: "pg-link-2",
    discordUserId: "discord-1",
    puuid: "pg-puuid-2",
  });
  assert.equal((await service.list("discord-1")).length, 2);
  await assert.rejects(
    adminPool.query(
      `insert into riot_account_link (
        link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
        verification_method, is_primary, approved_by, created_at
      ) values (
        'pg-link-conflict', 'discord-2', 'pg-puuid-1', 'KR', '다른 이름',
        'KR1', 'admin_approved_unverified', false, 'administrator', now()
      )`,
    ),
    /duplicate key/,
  );
  await adminPool.query(
    `insert into riot_game (game_key, platform_id, game_id, queue_id, started_at)
     values ('KR:game-1', 'KR', 'game-1', 420, now())`,
  );
  await assert.rejects(
    adminPool.query(
      `insert into riot_game (game_key, platform_id, game_id, queue_id, started_at)
       values ('another-key', 'KR', 'game-1', 420, now())`,
    ),
    /duplicate key/,
  );
});

test("refreshes mutable Discord and Riot display metadata without changing permanent identities", async () => {
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ('guild', 'discord-1', '이전 닉네임', now(), now())
     on conflict (guild_id, discord_user_id) do update
       set display_label = excluded.display_label`,
  );
  const labels = new PostgresDiscordMemberLabelStore(adminPool);
  await labels.refreshKnown([{
    guildId: "guild",
    discordUserId: "discord-1",
    displayLabel: "최신 닉네임",
  }], new Date("2026-07-29T00:00:00Z"));

  const identities = new PostgresRiotIdentityStore(adminPool);
  await identities.updateIdentity({
    linkId: "pg-link-1",
    puuid: "pg-puuid-1",
    platformId: "KR",
    version: 0,
    gameName: "변경된 이름",
    tagLine: "NEW",
  });
  await identities.updateIdentity({
    linkId: "pg-link-1",
    puuid: "pg-puuid-1",
    platformId: "KR",
    version: 0,
    gameName: "오래된 쓰기",
    tagLine: "OLD",
  });

  const result = await adminPool.query<{
    discord_user_id: string;
    puuid: string;
    game_name: string;
    tag_line: string;
    version: string;
    removed_at: Date | null;
    display_label: string;
  }>(
    `select link.discord_user_id, link.puuid, link.game_name, link.tag_line,
            link.version::text, link.removed_at, users.display_label
       from riot_account_link link
       join registered_discord_user users
         on users.guild_id = 'guild'
        and users.discord_user_id = link.discord_user_id
      where link.link_id = 'pg-link-1'`,
  );
  assert.deepEqual(result.rows[0], {
    discord_user_id: "discord-1",
    puuid: "pg-puuid-1",
    game_name: "변경된 이름",
    tag_line: "NEW",
    version: "1",
    removed_at: null,
    display_label: "최신 닉네임",
  });
});

test("keeps Riot requests pending before approval and commits conflicts with audit atomically", async () => {
  const store = new PostgresRiotCommandStore(adminPool);
  const occurredAt = new Date("2026-07-25T05:00:00Z");
  const request = async (
    operationId: string,
    requestId: string,
    gameName: string,
  ) =>
    store.requestLinkWithAudit({
      operationId,
      requestId,
      discordUserId: "riot-command-user",
      platformId: "KR",
      gameName,
      tagLine: "KR1",
      requestedAt: occurredAt,
      audit: commandAudit(operationId, "라이엇계정 연결", occurredAt),
    });
  assert.equal(await request("riot-request-op-1", "riot-request-1", "첫계정"), "created");
  assert.equal(
    await request("riot-request-op-duplicate", "riot-request-duplicate", "첫계정"),
    "already_pending",
  );
  const beforeApproval = await store.list({
    discordUserId: "riot-command-user",
    includePending: true,
  });
  assert.deepEqual(beforeApproval.map((item) => item.kind), ["pending"]);

  assert.equal(
    await store.approveRequestWithAudit({
      operationId: "riot-approve-op-1",
      requestId: "riot-request-1",
      expectedVersion: 0,
      linkId: "riot-approved-link-1",
      puuid: "riot-approved-puuid",
      administratorId: "administrator",
      decidedAt: occurredAt,
      audit: commandAudit("riot-approve-op-1", "라이엇계정 연결", occurredAt),
    }),
    "approved",
  );
  assert.equal(
    await request("riot-request-op-active", "riot-request-active", "첫계정"),
    "already_linked",
  );
  assert.equal(await request("riot-request-op-2", "riot-request-2", "둘째계정"), "created");
  assert.equal(
    await store.approveRequestWithAudit({
      operationId: "riot-approve-op-conflict",
      requestId: "riot-request-2",
      expectedVersion: 0,
      linkId: "riot-approved-link-conflict",
      puuid: "riot-approved-puuid",
      administratorId: "administrator",
      decidedAt: occurredAt,
      audit: commandAudit("riot-approve-op-conflict", "라이엇계정 연결", occurredAt),
    }),
    "puuid_conflict",
  );
  const conflict = await adminPool.query<{ status: string; reason_code: string }>(
    `select request.status, audit.reason_code
       from riot_account_link_request request
       join audit_event audit on audit.event_id = 'riot-approve-op-conflict'
      where request.request_id = 'riot-request-2'`,
  );
  assert.deepEqual(conflict.rows, [{
    status: "pending_admin_approval",
    reason_code: "riot_active_puuid_conflict",
  }]);

  await adminPool.query(`
    create function reject_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'audit-failure-operation' then
        raise exception 'synthetic audit failure';
      end if;
      return new;
    end
    $$;
    create trigger reject_audit_fixture
      before insert on audit_event
      for each row execute function reject_audit_fixture()
  `);
  try {
    await assert.rejects(
      request("audit-failure-operation", "audit-failure-request", "감사실패계정"),
      PersistenceError,
    );
    const rolledBack = await adminPool.query<{ operations: string; requests: string }>(`
      select
        (select count(*)::text from operation_ledger
          where operation_id = 'audit-failure-operation') as operations,
        (select count(*)::text from riot_account_link_request
          where request_id = 'audit-failure-request') as requests
    `);
    assert.deepEqual(rolledBack.rows, [{ operations: "0", requests: "0" }]);
  } finally {
    await adminPool.query(`
      drop trigger reject_audit_fixture on audit_event;
      drop function reject_audit_fixture()
    `);
  }
});

function commandAudit(
  eventId: string,
  commandName: "라이엇계정 연결",
  occurredAt: Date,
) {
  return {
    eventId,
    correlationId: `correlation:${eventId}`,
    occurredAt,
    actorId: "riot-command-user",
    guildId: "guild",
    channelId: "channel",
    commandName,
    outcome: "success" as const,
    reasonCode: "fixture",
  };
}

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
    await applyMigration(legacyPool, {
      version: 3,
      name: "session_recent_auth",
      sql: migrationThreeSql,
    });
    await applyMigration(legacyPool, {
      version: 4,
      name: "dashboard_settings",
      sql: migrationFourSql,
    });

    const versions = await legacyPool.query<{ version: number }>(
      "select version from app_schema_version order by version",
    );
    const ledger = await legacyPool.query<{ version: number }>(
      "select version from waw_schema_migration order by version",
    );
    assert.deepEqual(versions.rows, [
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
    ]);
    assert.deepEqual(ledger.rows, [
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
    ]);
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
    { version: 3, name: "session_recent_auth", sql: migrationThreeSql },
    { version: 4, name: "dashboard_settings", sql: migrationFourSql },
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

test("resumes from the exact mixed-line-ending production ledger", async () => {
  const productionHistoricalChecksums = [
    [1, "337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10"],
    [2, "fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d"],
    [3, "f7f94d1f2c5b4d5f39fd763f36f7b7d8819462f818d37052bf51507058edc184"],
    [4, "a48187b28dc3726726e5bef174a6e9b01a33ba7779c75ad93c68b0e3485e6419"],
    [5, "d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66d71f97972b71d32a"],
  ] as const;
  for (const [version, sha256] of productionHistoricalChecksums) {
    await adminPool.query(
      "update waw_schema_migration set sha256 = $2 where version = $1",
      [version, sha256],
    );
  }

  assert.deepEqual(
    await applyPendingMigrations(adminPool, [
      { version: 1, name: "auth_and_operations", sql: migrationOneSql },
      { version: 2, name: "application_persistence", sql: migrationTwoSql },
      { version: 3, name: "session_recent_auth", sql: migrationThreeSql },
      { version: 4, name: "dashboard_settings", sql: migrationFourSql },
      { version: 5, name: "summary_riot_game", sql: migrationFiveSql },
      { version: 6, name: "admin_command_result", sql: migrationSixSql },
      { version: 7, name: "summary_daily_quota", sql: migrationSevenSql },
      { version: 8, name: "summary_hourly_cooldown", sql: migrationEightSql },
    ]),
    [],
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
        'audit_event',
        'dashboard_setting'
      )
      order by relname`,
  );
  assert.equal(rls.rows.length, 6);
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
    await webPool.query("select summary_enabled from dashboard_setting");
    const webPersistence = new PostgresPersistence(webPool);
    await webPersistence.saveSession({
      sessionIdHash: "web-role-session-hash",
      actorId: "web-role-actor",
      authorizationTier: "operator",
      createdAt: new Date("2026-07-23T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-23T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-07-24T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
      lastOAuthCompletedAt: new Date("2026-07-23T00:00:00.000Z"),
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
    await botPool.query("select summary_enabled from dashboard_setting");
    await assert.rejects(
      botPool.query("update dashboard_setting set summary_enabled = false"),
      /permission denied/,
    );
    await botPool.query(
      `insert into audit_event (
        event_id, occurred_at, event_type, actor_id, outcome, reason_code, correlation_id
      ) values (
        'bot-allowed-audit', now(), 'fixture', null, 'success', 'fixture', 'fixture'
      )`,
    );
    assert.equal(
      (
        await adminPool.query<{ count: string }>(
          "select count(*)::text as count from audit_event where event_id = 'bot-allowed-audit'",
        )
      ).rows[0]?.count,
      "1",
    );
    await assert.rejects(botPool.query("select event_id from audit_event"), /permission denied/);
    await assert.rejects(
      botPool.query(
        "update audit_event set reason_code = 'forbidden' where event_id = 'bot-allowed-audit'",
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
    lastOAuthCompletedAt: createdAt,
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
      lastOAuthCompletedAt: createdAt,
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

test("atomically consumes OAuth state, rotates session, and records role evidence", async () => {
  const persistence = new PostgresPersistence(adminPool);
  const completedAt = new Date("2026-07-23T04:00:00.000Z");
  await persistence.createOAuthState({
    stateHash: "callback-state-hash",
    expiresAt: new Date("2026-07-23T04:10:00.000Z"),
  });
  await persistence.saveSession({
    sessionIdHash: "callback-previous-session-hash",
    actorId: "callback-actor",
    authorizationTier: "operator",
    createdAt: new Date("2026-07-23T03:00:00.000Z"),
    lastSeenAt: new Date("2026-07-23T03:00:00.000Z"),
    idleExpiresAt: new Date("2026-07-24T03:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-30T03:00:00.000Z"),
    lastOAuthCompletedAt: new Date("2026-07-23T03:00:00.000Z"),
  });
  const nextSession = {
    sessionIdHash: "callback-next-session-hash",
    actorId: "callback-actor",
    authorizationTier: "administrator" as const,
    createdAt: completedAt,
    lastSeenAt: completedAt,
    idleExpiresAt: new Date("2026-07-24T04:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-30T04:00:00.000Z"),
    lastOAuthCompletedAt: completedAt,
  };

  assert.equal(
    await persistence.completeOAuthCallback({
      stateHash: "callback-state-hash",
      completedAt,
      previousSessionIdHash: "callback-previous-session-hash",
      session: nextSession,
      roleCache: {
        actorId: "callback-actor",
        authorizationTier: "administrator",
        verifiedAt: completedAt,
      },
    }),
    "completed",
  );
  assert.equal(
    (await persistence.findSession("callback-previous-session-hash"))?.revokedAt?.toISOString(),
    completedAt.toISOString(),
  );
  assert.equal(
    (await persistence.findSession("callback-next-session-hash"))?.lastOAuthCompletedAt.toISOString(),
    completedAt.toISOString(),
  );
  assert.equal(
    (
      await persistence.findFreshRoleCache(
        "callback-actor",
        new Date("2026-07-23T04:05:00.000Z"),
      )
    )?.authorizationTier,
    "administrator",
  );
  assert.equal(
    await persistence.completeOAuthCallback({
      stateHash: "callback-state-hash",
      completedAt: new Date("2026-07-23T04:01:00.000Z"),
      session: { ...nextSession, sessionIdHash: "callback-replay-session-hash" },
      roleCache: {
        actorId: "callback-actor",
        authorizationTier: "administrator",
        verifiedAt: new Date("2026-07-23T04:01:00.000Z"),
      },
    }),
    "state-invalid",
  );
  assert.equal(await persistence.findSession("callback-replay-session-hash"), undefined);
});

test("composes login, callback, session touch, and logout against disposable PostgreSQL", async () => {
  const persistence = new PostgresPersistence(adminPool);
  const composedAt = new Date("2026-07-23T05:00:00.000Z");
  const rawState = "postgres-state-canary-0123456789abcdef";
  const rawSession = "postgres-session-canary-0123456789abcdef";
  const csrfKey = "postgres-csrf-key-0123456789abcdef";
  const configuration = parseAuthConfiguration({
    environment: "production",
    clientId: "7100",
    clientSecret: "synthetic-client-secret",
    redirectUri: "https://waw.dubeom.com/auth/discord/callback",
    allowedOrigin: "https://waw.dubeom.com",
    allowedGuildId: "7200",
    operatorRoleIds: "7300",
    administratorRoleIds: "7400",
    providerTimeoutMilliseconds: "2500",
  });
  const service = createAuthService({
    configuration,
    provider: {
      createAuthorizationUrl(state) {
        const url = new URL("https://discord.com/oauth2/authorize");
        url.searchParams.set("client_id", "7100");
        url.searchParams.set(
          "redirect_uri",
          "https://waw.dubeom.com/auth/discord/callback",
        );
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "identify");
        url.searchParams.set("state", state);
        return url.href;
      },
      async exchangeCode() {
        return { accessToken: "synthetic-access-token" };
      },
      async fetchIdentity() {
        return { id: "7500" };
      },
    },
    memberReader: {
      async readCurrentMember() {
        return {
          kind: "member",
          guildId: "7200",
          guildOwnerId: "7999",
          roleIds: ["7300"],
        };
      },
    },
    persistence,
    csrfKey,
    now: () => composedAt,
    generateOAuthState: () => rawState,
    generateSessionId: () => rawSession,
  });

  const login = await service.login();
  assert.equal(login.statusCode, 302);
  assert.equal(
    await persistence.isOAuthStateUsable(
      hashOpaqueSessionId(rawState),
      composedAt,
    ),
    true,
  );

  const callback = await service.callback({
    method: "GET",
    url:
      "https://waw.dubeom.com/auth/discord/callback" +
      `?code=synthetic-code&state=${rawState}`,
    headers: {
      cookie: (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0],
    },
  });
  assert.equal(callback.statusCode, 303);
  assert.equal(
    await persistence.isOAuthStateUsable(
      hashOpaqueSessionId(rawState),
      composedAt,
    ),
    false,
  );
  const setCookie = callback.headers["set-cookie"];
  assert.ok(Array.isArray(setCookie));
  const cookie = setCookie
    .map((value) => value.slice(0, value.indexOf(";")))
    .join("; ");
  const csrf = cookie
    .split("; ")
    .find((value) => value.startsWith("__Host-waw_csrf="))
    ?.split("=")[1];
  assert.ok(csrf);

  const read = await service.authorize({
    kind: "read",
    headers: { cookie },
  });
  assert.equal(read.statusCode, 200);
  assert.equal(
    (
      await persistence.findSession(hashOpaqueSessionId(rawSession))
    )?.lastSeenAt.toISOString(),
    composedAt.toISOString(),
  );

  const logout = await service.logout({
    method: "POST",
    headers: {
      cookie,
      origin: "https://waw.dubeom.com",
      "x-csrf-token": csrf,
    },
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(
    (
      await persistence.findSession(hashOpaqueSessionId(rawSession))
    )?.revokedAt?.toISOString(),
    composedAt.toISOString(),
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
