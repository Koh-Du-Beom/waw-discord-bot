import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";

import { Client } from "discord.js";
import { Pool } from "pg";

import {
  createDiscordConversationHistoryReader,
  type DiscordHistoryChannel,
} from "../adapters/discord/conversation-history.ts";
import { createDiscordInteractionHandler } from "../adapters/discord/interaction-handler.ts";
import { createDiscordVoiceSource } from "../adapters/discord/voice-observation-adapter.ts";
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
import { KoreanCommandHandler } from "../commands/command-handler.ts";
import { RoutedFeatureCommandExecutor } from "../commands/feature-command-executor.ts";
import { GameCommandExecutor } from "../game/game-command-executor.ts";
import { GameObservationExecutor } from "../game/game-observation-executor.ts";
import { GameObservationScheduler } from "../game/observation-scheduler.ts";
import {
  readDatabaseUrlCredential,
  readSystemdCredential,
} from "../persistence/database-credential.ts";
import { PostgresCommandAuditSink } from "../persistence/command-audit-store.ts";
import { PostgresSummaryQuotaStore } from "../persistence/postgres-summary-quota-store.ts";
import { OpenAiConversationSummarizer } from "../summary/openai-conversation-summarizer.ts";
import { summaryProviderEnabled } from "../summary/provider-feature.ts";
import { summaryQuotaEnforcementEnabled } from "../summary/quota-feature.ts";
import { PostgresFeatureStore } from "../persistence/feature-store.ts";
import { PostgresGameObservationStore } from "../persistence/postgres-game-observation-store.ts";
import { PostgresObservationTargetSource } from "../persistence/postgres-observation-target-source.ts";
import { PostgresRiotCommandStore } from "../persistence/postgres-riot-command-store.ts";
import { RiotCommandExecutor } from "../riot/riot-command-executor.ts";
import { RiotSpectatorObserver } from "../riot/riot-game-observer.ts";
import { RiotPuuidValidator } from "../riot/riot-puuid-validator.ts";
import { DUPLICATE_BOT_EXIT_CODE } from "./bot-entrypoint.ts";
import {
  parseBotAuthorizationConfiguration,
  resolveMemberAuthorization,
} from "./discord-member-authorization.ts";
import { startDiscordJsBot } from "./discordjs-bot.ts";
import {
  type BotFailureReason,
  gatewayFailureDiagnostic,
  gatewayStateDiagnostic,
} from "./gateway-diagnostics.ts";
import { observationFeatureEnabled } from "./observation-feature.ts";
import { AdminCommandApplication } from "../ipc/admin-command-application.ts";
import { createAdminCommandIpcServer } from "../ipc/admin-command-ipc.ts";
import {
  adminCommandFeatureEnabled,
  shutdownBotFeatures,
  startAdminCommandServerFeature,
} from "../ipc/admin-command-feature.ts";

const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
const providerEnabled = summaryProviderEnabled(
  process.env.WAW_SUMMARY_PROVIDER_ENABLED,
);
const [token, databaseUrl, riotApiKey, summaryApiKey] = await Promise.all([
  readSystemdCredential(
    credentialsDirectory,
    "discord-bot-token",
    "discord_bot_token",
  ),
  readDatabaseUrlCredential(credentialsDirectory),
  readSystemdCredential(credentialsDirectory, "riot-api-key", "riot_api_key"),
  providerEnabled
    ? readSystemdCredential(
      credentialsDirectory,
      "summary-api-key",
      "summary_provider_credential",
    )
    : undefined,
]);
const authorizationConfiguration =
  parseBotAuthorizationConfiguration(process.env);
