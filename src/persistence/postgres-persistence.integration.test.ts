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
import { PostgresKboEnrollmentStore } from "./postgres-kbo-enrollment-store.ts";
import { PostgresKboEnrollmentActorStore } from "./postgres-kbo-enrollment-actor-store.ts";
import { PostgresKboDailyCreditClaimStore } from "./postgres-kbo-daily-credit-claim-store.ts";
import { PostgresKboCreditBalanceStore } from "./postgres-kbo-credit-balance-store.ts";
import { PostgresKboBetStore } from "./postgres-kbo-bet-store.ts";
import { PostgresKboSettlementStore } from "./postgres-kbo-settlement-store.ts";
import { PostgresKboBetQueryStore } from "./postgres-kbo-bet-query-store.ts";
import { PostgresKboRankingStore } from "./postgres-kbo-ranking-store.ts";
import { PostgresKboAdminCreditStore } from "./postgres-kbo-admin-credit-store.ts";
import { PostgresDashboardStore } from "./dashboard-store.ts";
import { PostgresKboDepartureStore } from "./postgres-kbo-departure-store.ts";
import { PostgresKboRetentionStore } from "./postgres-kbo-retention-store.ts";
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
const migrationElevenPath = path.join(projectRoot, "migrations/0011_kbo_credit_ledger_foundation.sql");
const migrationTwelvePath = path.join(projectRoot, "migrations/0012_kbo_daily_credit_claim.sql");
const migrationThirteenPath = path.join(projectRoot, "migrations/0013_kbo_bet_foundation.sql");
const migrationFourteenPath = path.join(projectRoot, "migrations/0014_kbo_game_projection.sql");
const migrationFifteenPath = path.join(projectRoot, "migrations/0015_kbo_settlement_schema.sql");
const migrationSixteenPath = path.join(projectRoot, "migrations/0016_kbo_admin_credit_adjustment.sql");
const migrationSeventeenPath = path.join(projectRoot, "migrations/0017_kbo_retention_purge.sql");
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
const migrationTwelveSql = await readFile(migrationTwelvePath, "utf8");
const migrationThirteenSql = await readFile(migrationThirteenPath, "utf8");
const migrationFourteenSql = await readFile(migrationFourteenPath, "utf8");
const migrationFifteenSql = await readFile(migrationFifteenPath, "utf8");
const migrationSixteenSql = await readFile(migrationSixteenPath, "utf8");
const migrationSeventeenSql = await readFile(migrationSeventeenPath, "utf8");

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
    name: "kbo_credit_ledger_foundation",
    sql: migrationElevenSql,
  });
  await applyMigration(adminPool, {
    version: 12,
    name: "kbo_daily_credit_claim",
    sql: migrationTwelveSql,
  });
  await applyMigration(adminPool, {
    version: 13,
    name: "kbo_bet_foundation",
    sql: migrationThirteenSql,
  });
  await applyMigration(adminPool, {
    version: 14,
    name: "kbo_game_projection",
    sql: migrationFourteenSql,
  });
  await applyMigration(adminPool, {
    version: 15,
    name: "kbo_settlement_schema",
    sql: migrationFifteenSql,
  });
  await applyMigration(adminPool, {
    version: 16,
    name: "kbo_admin_credit_adjustment",
    sql: migrationSixteenSql,
  });
  await applyMigration(adminPool, {
    version: 17,
    name: "kbo_retention_purge",
    sql: migrationSeventeenSql,
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
    { version: 12 },
    { version: 13 },
    { version: 14 },
    { version: 15 },
    { version: 16 },
    { version: 17 },
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

test("enforces the KBO enrollment, account, and immutable ledger schema", async () => {
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ('kbo-guild', 'kbo-user', 'KBO 사용자', now(), now())`,
  );
  const empty = await adminPool.query<{ accounts: string; enrollments: string; entries: string }>(
    `select
       (select count(*)::text from credit_account) accounts,
       (select count(*)::text from betting_enrollment) enrollments,
       (select count(*)::text from credit_ledger_entry) entries`,
  );
  assert.deepEqual(empty.rows[0], { accounts: "0", enrollments: "0", entries: "0" });

  await assert.rejects(
    adminPool.query(
      `insert into credit_account (
         account_id, available_balance, correction_debt, created_at, updated_at
       ) values ('invalid-negative-balance', -1, 0, now(), now())`,
    ),
    /check constraint/u,
  );
  await assert.rejects(
    adminPool.query(
      `insert into credit_account (
         account_id, available_balance, correction_debt, version, created_at, updated_at
       ) values ('invalid-negative-debt', 0, -1, -1, now(), now())`,
    ),
    /check constraint/u,
  );

  await adminPool.query(
    `insert into credit_account (account_id, created_at, updated_at)
     values ('kbo-account', now(), now())`,
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values (
       'kbo-enrollment', 'kbo-account', 'kbo-guild', 'kbo-user', 'active', 1, now()
     )`,
  );
  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values
       ('kbo-ledger-valid', 'kbo-user', now(), 'accepted', 'completed'),
       ('kbo-ledger-mismatch', 'kbo-user', now(), 'accepted', 'completed'),
       ('kbo-ledger-invalid-reason', 'kbo-user', now(), 'accepted', 'completed'),
       ('kbo-ledger-duplicate-source', 'kbo-user', now(), 'accepted', 'completed')`,
  );
  await adminPool.query(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values (
       'kbo-account', 'daily_claim', 50000, 0,
       0, 50000, 0, 0,
       'kbo-ledger-valid', 'daily_claim', '2026-08-07', 'system', now()
     )`,
  );

  await assert.rejects(
    adminPool.query(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'kbo-account', 'daily_claim', 50000, 0,
         0, 49999, 0, 0,
         'kbo-ledger-mismatch', 'daily_claim', 'mismatch', 'system', now()
       )`,
    ),
    /check constraint/u,
  );
  await assert.rejects(
    adminPool.query(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'kbo-account', 'unknown_reason', 0, 0,
         0, 0, 0, 0,
         'kbo-ledger-invalid-reason', 'fixture', 'invalid', 'system', now()
       )`,
    ),
    /check constraint/u,
  );
  await assert.rejects(
    adminPool.query(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'kbo-account', 'daily_claim', 50000, 0,
         0, 50000, 0, 0,
         'kbo-ledger-duplicate-source', 'daily_claim', '2026-08-07', 'system', now()
       )`,
    ),
    /duplicate key/u,
  );
  await assert.rejects(
    adminPool.query(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'kbo-account', 'daily_claim', 50000, 0,
         0, 50000, 0, 0,
         'kbo-ledger-valid', 'daily_claim', 'another-source', 'system', now()
       )`,
    ),
    /duplicate key/u,
  );
});

test("enforces the KBO daily credit claim schema", async () => {
  await adminPool.query(
    `insert into credit_account (account_id, created_at, updated_at)
     values
       ('claim-account-a', now(), now()),
       ('claim-account-b', now(), now())`,
  );
  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values
       ('claim-operation-1', 'claim-user', now(), 'accepted', 'completed'),
       ('claim-operation-2', 'claim-user', now(), 'accepted', 'completed'),
       ('claim-operation-3', 'claim-user', now(), 'accepted', 'completed'),
       ('claim-operation-4', 'claim-user', now(), 'accepted', 'completed')`,
  );
  await adminPool.query(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values
       ('claim-account-a', 'daily_claim', 50000, 0, 0, 50000, 0, 0,
        'claim-operation-1', 'daily_claim', '2026-08-07', 'system', now()),
       ('claim-account-a', 'daily_claim', 50000, 0, 50000, 100000, 0, 0,
        'claim-operation-2', 'daily_claim', '2026-08-08', 'system', now()),
       ('claim-account-b', 'daily_claim', 50000, 0, 0, 50000, 0, 0,
        'claim-operation-3', 'daily_claim', '2026-08-07', 'system', now()),
       ('claim-account-b', 'daily_claim', 50000, 0, 50000, 100000, 0, 0,
        'claim-operation-4', 'daily_claim', '2026-08-08', 'system', now())`,
  );
  const entries = await adminPool.query<{ entry_id: string; operation_id: string }>(
    `select entry_id::text, operation_id
       from credit_ledger_entry
      where operation_id like 'claim-operation-%'`,
  );
  const entryByOperation = new Map(entries.rows.map((row) => [row.operation_id, row.entry_id]));
  const insertClaim = (values: [string, string, string, string, string]) =>
    adminPool.query(
      `insert into daily_credit_claim (
         claim_id, account_id, claim_date, operation_id, ledger_entry_id, claimed_at
       ) values ($1, $2, $3::date, $4, $5, now())`,
      values,
    );

  await insertClaim([
    "claim-1",
    "claim-account-a",
    "2026-08-07",
    "claim-operation-1",
    entryByOperation.get("claim-operation-1")!,
  ]);
  await assert.rejects(
    insertClaim([
      "claim-duplicate-date",
      "claim-account-a",
      "2026-08-07",
      "claim-operation-2",
      entryByOperation.get("claim-operation-2")!,
    ]),
    /duplicate key/u,
  );
  await insertClaim([
    "claim-next-date",
    "claim-account-a",
    "2026-08-08",
    "claim-operation-2",
    entryByOperation.get("claim-operation-2")!,
  ]);
  await insertClaim([
    "claim-other-account",
    "claim-account-b",
    "2026-08-07",
    "claim-operation-3",
    entryByOperation.get("claim-operation-3")!,
  ]);
  await assert.rejects(
    insertClaim([
      "claim-duplicate-operation",
      "claim-account-b",
      "2026-08-08",
      "claim-operation-1",
      entryByOperation.get("claim-operation-4")!,
    ]),
    /duplicate key/u,
  );
  await assert.rejects(
    insertClaim([
      "claim-duplicate-ledger",
      "claim-account-b",
      "2026-08-08",
      "claim-operation-4",
      entryByOperation.get("claim-operation-3")!,
    ]),
    /duplicate key/u,
  );
  await assert.rejects(
    insertClaim(["claim-missing-account", "missing-account", "2026-08-09", "claim-operation-4", entryByOperation.get("claim-operation-4")!]),
    /foreign key/u,
  );
  await assert.rejects(
    insertClaim(["claim-missing-operation", "claim-account-b", "2026-08-09", "missing-operation", entryByOperation.get("claim-operation-4")!]),
    /foreign key/u,
  );
  await assert.rejects(
    insertClaim(["claim-missing-ledger", "claim-account-b", "2026-08-09", "claim-operation-4", "999999999"]),
    /foreign key/u,
  );
});

