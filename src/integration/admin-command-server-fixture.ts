import { chmod } from "node:fs/promises";

import { Pool } from "pg";

import { AdminCommandApplication } from "../ipc/admin-command-application.ts";
import { createAdminCommandIpcServer } from "../ipc/admin-command-ipc.ts";
import { PostgresRiotCommandStore } from "../persistence/postgres-riot-command-store.ts";

const socketPath = required("WAW_ADMIN_COMMAND_SOCKET");
const pool = new Pool({
  connectionString: required("WAW_POSTGRES_TEST_URL"),
  max: 4,
});
const store = new PostgresRiotCommandStore(pool);
const application = new AdminCommandApplication({
  authorization: {
    async readCurrentAuthorization() {
      return { kind: "authorized", authorizationTier: "administrator" };
    },
  },
  validator: {
    async validate(input) {
      return { kind: "valid", normalizedPuuid: input.puuid };
    },
  },
  store,
  now: () => new Date(),
});
const responseDelay = Number(process.env.WAW_ADMIN_RESPONSE_DELAY_MS ?? "0");
const server = createAdminCommandIpcServer({
  socketPath,
  socketMode: 0o660,
  async execute(request) {
    const response = await application.execute(request);
    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }
    return response;
  },
});
await server.listen();
await chmod(socketPath, 0o660);
process.stdout.write("admin_command_fixture_ready\n");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.close();
  await pool.end();
}
process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
process.once("SIGINT", () => void stop().then(() => process.exit(0)));
setInterval(() => undefined, 30_000).unref();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}
