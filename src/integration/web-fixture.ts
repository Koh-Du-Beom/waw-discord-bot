import { readFile } from "node:fs/promises";
import path from "node:path";

import Fastify from "fastify";
import { Pool } from "pg";

import { readDatabaseUrlCredential } from "../persistence/database-credential.ts";
import { parseWebListenConfiguration } from "../http/web-entrypoint.ts";

const configuration = parseWebListenConfiguration(process.env);
const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
const databaseUrl = await readDatabaseUrlCredential(credentialsDirectory);
await readRequiredCredential(credentialsDirectory, "oauth-client-secret");

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 2_000,
});
const app = Fastify({ logger: false });

app.get("/health", async (_request, reply) => {
  try {
    await pool.query("select 1");
    return {
      status: "degraded",
      storage: { status: "connected" },
      gateway: { status: "unknown" },
    };
  } catch {
    reply.code(503);
    return {
      status: "unavailable",
      storage: { status: "unavailable" },
      gateway: { status: "unknown" },
    };
  }
});

await app.listen(configuration);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close();
  await pool.end();
}

process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
process.once("SIGINT", () => void stop().then(() => process.exit(0)));

async function readRequiredCredential(
  directory: string | undefined,
  name: string,
): Promise<void> {
  if (directory === undefined || !path.isAbsolute(directory)) {
    throw new Error("credential_path_invalid");
  }
  const value = await readFile(path.join(directory, name), "utf8");
  if (value.trim().length === 0 || /[\r\n].+/.test(value)) {
    throw new Error("credential_invalid");
  }
}
