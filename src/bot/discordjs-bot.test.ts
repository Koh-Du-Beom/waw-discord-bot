import assert from "node:assert/strict";
import test from "node:test";
import { Events } from "discord.js";

import { startDiscordJsBot } from "./discordjs-bot.ts";
import type { DiscordJsClientFacade, DiscordJsGatewayDiagnosticListeners } from "../gateway/discordjs-adapter.ts";
import type { SingletonLease } from "../gateway/singleton-lease.ts";

test("assembles fake discord.js lifecycle without a token or network", async () => {
  const listeners = new Map<string, (...arguments_: readonly unknown[]) => void>();
  let diagnostics: DiscordJsGatewayDiagnosticListeners | undefined;
  const calls: string[] = [];
  const client: DiscordJsClientFacade = {
    on(event, listener) {
      listeners.set(event, listener);
    },
    off(event) {
      listeners.delete(event);
    },
    destroy() {
      calls.push("destroy");
    },
  };
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
  const assembly = await startDiscordJsBot({
    ownerId: "fake-owner",
    lease,
    client,
    startClient: async () => {
      calls.push("start-fake");
    },
    diagnostics: {
      subscribe(value) {
        diagnostics = value;
        return () => {
          diagnostics = undefined;
        };
      },
    },
    reconcileMembers: async () => [
      { actorId: "operator-1", authorizationTier: "operator" },
    ],
    now: () => 1,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
    shutdownTimeoutMs: 100,
    timeout: () => new Promise(() => {}),
    reportFailure: () => {},
  });

  listeners.get(Events.ClientReady)?.();
  diagnostics?.heartbeatAcknowledged();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(assembly.gateway.readCurrentRole("operator-1"), "operator");
  await assembly.process.shutdown();

  assert.deepEqual(calls, ["claim", "start-fake", "destroy", "release"]);
  assert.equal(listeners.size, 0);
  assert.equal(diagnostics, undefined);
});

test("duplicate assembly refuses start before any fake Client login boundary", async () => {
  let startCalls = 0;
  const assembly = await startDiscordJsBot({
    ownerId: "duplicate",
    lease: {
      claim: async () => false,
      release: async () => false,
    },
    client: {
      on() {},
      off() {},
      destroy() {},
    },
    startClient: async () => {
      startCalls += 1;
    },
    diagnostics: {
      subscribe() {
        return () => {};
      },
    },
    reconcileMembers: async () => [],
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
    shutdownTimeoutMs: 100,
    timeout: async () => {},
    reportFailure: () => {},
  });

  assert.equal(assembly.process.exitCode, 73);
  assert.equal(startCalls, 0);
});
