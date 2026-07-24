import { Events, GatewayIntentBits } from "discord.js";

import type {
  GatewayClient,
  GatewayEvent,
  GatewayReconciler,
  ReconciledMember,
} from "./gateway-runtime.ts";

export const DISCORDJS_MINIMUM_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
] as const;

type EventListener = (...arguments_: readonly unknown[]) => void;

export type DiscordJsClientFacade = {
  on(event: string, listener: EventListener): unknown;
  off(event: string, listener: EventListener): unknown;
  destroy(): void;
};

export type DiscordJsGatewayDiagnosticListeners = {
  heartbeatAcknowledged: () => void;
  invalidSession: (resumable: boolean) => void;
  gatewayRateLimited: (retryAfterMs: number) => void;
};

export type DiscordJsGatewayDiagnosticSource = {
  subscribe(listeners: DiscordJsGatewayDiagnosticListeners): () => void;
};

export type DiscordJsGatewayAdapterOptions = {
  client: DiscordJsClientFacade;
  startClient: () => Promise<void>;
  diagnostics: DiscordJsGatewayDiagnosticSource;
  reconcileMembers: () => Promise<readonly ReconciledMember[]>;
  emit: (event: GatewayEvent) => Promise<void>;
  reportFailure: (reason: "gateway_event_rejected") => void;
};

export class DiscordJsGatewayAdapter implements GatewayClient, GatewayReconciler {
  private readonly options: DiscordJsGatewayAdapterOptions;
  private sequence = 0;
  private detached = false;
  private eventQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Map<string, EventListener>();
  private readonly unsubscribeDiagnostics: () => void;

  constructor(options: DiscordJsGatewayAdapterOptions) {
    this.options = options;
    this.listen(Events.ClientReady, () => {
      this.publish({ type: "ready", sequence: this.nextSequence() });
    });
    this.listen(Events.ShardResume, () => {
      this.publish({ type: "resumed", sequence: this.nextSequence() });
    });
    this.listen(Events.ShardReconnecting, () => {
      this.publish({ type: "disconnected", resumable: true });
    });
    this.listen(Events.ShardDisconnect, () => {
      this.publish({ type: "disconnected", resumable: false });
    });
    this.unsubscribeDiagnostics = options.diagnostics.subscribe({
      heartbeatAcknowledged: () => {
        this.publish({ type: "heartbeat_ack", sequence: this.nextSequence() });
      },
      invalidSession: (resumable) => {
        this.publish({ type: "invalid_session", resumable });
      },
      gatewayRateLimited: (retryAfterMs) => {
        this.publish({ type: "rate_limited", retryAfterMs });
      },
    });
  }

  async login(): Promise<void> {
    await this.options.startClient();
  }

  async reconnect(_mode: "resume" | "identify"): Promise<void> {
    // discord.js owns its WebSocket reconnect/Resume/Identify loop. The runtime
    // records the desired recovery path without invoking private SDK methods.
  }

  async destroy(): Promise<void> {
    this.detach();
    await this.eventQueue;
    this.options.client.destroy();
  }

  async reconcile(): Promise<readonly ReconciledMember[]> {
    return this.options.reconcileMembers();
  }

  async whenIdle(): Promise<void> {
    await this.eventQueue;
  }

  private listen(event: string, listener: EventListener): void {
    this.listeners.set(event, listener);
    this.options.client.on(event, listener);
  }

  private publish(event: GatewayEvent): void {
    if (this.detached) {
      return;
    }
    this.eventQueue = this.eventQueue
      .then(async () => this.options.emit(event))
      .catch(() => {
        this.options.reportFailure("gateway_event_rejected");
      });
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private detach(): void {
    if (this.detached) {
      return;
    }
    this.detached = true;
    for (const [event, listener] of this.listeners) {
      this.options.client.off(event, listener);
    }
    this.listeners.clear();
    this.unsubscribeDiagnostics();
  }
}