const gameObservationEnabled = observationFeatureEnabled(
  process.env.WAW_GAME_OBSERVATION_ENABLED,
);
const client = new Client({ intents: [...DISCORDJS_MINIMUM_INTENTS] });
const pool = new Pool({
  connectionString: databaseUrl,
  application_name: "waw-bot",
  max: 4,
  connectionTimeoutMillis: 3_000,
  statement_timeout: 3_000,
  idleTimeoutMillis: 30_000,
});
const readCurrentAuthorization = async (input: {
  actorId: string;
  guildId: string;
}): Promise<CurrentAuthorizationResult> => {
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
};
const featureStore = new PostgresFeatureStore(pool);
const riotStore = new PostgresRiotCommandStore(pool);
const commandHandler = new KoreanCommandHandler({
  history: createDiscordConversationHistoryReader({
    async resolve(channelId) {
      const channel = await client.channels.fetch(channelId, { cache: false });
      if (!channel?.isTextBased() || !("messages" in channel)) return undefined;
      return channel as unknown as DiscordHistoryChannel;
    },
  }),
  features: new RoutedFeatureCommandExecutor(
    new RiotCommandExecutor(riotStore, () => new Date()),
    new GameCommandExecutor(
      featureStore,
      { readCurrentAuthorization },
      () => new Date(),
    ),
  ),
  audit: new PostgresCommandAuditSink(pool),
  ...(summaryApiKey === undefined
    ? {}
    : { summarizer: new OpenAiConversationSummarizer(summaryApiKey) }),
  ...(summaryQuotaEnforcementEnabled(process.env.WAW_SUMMARY_QUOTA_ENABLED)
    ? { quota: new PostgresSummaryQuotaStore(pool) }
    : {}),
  now: () => new Date(),
});
const handleInteraction = createDiscordInteractionHandler({
  handler: commandHandler,
  createCorrelationId: randomUUID,
});
const diagnostics: DiscordJsGatewayDiagnosticSource = {
  subscribe(listeners) {
    const timer = setInterval(() => {
      if (client.isReady()) listeners.heartbeatAcknowledged();
    }, 15_000);
    timer.unref();
    return () => clearInterval(timer);
  },
};
const reportFailure = (reason: BotFailureReason): void => {
  process.stderr.write(`${gatewayFailureDiagnostic(reason)}\n`);
};
const observationScheduler = gameObservationEnabled
  ? new GameObservationScheduler({
      targets: new PostgresObservationTargetSource(
        pool,
        authorizationConfiguration.allowedGuildId,
      ),
      riot: new RiotSpectatorObserver(riotApiKey),
      voice: createDiscordVoiceSource({
        async fetchMembers(guildId) {
          const guild = await client.guilds.fetch(guildId);
          const members = await guild.members.fetch();
          return members.map((member) => ({
            discordUserId: member.id,
            selfStream: member.voice.streaming === true,
          }));
        },
      }),
      observations: new GameObservationExecutor(
        new PostgresGameObservationStore(pool),
      ),
      now: () => new Date(),
      timeoutMilliseconds: 3_000,
    })
  : undefined;
const reconcileMembers = async () => {
  let guild;
  try {
    guild = await client.guilds.fetch(
      authorizationConfiguration.allowedGuildId,
    );
  } catch {
    reportFailure("gateway_guild_fetch_failed");
    throw new Error("gateway guild fetch failed");
  }
  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    reportFailure("gateway_member_reconciliation_failed");
    throw new Error("gateway member reconciliation failed");
  }
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
  reconciliationTimeoutMs: 15_000,
  reconciliationRetryDelaysMs: [2_000, 5_000],
  timeout: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  reportFailure,
  commands: {
    source: client,
    handle: handleInteraction,
  },
  ...(observationScheduler === undefined
    ? {}
    : {
        observations: {
          source: client,
          scheduler: observationScheduler,
          guildId: authorizationConfiguration.allowedGuildId,
          pollIntervalMilliseconds: 30_000,
        },
      }),
});
if (assembly.process.exitCode === DUPLICATE_BOT_EXIT_CODE) {
  await pool.end();
  process.exitCode = DUPLICATE_BOT_EXIT_CODE;
} else {
  const ipc = createMemberRoleIpcServer({
    socketPath:
      process.env.WAW_MEMBER_ROLE_SOCKET ??
      "/run/waw-member-role/member-role.sock",
    readAuthorization: readCurrentAuthorization,
  });
  await ipc.listen();
  const adminApplication = new AdminCommandApplication({
    authorization: { readCurrentAuthorization },
    validator: new RiotPuuidValidator(riotApiKey),
    store: riotStore,
    displayName: async (discordUserId) => {
      const guild = await client.guilds.fetch(
        authorizationConfiguration.allowedGuildId,
      );
      return guild.members.cache.get(discordUserId)?.displayName;
    },
    now: () => new Date(),
  });
  const adminIpc = await startAdminCommandServerFeature({
    enabled: adminCommandFeatureEnabled(
      process.env.WAW_ADMIN_COMMAND_IPC_ENABLED,
    ),
    duplicateBot: false,
    createServer: (execute) =>
      createAdminCommandIpcServer({
        socketPath:
          process.env.WAW_ADMIN_COMMAND_SOCKET ??
          "/run/waw-admin-command/admin-command.sock",
        socketMode: 0o660,
        inheritSocketDirectoryGroup: true,
        reportDiagnostic: (diagnostic) => {
          process.stderr.write(
            `${JSON.stringify({
              event_type: "admin_command.ipc",
              ...diagnostic,
            })}\n`,
          );
        },
        execute,
      }),
    execute: (request) => adminApplication.execute(request),
  });
  const healthPath =
    process.env.WAW_BOT_HEALTH_PATH ?? "/run/waw-bot/health.json";
  let lastGatewayDiagnostic: string | undefined;
  await publishHealth(healthPath);
  const healthTimer = setInterval(() => void publishHealth(healthPath), 15_000);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(healthTimer);
    await shutdownBotFeatures({
      ...(adminIpc === undefined ? {} : { adminCommand: adminIpc }),
      memberRole: ipc,
      shutdownBot: () => assembly.process.shutdown(),
      closeDatabase: () => pool.end(),
    });
  };
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));

  async function publishHealth(path: string): Promise<void> {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    const snapshot = assembly.gateway.snapshot();
    const gatewayDiagnostic = gatewayStateDiagnostic(snapshot);
    if (gatewayDiagnostic !== lastGatewayDiagnostic) {
      lastGatewayDiagnostic = gatewayDiagnostic;
      process.stdout.write(`${gatewayDiagnostic}\n`);
    }
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
