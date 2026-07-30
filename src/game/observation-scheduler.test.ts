import assert from "node:assert/strict";
import test from "node:test";

import {
  GameObservationExecutor,
  type NormalizedGameObservation,
  type PersistedGameObservation,
} from "./game-observation-executor.ts";
import type { RiotGameObserver } from "./observation-state.ts";
import {
  GameObservationScheduler,
  type ObservedRiotLink,
} from "./observation-scheduler.ts";

const target: ObservedRiotLink = {
  linkId: "link",
  guildId: "guild",
  discordUserId: "member",
  platformId: "KR",
  puuid: "synthetic-puuid",
  version: 0,
};
const startedAt = new Date("2026-07-25T00:00:00Z");

test("prevents concurrent polling of the same link", async () => {
  let resolve!: (value: {
    state: "active";
    gameId: string;
    queueId: number;
    startedAt: Date;
  }) => void;
  const pending = new Promise<{
    state: "active";
    gameId: string;
    queueId: number;
    startedAt: Date;
  }>((done) => {
    resolve = done;
  });
  const scheduler = fixture(async () => pending).scheduler;
  const first = scheduler.poll(target);
  assert.equal(await scheduler.poll(target), "already_running");
  resolve({ state: "active", gameId: "game", queueId: 420, startedAt });
  assert.equal(await first, "recorded");
});

test("normalizes rate limits and timeouts to unknown using the last active game", async () => {
  const calls: NormalizedGameObservation[] = [];
  let attempt = 0;
  const { scheduler } = fixture(
    async () => {
      attempt += 1;
      if (attempt === 1) {
        return { state: "active", gameId: "game", queueId: 420, startedAt };
      }
      if (attempt === 2) return { state: "unknown", reasonCode: "riot_rate_limited" };
      return new Promise(() => undefined);
    },
    calls,
    5,
  );
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: new Date("2026-07-25T00:01:00Z"),
  });
  assert.equal(await scheduler.poll(target), "recorded");
  assert.equal(await scheduler.poll(target), "recorded");
  assert.equal(await scheduler.poll(target), "recorded");
  assert.deepEqual(
    calls.map((call) => [call.riot.state, call.riot.evidenceCode]),
    [
      ["active", "spectator_active"],
      ["unknown", "riot_rate_limited"],
      ["unknown", "riot_timeout"],
    ],
  );
  assert.deepEqual(calls.map((call) => call.goLive.generation), [1, 2, 3]);
});

test("ignores a response arriving after timeout and accepts the next generation", async () => {
  const calls: NormalizedGameObservation[] = [];
  let resolveLate!: (value: {
    state: "active";
    gameId: string;
    queueId: number;
    startedAt: Date;
  }) => void;
  let attempt = 0;
  const { scheduler } = fixture(async () => {
    attempt += 1;
    if (attempt === 1) {
      return { state: "active", gameId: "game", queueId: 420, startedAt };
    }
    if (attempt === 2) {
      return new Promise((resolve) => {
        resolveLate = resolve;
      });
    }
    return { state: "active", gameId: "game", queueId: 420, startedAt };
  }, calls, 5);
  await scheduler.poll(target);
  await scheduler.poll(target);
  await scheduler.poll(target);
  resolveLate({ state: "active", gameId: "stale-game", queueId: 420, startedAt });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 3);
  assert.equal(calls[2]?.gameId, "game");
  assert.deepEqual(calls.map((call) => call.riot.generation), [1, 2, 3]);
});

test("disconnect marks Go Live unknown until full reconciliation", async () => {
  const calls: NormalizedGameObservation[] = [];
  const { scheduler, voiceCalls } = fixture(
    async () => ({ state: "active", gameId: "game", queueId: 420, startedAt }),
    calls,
  );
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: new Date("2026-07-25T00:01:00Z"),
  });
  scheduler.disconnect(new Date("2026-07-25T00:02:00Z"));
  await scheduler.poll(target);
  assert.equal(calls[0]?.goLive.state, "unknown");
  await scheduler.reconcile("guild");
  assert.deepEqual(voiceCalls, ["guild"]);
  await scheduler.poll(target);
  assert.equal(calls[1]?.goLive.state, "inactive");
  assert.equal(calls[1]?.goLive.evidenceCode, "reconciled");
});

