import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

async function collectTests(directory) {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...(await collectTests(path)));
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      tests.push(path);
    }
  }
  return tests;
}

let tests = [
  ...(await collectTests("src")),
  ...(await collectTests("web")),
].sort();

if (process.env.WAW_SKIP_POSTGRES_INTEGRATION === "1") {
  tests = tests.filter((path) => !path.endsWith(".integration.test.ts"));
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", ...tests],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