test("enforces the canonical KBO game projection and immutable revisions", async () => {
  const insertGame = async (gameId: string, sourceGameId: string, messageId: string, fingerprint: string) => {
    const client = await adminPool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into kbo_game (
           game_id, source_application_id, source_game_id, competition_id, season_id,
           home_team_id, away_team_id, scheduled_start_at, status,
           current_revision, market_version, source_updated_at, collected_at, parser_version
         ) values (
           $1, '1390247647293603881', $2, 'KBO_REGULAR', '2026',
           'HOME_TEAM', 'AWAY_TEAM', '2026-08-11T09:30:00Z', 'scheduled',
           1, 1, '2026-08-10T00:40:00Z', '2026-08-10T00:41:00Z', 1
         )`,
        [gameId, sourceGameId],
      );
      await client.query(
        `insert into kbo_game_revision (
           game_id, source_revision, source_message_id, content_fingerprint,
           scheduled_start_at, status, source_updated_at, collected_at, parser_version
         ) values (
           $1, 1, $2, $3, '2026-08-11T09:30:00Z', 'scheduled',
           '2026-08-10T00:40:00Z', '2026-08-10T00:41:00Z', 1
         )`,
        [gameId, messageId, fingerprint],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  await insertGame("game-id-0001", "source-game-0001", "92345678901234561", "1".repeat(64));
  await insertGame("game-id-0002", "source-game-0002", "92345678901234562", "2".repeat(64));
  await insertGame("game-id-0003", "source-game-0003", "92345678901234563", "3".repeat(64));

  assert.deepEqual(
    (await adminPool.query(
      `select game_id, status, current_revision::text, market_version::text
         from kbo_game order by game_id`,
    )).rows,
    [
      { game_id: "game-id-0001", status: "scheduled", current_revision: "1", market_version: "1" },
      { game_id: "game-id-0002", status: "scheduled", current_revision: "1", market_version: "1" },
      { game_id: "game-id-0003", status: "scheduled", current_revision: "1", market_version: "1" },
    ],
  );
  await assert.rejects(
    adminPool.query(
      `insert into kbo_game_revision (
         game_id, source_revision, source_message_id, content_fingerprint,
         scheduled_start_at, status, source_updated_at, collected_at, parser_version
       ) values (
         'game-id-0001', 2, '92345678901234564', $1,
         '2026-08-11T09:30:00Z', 'final', now(), now(), 1
       )`,
      ["4".repeat(64)],
    ),
    /check constraint/u,
  );
  await assert.rejects(
    adminPool.query(
      `insert into kbo_game_revision (
         game_id, source_revision, source_message_id, content_fingerprint,
         scheduled_start_at, status, source_updated_at, collected_at, parser_version
       ) values (
         'game-id-0001', 2, '92345678901234565', $1,
         '2026-08-11T09:30:00Z', 'scheduled', now(), now(), 1
       )`,
      ["1".repeat(64)],
    ),
    /duplicate key/u,
  );
  await assert.rejects(
    adminPool.query("update kbo_game set current_revision = 2 where game_id = 'game-id-0001'"),
    /foreign key/u,
  );
});

test("enforces the KBO bet registration schema", async () => {
  const accountId = "bet-account-0001";
  const guildId = "92345678901234567";
  await adminPool.query(
    `insert into credit_account (account_id, created_at, updated_at)
     values ($1, now(), now())`,
    [accountId],
  );
  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) select 'bet-operation-' || value, 'bet-user', now(), 'accepted', 'completed'
         from generate_series(1, 6) value`,
  );
  await adminPool.query(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) select $1, 'bet_stake', -1000, 0, 50000, 49000, 0, 0,
              'bet-operation-' || value, 'bet', 'bet-source-' || value, 'system', now()
         from generate_series(1, 6) value`,
    [accountId],
  );
  const entries = await adminPool.query<{ entry_id: string; operation_id: string }>(
    `select entry_id::text, operation_id from credit_ledger_entry
      where operation_id like 'bet-operation-%'`,
  );
  const entry = new Map(entries.rows.map((row) => [row.operation_id, row.entry_id]));
  const insertBet = (input: {
    betId: string;
    gameId: string;
    marketVersion: number;
    prediction: string;
    homeScore?: number | null;
    awayScore?: number | null;
    stake: string;
    operationId: string;
    ledgerEntryId: string;
    accountId?: string;
    guildId?: string;
  }) => adminPool.query(
    `insert into kbo_bet (
       bet_id, guild_id, account_id, game_id, market_version, prediction,
       predicted_home_score, predicted_away_score, stake, stake_date,
       operation_id, ledger_entry_id, placed_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-08-08', $10, $11, $12)`,
    [
      input.betId,
      input.guildId ?? guildId,
      input.accountId ?? accountId,
      input.gameId,
      input.marketVersion,
      input.prediction,
      input.homeScore ?? null,
      input.awayScore ?? null,
      input.stake,
      input.operationId,
      input.ledgerEntryId,
      new Date("2026-08-07T15:00:00.000Z"),
    ],
  );

  await insertBet({
    betId: "bet-id-0000000001",
    gameId: "game-id-0001",
    marketVersion: 1,
    prediction: "home_win",
    homeScore: 3,
    awayScore: 2,
    stake: "1000",
    operationId: "bet-operation-1",
    ledgerEntryId: entry.get("bet-operation-1")!,
  });
  await adminPool.query("begin");
  await adminPool.query(
    `insert into bet_settlement (
       settlement_id, bet_id, game_id, game_revision, result, multiplier,
       return_amount, applied_delta, operation_id, ledger_entry_id, settled_at
     ) values (
       'settlement-fixture-0001', 'bet-id-0000000001', 'game-id-0001', 1,
       'void', 1, 1000, 1000, 'bet-operation-5', $1, now()
     )`,
    [entry.get("bet-operation-5")!],
  );
  await adminPool.query(
    `update kbo_bet
        set status = 'void', current_settlement_id = 'settlement-fixture-0001'
      where bet_id = 'bet-id-0000000001'`,
  );
  await adminPool.query("commit");
  await insertBet({
    betId: "bet-id-0000000002",
    gameId: "game-id-0001",
    marketVersion: 2,
    prediction: "away_win",
    homeScore: 1,
    awayScore: 4,
    stake: "50000",
    operationId: "bet-operation-2",
    ledgerEntryId: entry.get("bet-operation-2")!,
  });
  await insertBet({
    betId: "bet-id-0000000003",
    gameId: "game-id-0002",
    marketVersion: 1,
    prediction: "draw",
    stake: "1000",
    operationId: "bet-operation-3",
    ledgerEntryId: entry.get("bet-operation-3")!,
  });

  const rejected = async (overrides: Partial<Parameters<typeof insertBet>[0]>, pattern: RegExp) =>
    assert.rejects(insertBet({
      betId: "bet-id-0000000004",
      gameId: "game-id-0003",
      marketVersion: 1,
      prediction: "home_win",
      stake: "1000",
      operationId: "bet-operation-4",
      ledgerEntryId: entry.get("bet-operation-4")!,
      ...overrides,
    }), pattern);

  await rejected({ prediction: "unknown" }, /check constraint/u);
  await rejected({ homeScore: 1, awayScore: null }, /check constraint/u);
  await rejected({ homeScore: -1, awayScore: 0 }, /check constraint/u);
  await rejected({ homeScore: 32_768, awayScore: 0 }, /smallint/u);
  for (const stake of ["0", "999", "1001", "50001"]) {
    await rejected({ stake }, /check constraint/u);
  }
  await rejected({ stake: "9223372036854775808" }, /bigint/u);
  await rejected({ betId: "short" }, /check constraint/u);
  await rejected({ gameId: "short" }, /check constraint/u);
  await rejected({ guildId: "not-a-snowflake" }, /check constraint/u);
  await rejected({ gameId: "game-id-0001", marketVersion: 2 }, /duplicate key/u);
  await rejected({ gameId: "game-id-0001", marketVersion: 3 }, /duplicate key/u);
  await rejected({ gameId: "game-id-missing" }, /foreign key/u);
  await rejected({ operationId: "bet-operation-1" }, /duplicate key/u);
  await rejected({ ledgerEntryId: entry.get("bet-operation-1")! }, /duplicate key/u);
  await rejected({ accountId: "missing-account-01" }, /foreign key/u);
  await rejected({ operationId: "missing-operation" }, /foreign key/u);
  await rejected({ ledgerEntryId: "999999999" }, /foreign key/u);

  assert.deepEqual(
    (await adminPool.query<{
      bet_id: string;
      prediction: string;
      stake: string;
      stake_date: string;
      status: string;
      placed_at: Date;
    }>(
      `select bet_id, prediction, stake::text, stake_date::text, status, placed_at
         from kbo_bet order by bet_id`,
    )).rows,
    [
      {
        bet_id: "bet-id-0000000001",
        prediction: "home_win",
        stake: "1000",
        stake_date: "2026-08-08",
        status: "void",
        placed_at: new Date("2026-08-07T15:00:00.000Z"),
      },
      {
        bet_id: "bet-id-0000000002",
        prediction: "away_win",
        stake: "50000",
        stake_date: "2026-08-08",
        status: "pending",
        placed_at: new Date("2026-08-07T15:00:00.000Z"),
      },
      {
        bet_id: "bet-id-0000000003",
        prediction: "draw",
        stake: "1000",
        stake_date: "2026-08-08",
        status: "pending",
        placed_at: new Date("2026-08-07T15:00:00.000Z"),
      },
    ],
  );
});

