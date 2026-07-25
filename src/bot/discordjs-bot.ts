import type { BotProcess } from "./bot-entrypoint.ts";
import { startBotProcess } from "./bot-entrypoint.ts";
import {
  DiscordJsGatewayAdapter,
  type DiscordJsClientFacade,
  type DiscordJsGatewayDiagnosticSource,
} from "../gateway/discordjs-adapter.ts";
import {
  GatewayRuntime,
  type GatewayRuntimeOptions,
  type ReconciledMember,
} from "../gateway/gateway-runtime.ts";
import type { SingletonLease } from "../gateway/singleton-lease.ts";
import {
  attachDiscordCommandListener,
  type DiscordInteractionSource,
} from "../adapters/discord/command-listener.ts";
import type { DiscordChatInputInteraction } from "../adapters/discord/interaction-handler.ts";
import {
  attachDiscordVoiceObservationAdapter,
  type DiscordVoiceEventSource,
  type VoiceSchedulerSink,
} from "../adapters/discord/voice-observation-adapter.ts";

export type DiscordJsBotAssembly = {
  process: BotProcess;
  gateway: GatewayRuntime;
  commands?: { whenIdle(): Promise<void> };
  observations?: { whenIdle(): Promise<void> };
};

export async function startDiscordJsBot(input: {
  ownerId: string;
  lease: SingletonLease;
  client: DiscordJsClientFacade;
  startClient: () => Promise<void>;
  diagnostics: DiscordJsGatewayDiagnosticSource;
  reconcileMembers: () => Promise<readonly ReconciledMember[]>;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  heartbeatStaleAfterMs: number;
  reconnectDelaysMs: readonly number[];
  shutdownTimeoutMs: number;
  timeout: (milliseconds: number) => Promise<void>;
  reportFailure: (
    reason:
      | "gateway_event_rejected"
      | "command_dispatch_failed"
      | "observation_failed",
  ) => void;
  commands?: {
    source: DiscordInteractionSource;
    handle: (interaction: DiscordChatInputInteraction) => Promise<void>;
  };
  observations?: {
    source: DiscordVoiceEventSource;
    scheduler: VoiceSchedulerSink & { tick(): Promise<unknown> };
    guildId: string;
    pollIntervalMilliseconds: number;
    startInterval?: (action: () => void, milliseconds: number) => () => void;
  };
}): Promise<DiscordJsBotAssembly> {
  let gateway: GatewayRuntime;
  const adapter = new DiscordJsGatewayAdapter({
    client: input.client,
    startClient: input.startClient,
    diagnostics: input.diagnostics,
    reconcileMembers: input.reconcileMembers,
    emit: async (event) => gateway.accept(event),
    reportFailure: () => input.reportFailure("gateway_event_rejected"),
  });
  const runtimeOptions: GatewayRuntimeOptions = {
    client: adapter,
    reconciler: adapter,
    now: input.now,
    sleep: input.sleep,
    heartbeatStaleAfterMs: input.heartbeatStaleAfterMs,
    reconnectDelaysMs: input.reconnectDelaysMs,
  };
  gateway = new GatewayRuntime(runtimeOptions);
  const process = await startBotProcess({
    ownerId: input.ownerId,
    lease: input.lease,
    gateway,
    shutdownTimeoutMs: input.shutdownTimeoutMs,
    timeout: input.timeout,
  });
  if (process.exitCode !== undefined) {
    return { process, gateway };
  }
  const commands =
    input.commands === undefined
      ? undefined
      : attachDiscordCommandListener({
          source: input.commands.source,
          handle: input.commands.handle,
          reportFailure: () => input.reportFailure("command_dispatch_failed"),
        });
  const observations =
    input.observations === undefined
      ? undefined
      : attachDiscordVoiceObservationAdapter({
          source: input.observations.source,
          scheduler: input.observations.scheduler,
          guildId: input.observations.guildId,
          now: () => new Date(input.now()),
          reportFailure: () => input.reportFailure("observation_failed"),
        });
  const stopInterval =
    input.observations === undefined
      ? undefined
      : (input.observations.startInterval ?? defaultInterval)(
          () => {
            void input.observations?.scheduler
              .tick()
              .catch(() => input.reportFailure("observation_failed"));
          },
          input.observations.pollIntervalMilliseconds,
        );
  return {
    gateway,
    ...(commands === undefined ? {} : { commands }),
    ...(observations === undefined ? {} : { observations }),
    process: {
      exitCode: process.exitCode,
      async shutdown() {
        stopInterval?.();
        await observations?.detach();
        await commands?.detach();
        await process.shutdown();
      },
    },
  };
}

function defaultInterval(action: () => void, milliseconds: number): () => void {
  const timer = setInterval(action, milliseconds);
  timer.unref();
  return () => clearInterval(timer);
}
