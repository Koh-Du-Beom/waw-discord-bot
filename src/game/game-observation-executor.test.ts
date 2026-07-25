import assert from "node:assert/strict";
import test from "node:test";

import {
  GameObservationExecutor,
  GameObservationInputError,
  type PersistedGameObservation,
} from "./game-observation-executor.ts";

const startedAt = new Date("2026-07-25T00:00:00Z");

function input(overrides: Record<string, unknown> = {}) {
  return {
    platformId: "KR",
    gameId: "game-1",
    queueId: 420,
    gameStartedAt: startedAt,
    discordUserId: "member",
    observedAt: new Date("2026-07-25T00:05:00Z"),
    riot: { state: "active" as const, evidenceCode: "spectator_active", generation: 1 },
    goLive: { state: "inactive" as const, evidenceCode: "voice_state_event", generation: 1 },
    ...overrides,
  };
}

test("computes accepted grace and interruption boundaries before persistence", async () => {
  const recorded: PersistedGameObservation[] = [];
  const executor = new GameObservationExecutor({
    async record(observation) {
      recorded.push(observation);
      return "recorded";
    },
  });

  await executor.execute({
    ...input(),
    observedAt: new Date("2026-07-25T00:04:59.999Z"),
  });
  await executor.execute({
    ...input(),
    observedAt: new Date("2026-07-25T00:06:59.999Z"),
    goLive: {
      state: "inactive",
      evidenceCode: "voice_state_event",
      generation: 2,
      interruptedAt: new Date("2026-07-25T00:05:00Z"),
    },
  });
  await executor.execute({
    ...input(),
    observedAt: new Date("2026-07-25T00:07:00Z"),
    goLive: {
      state: "inactive",
      evidenceCode: "voice_state_event",
      generation: 3,
      interruptedAt: new Date("2026-07-25T00:05:00Z"),
    },
  });

  assert.deepEqual(
    recorded.map((item) => item.comparisonState),
    ["grace", "interrupted", "violation"],
  );
  assert.equal(recorded[0]?.gameKey, "KR:game-1");
  assert.equal(recorded[0]?.policyVersion, 1);
});

test("keeps unavailable evidence unknown and ignores unconfigured queues", async () => {
  const recorded: PersistedGameObservation[] = [];
  const executor = new GameObservationExecutor({
    async record(observation) {
      recorded.push(observation);
      return "recorded";
    },
  });

  assert.equal(
    await executor.execute({
      ...input(),
      riot: { state: "unknown", evidenceCode: "riot_timeout", generation: 1 },
    }),
    "recorded",
  );
  assert.equal(recorded[0]?.comparisonState, "unknown");
  assert.equal(await executor.execute({ ...input(), queueId: 440 }), "queue_ignored");
  assert.equal(recorded.length, 1);
});

test("rejects malformed normalized evidence before calling the store", async () => {
  let called = false;
  const executor = new GameObservationExecutor({
    async record() {
      called = true;
      return "recorded";
    },
  });
  await assert.rejects(
    executor.execute({ ...input(), gameId: "" }),
    GameObservationInputError,
  );
  assert.equal(called, false);
});
