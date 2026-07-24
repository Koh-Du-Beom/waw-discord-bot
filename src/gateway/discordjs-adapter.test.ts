import assert from "node:assert/strict";
import test from "node:test";
import { Events, GatewayIntentBits } from "discord.js";

import {
  DISCORDJS_MINIMUM_INTENTS,
  DiscordJsGatewayAdapter,
  type DiscordJsClientFacade,
  type DiscordJsGatewayDiagnosticListeners,
  type DiscordJsGatewayDiagnosticSource,
} from "./discordjs-adapter.ts";
import type { GatewayEvent } from "./gateway-runtime.ts";

class FakeDiscordJsClient implements DiscordJsClientFacade {
  readonly listeners = new Map<string, Set<(...arguments_: readonly unknown[]) => void>>();
  destroyCalls = 0;

  on(event: string, listener: (...arguments_: readonly unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (...arguments_: readonly unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  emit(event: string, ...arguments_: readonly unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...arguments_);
    }
  }
}

class FakeDiagnostics implements DiscordJsGatewayDiagnosticSource {
  listeners: DiscordJsGatewayDiagnosticListeners | undefined;
  unsubscribeCalls = 0;

  subscribe(listeners: DiscordJsGatewayDiagnosticListeners): () => void {
    this.listeners = listeners;
    return () => {
      this.unsubscribeCalls += 1;
      this.listeners = undefined;
    };
  }
}

test("declares only the guild, member-role, and voice-state intents", () => {
  assert.deepEqual(DISCORDJS_MINIMUM_INTENTS, [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ]);
  assert.equal(DISCORDJS_MINIMUM_INTENTS.includes(GatewayIntentBits.MessageContent), false);
  assert.equal(DISCORDJS_MINIMUM_INTENTS.includes(GatewayIntentBits.GuildMessages), false);
});

test("maps public discord.js lifecycle events and injected diagnostics to normalized events", async () => {
  const client = new FakeDiscordJsClient();
  const diagnostics = new FakeDiagnostics();
  const events: GatewayEvent[] = [];
  const adapter = new DiscordJsGatewayAdapter({
    client,
    startClient: async () => {},
    diagnostics,
    reconcileMembers: async () => [],
    emit: async (event) => {
      events.push(event);
    },
    reportFailure: () => {},
  });

  client.emit(Events.ClientReady, { forbiddenPayload: "not forwarded" });
  client.emit(Events.ShardResume, 0, 2);
  client.emit(Events.ShardReconnecting, 0);
  client.emit(Events.ShardDisconnect, { code: 4_014 }, 0);
  diagnostics.listeners?.heartbeatAcknowledged();
  diagnostics.listeners?.invalidSession(true);
  diagnostics.listeners?.gatewayRateLimited(250);
  await adapter.whenIdle();

  assert.deepEqual(events, [
    { type: "ready", sequence: 1 },
    { type: "resumed", sequence: 2 },
    { type: "disconnected", resumable: true },
    { type: "disconnected", resumable: false },
    { type: "heartbeat_ack", sequence: 3 },
    { type: "invalid_session", resumable: true },
    { type: "rate_limited", retryAfterMs: 250 },
  ]);
  assert.equal(JSON.stringify(events).includes("forbiddenPayload"), false);
  await adapter.destroy();
});

test("delegates start and reconciliation but leaves reconnect ownership to discord.js", async () => {
  const client = new FakeDiscordJsClient();
  const diagnostics = new FakeDiagnostics();
  const calls: string[] = [];
  const adapter = new DiscordJsGatewayAdapter({
    client,
    startClient: async () => {
      calls.push("start");
    },
    diagnostics,
    reconcileMembers: async () => {
      calls.push("reconcile");
      return [{ actorId: "operator-1", authorizationTier: "operator" }];
    },
    emit: async () => {},
    reportFailure: () => {},
  });

  await adapter.login();
  await adapter.reconnect("resume");
  assert.deepEqual(await adapter.reconcile(), [
    { actorId: "operator-1", authorizationTier: "operator" },
  ]);
  await adapter.destroy();

  assert.deepEqual(calls, ["start", "reconcile"]);
  assert.equal(client.destroyCalls, 1);
  assert.equal(diagnostics.unsubscribeCalls, 1);
  assert.equal([...client.listeners.values()].every((listeners) => listeners.size === 0), true);
});

test("normalizes event handler failure without reflecting provider errors", async () => {
  const client = new FakeDiscordJsClient();
  const diagnostics = new FakeDiagnostics();
  const failures: string[] = [];
  const adapter = new DiscordJsGatewayAdapter({
    client,
    startClient: async () => {},
    diagnostics,
    reconcileMembers: async () => [],
    emit: async () => {
      throw new Error("synthetic provider payload must not escape");
    },
    reportFailure: (reason) => {
      failures.push(reason);
    },
  });

  client.emit(Events.ClientReady);
  await adapter.whenIdle();
  assert.deepEqual(failures, ["gateway_event_rejected"]);
});
