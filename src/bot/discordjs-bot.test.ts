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
  assert.equal(listeners.has(Events.VoiceStateUpdate), false);
  await assembly.process.shutdown();

  assert.deepEqual(calls, ["claim", "start-fake", "destroy", "release"]);
  assert.equal(listeners.size, 0);
  assert.equal(diagnostics, undefined);
});

test("attaches and stops the gated observation lifecycle with a fake client", async () => {
  const listeners = new Map<string, Set<(...arguments_: readonly unknown[]) => void>>();
  const calls: string[] = [];
  let intervalAction: (() => void) | undefined;
  const client: DiscordJsClientFacade = {
    on(event, listener) {
      const values = listeners.get(event) ?? new Set();
      values.add(listener);
      listeners.set(event, values);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    destroy() {
      calls.push("destroy");
    },
  };
  const assembly = await startDiscordJsBot({
    ownerId: "observation-owner",
    lease: {
      claim: async () => true,
      release: async () => true,
    },
    client,
    startClient: async () => {},
    diagnostics: { subscribe: () => () => {} },
    reconcileMembers: async () => [],
    now: () => Date.parse("2026-07-25T00:00:00Z"),
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
    shutdownTimeoutMs: 100,
    timeout: () => new Promise(() => {}),
    reportFailure: () => calls.push("failure"),
    observations: {
      source: client,
      guildId: "guild",
      pollIntervalMilliseconds: 30_000,
      scheduler: {
        observeVoice(input) {
          calls.push(`voice:${input.discordUserId}:${String(input.selfStream)}`);
          return {} as never;
        },
        disconnect() {
          calls.push("disconnect");
        },
        async reconcile() {
          calls.push("reconcile");
          return [];
        },
        async tick() {
          calls.push("tick");
        },
      },
      startInterval(action, milliseconds) {
        calls.push(`interval:${milliseconds}`);
        intervalAction = action;
        return () => calls.push("interval-stopped");
      },
    },
  });
  await assembly.observations?.whenIdle();
  intervalAction?.();
  for (const listener of listeners.get(Events.VoiceStateUpdate) ?? []) {
    listener({}, { guild: { id: "guild" }, id: "member", selfStream: true });
  }
  await assembly.observations?.whenIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 4), [
    "interval:30000",
    "reconcile",
    "tick",
    "voice:member:true",
  ]);
  await assembly.process.shutdown();
  assert.equal(calls.includes("interval-stopped"), true);
  assert.equal(listeners.get(Events.VoiceStateUpdate)?.size, 0);
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
