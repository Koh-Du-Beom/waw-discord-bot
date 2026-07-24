import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRuntimeHealth } from "../runtime/health.ts";
import { FakeGatewayAdapter } from "./fake-gateway.ts";
import {
  GatewayRuntime,
  type GatewayClient,
  type ReconciledMember,
} from "./gateway-runtime.ts";

function fixture(reconcile: () => Promise<readonly ReconciledMember[]> = async () => []) {
  let now = 1_000;
  const calls: string[] = [];
  const sleeps: number[] = [];
  const client: GatewayClient = {
    async login() {
      calls.push("login");
    },
    async reconnect(mode) {
      calls.push(`reconnect:${mode}`);
    },
    async destroy() {
      calls.push("destroy");
    },
  };
  const runtime = new GatewayRuntime({
    client,
    reconciler: { reconcile },
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [10, 20],
  });
  return {
    runtime,
    calls,
    sleeps,
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}

test("Ready reconciles roles and stale heartbeat degrades shared health", async () => {
  const value = fixture(async () => [
    { actorId: "operator-1", authorizationTier: "operator" },
  ]);

  await value.runtime.start();
  assert.equal(value.runtime.snapshot().gatewayState, "unknown");
  await value.runtime.accept({ type: "ready", sequence: 1 });
  assert.equal(value.runtime.readCurrentRole("operator-1"), "operator");
  assert.equal(value.runtime.snapshot().gatewayState, "connected");

  value.advance(101);
  assert.equal(value.runtime.snapshot().gatewayState, "disconnected");
  assert.equal(value.runtime.readCurrentRole("operator-1"), undefined);
  assert.equal(
    evaluateRuntimeHealth({
      webProcessRunning: true,
      storageAvailable: true,
      botProcessRunning: true,
      gatewayState: value.runtime.snapshot().gatewayState,
    }).status,
    "degraded",
  );
});

test("disconnect prefers Resume and invalid non-resumable session identifies with bounded backoff", async () => {
  const value = fixture();
  await value.runtime.start();
  await value.runtime.accept({ type: "ready", sequence: 1 });
  await value.runtime.accept({ type: "disconnected", resumable: true });
  await value.runtime.accept({ type: "invalid_session", resumable: false });

  assert.deepEqual(value.calls, ["login", "reconnect:resume", "reconnect:identify"]);
  assert.deepEqual(value.sleeps, [10, 20]);
  assert.equal(value.runtime.snapshot().gatewayState, "disconnected");
});

test("rate limit honors provider retry floor and duplicate sequence is idempotent", async () => {
  let reconciliationCount = 0;
  const value = fixture(async () => {
    reconciliationCount += 1;
    return [];
  });
  await value.runtime.start();
  await value.runtime.accept({ type: "ready", sequence: 4 });
  await value.runtime.accept({ type: "ready", sequence: 4 });
  await value.runtime.accept({ type: "rate_limited", retryAfterMs: 250 });

  assert.equal(reconciliationCount, 1);
  assert.deepEqual(value.sleeps, [250]);
  assert.deepEqual(value.calls, ["login", "reconnect:identify"]);
});

test("failed or partial reconciliation defaults role lookup and health to deny", async () => {
  const value = fixture(async () => {
    throw new Error("synthetic provider failure with payload omitted");
  });
  await value.runtime.start();
  await value.runtime.accept({ type: "ready", sequence: 1 });

  assert.equal(value.runtime.snapshot().reconciliation, "failed");
  assert.equal(value.runtime.snapshot().gatewayState, "disconnected");
  assert.equal(value.runtime.readCurrentRole("operator-1"), undefined);
});

test("a stale reconciliation result cannot overwrite a newer Resume snapshot", async () => {
  let finishFirst: ((members: readonly ReconciledMember[]) => void) | undefined;
  let call = 0;
  const value = fixture(() => {
    call += 1;
    if (call === 1) {
      return new Promise((resolve) => {
        finishFirst = resolve;
      });
    }
    return Promise.resolve([
      { actorId: "current-operator", authorizationTier: "operator" },
    ]);
  });
  await value.runtime.start();
  const ready = value.runtime.accept({ type: "ready", sequence: 1 });
  await Promise.resolve();
  await value.runtime.accept({ type: "resumed", sequence: 2 });
  finishFirst?.([{ actorId: "stale-admin", authorizationTier: "administrator" }]);
  await ready;

  assert.equal(value.runtime.readCurrentRole("current-operator"), "operator");
  assert.equal(value.runtime.readCurrentRole("stale-admin"), undefined);
});

test("shutdown clears role authority and destroys the fake client once", async () => {
  const value = fixture(async () => [
    { actorId: "administrator-1", authorizationTier: "administrator" },
  ]);
  await value.runtime.start();
  await value.runtime.accept({ type: "ready", sequence: 1 });
  await value.runtime.stop();
  await value.runtime.stop();

  assert.equal(value.runtime.snapshot().lifecycle, "stopped");
  assert.equal(value.runtime.snapshot().gatewayState, "disconnected");
  assert.equal(value.runtime.readCurrentRole("administrator-1"), undefined);
  assert.deepEqual(value.calls, ["login", "destroy"]);
});

test("reusable fake Gateway adapter performs no network and exposes normalized calls only", async () => {
  const adapter = new FakeGatewayAdapter();
  adapter.members = [{ actorId: "operator-1", authorizationTier: "operator" }];
  const runtime = new GatewayRuntime({
    client: adapter,
    reconciler: adapter,
    now: () => 1,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
  });

  await runtime.start();
  await runtime.accept({ type: "ready", sequence: 1 });
  await runtime.stop();

  assert.deepEqual(adapter.calls, ["login", "reconcile", "destroy"]);
  assert.equal(JSON.stringify(adapter).includes("token"), false);
});
