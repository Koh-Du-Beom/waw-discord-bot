import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRuntimeHealth, InMemorySingletonLease } from "./health.ts";

test("reports healthy only when web, storage, bot and Gateway are connected", () => {
  assert.deepEqual(
    evaluateRuntimeHealth({
      webProcessRunning: true,
      storageAvailable: true,
      botProcessRunning: true,
      gatewayState: "connected",
    }),
    {
      status: "healthy",
      web: "available",
      storage: "available",
      bot: "connected",
    },
  );
});

test("reports degraded rather than healthy while Gateway is disconnected", () => {
  assert.deepEqual(
    evaluateRuntimeHealth({
      webProcessRunning: true,
      storageAvailable: true,
      botProcessRunning: true,
      gatewayState: "disconnected",
    }),
    {
      status: "degraded",
      web: "available",
      storage: "available",
      bot: "degraded",
    },
  );
});

test("reports unavailable when storage is unavailable", () => {
  assert.deepEqual(
    evaluateRuntimeHealth({
      webProcessRunning: true,
      storageAvailable: false,
      botProcessRunning: true,
      gatewayState: "connected",
    }),
    {
      status: "unavailable",
      web: "available",
      storage: "unavailable",
      bot: "connected",
    },
  );
});

test("allows one singleton owner and rejects duplicate bot start", () => {
  const lease = new InMemorySingletonLease();

  assert.equal(lease.claim("bot-a"), true);
  assert.equal(lease.claim("bot-b"), false);
  assert.equal(lease.release("bot-b"), false);
  assert.equal(lease.release("bot-a"), true);
  assert.equal(lease.claim("bot-b"), true);
});
