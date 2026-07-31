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

test("expires cached evidence at the freshness boundary", () => {
  const observer = new DiscordStreamObserver();
  observer.observe({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: new Date("2026-07-31T00:00:00Z"),
  });
  assert.equal(
    observer.currentAt(
      "guild",
      "member",
      new Date("2026-07-31T00:02:59.999Z"),
      180_000,
    )?.state,
    "active",
  );
  assert.deepEqual(
    observer.currentAt(
      "guild",
      "member",
      new Date("2026-07-31T00:03:00Z"),
      180_000,
    ),
    {
      ...observer.current("guild", "member"),
      state: "unknown",
      evidenceCode: "stale",
    },
  );
});

test("does not let a late reconciliation overwrite a newer voice event", () => {
  const observer = new DiscordStreamObserver();
  const initial = observer.observe({
    guildId: "guild",
    discordUserId: "member",
    selfStream: false,
    observedAt: new Date("2026-07-31T00:00:00Z"),
  });
  const baseline = new Map([["member", initial.generation]]);
  observer.observe({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: new Date("2026-07-31T00:00:01Z"),
  });

  assert.deepEqual(
    observer.reconcile({
      guildId: "guild",
      observedAt: new Date("2026-07-31T00:00:02Z"),
      members: [{ discordUserId: "member", selfStream: false }],
      baselineGenerations: baseline,
    }),
    [],
  );
  assert.equal(observer.current("guild", "member")?.state, "active");
  assert.equal(
    observer.current("guild", "member")?.evidenceCode,
    "voice_state_event",
  );
});