test("enforces immutable KBO settlements and the canonical bet projection", async () => {
  await adminPool.query(
    `insert into kbo_game_revision (
       game_id, source_revision, source_message_id, content_fingerprint,
       scheduled_start_at, status, home_score, away_score,
       source_updated_at, collected_at, parser_version
     ) values
       ('game-id-0001', 2, '92345678901234566', $1,
        '2026-08-11T09:30:00Z', 'final', 5, 3, now(), now(), 1),
       ('game-id-0001', 3, '92345678901234567', $2,
        '2026-08-11T09:30:00Z', 'final', 2, 3, now(), now(), 1)`,
    ["6".repeat(64), "7".repeat(64)],
  );
  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values
       ('settlement-operation-1', 'system:kbo-settlement', now(), 'accepted', 'completed'),
       ('settlement-operation-2', 'system:kbo-settlement', now(), 'accepted', 'completed'),
       ('settlement-operation-3', 'system:kbo-settlement', now(), 'accepted', 'completed')`,
  );
  await adminPool.query(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values
       ('bet-account-0001', 'bet_payout', 100000, 0,
        0, 100000, 0, 0, 'settlement-operation-1', 'settlement',
        'settlement-id-00000001', 'system', now()),
       ('bet-account-0001', 'settlement_correction', -100000, 0,
        100000, 0, 0, 0, 'settlement-operation-2', 'settlement',
        'settlement-id-00000002', 'system', now())`,
  );
  const ledger = new Map(
    (await adminPool.query<{ entry_id: string; operation_id: string }>(
      `select entry_id::text, operation_id from credit_ledger_entry
        where operation_id like 'settlement-operation-%'`,
    )).rows.map((row) => [row.operation_id, row.entry_id]),
  );

  await adminPool.query("begin");
  await adminPool.query(
    `insert into bet_settlement (
       settlement_id, bet_id, game_id, game_revision, result, multiplier,
       return_amount, applied_delta, operation_id, ledger_entry_id, settled_at
     ) values (
       'settlement-id-00000001', 'bet-id-0000000002', 'game-id-0001', 2,
       'outcome_hit', 2, 100000, 100000, 'settlement-operation-1', $1, now()
     )`,
    [ledger.get("settlement-operation-1")!],
  );
  await adminPool.query(
    `update kbo_bet
        set status = 'settled', current_settlement_id = 'settlement-id-00000001'
      where bet_id = 'bet-id-0000000002'`,
  );
  await adminPool.query("commit");

  await adminPool.query("begin");
  await adminPool.query(
    `insert into bet_settlement (
       settlement_id, bet_id, game_id, game_revision, result, multiplier,
       return_amount, applied_delta, operation_id, ledger_entry_id,
       supersedes_settlement_id, settled_at
     ) values (
       'settlement-id-00000002', 'bet-id-0000000002', 'game-id-0001', 3,
       'lost', 0, 0, -100000, 'settlement-operation-2', $1,
       'settlement-id-00000001', now()
     )`,
    [ledger.get("settlement-operation-2")!],
  );
  await adminPool.query(
    `update kbo_bet set current_settlement_id = 'settlement-id-00000002'
      where bet_id = 'bet-id-0000000002'`,
  );
  await adminPool.query("commit");

  assert.deepEqual(
    (await adminPool.query(
      `select settlement_id, result, multiplier, return_amount::text,
              applied_delta::text, supersedes_settlement_id
         from bet_settlement where bet_id = 'bet-id-0000000002'
        order by game_revision`,
    )).rows,
    [
      {
        settlement_id: "settlement-id-00000001",
        result: "outcome_hit",
        multiplier: 2,
        return_amount: "100000",
        applied_delta: "100000",
        supersedes_settlement_id: null,
      },
      {
        settlement_id: "settlement-id-00000002",
        result: "lost",
        multiplier: 0,
        return_amount: "0",
        applied_delta: "-100000",
        supersedes_settlement_id: "settlement-id-00000001",
      },
    ],
  );
  await assert.rejects(
    adminPool.query(
      `insert into bet_settlement (
         settlement_id, bet_id, game_id, game_revision, result, multiplier,
         return_amount, applied_delta, operation_id, settled_at
       ) values (
         'settlement-id-invalid-1', 'bet-id-0000000002', 'game-id-0001', 1,
         'score_hit', 2, 50000, 0, 'settlement-operation-3', now()
       )`,
    ),
    /check constraint/u,
  );
  await assert.rejects(
    adminPool.query(
      `update kbo_bet set status = 'pending'
        where bet_id = 'bet-id-0000000002'`,
    ),
    /check constraint/u,
  );
});

test("places one idempotent KBO bet with account, ledger, bet, and audit atomically", async () => {
  const store = new PostgresKboBetStore(adminPool);
  const guildId = "92345678901234567";
  const discordUserId = "92345678901234569";
  await adminPool.query(
     `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, 'KBO bettor', '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z')`,
    [guildId, discordUserId],
  );
  await adminPool.query(
     `insert into credit_account (
       account_id, available_balance, created_at, updated_at
     ) values (
       'bet-store-account-01', 100000,
       '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z'
     )`,
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values (
       'bet-store-enrollment-01', 'bet-store-account-01', $1, $2,
       'active', 1, '2026-08-10T00:00:00Z'
     )`,
    [guildId, discordUserId],
  );

  const input = {
    operationId: "bet-store-operation-01",
    betId: "bet-store-id-00000001",
    guildId,
    discordUserId,
    gameId: "game-id-0001",
    rightsStatus: "authorized" as const,
    stake: 1_000n,
    prediction: "home_win" as const,
    placedAt: new Date("2026-08-10T00:42:00.000Z"),
  };
  const placed = {
    status: "placed" as const,
    betId: input.betId,
    gameId: input.gameId,
    marketVersion: 1n,
    stakeDate: "2026-08-10",
  };
  assert.deepEqual(await store.place(input), placed);
  assert.deepEqual(await store.place(input), placed);
  assert.deepEqual(
    await store.place({
      ...input,
      operationId: "bet-store-operation-02",
      betId: "bet-store-id-00000002",
    }),
    { status: "denied", reason: "already_bet" },
  );
  assert.deepEqual(
    await store.place({
      ...input,
      operationId: "bet-store-operation-03",
      betId: "bet-store-id-00000003",
      gameId: "game-id-0002",
      placedAt: new Date("2026-08-10T00:45:00.001Z"),
    }),
    { status: "denied", reason: "game_data_unavailable" },
  );
  await adminPool.query(
    "update credit_account set correction_debt = 1 where account_id = 'bet-store-account-01'",
  );
  assert.deepEqual(
    await store.place({
      ...input,
      operationId: "bet-store-operation-06",
      betId: "bet-store-id-00000006",
      gameId: "game-id-0002",
    }),
    { status: "denied", reason: "correction_debt" },
  );
  await adminPool.query(
    `update credit_account set correction_debt = 0, available_balance = 500
      where account_id = 'bet-store-account-01'`,
  );
  assert.deepEqual(
    await store.place({
      ...input,
      operationId: "bet-store-operation-07",
      betId: "bet-store-id-00000007",
      gameId: "game-id-0002",
    }),
    { status: "denied", reason: "insufficient_balance" },
  );
  await adminPool.query(
    "update credit_account set available_balance = 99000 where account_id = 'bet-store-account-01'",
  );
  assert.deepEqual(
    await store.place({
      ...input,
      operationId: "bet-store-operation-08",
      betId: "bet-store-id-00000008",
      gameId: "game-id-0002",
      stake: 50_000n,
    }),
    { status: "denied", reason: "daily_limit_exceeded" },
  );

  const concurrentInput = {
    ...input,
    operationId: "bet-store-operation-04",
    betId: "bet-store-id-00000004",
    gameId: "game-id-0003",
    placedAt: new Date("2026-08-10T00:43:00.000Z"),
  };
  assert.deepEqual(await Promise.all([store.place(concurrentInput), store.place(concurrentInput)]), [
    { ...placed, betId: concurrentInput.betId, gameId: concurrentInput.gameId },
    { ...placed, betId: concurrentInput.betId, gameId: concurrentInput.gameId },
  ]);

  assert.deepEqual(
    (await adminPool.query(
      `select account.available_balance::text,
              (select count(*)::text from kbo_bet where account_id = account.account_id) bets,
              (select count(*)::text from credit_ledger_entry
                where account_id = account.account_id and reason_code = 'bet_stake') stakes
         from credit_account account where account_id = 'bet-store-account-01'`,
    )).rows[0],
    { available_balance: "98000", bets: "2", stakes: "2" },
  );

  await adminPool.query(`
    create function reject_kbo_bet_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'kbo-bet:bet-store-operation-05' then
        raise exception 'synthetic KBO bet audit failure';
      end if;
      return new;
    end
    $$;
    create trigger reject_kbo_bet_audit_fixture
      before insert on audit_event
      for each row execute function reject_kbo_bet_audit_fixture();
  `);
  try {
    await assert.rejects(
      store.place({
        ...input,
        operationId: "bet-store-operation-05",
        betId: "bet-store-id-00000005",
        gameId: "game-id-0002",
      }),
      (error) =>
        error instanceof PersistenceError &&
        error.reasonCode === "kbo_bet_registration_failed",
    );
    assert.deepEqual(
      (await adminPool.query(
        `select available_balance::text,
                (select count(*)::text from kbo_bet
                  where operation_id = 'bet-store-operation-05') bets,
                (select count(*)::text from operation_ledger
                  where operation_id = 'bet-store-operation-05') operations
           from credit_account where account_id = 'bet-store-account-01'`,
      )).rows[0],
      { available_balance: "98000", bets: "0", operations: "0" },
    );
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_bet_audit_fixture on audit_event;
      drop function reject_kbo_bet_audit_fixture();
    `);
  }
});

