import assert from "node:assert/strict";
import test from "node:test";

import {
  gatewayFailureDiagnostic,
  gatewayStateDiagnostic,
} from "./gateway-diagnostics.ts";

test("renders only allowlisted fixed gateway failure fields", () => {
  const value = gatewayFailureDiagnostic("gateway_member_reconciliation_failed");
  assert.deepEqual(JSON.parse(value), {
    event_type: "gateway.failure",
    reason_code: "gateway_member_reconciliation_failed",
  });
  assert.equal(value.includes("discord-identifier-canary"), false);
  assert.equal(value.includes("provider-payload-canary"), false);
});

test("renders only bounded gateway state metadata", () => {
  const value = gatewayStateDiagnostic({
    lifecycle: "ready",
    gatewayState: "disconnected",
    lastSequence: 99,
    reconnectAttempts: 1,
    reconciliation: "failed",
  });
  assert.deepEqual(JSON.parse(value), {
    event_type: "gateway.state",
    gateway_state: "disconnected",
    lifecycle: "ready",
    reconciliation: "failed",
    reconnect_attempts: 1,
  });
  assert.equal(value.includes("99"), false);
});
