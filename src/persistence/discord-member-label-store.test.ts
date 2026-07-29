import assert from "node:assert/strict";
import test from "node:test";

import { PostgresDiscordMemberLabelStore } from "./discord-member-label-store.ts";

test("updates only existing Discord identities with changed display labels", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const store = new PostgresDiscordMemberLabelStore({
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 } as never;
    },
  });
  const observedAt = new Date("2026-07-29T00:00:00Z");
  await store.refreshKnown([{
    guildId: "guild",
    discordUserId: "member",
    displayLabel: "최신 닉네임",
  }], observedAt);
  assert.match(calls[0]!.text, /update registered_discord_user/u);
  assert.match(calls[0]!.text, /is distinct from/u);
  assert.doesNotMatch(calls[0]!.text, /insert into/u);
  assert.deepEqual(calls[0]!.values, [
    ["guild"], ["member"], ["최신 닉네임"], observedAt,
  ]);
});
