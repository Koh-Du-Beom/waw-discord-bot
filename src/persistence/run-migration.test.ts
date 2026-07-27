import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("production runner registers every migration file", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const [filenames, runner] = await Promise.all([
    readdir(path.join(root, "migrations")),
    readFile(path.join(root, "src/persistence/run-migration.ts"), "utf8"),
  ]);

  for (const filename of filenames.filter((name) => name.endsWith(".sql"))) {
    assert.ok(runner.includes(filename), `${filename} is not registered`);
  }
});
