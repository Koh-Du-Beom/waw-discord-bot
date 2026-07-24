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

export type DiscordJsBotAssembly = {
  process: BotProcess;
  gateway: GatewayRuntime;
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
  reportFailure: (reason: "gateway_event_rejected") => void;
}): Promise<DiscordJsBotAssembly> {
  let gateway: GatewayRuntime;
  const adapter = new DiscordJsGatewayAdapter({
    client: input.client,
    startClient: input.startClient,
    diagnostics: input.diagnostics,
    reconcileMembers: input.reconcileMembers,
    emit: async (event) => gateway.accept(event),
    reportFailure: input.reportFailure,
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
  return { process, gateway };
}