test("settles, voids, and corrects KBO bets atomically", async () => {
  const store = new PostgresKboSettlementStore(adminPool);
  const guildId = "92345678901234567";
  const settledAt = new Date("2026-08-10T01:00:00Z");
  let fixtureNumber = 0;
  const createFixture = async (input: {
    suffix: string;
    status: "final" | "cancelled";
    homeScore?: number;
    awayScore?: number;
    prediction: "home_win" | "draw" | "away_win";
    predictedHomeScore?: number;
    predictedAwayScore?: number;
    available: bigint;
    debt: bigint;
  }) => {
    fixtureNumber += 1;
    const accountId = `settlement-account-${input.suffix}`;
    const gameId = `settlement-game-${input.suffix}`;
    const betId = `settlement-bet-${input.suffix}`;
    const stakeOperation = `settlement-stake-${input.suffix}`;
    await adminPool.query(
      `insert into credit_account (
         account_id, available_balance, correction_debt, created_at, updated_at
       ) values ($1,$2,$3,$4,$4)`,
      [accountId, input.available.toString(), input.debt.toString(), settledAt],
    );
    await adminPool.query(
      `insert into operation_ledger (
         operation_id, actor_id, accepted_at, outcome, reason_code
       ) values ($1,'system:kbo-fixture',$2,'accepted','completed')`,
      [stakeOperation, settledAt],
    );
    const stakeLedger = await adminPool.query<{ entry_id: string }>(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values ($1,'bet_stake',-1000,0,1000,0,0,0,$2,'bet',$3,'system',$4)
       returning entry_id::text`,
      [accountId, stakeOperation, betId, settledAt],
    );
    await adminPool.query("begin");
    await adminPool.query(
      `insert into kbo_game (
         game_id, source_application_id, source_game_id, competition_id, season_id,
         home_team_id, away_team_id, scheduled_start_at, status,
         home_score, away_score, current_revision, market_version,
         source_updated_at, collected_at, parser_version
       ) values (
         $1,'1390247647293603881',$2,'KBO_REGULAR','2026','HOME','AWAY',
         '2026-08-09T09:30:00Z',$3,$4,$5,1,1,$6,$6,1
       )`,
      [gameId, `source-${gameId}`, input.status, input.homeScore ?? null, input.awayScore ?? null, settledAt],
    );
    await adminPool.query(
      `insert into kbo_game_revision (
         game_id, source_revision, source_message_id, content_fingerprint,
         scheduled_start_at, status, home_score, away_score,
         source_updated_at, collected_at, parser_version
       ) values ($1,1,$2,$3,'2026-08-09T09:30:00Z',$4,$5,$6,$7,$7,1)`,
      [
        gameId,
        String(92345678901234700n + BigInt(fixtureNumber)),
        fixtureNumber.toString(16).padStart(64, "a").slice(-64),
        input.status,
        input.homeScore ?? null,
        input.awayScore ?? null,
        settledAt,
      ],
    );
    await adminPool.query("commit");
    await adminPool.query(
      `insert into kbo_bet (
         bet_id, guild_id, account_id, game_id, market_version, prediction,
         predicted_home_score, predicted_away_score, stake, stake_date,
         operation_id, ledger_entry_id, placed_at
       ) values ($1,$2,$3,$4,1,$5,$6,$7,1000,'2026-08-09',$8,$9,$10)`,
      [
        betId,
        guildId,
        accountId,
        gameId,
        input.prediction,
        input.predictedHomeScore ?? null,
        input.predictedAwayScore ?? null,
        stakeOperation,
        stakeLedger.rows[0]!.entry_id,
        settledAt,
      ],
    );
    return { accountId, gameId, betId };
  };
  const revise = async (
    gameId: string,
    revision: number,
    homeScore: number,
    awayScore: number,
  ) => {
    await adminPool.query("begin");
    await adminPool.query(
      `insert into kbo_game_revision (
         game_id, source_revision, source_message_id, content_fingerprint,
         scheduled_start_at, status, home_score, away_score,
         source_updated_at, collected_at, parser_version
       ) values ($1,$2,$3,$4,'2026-08-09T09:30:00Z','final',$5,$6,$7,$7,1)`,
      [
        gameId,
        revision,
        String(92345678901234800n + BigInt(revision) + BigInt(fixtureNumber * 10)),
        `${revision.toString(16)}${fixtureNumber.toString(16)}`.padStart(64, "b").slice(-64),
        homeScore,
        awayScore,
        settledAt,
      ],
    );
    await adminPool.query(
      `update kbo_game
          set current_revision = $2, status = 'final', home_score = $3,
              away_score = $4, source_updated_at = $5, collected_at = $5
        where game_id = $1`,
      [gameId, revision, homeScore, awayScore, settledAt],
    );
    await adminPool.query("commit");
  };

  const exact = await createFixture({
    suffix: "exact-01",
    status: "final",
    homeScore: 5,
    awayScore: 3,
    prediction: "home_win",
    predictedHomeScore: 5,
    predictedAwayScore: 3,
    available: 0n,
    debt: 500n,
  });
  const initialInput = {
    operationId: "settlement-run-exact-01",
    settlementId: "settlement-record-exact-01",
    guildId,
    betId: exact.betId,
    gameId: exact.gameId,
    gameRevision: 1n,
    rightsStatus: "authorized" as const,
    settledAt,
  };
  const [first, duplicate] = await Promise.all([store.settle(initialInput), store.settle(initialInput)]);
  assert.deepEqual(first, duplicate);
  assert.deepEqual(first, {
    status: "settled",
    settlementId: initialInput.settlementId,
    result: "score_hit",
    multiplier: 3,
    returnAmount: 3000n,
    appliedDelta: 3000n,
    availableDelta: 2500n,
    debtDelta: -500n,
    gameRevision: 1n,
  });

  await revise(exact.gameId, 2, 2, 3);
  assert.deepEqual(
    await store.settle({
      ...initialInput,
      operationId: "settlement-run-exact-02",
      settlementId: "settlement-record-exact-02",
      gameRevision: 2n,
    }),
    {
      status: "settled",
      settlementId: "settlement-record-exact-02",
      result: "lost",
      multiplier: 0,
      returnAmount: 0n,
      appliedDelta: -3000n,
      availableDelta: -2500n,
      debtDelta: 500n,
      gameRevision: 2n,
    },
  );
  await revise(exact.gameId, 3, 5, 3);
  assert.deepEqual(
    await store.settle({
      ...initialInput,
      operationId: "settlement-run-exact-03",
      settlementId: "settlement-record-exact-03",
      gameRevision: 3n,
    }),
    {
      status: "settled",
      settlementId: "settlement-record-exact-03",
      result: "score_hit",
      multiplier: 3,
      returnAmount: 3000n,
      appliedDelta: 3000n,
      availableDelta: 2500n,
      debtDelta: -500n,
      gameRevision: 3n,
    },
  );
  assert.deepEqual(
    (await adminPool.query(
      `select available_balance::text, correction_debt::text from credit_account where account_id = $1`,
      [exact.accountId],
    )).rows,
    [{ available_balance: "2500", correction_debt: "0" }],
  );
  assert.deepEqual(
    await store.settle({
      ...initialInput,
      operationId: "settlement-run-stale-01",
      settlementId: "settlement-record-stale-01",
      gameRevision: 2n,
    }),
    { status: "denied", reason: "revision_not_current" },
  );
  assert.deepEqual(
    await store.settle({
      ...initialInput,
      operationId: "settlement-run-repeat-01",
      settlementId: "settlement-record-repeat-01",
      gameRevision: 3n,
    }),
    { status: "denied", reason: "already_settled" },
  );

  const voided = await createFixture({
    suffix: "void-01",
    status: "cancelled",
    prediction: "home_win",
    available: 0n,
    debt: 500n,
  });
  const voidResult = await store.settle({
    operationId: "settlement-run-void-01",
    settlementId: "settlement-record-void-01",
    guildId,
    betId: voided.betId,
    gameId: voided.gameId,
    gameRevision: 1n,
    rightsStatus: "authorized",
    settledAt,
  });
  assert.equal(voidResult.status, "settled");
  assert.deepEqual(
    (await adminPool.query(
      `select available_balance::text, correction_debt::text from credit_account where account_id = $1`,
      [voided.accountId],
    )).rows,
    [{ available_balance: "1000", correction_debt: "500" }],
  );

  const lost = await createFixture({
    suffix: "lost-01",
    status: "final",
    homeScore: 2,
    awayScore: 3,
    prediction: "home_win",
    available: 100n,
    debt: 200n,
  });
  assert.deepEqual(
    await store.settle({
      operationId: "settlement-run-lost-01",
      settlementId: "settlement-record-lost-01",
      guildId,
      betId: lost.betId,
      gameId: lost.gameId,
      gameRevision: 1n,
      rightsStatus: "authorized",
      settledAt,
    }),
    {
      status: "settled",
      settlementId: "settlement-record-lost-01",
      result: "lost",
      multiplier: 0,
      returnAmount: 0n,
      appliedDelta: 0n,
      availableDelta: 0n,
      debtDelta: 0n,
      gameRevision: 1n,
    },
  );
  assert.deepEqual(
    (await adminPool.query(
      `select account.available_balance::text, account.correction_debt::text,
              settlement.ledger_entry_id
         from credit_account account
         join kbo_bet bet on bet.account_id = account.account_id
         join bet_settlement settlement on settlement.settlement_id = bet.current_settlement_id
        where account.account_id = $1`,
      [lost.accountId],
    )).rows,
    [{ available_balance: "100", correction_debt: "200", ledger_entry_id: null }],
  );

  const failed = await createFixture({
    suffix: "rollback-01",
    status: "final",
    homeScore: 5,
    awayScore: 3,
    prediction: "home_win",
    available: 0n,
    debt: 0n,
  });
  await adminPool.query(`
    create function reject_kbo_settlement_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_type = 'kbo.settlement' then raise exception 'fixture rejection'; end if;
      return new;
    end $$;
    create trigger reject_kbo_settlement_audit_fixture
      before insert on audit_event for each row
      execute function reject_kbo_settlement_audit_fixture();
  `);
  try {
    await assert.rejects(
      store.settle({
        operationId: "settlement-run-rollback-01",
        settlementId: "settlement-record-rollback-01",
        guildId,
        betId: failed.betId,
        gameId: failed.gameId,
        gameRevision: 1n,
        rightsStatus: "authorized",
        settledAt,
      }),
      (error: unknown) => error instanceof PersistenceError && error.reasonCode === "kbo_settlement_failed",
    );
    assert.deepEqual(
      (await adminPool.query(
        `select bet.status, bet.current_settlement_id,
                account.available_balance::text, account.correction_debt::text,
                (select count(*)::text from bet_settlement where bet_id = bet.bet_id) settlements,
                (select count(*)::text from operation_ledger
                  where operation_id = 'settlement-run-rollback-01') operations
           from kbo_bet bet join credit_account account on account.account_id = bet.account_id
          where bet.bet_id = $1`,
        [failed.betId],
      )).rows,
      [{
        status: "pending",
        current_settlement_id: null,
        available_balance: "0",
        correction_debt: "0",
        settlements: "0",
        operations: "0",
      }],
    );
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_settlement_audit_fixture on audit_event;
      drop function reject_kbo_settlement_audit_fixture();
    `);
  }
});

test("reads only fresh open KBO games and the active user's latest five bets", async () => {
  const store = new PostgresKboBetQueryStore(adminPool);
  const guildId = "92345678901234567";
  const discordUserId = "82345678901234567";
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1,$2,'최근 베팅 사용자',now(),now())`,
    [guildId, discordUserId],
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values ('settlement-query-enrollment','settlement-account-exact-01',$1,$2,'active',1,now())`,
    [guildId, discordUserId],
  );

  const recent = await store.readRecent({ guildId, discordUserId });
  assert.equal(recent.status, "ok");
  if (recent.status === "ok") {
    assert.equal(recent.bets.length, 1);
    assert.deepEqual(
      {
        status: recent.bets[0]?.status,
        corrected: recent.bets[0]?.corrected,
        returnAmount: recent.bets[0]?.returnAmount,
      },
      { status: "settled", corrected: true, returnAmount: 3000n },
    );
  }
  assert.deepEqual(
    await store.readRecent({ guildId, discordUserId: "72345678901234567" }),
    { status: "not_enrolled" },
  );

  const fresh = await store.listOpenGames({ now: new Date("2026-08-10T00:41:00Z") });
  assert.deepEqual(fresh.map((game) => game.gameId), ["game-id-0001", "game-id-0002", "game-id-0003"]);
  assert.deepEqual(
    await store.listOpenGames({ now: new Date("2026-08-10T00:46:00Z") }),
    [],
  );
});

