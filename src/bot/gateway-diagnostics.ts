import type { GatewayRuntimeSnapshot } from "../gateway/gateway-runtime.ts";

export type BotFailureReason =
  | "gateway_event_rejected"
  | "gateway_guild_fetch_failed"
  | "gateway_member_reconciliation_failed"
  | "gateway_member_reconciliation_timed_out"
  | "gateway_member_reconciliation_retry_exhausted"
  | "command_dispatch_failed"
  | "observation_failed";

export function gatewayFailureDiagnostic(reason: BotFailureReason): string {
  return JSON.stringify({
    event_type: "gateway.failure",
    reason_code: reason,
  });
}

export function gatewayStateDiagnostic(snapshot: GatewayRuntimeSnapshot): string {
  return JSON.stringify({
    event_type: "gateway.state",
    gateway_state: snapshot.gatewayState,
    lifecycle: snapshot.lifecycle,
    reconciliation: snapshot.reconciliation,
    reconnect_attempts: snapshot.reconnectAttempts,
  });
}