test("integrates fake sources through the real comparison executor and clears ended games", async () => {
  const persisted: PersistedGameObservation[] = [];
  let attempt = 0;
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target, target]; } },
    riot: {
      async observe() {
        attempt += 1;
        return attempt === 1
          ? { state: "active", gameId: "game", queueId: 420, startedAt }
          : { state: "inactive" };
      },
    },
    voice: { async reconcile() { return []; } },
    observations: new GameObservationExecutor({
      async record(input) {
        persisted.push(input);
        return "recorded";
      },
    }),
    violations: { async notify() {} },
    now: () => new Date("2026-07-25T00:10:00Z"),
    timeoutMilliseconds: 100,
  });
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: false,
    observedAt: new Date("2026-07-25T00:09:00Z"),
  });

  const duplicateTick = await scheduler.tick();
  assert.equal(attempt, 1);
  assert.equal(duplicateTick.get("link"), "already_running");
  assert.equal(persisted[0]?.comparisonState, "violation");
  assert.equal(await scheduler.poll(target), "recorded");
  assert.equal(persisted[1]?.riot.state, "inactive");
  assert.equal(await scheduler.poll(target), "no_active_game");
});

function fixture(
  observe: RiotGameObserver["observe"],
  calls: NormalizedGameObservation[] = [],
  timeoutMilliseconds = 100,
) {
  const voiceCalls: string[] = [];
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: { observe },
    voice: {
      async reconcile(guildId) {
        voiceCalls.push(guildId);
        return [{ discordUserId: "member", selfStream: false }];
      },
    },
    observations: {
      async execute(input) {
        calls.push(input);
        return "recorded";
      },
    },
    violations: { async notify() {} },
    now: () => new Date("2026-07-25T00:10:00Z"),
    timeoutMilliseconds,
  });
  return { scheduler, voiceCalls };
}

test("announces only a newly recorded violation", async () => {
  const notifications: unknown[] = [];
  let observations = 0;
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        return {
          state: "active" as const,
          gameId: "game",
          queueId: 420,
          startedAt,
        };
      },
    },
    voice: { async reconcile() { return []; } },
    observations: {
      async execute() {
        observations += 1;
        return observations === 1 ? "violation_recorded" : "recorded";
      },
    },
    violations: {
      async notify(input: unknown) {
        notifications.push(input);
      },
    },
    now: () => new Date("2026-07-25T00:10:00Z"),
    timeoutMilliseconds: 100,
  });

  assert.equal(await scheduler.poll(target), "violation_recorded");
  assert.equal(await scheduler.poll(target), "recorded");
  assert.deepEqual(notifications, [
    { guildId: "guild", discordUserId: "member" },
  ]);
});

test("retries a failed violation announcement on the next poll", async () => {
  let observations = 0;
  let notifications = 0;
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        return {
          state: "active" as const,
          gameId: "game",
          queueId: 420,
          startedAt,
        };
      },
    },
    voice: { async reconcile() { return []; } },
    observations: {
      async execute() {
        observations += 1;
        return observations === 1 ? "violation_recorded" : "recorded";
      },
    },
    violations: {
      async notify() {
        notifications += 1;
        if (notifications === 1) throw new Error("discord unavailable");
      },
    },
    now: () => new Date("2026-07-25T00:10:00Z"),
    timeoutMilliseconds: 100,
  });

  await assert.rejects(scheduler.poll(target), /discord unavailable/u);
  assert.equal(await scheduler.poll(target), "recorded");
  assert.equal(notifications, 2);
});
