import assert from "node:assert/strict";
import test from "node:test";

import { DiscordStreamObserver } from "./discord-stream-observer.ts";

test("normalizes self_stream and turns reconnect gaps into unknown until reconciliation", () => {
  const observer = new DiscordStreamObserver();
  observer.observe({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: new Date("2026-07-25T00:00:00Z"),
  });
  assert.equal(observer.current("guild", "member")?.state, "active");
  observer.disconnect(new Date("2026-07-25T00:01:00Z"));
  assert.equal(observer.current("guild", "member")?.state, "unknown");
  observer.reconcile({
    guildId: "guild",
    observedAt: new Date("2026-07-25T00:02:00Z"),
    members: [{ discordUserId: "member", selfStream: false }],
  });
  assert.equal(observer.current("guild", "member")?.state, "inactive");
  assert.equal(observer.current("guild", "member")?.evidenceCode, "reconciled");
});
