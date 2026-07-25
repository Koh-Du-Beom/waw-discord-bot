import { rename, writeFile } from "node:fs/promises";

import { Client } from "discord.js";

import {
  createMemberRoleIpcServer,
  type CurrentAuthorizationResult,
} from "../auth/member-role-ipc.ts";
import {
  DISCORDJS_MINIMUM_INTENTS,
  type DiscordJsClientFacade,
  type DiscordJsGatewayDiagnosticSource,
} from "../gateway/discordjs-adapter.ts";
import { FileSingletonLease } from "../gateway/singleton-lease.ts";
import { readSystemdCredential } from "../persistence/database-credential.ts";
import { DUPLICATE_BOT_EXIT_CODE } from "./bot-entrypoint.ts";
import {
  parseBotAuthorizationConfiguration,
  resolveMemberAuthorization,
} from "./discord-member-authorization.ts";
import { startDiscordJsBot } from "./discordjs-bot.ts";

const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
const token = await readSystemdCredential(
  credentialsDirectory,
  "discord-bot-token",
  "discord_bot_token",
);
const authorizationConfiguration =
  parseBotAuthorizationConfiguration(process.env);
const client = new Client({ intents: [...DISCORDJS_MINIMUM_INTENTS] });
const diagnostics: DiscordJsGatewayDiagnosticSource = {
  subscribe(listeners) {
    const timer = setInterval(() => {
      if (client.isReady()) listeners.heartbeatAcknowledged();
    }, 15_000);
    timer.unref();
    return () => clearInterval(timer);
  },
};
const reconcileMembers = async () => {
  const guild = await client.guilds.fetch(
    authorizationConfiguration.allowedGuildId,
  );
  const members = await guild.members.fetch();
  return members
    .map((member) => {
      const authorizationTier = resolveMemberAuthorization({
        actorId: member.id,
        guildOwnerId: guild.ownerId,
        roleIds: [...member.roles.cache.keys()],
        configuration: authorizationConfiguration,
      });
      return authorizationTier === undefined
        ? undefined
        : { actorId: member.id, authorizationTier };
    })
    .filter((value) => value !== undefined);
};
const assembly = await startDiscordJsBot({
  ownerId: `pid-${process.pid}`,
  lease: new FileSingletonLease("/run/waw-bot/singleton", process.pid),
  client: client as unknown as DiscordJsClientFacade,
  startClient: async () => {
    await client.login(token);
  },
  diagnostics,
  reconcileMembers,
  now: Date.now,
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  heartbeatStaleAfterMs: 45_000,
  reconnectDelaysMs: [1_000, 2_000, 5_000, 10_000],
  shutdownTimeoutMs: 10_000,
  timeout: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  reportFailure(reason) {
    process.stderr.write(
      `${JSON.stringify({
        event_type: "gateway.failure",
        reason_code: reason,
      })}\n`,
    );
  },
});
if (assembly.process.exitCode === DUPLICATE_BOT_EXIT_CODE) {
  process.exitCode = DUPLICATE_BOT_EXIT_CODE;
} else {
  const ipc = createMemberRoleIpcServer({
    socketPath:
      process.env.WAW_MEMBER_ROLE_SOCKET ??
      "/run/waw-member-role/member-role.sock",
    readAuthorization,
  });
  await ipc.listen();
  const healthPath =
    process.env.WAW_BOT_HEALTH_PATH ?? "/run/waw-bot/health.json";
  await publishHealth(healthPath);
  const healthTimer = setInterval(() => void publishHealth(healthPath), 15_000);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(healthTimer);
    await ipc.close();
    await assembly.process.shutdown();
  };
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));

  async function readAuthorization(input: {
    actorId: string;
    guildId: string;
  }): Promise<CurrentAuthorizationResult> {
    if (input.guildId !== authorizationConfiguration.allowedGuildId) {
      return { kind: "unauthorized" };
    }
    try {
      const guild = await client.guilds.fetch(input.guildId);
      const member = await guild.members.fetch(input.actorId);
      const authorizationTier = resolveMemberAuthorization({
        actorId: member.id,
        guildOwnerId: guild.ownerId,
        roleIds: [...member.roles.cache.keys()],
        configuration: authorizationConfiguration,
      });
      return authorizationTier === undefined
        ? { kind: "unauthorized" }
        : { kind: "authorized", authorizationTier };
    } catch (error) {
      return isUnknownMember(error)
        ? { kind: "unauthorized" }
        : { kind: "unavailable" };
    }
  }

  async function publishHealth(path: string): Promise<void> {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    const snapshot = assembly.gateway.snapshot();
    await writeFile(
      temporaryPath,
      JSON.stringify({
        running: true,
        gatewayState: snapshot.gatewayState,
        observedAt: new Date().toISOString(),
      }),
      { mode: 0o640 },
    );
    await rename(temporaryPath, path);
  }
}

function isUnknownMember(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === 10_007 || error.code === "10007")
  );
}
