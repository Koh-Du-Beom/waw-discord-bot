import assert from "node:assert/strict";
import test from "node:test";
import { Events } from "discord.js";

import { attachDiscordVoiceObservationAdapter } from "./voice-observation-adapter.ts";

test("normalizes voice events and reconciles after ready or resume", async () => {
  const listeners = new Map<string, Set<(...arguments_: readonly unknown[]) => void>>();
  const calls: string[] = [];
  const source = {
    on(event: string, listener: (...arguments_: readonly unknown[]) => void) {
      const values = listeners.get(event) ?? new Set();
      values.add(listener);
      listeners.set(event, values);
    },
    off(event: string, listener: (...arguments_: readonly unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
  };
  const adapter = attachDiscordVoiceObservationAdapter({
    source,
    scheduler: {
      observeVoice(input) {
        calls.push(`voice:${input.discordUserId}:${String(input.selfStream)}`);
        return {} as never;
      },
      disconnect() {
        calls.push("disconnect");
      },
      async reconcile(guildId) {
        calls.push(`reconcile:${guildId}`);
        return [];
      },
    },
    guildId: "guild",
    now: () => new Date("2026-07-25T00:00:00Z"),
    reportFailure: () => calls.push("failure"),
  });
  await adapter.whenIdle();
  emit(listeners, Events.VoiceStateUpdate, {}, {
    guild: { id: "guild" },
    id: "member",
    selfStream: true,
  });
  emit(listeners, Events.ShardReconnecting);
  emit(listeners, Events.ShardResume);
  await adapter.whenIdle();
  assert.deepEqual(calls, [
    "reconcile:guild",
    "voice:member:true",
    "disconnect",
    "reconcile:guild",
  ]);
  await adapter.detach();
  assert.equal([...listeners.values()].every((values) => values.size === 0), true);
});

function emit(
  listeners: Map<string, Set<(...arguments_: readonly unknown[]) => void>>,
  event: string,
  ...arguments_: readonly unknown[]
): void {
  for (const listener of listeners.get(event) ?? []) listener(...arguments_);
}
