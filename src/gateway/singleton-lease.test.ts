import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileSingletonLease } from "./singleton-lease.ts";

test("file lease refuses an active owner and never force-takes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "waw-singleton-"));
  const path = join(directory, "bot.lock");
  try {
    const first = new FileSingletonLease(path, 101, (pid) => pid === 101);
    const duplicate = new FileSingletonLease(path, 202, (pid) => pid === 101);
    assert.equal(await first.claim("first"), true);
    assert.equal(await duplicate.claim("duplicate"), false);
    assert.equal(await duplicate.release("duplicate"), false);
    assert.equal(await first.release("first"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file lease replaces a well-formed stale owner and releases its own file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "waw-singleton-"));
  const path = join(directory, "bot.lock");
  try {
    await writeFile(path, JSON.stringify({ ownerId: "stale", pid: 101 }), { mode: 0o600 });
    const next = new FileSingletonLease(path, 202, () => false);
    assert.equal(await next.claim("next"), true);
    assert.equal(await next.release("next"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file lease does not delete a malformed lock whose ownership cannot be proved stale", async () => {
  const directory = await mkdtemp(join(tmpdir(), "waw-singleton-"));
  const path = join(directory, "bot.lock");
  try {
    await writeFile(path, "not-json", { mode: 0o600 });
    const next = new FileSingletonLease(path, 202, () => false);
    assert.equal(await next.claim("next"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
