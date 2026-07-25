import { readFile } from "node:fs/promises";
import path from "node:path";

import { startBotProcess, DUPLICATE_BOT_EXIT_CODE } from "../bot/bot-entrypoint.ts";
import { FakeGatewayAdapter } from "../gateway/fake-gateway.ts";
import { GatewayRuntime } from "../gateway/gateway-runtime.ts";
import { FileSingletonLease } from "../gateway/singleton-lease.ts";

const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
await readRequiredCredential(credentialsDirectory, "discord-bot-token");

const adapter = new FakeGatewayAdapter();
const gateway = new GatewayRuntime({
  client: adapter,
  reconciler: adapter,
  now: Date.now,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  heartbeatStaleAfterMs: 30_000,
  reconnectDelaysMs: [1_000, 2_000, 5_000],
});
const lease = new FileSingletonLease("/run/waw-bot/singleton", process.pid);
const bot = await startBotProcess({
  ownerId: `pid-${process.pid}`,
  lease,
  gateway,
  shutdownTimeoutMs: 10_000,
  timeout: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

if (bot.exitCode === DUPLICATE_BOT_EXIT_CODE) {
  process.exitCode = DUPLICATE_BOT_EXIT_CODE;
} else {
  await gateway.accept({ type: "ready", sequence: 1 });
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await bot.shutdown();
  };
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  setInterval(() => void 0, 30_000);
}

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
