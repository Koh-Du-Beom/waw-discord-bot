import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = path.resolve("migrations");
const destinationDirectory = path.resolve("dist/migrations");
const migrationPattern = /^00[0-9]{2}_[a-z0-9_]+\.sql$/;

const migrationFiles = (await readdir(sourceDirectory))
  .filter((name) => migrationPattern.test(name))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("migration_assets_missing");
}

await rm(destinationDirectory, { force: true, recursive: true });
await mkdir(destinationDirectory, { recursive: true });
await Promise.all(
  migrationFiles.map((name) =>
    cp(path.join(sourceDirectory, name), path.join(destinationDirectory, name)),
  ),
);

process.stdout.write(`migration_assets_copied count=${migrationFiles.length}\n`);