test("ranks only active KBO enrollments with canonical season settlements and shared ties", async () => {
  const store = new PostgresKboRankingStore(adminPool);
  const guildId = "92345678901234567";
  const callerId = "82345678901234567";
  for (let index = 1; index <= 9; index += 1) {
    const betId = `ranking-bet-${String(index).padStart(6, "0")}`;
    const stakeOperation = `ranking-stake-operation-${index}`;
    const payoutOperation = `ranking-payout-operation-${index}`;
    const settlementId = `ranking-settlement-${String(index).padStart(6, "0")}`;
    await adminPool.query(
      `insert into operation_ledger (
         operation_id, actor_id, accepted_at, outcome, reason_code
       ) values
         ($1,'system:kbo-ranking-fixture',now(),'accepted','completed'),
         ($2,'system:kbo-ranking-fixture',now(),'accepted','completed')`,
      [stakeOperation, payoutOperation],
    );
    const entries = await adminPool.query<{ entry_id: string; operation_id: string }>(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values
         ('settlement-account-exact-01','bet_stake',-1000,0,1000,0,0,0,
          $1,'bet',$3,'system',now()),
         ('settlement-account-exact-01','bet_payout',2000,0,0,2000,0,0,
          $2,'settlement',$4,'system',now())
       returning entry_id::text, operation_id`,
      [stakeOperation, payoutOperation, betId, settlementId],
    );
    const byOperation = new Map(entries.rows.map((row) => [row.operation_id, row.entry_id]));
    await adminPool.query("begin");
    await adminPool.query(
      `insert into kbo_bet (
         bet_id, guild_id, account_id, game_id, market_version, prediction,
         stake, stake_date, status, operation_id, ledger_entry_id,
         placed_at, current_settlement_id
       ) values ($1,$2,'settlement-account-exact-01','settlement-game-exact-01',$3,
                 'home_win',1000,'2026-08-09','settled',$4,$5,now(),$6)`,
      [betId, guildId, 10 + index, stakeOperation, byOperation.get(stakeOperation)!, settlementId],
    );
    await adminPool.query(
      `insert into bet_settlement (
         settlement_id, bet_id, game_id, game_revision, result, multiplier,
         return_amount, applied_delta, operation_id, ledger_entry_id, settled_at
       ) values ($1,$2,'settlement-game-exact-01',3,'outcome_hit',2,2000,2000,$3,$4,now())`,
      [settlementId, betId, payoutOperation, byOperation.get(payoutOperation)!],
    );
    await adminPool.query("commit");
  }

  const otherUserId = "62345678901234567";
  await adminPool.query("begin");
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1,$2,'공동 1위',now(),now())`,
    [guildId, otherUserId],
  );
  await adminPool.query(
    `insert into credit_account (
       account_id, available_balance, created_at, updated_at
     ) values (
       'ranking-account-other',2500,
       '2026-08-10T01:00:00Z','2026-08-10T01:00:00Z'
     )`,
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values ('ranking-enrollment-other','ranking-account-other',$1,$2,'active',1,now())`,
    [guildId, otherUserId],
  );
  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ('ranking-admin-operation','admin-fixture',now(),'accepted','completed')`,
  );
  await adminPool.query(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, actor_id, occurred_at
     ) values ('ranking-account-other','admin_adjustment',1,0,2499,2500,0,0,
               'ranking-admin-operation','admin_adjustment','ranking-adjustment',
               'administrator','admin-fixture',now())`,
  );
  await adminPool.query("commit");

  const credits = await store.read({
    guildId,
    discordUserId: callerId,
    metric: "credits",
    page: 1,
  });
  assert.deepEqual(
    credits.map((row) => ({ rank: row.rank, label: row.displayLabel, self: row.isSelf, adjusted: row.adminAdjusted })),
    [
      { rank: 1n, label: "KBO bettor", self: false, adjusted: false },
      { rank: 2n, label: "공동 1위", self: false, adjusted: true },
      { rank: 2n, label: "최근 베팅 사용자", self: true, adjusted: false },
    ],
  );
  const performance = await store.read({
    guildId,
    discordUserId: callerId,
    metric: "hit_rate",
    page: 1,
    competitionId: "KBO_REGULAR",
    seasonId: "2026",
  });
  assert.deepEqual(performance, [{
    rank: 1n,
    displayLabel: "최근 베팅 사용자",
    isSelf: true,
    validSettlements: 10n,
    outcomeHits: 10n,
    scoreHits: 1n,
  }]);

  await adminPool.query(
    `update betting_enrollment
        set status = 'departed', discord_user_id = null, departed_at = now()
      where enrollment_id = 'ranking-enrollment-other'`,
  );
  assert.deepEqual(
    (await store.read({ guildId, discordUserId: callerId, metric: "credits", page: 1 }))
      .map((row) => row.displayLabel),
    ["KBO bettor", "최근 베팅 사용자"],
  );
  assert.deepEqual(
    await store.read({ guildId, discordUserId: callerId, metric: "credits", page: 2 }),
    [],
  );
});

test("adjusts KBO available credit with immutable admin ledger and audit atomically", async () => {
  const store = new PostgresKboAdminCreditStore(adminPool);
  const administratorId = "52345678901234567";
  const guildId = "92345678901234567";
  const adjustedAt = new Date("2026-08-10T02:00:00Z");
  const input = (operationId: string, expectedVersion: number, delta: bigint) => ({
    operationId,
    accountId: "ranking-account-other",
    expectedVersion,
    delta,
    reasonCode: "support_correction" as const,
    administratorId,
    adjustedAt,
    audit: {
      eventId: operationId,
      correlationId: `request:${operationId}`,
      occurredAt: adjustedAt,
      actorId: administratorId,
      guildId,
      channelId: "dashboard",
      commandName: "크레딧 관리자조정" as const,
      outcome: "success" as const,
      reasonCode: "completed",
    },
  });

  assert.deepEqual(
    await store.adjust(input("admin-credit-adjust-01", 0, 500n)),
    { status: "adjusted", availableBalance: 3000n, version: 1 },
  );
  assert.deepEqual(
    await store.adjust(input("admin-credit-adjust-01", 0, 500n)),
    { status: "duplicate_operation" },
  );
  assert.deepEqual(
    await store.adjust(input("admin-credit-stale-01", 0, 500n)),
    { status: "stale" },
  );
  assert.deepEqual(
    await store.adjust(input("admin-credit-insufficient-01", 1, -4000n)),
    { status: "insufficient_balance" },
  );

  const exactVersion = await adminPool.query<{ version: string }>(
    `select version::text from credit_account where account_id = 'settlement-account-exact-01'`,
  );
  assert.deepEqual(
    await store.adjust({
      ...input("admin-credit-self-01", Number(exactVersion.rows[0]!.version), 100n),
      accountId: "settlement-account-exact-01",
      administratorId: "82345678901234567",
      audit: {
        ...input("admin-credit-self-01", 0, 100n).audit,
        actorId: "82345678901234567",
      },
    }),
    { status: "self_adjustment" },
  );

  const concurrent = await Promise.all([
    store.adjust(input("admin-credit-concurrent-01", 1, 100n)),
    store.adjust(input("admin-credit-concurrent-02", 1, 100n)),
  ]);
  assert.deepEqual(
    concurrent.map((result) => result.status).sort(),
    ["adjusted", "stale"],
  );
  assert.deepEqual(
    (await adminPool.query(
      `select account.available_balance::text, account.correction_debt::text,
              account.version::text, ledger.available_delta::text,
              ledger.source_type, ledger.actor_id
         from credit_account account
         join credit_ledger_entry ledger
           on ledger.operation_id = 'admin-credit-adjust-01'
        where account.account_id = 'ranking-account-other'`,
    )).rows,
    [{
      available_balance: "3100",
      correction_debt: "0",
      version: "2",
      available_delta: "500",
      source_type: "admin_adjustment_support_correction",
      actor_id: administratorId,
    }],
  );

  const management = await new PostgresDashboardStore(adminPool).readKboManagement(guildId);
  const adjustedAccount = management.accounts.find(
    (account) => account.accountId === "ranking-account-other",
  );
  assert.equal(adjustedAccount?.availableBalance, "3100");
  assert.equal(adjustedAccount?.adminAdjusted, true);
  assert.equal(adjustedAccount?.enrollmentStatus, "departed");
  assert.equal(management.provider.games > 0, true);

  await adminPool.query(`
    create function reject_kbo_admin_credit_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'admin-credit-rollback-01' then raise exception 'fixture rejection'; end if;
      return new;
    end $$;
    create trigger reject_kbo_admin_credit_audit_fixture
      before insert on audit_event for each row
      execute function reject_kbo_admin_credit_audit_fixture();
  `);
  try {
    await assert.rejects(
      store.adjust(input("admin-credit-rollback-01", 2, 100n)),
      (error: unknown) =>
        error instanceof PersistenceError && error.reasonCode === "kbo_admin_credit_adjustment_failed",
    );
    assert.deepEqual(
      (await adminPool.query(
        `select account.available_balance::text, account.version::text,
                (select count(*)::text from operation_ledger
                  where operation_id = 'admin-credit-rollback-01') operations
           from credit_account account where account_id = 'ranking-account-other'`,
      )).rows,
      [{ available_balance: "3100", version: "2", operations: "0" }],
    );
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_admin_credit_audit_fixture on audit_event;
      drop function reject_kbo_admin_credit_audit_fixture();
    `);
  }
});

