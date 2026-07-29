import assert from "node:assert/strict";
import test from "node:test";
import { Events } from "discord.js";

import {
  attachDiscordMemberLabelSync,
  refreshReconciledMemberLabels,
} from "./member-label-sync.ts";

test("refreshes labels from the existing startup member reconciliation", async () => {
  const refreshed: unknown[] = [];
  await refreshReconciledMemberLabels({
    guildId: "guild",
    members: [{ id: "member", displayName: "시작 시 닉네임" }],
    observedAt: new Date("2026-07-29T00:00:00Z"),
    async refreshKnown(members, observedAt) {
      refreshed.push({ members, observedAt });
    },
  });
  assert.deepEqual(refreshed, [{
    members: [{
      guildId: "guild",
      discordUserId: "member",
      displayLabel: "시작 시 닉네임",
    }],
    observedAt: new Date("2026-07-29T00:00:00Z"),
  }]);
});

test("refreshes a known member label from guildMemberUpdate and detaches", async () => {
  const listeners = new Map<string, (...arguments_: readonly unknown[]) => void>();
  const refreshed: unknown[] = [];
  const source = {
    on(event: string, listener: (...arguments_: readonly unknown[]) => void) {
      listeners.set(event, listener);
    },
    off(event: string) {
      listeners.delete(event);
    },
  };
  const sync = attachDiscordMemberLabelSync({
    source,
    allowedGuildId: "guild",
    async refreshKnown(members, observedAt) {
      refreshed.push({ members, observedAt });
    },
    now: () => new Date("2026-07-29T00:00:00Z"),
    reportFailure() {
      assert.fail("unexpected failure");
    },
  });

  listeners.get(Events.GuildMemberUpdate)?.(
    {},
    { id: "member", displayName: "최신 닉네임", guild: { id: "guild" } },
  );
  await sync.whenIdle();
  assert.deepEqual(refreshed, [{
    members: [{
      guildId: "guild",
      discordUserId: "member",
      displayLabel: "최신 닉네임",
    }],
    observedAt: new Date("2026-07-29T00:00:00Z"),
  }]);
  await sync.detach();
  assert.equal(listeners.has(Events.GuildMemberUpdate), false);
});

test("ignores member updates from another guild", async () => {
  let listener: ((...arguments_: readonly unknown[]) => void) | undefined;
  let calls = 0;
  const sync = attachDiscordMemberLabelSync({
    source: {
      on(_event, value) { listener = value; },
      off() {},
    },
    allowedGuildId: "guild",
    async refreshKnown() { calls += 1; },
    now: () => new Date(),
    reportFailure() {},
  });
  listener?.({}, { id: "member", displayName: "name", guild: { id: "other" } });
  await sync.whenIdle();
  assert.equal(calls, 0);
});
