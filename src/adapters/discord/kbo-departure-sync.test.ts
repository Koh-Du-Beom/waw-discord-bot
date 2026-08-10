import assert from "node:assert/strict";
import test from "node:test";
import { Events } from "discord.js";

import type { KboDepartureInput, KboDepartureStore } from "../../kbo/departure.ts";
import { attachKboDepartureSync, reconcileKboDepartures } from "./kbo-departure-sync.ts";

test("departs only missing active members during startup reconciliation", async () => {
  const departed: KboDepartureInput[] = [];
  await reconcileKboDepartures({
    guildId: "223456789012345678",
    currentDiscordUserIds: ["323456789012345678"],
    store: store(["323456789012345678", "423456789012345678"], departed),
    now: () => new Date("2026-08-10T03:00:00.000Z"),
    generateId: () => "departure-operation-0001",
  });
  assert.deepEqual(departed, [{
    operationId: "departure-operation-0001",
    guildId: "223456789012345678",
    discordUserId: "423456789012345678",
    departedAt: new Date("2026-08-10T03:00:00.000Z"),
  }]);
});

test("queues allowed guildMemberRemove once and detaches", async () => {
  const listeners = new Map<string, (...arguments_: readonly unknown[]) => void>();
  const departed: KboDepartureInput[] = [];
  let failures = 0;
  const sync = attachKboDepartureSync({
    source: {
      on(event, listener) { listeners.set(event, listener); },
      off(event) { listeners.delete(event); },
    },
    allowedGuildId: "223456789012345678",
    store: store([], departed),
    now: () => new Date("2026-08-10T03:00:00.000Z"),
    generateId: () => "departure-operation-0002",
    reportFailure() { failures += 1; },
  });
  listeners.get(Events.GuildMemberRemove)?.({
    id: "423456789012345678",
    guild: { id: "999456789012345678" },
  });
  listeners.get(Events.GuildMemberRemove)?.({
    id: "423456789012345678",
    guild: { id: "223456789012345678" },
  });
  await sync.whenIdle();
  assert.equal(departed.length, 1);
  assert.equal(failures, 0);
  await sync.detach();
  assert.equal(listeners.has(Events.GuildMemberRemove), false);
});

function store(active: readonly string[], departed: KboDepartureInput[]): KboDepartureStore {
  return {
    async listActiveDiscordUserIds() { return active; },
    async depart(input) { departed.push(input); return "departed"; },
  };
}