test("creates one idempotent KBO enrollment and zero-balance account transaction", async () => {
  const actors = new PostgresKboEnrollmentActorStore(adminPool);
  const store = new PostgresKboEnrollmentStore(adminPool);
  const enrolledAt = new Date("2026-08-07T02:00:00.000Z");
  const input = {
    operationId: "kbo-enrollment-operation-0001",
    enrollmentId: "kbo_enrollment_00000001",
    accountId: "kbo_account_00000000001",
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
    policyVersion: 1,
    enrolledAt,
  };
  await actors.register({
    guildId: input.guildId,
    discordUserId: input.discordUserId,
    displayLabel: "가입 사용자",
    registeredAt: enrolledAt,
  });

  assert.equal(await store.enroll(input), "created");
  assert.equal(await store.enroll(input), "duplicate_operation");
  assert.equal(
    await store.enroll({
      ...input,
      operationId: "kbo-enrollment-operation-0002",
      enrollmentId: "kbo_enrollment_00000002",
      accountId: "kbo_account_00000000002",
    }),
    "already_enrolled",
  );

  const created = await adminPool.query<{
    accounts: string;
    enrollments: string;
    entries: string;
    operations: string;
    audits: string;
    available_balance: string;
    correction_debt: string;
    version: string;
  }>(
    `select
       (select count(*)::text from credit_account
         where account_id in ('kbo_account_00000000001', 'kbo_account_00000000002')) accounts,
       (select count(*)::text from betting_enrollment
         where guild_id = $1 and discord_user_id = $2) enrollments,
       (select count(*)::text from credit_ledger_entry
         where account_id = 'kbo_account_00000000001') entries,
       (select count(*)::text from operation_ledger
         where operation_id like 'kbo-enrollment-operation-000%') operations,
       (select count(*)::text from audit_event
         where event_type = 'kbo.enrollment' and actor_id = $2) audits,
       account.available_balance::text,
       account.correction_debt::text,
       account.version::text
     from credit_account account
     where account.account_id = 'kbo_account_00000000001'`,
    [input.guildId, input.discordUserId],
  );
  assert.deepEqual(created.rows[0], {
    accounts: "1",
    enrollments: "1",
    entries: "0",
    operations: "2",
    audits: "2",
    available_balance: "0",
    correction_debt: "0",
    version: "0",
  });

  assert.equal(
    await store.enroll({
      ...input,
      operationId: "kbo-enrollment-not-registered",
      enrollmentId: "kbo_enrollment_00000003",
      accountId: "kbo_account_00000000003",
      discordUserId: "32345678901234567",
    }),
    "not_registered",
  );

  const concurrentUser = "42345678901234567";
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, '동시 가입', $3, $3)`,
    [input.guildId, concurrentUser, enrolledAt],
  );
  const concurrent = await Promise.all([1, 2].map((number) =>
    store.enroll({
      ...input,
      operationId: `kbo-concurrent-operation-000${number}`,
      enrollmentId: `kbo_concurrent_enroll_00${number}`,
      accountId: `kbo_concurrent_account_00${number}`,
      discordUserId: concurrentUser,
    })));
  assert.deepEqual([...concurrent].sort(), ["already_enrolled", "created"]);

  const duplicateUser = "62345678901234567";
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, '동일 요청', $3, $3)`,
    [input.guildId, duplicateUser, enrolledAt],
  );
  const duplicateInput = {
    ...input,
    operationId: "kbo-same-operation-00001",
    enrollmentId: "kbo_same_enrollment_0001",
    accountId: "kbo_same_account_0000001",
    discordUserId: duplicateUser,
  };
  const duplicateConcurrent = await Promise.all([
    store.enroll(duplicateInput),
    store.enroll(duplicateInput),
  ]);
  assert.deepEqual([...duplicateConcurrent].sort(), ["created", "duplicate_operation"]);
  assert.equal(
    (
      await adminPool.query<{ count: string }>(
        `select count(*)::text count from credit_account
          where account_id = 'kbo_same_account_0000001'`,
      )
    ).rows[0]?.count,
    "1",
  );

  await adminPool.query(`
    create function reject_kbo_enrollment_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'kbo-enrollment:kbo-audit-failure-operation' then
        raise exception 'synthetic KBO audit failure';
      end if;
      return new;
    end
    $$;
    create trigger reject_kbo_enrollment_audit_fixture
      before insert on audit_event
      for each row execute function reject_kbo_enrollment_audit_fixture()
  `);
  const rollbackUser = "52345678901234567";
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, '롤백 가입', $3, $3)`,
    [input.guildId, rollbackUser, enrolledAt],
  );
  try {
    await assert.rejects(
      store.enroll({
        ...input,
        operationId: "kbo-audit-failure-operation",
        enrollmentId: "kbo_rollback_enrollment01",
        accountId: "kbo_rollback_account00001",
        discordUserId: rollbackUser,
      }),
      PersistenceError,
    );
    const rollback = await adminPool.query<{ operations: string; accounts: string; enrollments: string }>(
      `select
         (select count(*)::text from operation_ledger
           where operation_id = 'kbo-audit-failure-operation') operations,
         (select count(*)::text from credit_account
           where account_id = 'kbo_rollback_account00001') accounts,
         (select count(*)::text from betting_enrollment
           where enrollment_id = 'kbo_rollback_enrollment01') enrollments`,
    );
    assert.deepEqual(rollback.rows[0], {
      operations: "0",
      accounts: "0",
      enrollments: "0",
    });
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_enrollment_audit_fixture on audit_event;
      drop function reject_kbo_enrollment_audit_fixture()
    `);
  }
});

