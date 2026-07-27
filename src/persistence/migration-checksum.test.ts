import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  acceptedMigrationChecksums,
  migrationChecksum,
} from "./postgres-persistence.ts";

const productionHistoricalChecksums = new Map([
  [1, "337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10"],
  [2, "fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d"],
  [3, "f7f94d1f2c5b4d5f39fd763f36f7b7d8819462f818d37052bf51507058edc184"],
  [4, "a48187b28dc3726726e5bef174a6e9b01a33ba7779c75ad93c68b0e3485e6419"],
  [5, "d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66d71f97972b71d32a"],
]);

test("migration checksum is independent of LF, CRLF, and CR line endings", () => {
  const lf = "create table example (\n  id integer\n);\n";
  assert.equal(migrationChecksum(lf), migrationChecksum(lf.replaceAll("\n", "\r\n")));
  assert.equal(migrationChecksum(lf), migrationChecksum(lf.replaceAll("\n", "\r")));
});

test("accepts only canonical or alternate-line-ending checksums", () => {
  const sql = "select 1;\n";
  const accepted = acceptedMigrationChecksums(sql);
  assert.equal(accepted.has(migrationChecksum(sql)), true);
  assert.equal(
    accepted.has(migrationChecksum(`${sql}-- changed\n`)),
    false,
  );
});

test("accepts the exact production historical migration ledger", async () => {
  for (const [version, checksum] of productionHistoricalChecksums) {
    const prefix = String(version).padStart(4, "0");
    const filenames = [
      "0001_auth_and_operations.sql",
      "0002_application_persistence.sql",
      "0003_session_recent_auth.sql",
      "0004_dashboard_settings.sql",
      "0005_summary_riot_game.sql",
    ];
    const filename = filenames.find((candidate) => candidate.startsWith(prefix));
    assert.ok(filename);
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../../migrations", filename),
      "utf8",
    );
    assert.equal(
      acceptedMigrationChecksums(sql, version).has(checksum),
      true,
      `production migration ${prefix} checksum must remain compatible`,
    );
  }
});

test("binds the production version 5 ledger exception to its canonical SQL", async () => {
  const sql = await readFile(
    path.resolve(import.meta.dirname, "../../migrations/0005_summary_riot_game.sql"),
    "utf8",
  );
  const historical =
    "d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66d71f97972b71d32a";

  assert.equal(acceptedMigrationChecksums(sql, 4).has(historical), false);
  assert.equal(acceptedMigrationChecksums(`${sql}\n-- changed`, 5).has(historical), false);
});
