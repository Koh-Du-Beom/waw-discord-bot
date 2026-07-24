import assert from "node:assert/strict";
import test from "node:test";
import { createBackupManifest, verifyRestore } from "./archive-manifest.ts";

const createdAt = new Date("2026-07-21T00:00:00.000Z");

function fixture() {
  const encryptedArchive = new TextEncoder().encode("encrypted synthetic archive");
  const manifest = createBackupManifest({
    now: createdAt,
    encryptedArchive,
    schemaVersion: 1,
    expectedRowCount: 3,
    expectedInvariant: "foreign_keys_valid",
  });
  return { manifest };
}

test("verifies matching non-secret backup metadata and restore evidence", () => {
  const { manifest } = fixture();

  assert.deepEqual(
    verifyRestore(
      manifest,
      {
        archiveSha256: manifest.archiveSha256,
        schemaVersion: 1,
        rowCount: 3,
        verifiedInvariants: ["foreign_keys_valid"],
      },
      createdAt,
    ),
    { status: "verified" },
  );
  assert.equal("connectionString" in manifest, false);
  assert.equal("plaintextDump" in manifest, false);
});

test("rejects a mismatched archive hash", () => {
  const { manifest } = fixture();

  assert.deepEqual(
    verifyRestore(
      manifest,
      {
        archiveSha256: "0".repeat(64),
        schemaVersion: 1,
        rowCount: 3,
        verifiedInvariants: ["foreign_keys_valid"],
      },
      createdAt,
    ),
    { status: "unverified", reason: "archive_hash_mismatch" },
  );
});

test("rejects missing schema version and bad restore evidence", () => {
  const { manifest } = fixture();
  const malformed = { ...manifest, schemaVersion: 0 };

  assert.deepEqual(
    verifyRestore(
      malformed,
      {
        archiveSha256: manifest.archiveSha256,
        schemaVersion: 0,
        rowCount: 3,
        verifiedInvariants: ["foreign_keys_valid"],
      },
      createdAt,
    ),
    { status: "unverified", reason: "invalid_manifest" },
  );
});

test("rejects expired retention, row count mismatch, and missing invariant", () => {
  const { manifest } = fixture();
  const evidence = {
    archiveSha256: manifest.archiveSha256,
    schemaVersion: 1,
    rowCount: 2,
    verifiedInvariants: [] as readonly string[],
  };

  assert.deepEqual(
    verifyRestore(manifest, evidence, new Date("2026-08-21T00:00:00.000Z")),
    { status: "unverified", reason: "retention_expired" },
  );
  assert.deepEqual(verifyRestore(manifest, evidence, createdAt), {
    status: "unverified",
    reason: "row_count_mismatch",
  });
  assert.deepEqual(
    verifyRestore(
      manifest,
      { ...evidence, rowCount: 3 },
      createdAt,
    ),
    { status: "unverified", reason: "invariant_mismatch" },
  );
});