test("departs a KBO member atomically without retaining a direct account link", async () => {
  const guildId = "63345678901234567";
  const discordUserId = "64345678901234567";
  const departedAt = new Date("2026-08-10T03:00:00.000Z");
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, '탈퇴 전 표시명', $3, $3)`,
    [guildId, discordUserId, new Date("2026-08-10T01:00:00.000Z")],
  );
  await adminPool.query(
    `insert into credit_account (account_id, created_at, updated_at)
     values ('departure-account-old', $1, $1)`,
    [new Date("2026-08-10T01:00:00.000Z")],
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values ('departure-enrollment-old', 'departure-account-old', $1, $2,
               'active', 1, $3)`,
    [guildId, discordUserId, new Date("2026-08-10T01:00:00.000Z")],
  );
  const store = new PostgresKboDepartureStore(adminPool);
  assert.equal((await store.listActiveDiscordUserIds(guildId)).includes(discordUserId), true);
  assert.equal(await store.depart({
    operationId: "departure-operation-01",
    guildId,
    discordUserId,
    departedAt,
  }), "departed");
  assert.equal(await store.depart({
    operationId: "departure-operation-02",
    guildId,
    discordUserId,
    departedAt,
  }), "not_enrolled");
  assert.deepEqual(
    (await adminPool.query(
      `select enrollment.status, enrollment.discord_user_id,
              enrollment.departed_at, operation.actor_id operation_actor_id,
              audit.actor_id audit_actor_id
         from betting_enrollment enrollment
         join operation_ledger operation
           on operation.operation_id = 'departure-operation-01'
         join audit_event audit
           on audit.operation_id = operation.operation_id
        where enrollment.enrollment_id = 'departure-enrollment-old'`,
    )).rows,
    [{
      status: "departed",
      discord_user_id: null,
      departed_at: departedAt,
      operation_actor_id: "system:kbo-departure",
      audit_actor_id: null,
    }],
  );
  assert.deepEqual(
    await new PostgresKboCreditBalanceStore(adminPool).read({ guildId, discordUserId }),
    { status: "not_enrolled" },
  );
  assert.equal(
    await new PostgresKboEnrollmentStore(adminPool).enroll({
      operationId: "departure-reenroll-operation",
      enrollmentId: "departure-enrollment-new",
      accountId: "departure-account-new",
      guildId,
      discordUserId,
      policyVersion: 1,
      enrolledAt: new Date("2026-08-10T04:00:00.000Z"),
    }),
    "created",
  );
  assert.deepEqual(
    (await adminPool.query(
      `select available_balance::text, correction_debt::text
         from credit_account where account_id = 'departure-account-new'`,
    )).rows,
    [{ available_balance: "0", correction_debt: "0" }],
  );

  const rollbackUserId = "65345678901234567";
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, 'rollback', $3, $3)`,
    [guildId, rollbackUserId, new Date("2026-08-10T01:00:00.000Z")],
  );
  await adminPool.query(
    `insert into credit_account (account_id, created_at, updated_at)
     values ('departure-account-rollback', $1, $1)`,
    [new Date("2026-08-10T01:00:00.000Z")],
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values ('departure-enrollment-rollback', 'departure-account-rollback',
               $1, $2, 'active', 1, $3)`,
    [guildId, rollbackUserId, new Date("2026-08-10T01:00:00.000Z")],
  );
  await adminPool.query(`
    create function reject_kbo_departure_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'kbo-departure:departure-rollback-01' then raise exception 'fixture rejection'; end if;
      return new;
    end $$;
    create trigger reject_kbo_departure_audit_fixture
      before insert on audit_event for each row execute function reject_kbo_departure_audit_fixture()
  `);
  try {
    await assert.rejects(store.depart({
      operationId: "departure-rollback-01",
      guildId,
      discordUserId: rollbackUserId,
      departedAt,
    }), PersistenceError);
    assert.deepEqual(
      (await adminPool.query(
        `select status, discord_user_id,
                (select count(*)::text from operation_ledger
                  where operation_id = 'departure-rollback-01') operations
           from betting_enrollment
          where enrollment_id = 'departure-enrollment-rollback'`,
      )).rows,
      [{ status: "active", discord_user_id: rollbackUserId, operations: "0" }],
    );
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_departure_audit_fixture on audit_event;
      drop function reject_kbo_departure_audit_fixture()
    `);
  }
});

test("purges only expired terminal KBO accounts through the bounded function", async () => {
  await adminPool.query(`
    insert into credit_account (account_id, created_at, updated_at) values
      ('retention-account-terminal', '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z'),
      ('retention-account-recent', '2025-08-01T00:00:00Z', '2026-08-01T00:00:00Z'),
      ('retention-account-held', '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z'),
      ('retention-account-pending', '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z');
    insert into betting_enrollment (
      enrollment_id, account_id, guild_id, discord_user_id, status,
      policy_version, enrolled_at, departed_at
    ) values
      ('retention-enrollment-terminal', 'retention-account-terminal', '66345678901234567', null, 'departed', 1, '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z'),
      ('retention-enrollment-recent', 'retention-account-recent', '66345678901234567', null, 'departed', 1, '2025-08-01T00:00:00Z', '2026-08-01T00:00:00Z'),
      ('retention-enrollment-held', 'retention-account-held', '66345678901234567', null, 'departed', 1, '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z'),
      ('retention-enrollment-pending', 'retention-account-pending', '66345678901234567', null, 'departed', 1, '2024-08-01T00:00:00Z', '2025-08-01T00:00:00Z');
    insert into kbo_retention_hold (account_id, reason_code, held_at, held_by)
      values ('retention-account-held', 'active_dispute', '2026-08-01T00:00:00Z', 'fixture');
    insert into operation_ledger (operation_id, actor_id, accepted_at, outcome, reason_code) values
      ('retention-terminal-bet-operation', 'system', '2025-08-01T00:00:00Z', 'accepted', 'completed'),
      ('retention-terminal-settle-operation', 'system', '2025-08-01T01:00:00Z', 'accepted', 'completed'),
      ('retention-pending-bet-operation', 'system', '2025-08-01T00:00:00Z', 'accepted', 'completed');
  `);
  const terminalLedger = await adminPool.query<{ entry_id: string }>(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values ('retention-account-terminal', 'bet_stake', -1000, 0,
               1000, 0, 0, 0, 'retention-terminal-bet-operation',
               'bet', 'retention-terminal-bet-01', 'system', '2025-08-01T00:00:00Z')
     returning entry_id::text`,
  );
  const pendingLedger = await adminPool.query<{ entry_id: string }>(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values ('retention-account-pending', 'bet_stake', -1000, 0,
               1000, 0, 0, 0, 'retention-pending-bet-operation',
               'bet', 'retention-pending-bet-01', 'system', '2025-08-01T00:00:00Z')
     returning entry_id::text`,
  );
  await adminPool.query(
    `insert into kbo_bet (
       bet_id, guild_id, account_id, game_id, market_version, prediction,
       stake, stake_date, operation_id, ledger_entry_id, placed_at
     ) values
       ('retention-terminal-bet-01', '66345678901234567', 'retention-account-terminal',
        'game-id-0001', 1, 'home_win', 1000, '2025-08-01',
        'retention-terminal-bet-operation', $1, '2025-08-01T00:00:00Z'),
       ('retention-pending-bet-01', '66345678901234567', 'retention-account-pending',
        'game-id-0001', 1, 'home_win', 1000, '2025-08-01',
        'retention-pending-bet-operation', $2, '2025-08-01T00:00:00Z')`,
    [terminalLedger.rows[0]!.entry_id, pendingLedger.rows[0]!.entry_id],
  );
  await adminPool.query(`
    insert into bet_settlement (
      settlement_id, bet_id, game_id, game_revision, result, multiplier,
      return_amount, applied_delta, operation_id, ledger_entry_id, settled_at
    ) values ('retention-settlement-0001', 'retention-terminal-bet-01',
              'game-id-0001', 1, 'lost', 0, 0, 0,
              'retention-terminal-settle-operation', null, '2025-08-01T01:00:00Z');
    update kbo_bet set status = 'settled', current_settlement_id = 'retention-settlement-0001'
      where bet_id = 'retention-terminal-bet-01';
    insert into audit_event (
      event_id, operation_id, occurred_at, event_type, actor_id, outcome,
      reason_code, correlation_id, guild_id
    ) values ('retention-terminal-audit', 'retention-terminal-settle-operation',
              '2025-08-01T01:00:00Z', 'kbo.settlement', null, 'success',
              'completed', 'retention-terminal', '66345678901234567');
  `);

  assert.equal(
    await new PostgresKboRetentionStore(adminPool).purgeExpired(
      new Date("2026-08-10T00:00:00.000Z"),
      100,
    ),
    1,
  );
  assert.deepEqual(
    (await adminPool.query(
      `select
         (select count(*)::text from credit_account where account_id = 'retention-account-terminal') terminal_accounts,
         (select count(*)::text from kbo_bet where bet_id = 'retention-terminal-bet-01') terminal_bets,
         (select count(*)::text from bet_settlement where settlement_id = 'retention-settlement-0001') terminal_settlements,
         (select count(*)::text from operation_ledger where operation_id like 'retention-terminal-%') terminal_operations,
         (select count(*)::text from audit_event where event_id = 'retention-terminal-audit') terminal_audits,
         (select count(*)::text from credit_account where account_id in
           ('retention-account-recent', 'retention-account-held', 'retention-account-pending')) protected_accounts`,
    )).rows,
    [{
      terminal_accounts: "0",
      terminal_bets: "0",
      terminal_settlements: "0",
      terminal_operations: "0",
      terminal_audits: "0",
      protected_accounts: "3",
    }],
  );
});

test("claims 50,000 KBO credits once per KST date and pays debt first", async () => {
  const store = new PostgresKboDailyCreditClaimStore(adminPool);
  const guildId = "73456789012345678";
  const claimedAt = new Date("2026-08-07T14:59:59.000Z");
  let fixtureNumber = 0;
  const createEnrollment = async (discordUserId: string, correctionDebt = 0n) => {
    fixtureNumber += 1;
    const accountId = `daily_claim_account_${fixtureNumber.toString().padStart(4, "0")}`;
    await adminPool.query(
      `insert into registered_discord_user (
         guild_id, discord_user_id, display_label, created_at, updated_at
       ) values ($1, $2, '일일 지급', $3, $3)`,
      [guildId, discordUserId, claimedAt],
    );
    await adminPool.query(
      `insert into credit_account (
         account_id, correction_debt, created_at, updated_at
       ) values ($1, $2, $3, $3)`,
      [accountId, correctionDebt.toString(), claimedAt],
    );
    await adminPool.query(
      `insert into betting_enrollment (
         enrollment_id, account_id, guild_id, discord_user_id, status,
         policy_version, enrolled_at
       ) values ($1, $2, $3, $4, 'active', 1, $5)`,
      [`daily_claim_enrollment_${fixtureNumber.toString().padStart(4, "0")}`, accountId,
        guildId, discordUserId, claimedAt],
    );
    return accountId;
  };
  const input = (operationId: string, claimId: string, discordUserId: string, at = claimedAt) => ({
    operationId,
    claimId,
    guildId,
    discordUserId,
    claimedAt: at,
  });

  const primaryUser = "83456789012345678";
  const primaryAccount = await createEnrollment(primaryUser);
  const primaryInput = input(
    "daily-primary-operation-001",
    "daily_primary_claim_0001",
    primaryUser,
  );
  const first = {
    status: "claimed" as const,
    claimDate: "2026-08-07",
    availablePaid: 50_000n,
    debtPaid: 0n,
  };
  assert.deepEqual(await store.claim(primaryInput), first);
  assert.deepEqual(await store.claim(primaryInput), first);
  const primary = await adminPool.query<{
    available_balance: string;
    correction_debt: string;
    version: string;
    operations: string;
    entries: string;
    claims: string;
    audits: string;
  }>(
    `select account.available_balance::text, account.correction_debt::text,
            account.version::text,
       (select count(*)::text from operation_ledger
         where operation_id = 'daily-primary-operation-001') operations,
       (select count(*)::text from credit_ledger_entry
         where account_id = $1) entries,
       (select count(*)::text from daily_credit_claim
         where account_id = $1) claims,
       (select count(*)::text from audit_event
         where event_type = 'kbo.daily_claim' and actor_id = $2) audits
       from credit_account account where account.account_id = $1`,
    [primaryAccount, primaryUser],
  );
  assert.deepEqual(primary.rows[0], {
    available_balance: "50000",
    correction_debt: "0",
    version: "1",
    operations: "1",
    entries: "1",
    claims: "1",
    audits: "1",
  });
  assert.deepEqual(
    await store.claim(input(
      "daily-primary-operation-002",
      "daily_primary_claim_0002",
      primaryUser,
      new Date("2026-08-07T15:00:00.000Z"),
    )),
    { status: "claimed", claimDate: "2026-08-08", availablePaid: 50_000n, debtPaid: 0n },
  );

  const partialUser = "84456789012345678";
  const partialAccount = await createEnrollment(partialUser, 20_000n);
  assert.deepEqual(
    await store.claim(input("daily-partial-operation-01", "daily_partial_claim_001", partialUser)),
    { status: "claimed", claimDate: "2026-08-07", availablePaid: 30_000n, debtPaid: 20_000n },
  );
  const fullUser = "85456789012345678";
  const fullAccount = await createEnrollment(fullUser, 70_000n);
  assert.deepEqual(
    await store.claim(input("daily-full-debt-operation", "daily_full_debt_claim_01", fullUser)),
    { status: "claimed", claimDate: "2026-08-07", availablePaid: 0n, debtPaid: 50_000n },
  );
  const debtAccounts = await adminPool.query<{
    account_id: string;
    available_balance: string;
    correction_debt: string;
  }>(
    `select account_id, available_balance::text, correction_debt::text
       from credit_account where account_id = any($1::text[]) order by account_id`,
    [[partialAccount, fullAccount]],
  );
  assert.deepEqual(debtAccounts.rows, [
    { account_id: partialAccount, available_balance: "30000", correction_debt: "0" },
    { account_id: fullAccount, available_balance: "0", correction_debt: "20000" },
  ]);
  const debtLedger = await adminPool.query<{
    account_id: string;
    available_delta: string;
    debt_delta: string;
    available_before: string;
    available_after: string;
    debt_before: string;
    debt_after: string;
  }>(
    `select account_id, available_delta::text, debt_delta::text,
            available_before::text, available_after::text,
            debt_before::text, debt_after::text
       from credit_ledger_entry where account_id = any($1::text[]) order by account_id`,
    [[partialAccount, fullAccount]],
  );
  assert.deepEqual(debtLedger.rows, [
    {
      account_id: partialAccount,
      available_delta: "30000",
      debt_delta: "-20000",
      available_before: "0",
      available_after: "30000",
      debt_before: "20000",
      debt_after: "0",
    },
    {
      account_id: fullAccount,
      available_delta: "0",
      debt_delta: "-50000",
      available_before: "0",
      available_after: "0",
      debt_before: "70000",
      debt_after: "20000",
    },
  ]);

  await adminPool.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ('daily-claimless-duplicate', $1, $2, 'denied', 'fixture')`,
    [fullUser, claimedAt],
  );
  assert.deepEqual(
    await store.claim(input(
      "daily-claimless-duplicate",
      "daily_claimless_duplicate1",
      fullUser,
      new Date("2026-08-07T15:00:00.000Z"),
    )),
    { status: "duplicate_operation", claimDate: "2026-08-08" },
  );

  const concurrentUser = "86456789012345678";
  const concurrentAccount = await createEnrollment(concurrentUser);
  const concurrent = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    store.claim(input(
      `daily-concurrent-operation-${index.toString().padStart(2, "0")}`,
      `daily_concurrent_claim_${index.toString().padStart(3, "0")}`,
      concurrentUser,
    ))));
  assert.equal(concurrent.filter((result) => result.status === "claimed").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "already_claimed").length, 19);
  assert.equal(
    (await adminPool.query<{ count: string }>(
      "select count(*)::text count from daily_credit_claim where account_id = $1",
      [concurrentAccount],
    )).rows[0]?.count,
    "1",
  );

  const duplicateUser = "87456789012345678";
  await createEnrollment(duplicateUser);
  const duplicateInput = input(
    "daily-same-operation-0001",
    "daily_same_claim_0000001",
    duplicateUser,
  );
  const duplicate = await Promise.all([store.claim(duplicateInput), store.claim(duplicateInput)]);
  assert.deepEqual(duplicate, [
    { status: "claimed", claimDate: "2026-08-07", availablePaid: 50_000n, debtPaid: 0n },
    { status: "claimed", claimDate: "2026-08-07", availablePaid: 50_000n, debtPaid: 0n },
  ]);

  assert.deepEqual(
    await store.claim(input(
      "daily-not-enrolled-operation",
      "daily_not_enrolled_claim1",
      "88456789012345678",
    )),
    { status: "not_enrolled", claimDate: "2026-08-07" },
  );
  const departedUser = "89456789012345678";
  const departedAccount = await createEnrollment(departedUser);
  await adminPool.query(
    `update betting_enrollment
        set status = 'departed', discord_user_id = null, departed_at = $2
      where account_id = $1`,
    [departedAccount, new Date("2026-08-07T15:00:00.000Z")],
  );
  assert.deepEqual(
    await store.claim(input(
      "daily-departed-operation-01",
      "daily_departed_claim_001",
      departedUser,
    )),
    { status: "not_enrolled", claimDate: "2026-08-07" },
  );

  const rollbackUser = "91456789012345678";
  const rollbackAccount = await createEnrollment(rollbackUser);
  await adminPool.query(`
    create function reject_kbo_daily_claim_audit_fixture() returns trigger language plpgsql as $$
    begin
      if new.event_id = 'kbo-daily-claim:daily-rollback-operation-01' then
        raise exception 'synthetic daily claim audit failure';
      end if;
      return new;
    end
    $$;
    create trigger reject_kbo_daily_claim_audit_fixture
      before insert on audit_event
      for each row execute function reject_kbo_daily_claim_audit_fixture()
  `);
  try {
    await assert.rejects(
      store.claim(input(
        "daily-rollback-operation-01",
        "daily_rollback_claim_0001",
        rollbackUser,
      )),
      PersistenceError,
    );
    const rolledBack = await adminPool.query<{
      available_balance: string;
      version: string;
      operations: string;
      entries: string;
      claims: string;
    }>(
      `select account.available_balance::text, account.version::text,
         (select count(*)::text from operation_ledger
           where operation_id = 'daily-rollback-operation-01') operations,
         (select count(*)::text from credit_ledger_entry where account_id = $1) entries,
         (select count(*)::text from daily_credit_claim where account_id = $1) claims
       from credit_account account where account.account_id = $1`,
      [rollbackAccount],
    );
    assert.deepEqual(rolledBack.rows[0], {
      available_balance: "0",
      version: "0",
      operations: "0",
      entries: "0",
      claims: "0",
    });
  } finally {
    await adminPool.query(`
      drop trigger reject_kbo_daily_claim_audit_fixture on audit_event;
      drop function reject_kbo_daily_claim_audit_fixture()
    `);
  }
});

