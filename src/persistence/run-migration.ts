import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { readDatabaseUrlCredential } from "./database-credential.ts";
import {
  applyPendingMigrations,
  MigrationAlreadyAppliedError,
  MigrationChecksumMismatchError,
  PersistenceError,
} from "./postgres-persistence.ts";

const migrations = [
  {
    version: 1,
    name: "auth_and_operations",
    path: path.resolve(import.meta.dirname, "../../migrations/0001_auth_and_operations.sql"),
  },
  {
    version: 2,
    name: "application_persistence",
    path: path.resolve(import.meta.dirname, "../../migrations/0002_application_persistence.sql"),
  },
  {
    version: 3,
    name: "session_recent_auth",
    path: path.resolve(import.meta.dirname, "../../migrations/0003_session_recent_auth.sql"),
  },
  {
    version: 4,
    name: "dashboard_settings",
    path: path.resolve(import.meta.dirname, "../../migrations/0004_dashboard_settings.sql"),
  },
  {
    version: 5,
    name: "summary_riot_game",
    path: path.resolve(import.meta.dirname, "../../migrations/0005_summary_riot_game.sql"),
  },
  {
    version: 6,
    name: "admin_command_result",
    path: path.resolve(import.meta.dirname, "../../migrations/0006_admin_command_result.sql"),
  },
  {
    version: 7,
    name: "summary_daily_quota",
    path: path.resolve(import.meta.dirname, "../../migrations/0007_summary_daily_quota.sql"),
  },
  {
    version: 8,
    name: "summary_hourly_cooldown",
    path: path.resolve(import.meta.dirname, "../../migrations/0008_summary_hourly_cooldown.sql"),
  },
  {
    version: 9,
    name: "riot_link_version",
    path: path.resolve(import.meta.dirname, "../../migrations/0009_riot_link_version.sql"),
  },
  {
    version: 10,
    name: "riot_link_removal_result",
    path: path.resolve(import.meta.dirname, "../../migrations/0010_riot_link_removal_result.sql"),
  },
  {
    version: 11,
    name: "game_observation_source_time",
    path: path.resolve(import.meta.dirname, "../../migrations/0011_game_observation_source_time.sql"),
  },
] as const;

async function main(): Promise<void> {
  const connectionString = await readDatabaseUrlCredential(process.env.CREDENTIALS_DIRECTORY);
  const pool = new Pool({
    connectionString,
    application_name: "waw-schema-migration",
    max: 1,
  });
  try {
    const loadedMigrations = await Promise.all(
      migrations.map(async (migration) => ({
        version: migration.version,
        name: migration.name,
        sql: await readFile(migration.path, "utf8"),
      })),
    );
    const appliedVersions = await applyPendingMigrations(pool, loadedMigrations);
    for (const version of appliedVersions) {
      process.stdout.write(`migration_applied version=${version}\n`);
    }
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  const reasonCode =
    error instanceof MigrationAlreadyAppliedError
      ? "migration_already_applied"
      : error instanceof MigrationChecksumMismatchError
        ? "migration_checksum_mismatch"
      : error instanceof PersistenceError
        ? error.reasonCode
        : "migration_unexpected_failure";
  process.stderr.write(`migration_failed reason_code=${reasonCode}\n`);
  process.exitCode = 1;
}
