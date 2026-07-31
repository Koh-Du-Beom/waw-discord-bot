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
  now: () => Date = () => new Date("2026-07-25T00:10:00Z"),
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
    now,
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

test("preserves the Discord source observation time separately from the poll time", async () => {
  const calls: NormalizedGameObservation[] = [];
  let now = new Date("2026-07-31T00:01:00Z");
  const { scheduler } = fixture(
    async () => ({ state: "active", gameId: "freshness-game", queueId: 420, startedAt }),
    calls,
    100,
    () => now,
  );
  const sourceObservedAt = new Date("2026-07-31T00:00:00Z");
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: sourceObservedAt,
  });

  now = new Date("2026-07-31T00:01:30Z");
  await scheduler.poll(target);

  const goLive = calls[0]?.goLive as
    | (NormalizedGameObservation["goLive"] & { sourceObservedAt?: Date })
    | undefined;
  assert.equal(calls[0]?.observedAt.getTime(), now.getTime());
  assert.equal(goLive?.sourceObservedAt?.getTime(), sourceObservedAt.getTime());
});

test("turns a stale cached active stream into unknown instead of compliant", async () => {
  const persisted: PersistedGameObservation[] = [];
  let now = new Date("2026-07-31T00:00:00Z");
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        return {
          state: "active" as const,
          gameId: "stale-active-game",
          queueId: 420,
          startedAt,
        };
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
    now: () => now,
    timeoutMilliseconds: 100,
  });
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: now,
  });

  now = new Date("2026-07-31T00:10:00Z");
  await scheduler.poll(target);

  assert.equal(persisted[0]?.goLive.state, "unknown");
  assert.equal(persisted[0]?.comparisonState, "unknown");
});

test("periodically reconciles voice state while the Gateway remains healthy", async () => {
  const calls: NormalizedGameObservation[] = [];
  let now = new Date("2026-07-31T00:00:00Z");
  const { scheduler, voiceCalls } = fixture(
    async () => ({ state: "active", gameId: "periodic-reconcile-game", queueId: 420, startedAt }),
    calls,
    100,
    () => now,
  );

  await scheduler.tick();
  now = new Date("2026-07-31T00:10:00Z");
  await scheduler.tick();

  assert.deepEqual(voiceCalls, ["guild", "guild"]);
  assert.equal(calls[1]?.goLive.evidenceCode, "reconciled");
});

test("does not turn a Spectator disappearance during grace into a violation", async () => {
  const calls: PersistedGameObservation[] = [];
  let attempt = 0;
  let now = new Date("2026-07-31T00:04:00Z");
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        attempt += 1;
        return attempt === 1
          ? {
              state: "active" as const,
              gameId: "grace-only-game",
              queueId: 420,
              startedAt: new Date("2026-07-31T00:00:00Z"),
            }
          : { state: "inactive" as const };
      },
    },
    voice: { async reconcile() { return []; } },
    observations: new GameObservationExecutor({
      async record(input) {
        calls.push(input);
        return "recorded";
      },
    }),
    violations: { async notify() {} },
    now: () => now,
    timeoutMilliseconds: 100,
  });
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: false,
    observedAt: now,
  });

  await scheduler.poll(target);
  now = new Date("2026-07-31T00:04:30Z");
  await scheduler.poll(target);

  assert.deepEqual(
    calls.map((call) => call.comparisonState),
    ["grace", "compliant"],
  );
  assert.equal(
    calls.some((call) => call.comparisonState === "violation"),
    false,
  );
});

test("deduplicates targeted users and shares one in-flight guild reconciliation", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested: string[][] = [];
  const scheduler = new GameObservationScheduler({
    targets: {
      async listTargets() {
        return [
          target,
          { ...target, linkId: "alternate-link" },
        ];
      },
    },
    riot: {
      async observe() {
        return { state: "inactive" as const };
      },
    },
    voice: {
      async reconcile(_guildId, discordUserIds) {
        requested.push([...discordUserIds]);
        await pending;
        return [{ discordUserId: "member", selfStream: false }];
      },
    },
    observations: { async execute() { return "recorded"; } },
    violations: { async notify() {} },
    now: () => new Date("2026-07-31T00:00:00Z"),
    timeoutMilliseconds: 100,
  });

  const first = scheduler.reconcile("guild");
  const second = scheduler.reconcile("guild");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requested, [["member"]]);
  release();
  assert.equal(await first, await second);
});

test("turns a reconciliation failure into unknown without blocking game polling", async () => {
  const persisted: PersistedGameObservation[] = [];
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        return {
          state: "active" as const,
          gameId: "reconcile-failure-game",
          queueId: 420,
          startedAt,
        };
      },
    },
    voice: { async reconcile() { throw new Error("provider detail"); } },
    observations: new GameObservationExecutor({
      async record(input) {
        persisted.push(input);
        return "recorded";
      },
    }),
    violations: { async notify() {} },
    now: () => new Date("2026-07-31T00:10:00Z"),
    timeoutMilliseconds: 100,
    voiceReconciliationTimeoutMilliseconds: 10,
  });

  await scheduler.tick();

  assert.equal(persisted[0]?.goLive.state, "unknown");
  assert.equal(persisted[0]?.comparisonState, "unknown");
});

test("starts the interruption allowance when reconciliation finds streaming inactive", async () => {
  const persisted: PersistedGameObservation[] = [];
  let now = new Date("2026-07-31T00:10:00Z");
  const scheduler = new GameObservationScheduler({
    targets: { async listTargets() { return [target]; } },
    riot: {
      async observe() {
        return {
          state: "active" as const,
          gameId: "reconciled-interruption-game",
          queueId: 420,
          startedAt,
        };
      },
    },
    voice: {
      async reconcile() {
        return [{ discordUserId: "member", selfStream: false }];
      },
    },
    observations: new GameObservationExecutor({
      async record(input) {
        persisted.push(input);
        return "recorded";
      },
    }),
    violations: { async notify() {} },
    now: () => now,
    timeoutMilliseconds: 100,
  });
  scheduler.observeVoice({
    guildId: "guild",
    discordUserId: "member",
    selfStream: true,
    observedAt: now,
  });

  now = new Date("2026-07-31T00:10:30Z");
  await scheduler.reconcile("guild");
  await scheduler.poll(target);

  assert.equal(persisted[0]?.comparisonState, "interrupted");
});
