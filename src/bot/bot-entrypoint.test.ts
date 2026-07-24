import assert from "node:assert/strict";
import test from "node:test";

import { GatewayRuntime } from "../gateway/gateway-runtime.ts";
import type { SingletonLease } from "../gateway/singleton-lease.ts";
import { DUPLICATE_BOT_EXIT_CODE, startBotProcess } from "./bot-entrypoint.ts";

function gateway(calls: string[]): GatewayRuntime {
  return new GatewayRuntime({
    client: {
      async login() {
        calls.push("login");
      },
      async reconnect() {},
      async destroy() {
        calls.push("destroy");
      },
    },
    reconciler: { reconcile: async () => [] },
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
  });
}

test("duplicate process exits 73 without starting Gateway login", async () => {
  const calls: string[] = [];
  const lease: SingletonLease = {
    claim: async () => false,
    release: async () => {
      throw new Error("duplicate must not release another owner");
    },
  };
  const process = await startBotProcess({
    ownerId: "duplicate",
    lease,
    gateway: gateway(calls),
    shutdownTimeoutMs: 100,
    timeout: async () => {},
  });

  assert.equal(process.exitCode, DUPLICATE_BOT_EXIT_CODE);
  assert.deepEqual(calls, []);
});

test("entrypoint releases the lease after bounded graceful shutdown", async () => {
  const calls: string[] = [];
  const lease: SingletonLease = {
    claim: async () => {
      calls.push("claim");
      return true;
    },
    release: async () => {
      calls.push("release");
      return true;
    },
  };
  const process = await startBotProcess({
    ownerId: "primary",
    lease,
    gateway: gateway(calls),
    shutdownTimeoutMs: 100,
    timeout: () => new Promise(() => {}),
  });
  await process.shutdown();
  await process.shutdown();

  assert.equal(process.exitCode, undefined);
  assert.deepEqual(calls, ["claim", "login", "destroy", "release"]);
});

test("entrypoint retains ownership when Gateway destroy exceeds the shutdown bound", async () => {
  const calls: string[] = [];
  const lease: SingletonLease = {
    claim: async () => true,
    release: async () => {
      calls.push("release");
      return true;
    },
  };
  const runtime = new GatewayRuntime({
    client: {
      async login() {},
      async reconnect() {},
      destroy: () => new Promise(() => {}),
    },
    reconciler: { reconcile: async () => [] },
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
  });
  const process = await startBotProcess({
    ownerId: "primary",
    lease,
    gateway: runtime,
    shutdownTimeoutMs: 100,
    timeout: async () => {},
  });

  await assert.rejects(process.shutdown(), /shutdown timed out/);
  assert.deepEqual(calls, []);
});

test("entrypoint releases the lease when login fails", async () => {
  const calls: string[] = [];
  const runtime = gateway(calls);
  const lease: SingletonLease = {
    claim: async () => true,
    release: async () => {
      calls.push("release");
      return true;
    },
  };
  const failingRuntime = new GatewayRuntime({
    client: {
      async login() {
        throw new Error("normalized synthetic login failure");
      },
      async reconnect() {},
      async destroy() {},
    },
    reconciler: { reconcile: async () => [] },
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
  });

  await assert.rejects(
    startBotProcess({
      ownerId: "primary",
      lease,
      gateway: failingRuntime,
      shutdownTimeoutMs: 100,
      timeout: async () => {},
    }),
    /normalized synthetic login failure/,
  );
  assert.deepEqual(calls, ["release"]);
  assert.equal(runtime.snapshot().lifecycle, "idle");
});
