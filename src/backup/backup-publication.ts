import {
  isValidBackupManifest,
  type BackupArchiveManifest,
} from "./archive-manifest.ts";

export type BackupPublicationEvidence = {
  dumpSucceeded: boolean;
  encryptionSucceeded: boolean;
  uploadSucceeded: boolean;
  uploadedBytes: number;
  uploadedSha256: string;
  plaintextRemoved: boolean;
  encryptedLocalCopyRemoved: boolean;
};

export type BackupPublicationResult =
  | { status: "published" }
  | { status: "unverified"; reason: string };

export function evaluateBackupPublication(
  manifest: BackupArchiveManifest,
  evidence: BackupPublicationEvidence,
): BackupPublicationResult {
  if (!isValidBackupManifest(manifest)) {
    return { status: "unverified", reason: "invalid_manifest" };
  }
  if (!evidence.dumpSucceeded) {
    return { status: "unverified", reason: "dump_failed" };
  }
  if (!evidence.encryptionSucceeded) {
    return { status: "unverified", reason: "encryption_failed" };
  }
  if (!evidence.uploadSucceeded) {
    return { status: "unverified", reason: "upload_failed" };
  }
  if (evidence.uploadedBytes !== manifest.encryptedBytes) {
    return { status: "unverified", reason: "uploaded_size_mismatch" };
  }
  if (evidence.uploadedSha256 !== manifest.archiveSha256) {
    return { status: "unverified", reason: "uploaded_hash_mismatch" };
  }
  if (!evidence.plaintextRemoved || !evidence.encryptedLocalCopyRemoved) {
    return { status: "unverified", reason: "local_cleanup_failed" };
  }
  return { status: "published" };
}
