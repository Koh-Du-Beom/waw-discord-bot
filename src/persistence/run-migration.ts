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
