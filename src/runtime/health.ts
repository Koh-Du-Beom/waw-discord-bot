export type GatewayState = "connected" | "disconnected" | "unknown";
export type HealthStatus = "healthy" | "degraded" | "unavailable";

export type RuntimeHealthInput = {
  webProcessRunning: boolean;
  storageAvailable: boolean;
  botProcessRunning: boolean;
  gatewayState: GatewayState;
};

export type RuntimeHealth = {
  status: HealthStatus;
  web: "available" | "unavailable";
  storage: "available" | "unavailable";
  bot: "connected" | "degraded" | "unavailable";
};

export function evaluateRuntimeHealth(input: RuntimeHealthInput): RuntimeHealth {
  if (!input.webProcessRunning || !input.storageAvailable) {
    return {
      status: "unavailable",
      web: input.webProcessRunning ? "available" : "unavailable",
      storage: input.storageAvailable ? "available" : "unavailable",
      bot: botHealth(input),
    };
  }

  const bot = botHealth(input);
  return {
    status: bot === "connected" ? "healthy" : "degraded",
    web: "available",
    storage: "available",
    bot,
  };
}

export class InMemorySingletonLease {
  private ownerId: string | undefined;

  claim(ownerId: string): boolean {
    if (this.ownerId !== undefined) {
      return false;
    }
    this.ownerId = ownerId;
    return true;
  }

  release(ownerId: string): boolean {
    if (this.ownerId !== ownerId) {
      return false;
    }
    this.ownerId = undefined;
    return true;
  }
}

function botHealth(input: RuntimeHealthInput): "connected" | "degraded" | "unavailable" {
  if (!input.botProcessRunning) {
    return "unavailable";
  }
  return input.gatewayState === "connected" ? "connected" : "degraded";
}
