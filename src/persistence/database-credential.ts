import { readFile } from "node:fs/promises";
import path from "node:path";

import { PersistenceError } from "./postgres-persistence.ts";

const credentialNamePattern = /^[a-z][a-z0-9-]{0,63}$/;

export async function readDatabaseUrlCredential(
  credentialsDirectory: string | undefined,
  credentialName = "database-url",
): Promise<string> {
  return readSystemdCredential(
    credentialsDirectory,
    credentialName,
    "database_credential",
  );
}

export async function readSystemdCredential(
  credentialsDirectory: string | undefined,
  credentialName: string,
  reasonPrefix = "credential",
): Promise<string> {
  if (
    credentialsDirectory === undefined ||
    !path.isAbsolute(credentialsDirectory) ||
    !credentialNamePattern.test(credentialName)
  ) {
    throw new PersistenceError(`${reasonPrefix}_path_invalid`);
  }

  try {
    const rawValue = await readFile(path.join(credentialsDirectory, credentialName), "utf8");
    const value = rawValue.endsWith("\n") ? rawValue.slice(0, -1) : rawValue;
    if (value.length === 0 || /[\r\n\0]/u.test(value)) {
      throw new Error("invalid credential content");
    }
    return value;
  } catch {
    throw new PersistenceError(`${reasonPrefix}_read_failed`);
  }
}
