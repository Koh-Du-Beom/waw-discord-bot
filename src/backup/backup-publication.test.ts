import assert from "node:assert/strict";
import test from "node:test";
import { createBackupManifest } from "./archive-manifest.ts";
import {
  evaluateBackupPublication,
  type BackupPublicationEvidence,
} from "./backup-publication.ts";

const manifest = createBackupManifest({
  now: new Date("2026-07-22T00:00:00.000Z"),
  encryptedArchive: new TextEncoder().encode("encrypted synthetic archive"),
  schemaVersion: 1,
  expectedRowCount: 2,
  expectedInvariant: "foreign_keys_valid",
});

const validEvidence: BackupPublicationEvidence = {
  dumpSucceeded: true,
  encryptionSucceeded: true,
  uploadSucceeded: true,
  uploadedBytes: manifest.encryptedBytes,
  uploadedSha256: manifest.archiveSha256,
  plaintextRemoved: true,
  encryptedLocalCopyRemoved: true,
};

test("publishes only matching encrypted bytes after local cleanup", () => {
  assert.deepEqual(evaluateBackupPublication(manifest, validEvidence), {
    status: "published",
  });
  assert.equal("databaseUrl" in validEvidence, false);
  assert.equal("ageIdentity" in validEvidence, false);
});

test("keeps failed dump, encryption, or upload unverified", () => {
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, dumpSucceeded: false }),
    { status: "unverified", reason: "dump_failed" },
  );
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, encryptionSucceeded: false }),
    { status: "unverified", reason: "encryption_failed" },
  );
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, uploadSucceeded: false }),
    { status: "unverified", reason: "upload_failed" },
  );
});

test("rejects a malformed publication manifest", () => {
  assert.deepEqual(
    evaluateBackupPublication({ ...manifest, encryptedBytes: 0 }, validEvidence),
    { status: "unverified", reason: "invalid_manifest" },
  );
});

test("rejects uploaded byte or hash mismatch", () => {
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, uploadedBytes: 1 }),
    { status: "unverified", reason: "uploaded_size_mismatch" },
  );
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, uploadedSha256: "0".repeat(64) }),
    { status: "unverified", reason: "uploaded_hash_mismatch" },
  );
});

test("does not publish while a local dump or archive remains", () => {
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, plaintextRemoved: false }),
    { status: "unverified", reason: "local_cleanup_failed" },
  );
  assert.deepEqual(
    evaluateBackupPublication(manifest, { ...validEvidence, encryptedLocalCopyRemoved: false }),
    { status: "unverified", reason: "local_cleanup_failed" },
  );
});
