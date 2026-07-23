import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readDatabaseUrlCredential } from "./database-credential.ts";
import { PersistenceError } from "./postgres-persistence.ts";

test("reads a synthetic database URL from a systemd-style credential directory", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "waw-database-credential-"));
  try {
    const syntheticUrl = "postgresql://synthetic:synthetic@localhost/synthetic";
    await writeFile(path.join(directory, "database-url"), `${syntheticUrl}\n`, { mode: 0o600 });
    assert.equal(await readDatabaseUrlCredential(directory), syntheticUrl);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects missing, relative, traversal, empty, and multiline credentials without echoing values", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "waw-database-credential-"));
  const canary = "database-password-canary";
  try {
    await writeFile(path.join(directory, "empty"), "");
    await writeFile(path.join(directory, "multiline"), `postgresql://fixture/${canary}\nsecond-line`);

    for (const operation of [
      () => readDatabaseUrlCredential(undefined),
      () => readDatabaseUrlCredential("relative"),
      () => readDatabaseUrlCredential(directory, "../database-url"),
      () => readDatabaseUrlCredential(directory, "empty"),
      () => readDatabaseUrlCredential(directory, "multiline"),
    ]) {
      let failure: unknown;
      try {
        await operation();
      } catch (error) {
        failure = error;
      }
      assert.equal(failure instanceof PersistenceError, true);
      assert.equal(JSON.stringify(failure).includes(canary), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