test("reads only the active KBO user's exact available balance and correction debt", async () => {
  const balanceStore = new PostgresKboCreditBalanceStore(adminPool);
  const claimStore = new PostgresKboDailyCreditClaimStore(adminPool);
  const guildId = "92567890123456789";
  const discordUserId = "93567890123456789";
  const accountId = "balance_read_account_0001";
  const enrolledAt = new Date("2026-08-07T01:00:00.000Z");
  await adminPool.query(
    `insert into registered_discord_user (
       guild_id, discord_user_id, display_label, created_at, updated_at
     ) values ($1, $2, '잔액 조회', $3, $3)`,
    [guildId, discordUserId, enrolledAt],
  );
  await adminPool.query(
    `insert into credit_account (
       account_id, correction_debt, created_at, updated_at
     ) values ($1, 20000, $2, $2)`,
    [accountId, enrolledAt],
  );
  await adminPool.query(
    `insert into betting_enrollment (
       enrollment_id, account_id, guild_id, discord_user_id, status,
       policy_version, enrolled_at
     ) values ('balance_read_enrollment_01', $1, $2, $3, 'active', 1, $4)`,
    [accountId, guildId, discordUserId, enrolledAt],
  );

  assert.deepEqual(await balanceStore.read({ guildId, discordUserId }), {
    status: "active",
    availableBalance: 0n,
    correctionDebt: 20_000n,
  });
  await claimStore.claim({
    operationId: "balance-read-claim-operation",
    claimId: "balance_read_claim_00001",
    guildId,
    discordUserId,
    claimedAt: new Date("2026-08-07T02:00:00.000Z"),
  });
  assert.deepEqual(await balanceStore.read({ guildId, discordUserId }), {
    status: "active",
    availableBalance: 30_000n,
    correctionDebt: 0n,
  });
  assert.deepEqual(
    await balanceStore.read({ guildId: "94567890123456789", discordUserId }),
    { status: "not_enrolled" },
  );
  assert.deepEqual(
    await balanceStore.read({ guildId, discordUserId: "95567890123456789" }),
    { status: "not_enrolled" },
  );

  await adminPool.query(
    `update betting_enrollment
        set status = 'departed', discord_user_id = null, departed_at = $2
      where account_id = $1`,
    [accountId, new Date("2026-08-07T03:00:00.000Z")],
  );
  assert.deepEqual(await balanceStore.read({ guildId, discordUserId }), {
    status: "not_enrolled",
  });
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
        'dashboard_setting',
        'betting_enrollment',
        'credit_account',
        'credit_ledger_entry',
        'daily_credit_claim',
        'kbo_bet',
        'kbo_game',
        'kbo_game_revision',
        'bet_settlement'
      )
      order by relname`,
  );
  assert.equal(rls.rows.length, 14);
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
    await webPool.query("select account_id from credit_account");
    await webPool.query("select enrollment_id from betting_enrollment");
    await webPool.query("select entry_id from credit_ledger_entry");
    await webPool.query("select claim_id from daily_credit_claim");
    await webPool.query("select bet_id from kbo_bet");
    await webPool.query("select game_id from kbo_game");
    await webPool.query("select settlement_id from bet_settlement");
    await assert.rejects(
      webPool.query("select purge_expired_kbo_accounts(now(), 1)"),
      /permission denied/u,
    );
    await assert.rejects(webPool.query("select account_id from kbo_retention_hold"), /permission denied/u);
    await assert.rejects(webPool.query("select revision_id from kbo_game_revision"), /permission denied/u);
    await assert.rejects(
      webPool.query(
        `insert into credit_account (account_id, created_at, updated_at)
         values ('web-forbidden-account', now(), now())`,
      ),
      /permission denied/u,
    );
    await assert.rejects(
      webPool.query(
        `insert into daily_credit_claim (
           claim_id, account_id, claim_date, operation_id, ledger_entry_id, claimed_at
         ) values ('web-forbidden-claim', 'missing', current_date, 'missing', 1, now())`,
      ),
      /permission denied/u,
    );
    await assert.rejects(
      webPool.query("update daily_credit_claim set claim_date = current_date"),
      /permission denied/u,
    );
    await assert.rejects(
      webPool.query("delete from daily_credit_claim"),
      /permission denied/u,
    );
    await assert.rejects(
      webPool.query(
        `insert into kbo_bet (
           bet_id, guild_id, account_id, game_id, market_version, prediction,
           stake, stake_date, operation_id, ledger_entry_id, placed_at
         ) values (
           'web-forbidden-bet', '92345678901234567', 'missing-account-01',
           'game-id-0001', 1, 'home_win', 1000, current_date, 'missing', 1, now()
         )`,
      ),
      /permission denied/u,
    );
    await assert.rejects(webPool.query("update kbo_bet set status = 'void'"), /permission denied/u);
    await assert.rejects(webPool.query("delete from kbo_bet"), /permission denied/u);
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
    await botPool.query("select game_id from kbo_game");
    await botPool.query("select revision_id from kbo_game_revision");
    await botPool.query("select settlement_id from bet_settlement");
    await botPool.query("select purge_expired_kbo_accounts(now(), 1)");
    await assert.rejects(botPool.query("select account_id from kbo_retention_hold"), /permission denied/u);
    await botPool.query(
      `insert into role_cache (actor_id, authorization_tier, verified_at)
       values ('bot-role-fixture', 'operator', '2026-07-23T00:00:00Z')`,
    );
    await botPool.query(
      `insert into registered_discord_user (
         guild_id, discord_user_id, display_label, created_at, updated_at
       ) values ('bot-kbo-guild', 'bot-kbo-user', 'Bot KBO', now(), now())`,
    );
    await assert.rejects(
      botPool.query(
        `insert into credit_account (
           account_id, available_balance, created_at, updated_at
         ) values ('bot-invalid-opening-balance', 1, now(), now())`,
      ),
      /row-level security policy/u,
    );
    await botPool.query(
      `insert into credit_account (account_id, created_at, updated_at)
       values ('bot-kbo-account', now(), now())`,
    );
    await botPool.query(
      `insert into betting_enrollment (
         enrollment_id, account_id, guild_id, discord_user_id, status,
         policy_version, enrolled_at
       ) values (
         'bot-kbo-enrollment', 'bot-kbo-account', 'bot-kbo-guild',
         'bot-kbo-user', 'active', 1, now()
       )`,
    );
    await botPool.query(
      `update credit_account set version = version + 1
       where account_id = 'bot-kbo-account'`,
    );
    await botPool.query(
      `insert into operation_ledger (
         operation_id, actor_id, accepted_at, outcome, reason_code
       ) values ('bot-kbo-ledger-operation', 'bot-kbo-user', now(), 'accepted', 'completed')`,
    );
    await botPool.query(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'bot-kbo-account', 'daily_claim', 50000, 0,
         0, 50000, 0, 0,
         'bot-kbo-ledger-operation', 'daily_claim', '2026-08-08', 'system', now()
       )`,
    );
    const botLedgerEntry = await botPool.query<{ entry_id: string }>(
      `select entry_id::text from credit_ledger_entry
        where operation_id = 'bot-kbo-ledger-operation'`,
    );
    await botPool.query(
      `insert into daily_credit_claim (
         claim_id, account_id, claim_date, operation_id, ledger_entry_id, claimed_at
       ) values (
         'bot-kbo-claim', 'bot-kbo-account', '2026-08-08',
         'bot-kbo-ledger-operation', $1, now()
       )`,
      [botLedgerEntry.rows[0]?.entry_id],
    );
    await assert.rejects(
      botPool.query(
        `update credit_ledger_entry set available_after = 1
         where account_id = 'bot-kbo-account'`,
      ),
      /permission denied/u,
    );
    await assert.rejects(
      botPool.query("delete from credit_ledger_entry where account_id = 'bot-kbo-account'"),
      /permission denied/u,
    );
    await assert.rejects(
      botPool.query(
        "update daily_credit_claim set claim_date = '2026-08-09' where claim_id = 'bot-kbo-claim'",
      ),
      /permission denied/u,
    );
    await assert.rejects(
      botPool.query("delete from daily_credit_claim where claim_id = 'bot-kbo-claim'"),
      /permission denied/u,
    );
    await botPool.query(
      `insert into credit_account (account_id, created_at, updated_at)
       values ('bot-kbo-bet-account', now(), now())`,
    );
    await botPool.query(
      `insert into operation_ledger (
         operation_id, actor_id, accepted_at, outcome, reason_code
       ) values ('bot-kbo-bet-operation', 'bot-kbo-user', now(), 'accepted', 'completed')`,
    );
    const botBetLedger = await botPool.query<{ entry_id: string }>(
      `insert into credit_ledger_entry (
         account_id, reason_code, available_delta, debt_delta,
         available_before, available_after, debt_before, debt_after,
         operation_id, source_type, source_id, actor_type, occurred_at
       ) values (
         'bot-kbo-bet-account', 'bet_stake', -1000, 0,
         1000, 0, 0, 0,
         'bot-kbo-bet-operation', 'bet', 'bot-kbo-bet-0001', 'system', now()
       ) returning entry_id::text`,
    );
    await botPool.query(
      `insert into kbo_bet (
         bet_id, guild_id, account_id, game_id, market_version, prediction,
         stake, stake_date, operation_id, ledger_entry_id, placed_at
       ) values (
         'bot-kbo-bet-0001', '92345678901234567', 'bot-kbo-bet-account',
         'game-id-0001', 1, 'home_win', 1000, '2026-08-08',
         'bot-kbo-bet-operation', $1, now()
       )`,
      [botBetLedger.rows[0]?.entry_id],
    );
    await assert.rejects(
      botPool.query("update kbo_bet set stake = 2000 where bet_id = 'bot-kbo-bet-0001'"),
      /permission denied/u,
    );
    await assert.rejects(
      botPool.query("update kbo_bet set status = 'pending' where bet_id = 'bot-kbo-bet-0001'"),
      /row-level security policy/u,
    );
    await assert.rejects(botPool.query("update bet_settlement set return_amount = 0"), /permission denied/u);
    await assert.rejects(botPool.query("delete from bet_settlement"), /permission denied/u);
    await assert.rejects(
      botPool.query("delete from kbo_bet where bet_id = 'bot-kbo-bet-0001'"),
      /permission denied/u,
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
