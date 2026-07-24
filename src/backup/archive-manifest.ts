import { createHash, randomUUID } from "node:crypto";

export type BackupArchiveManifest = {
  archiveId: string;
  createdAt: string;
  retentionExpiresAt: string;
  schemaVersion: number;
  encryptedBytes: number;
  archiveSha256: string;
  expectedRowCount: number;
  expectedInvariant: string;
};

export type RestoreEvidence = {
  archiveSha256: string;
  schemaVersion: number;
  rowCount: number;
  verifiedInvariants: readonly string[];
};

export type ArchiveVerification =
  | { status: "verified" }
  | { status: "unverified"; reason: string };

const sha256Pattern = /^[a-f0-9]{64}$/;

export function createBackupManifest(input: {
  now: Date;
  encryptedArchive: Uint8Array;
  schemaVersion: number;
  expectedRowCount: number;
  expectedInvariant: string;
}): BackupArchiveManifest {
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new Error("schema version must be a positive integer");
  }
  if (!Number.isInteger(input.expectedRowCount) || input.expectedRowCount < 0) {
    throw new Error("expected row count must be a non-negative integer");
  }
  if (input.expectedInvariant.length === 0) {
    throw new Error("expected invariant is required");
  }

  const retentionExpiresAt = new Date(input.now);
  retentionExpiresAt.setUTCDate(retentionExpiresAt.getUTCDate() + 30);

  return {
    archiveId: randomUUID(),
    createdAt: input.now.toISOString(),
    retentionExpiresAt: retentionExpiresAt.toISOString(),
    schemaVersion: input.schemaVersion,
    encryptedBytes: input.encryptedArchive.byteLength,
    archiveSha256: sha256(input.encryptedArchive),
    expectedRowCount: input.expectedRowCount,
    expectedInvariant: input.expectedInvariant,
  };
}

export function verifyRestore(
  manifest: BackupArchiveManifest,
  evidence: RestoreEvidence,
  now: Date,
): ArchiveVerification {
  if (!isValidBackupManifest(manifest)) {
    return { status: "unverified", reason: "invalid_manifest" };
  }
  if (new Date(manifest.retentionExpiresAt) <= now) {
    return { status: "unverified", reason: "retention_expired" };
  }
  if (evidence.archiveSha256 !== manifest.archiveSha256) {
    return { status: "unverified", reason: "archive_hash_mismatch" };
  }
  if (evidence.schemaVersion !== manifest.schemaVersion) {
    return { status: "unverified", reason: "schema_version_mismatch" };
  }
  if (evidence.rowCount !== manifest.expectedRowCount) {
    return { status: "unverified", reason: "row_count_mismatch" };
  }
  if (!evidence.verifiedInvariants.includes(manifest.expectedInvariant)) {
    return { status: "unverified", reason: "invariant_mismatch" };
  }
  return { status: "verified" };
}

export function isValidBackupManifest(manifest: BackupArchiveManifest): boolean {
  return (
    /^[0-9a-f-]{36}$/.test(manifest.archiveId) &&
    isValidIsoDate(manifest.createdAt) &&
    isValidIsoDate(manifest.retentionExpiresAt) &&
    new Date(manifest.retentionExpiresAt) > new Date(manifest.createdAt) &&
    Number.isInteger(manifest.schemaVersion) &&
    manifest.schemaVersion > 0 &&
    Number.isInteger(manifest.encryptedBytes) &&
    manifest.encryptedBytes > 0 &&
    sha256Pattern.test(manifest.archiveSha256) &&
    Number.isInteger(manifest.expectedRowCount) &&
    manifest.expectedRowCount >= 0 &&
    manifest.expectedInvariant.length > 0
  );
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
