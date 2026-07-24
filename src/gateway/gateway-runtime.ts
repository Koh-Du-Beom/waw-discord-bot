import type { AuthorizationTier } from "../contracts/local-command.ts";
import type { GatewayState } from "../runtime/health.ts";

export type GatewayEvent =
  | { type: "ready"; sequence: number }
  | { type: "resumed"; sequence: number }
  | { type: "heartbeat_ack"; sequence: number }
  | { type: "disconnected"; resumable: boolean }
  | { type: "invalid_session"; resumable: boolean }
  | { type: "rate_limited"; retryAfterMs: number };

export type GatewayClient = {
  login(): Promise<void>;
  reconnect(mode: "resume" | "identify"): Promise<void>;
  destroy(): Promise<void>;
};

export type ReconciledMember = {
  actorId: string;
  authorizationTier: AuthorizationTier;
};

export type GatewayReconciler = {
  reconcile(): Promise<readonly ReconciledMember[]>;
};

export type GatewayRuntimeOptions = {
  client: GatewayClient;
  reconciler: GatewayReconciler;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  heartbeatStaleAfterMs: number;
  reconnectDelaysMs: readonly number[];
};

export type GatewayRuntimeSnapshot = {
  lifecycle:
    | "idle"
    | "connecting"
    | "ready"
    | "disconnected"
    | "reconnecting"
    | "stopping"
    | "stopped";
  gatewayState: GatewayState;
  lastSequence: number | undefined;
  reconnectAttempts: number;
  reconciliation: "unknown" | "current" | "failed";
};

export class GatewayRuntime {
  private readonly options: GatewayRuntimeOptions;
  private lifecycle: GatewayRuntimeSnapshot["lifecycle"] = "idle";
  private lastSequence: number | undefined;
  private lastHeartbeatAt: number | undefined;
  private reconnectAttempts = 0;
  private reconciliation: GatewayRuntimeSnapshot["reconciliation"] = "unknown";
  private reconciliationGeneration = 0;
  private readonly roles = new Map<string, AuthorizationTier>();

  constructor(options: GatewayRuntimeOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.lifecycle !== "idle") {
      return;
    }
    this.lifecycle = "connecting";
    await this.options.client.login();
  }

  async accept(event: GatewayEvent): Promise<void> {
    if (this.lifecycle === "stopping" || this.lifecycle === "stopped") {
      return;
    }

    if ("sequence" in event && !this.acceptSequence(event.sequence)) {
      return;
    }

    switch (event.type) {
      case "ready":
      case "resumed":
        this.lifecycle = "ready";
        this.lastHeartbeatAt = this.options.now();
        this.reconnectAttempts = 0;
        await this.reconcile();
        return;
      case "heartbeat_ack":
        this.lastHeartbeatAt = this.options.now();
        return;
      case "disconnected":
      case "invalid_session":
        this.lifecycle = "disconnected";
        this.reconciliation = "unknown";
        this.roles.clear();
        await this.reconnect(event.resumable ? "resume" : "identify", 0);
        return;
      case "rate_limited":
        this.lifecycle = "disconnected";
        this.reconciliation = "unknown";
        this.roles.clear();
        await this.reconnect("identify", event.retryAfterMs);
    }
  }

  snapshot(): GatewayRuntimeSnapshot {
    return {
      lifecycle: this.lifecycle,
      gatewayState: this.gatewayState(),
      lastSequence: this.lastSequence,
      reconnectAttempts: this.reconnectAttempts,
      reconciliation: this.reconciliation,
    };
  }

  readCurrentRole(actorId: string): AuthorizationTier | undefined {
    if (this.gatewayState() !== "connected" || this.reconciliation !== "current") {
      return undefined;
    }
    return this.roles.get(actorId);
  }

  async stop(): Promise<void> {
    if (this.lifecycle === "stopped") {
      return;
    }
    this.lifecycle = "stopping";
    this.reconciliationGeneration += 1;
    this.reconciliation = "unknown";
    this.roles.clear();
    try {
      await this.options.client.destroy();
    } finally {
      this.lifecycle = "stopped";
    }
  }

  private acceptSequence(sequence: number): boolean {
    if (this.lastSequence !== undefined && sequence <= this.lastSequence) {
      return false;
    }
    this.lastSequence = sequence;
    return true;
  }

  private async reconcile(): Promise<void> {
    const generation = ++this.reconciliationGeneration;
    this.reconciliation = "unknown";
    try {
      const members = await this.options.reconciler.reconcile();
      if (generation !== this.reconciliationGeneration || this.lifecycle !== "ready") {
        return;
      }
      const next = new Map<string, AuthorizationTier>();
      for (const member of members) {
        next.set(member.actorId, member.authorizationTier);
      }
      this.roles.clear();
      for (const [actorId, tier] of next) {
        this.roles.set(actorId, tier);
      }
      this.reconciliation = "current";
    } catch {
      if (generation === this.reconciliationGeneration) {
        this.roles.clear();
        this.reconciliation = "failed";
      }
    }
  }

  private async reconnect(mode: "resume" | "identify", minimumDelayMs: number): Promise<void> {
    const configuredDelay =
      this.options.reconnectDelaysMs[
        Math.min(this.reconnectAttempts, this.options.reconnectDelaysMs.length - 1)
      ] ?? 0;
    this.reconnectAttempts += 1;
    this.lifecycle = "reconnecting";
    await this.options.sleep(Math.max(configuredDelay, minimumDelayMs));
    if (this.lifecycle !== "reconnecting") {
      return;
    }
    await this.options.client.reconnect(mode);
  }

  private gatewayState(): GatewayState {
    if (this.lifecycle === "idle" || this.lifecycle === "connecting") {
      return "unknown";
    }
    if (this.lifecycle !== "ready" || this.reconciliation !== "current") {
      return "disconnected";
    }
    if (
      this.lastHeartbeatAt === undefined ||
      this.options.now() - this.lastHeartbeatAt > this.options.heartbeatStaleAfterMs
    ) {
      return "disconnected";
    }
    return "connected";
  }
}
