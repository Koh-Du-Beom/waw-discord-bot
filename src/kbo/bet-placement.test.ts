import assert from "node:assert/strict";
import test from "node:test";

import {
  assertKboBetRegistrationInput,
  evaluateKboBetPlacement,
  isKboBetEvidenceFresh,
  KBO_BET_EVIDENCE_MAX_AGE_MS,
  KboBetPlacementInputError,
  type KboBetRegistrationInput,
  type KboBetPlacementInput,
} from "./bet-placement.ts";

const valid: KboBetPlacementInput = {
  now: new Date("2026-08-10T08:59:59.999Z"),
  scheduledStartAt: new Date("2026-08-10T09:00:00.000Z"),
  enrollmentStatus: "active",
  rightsStatus: "authorized",
  evidenceStatus: "fresh",
  gameStatus: "scheduled",
  availableBalance: 50_000n,
  correctionDebt: 0n,
  dailyNetStake: 0n,
  stake: 1_000n,
  prediction: "home_win",
};

test("accepts a bounded KBO bet before start and derives its KST stake date", () => {
  assert.deepEqual(evaluateKboBetPlacement(valid), {
    status: "accepted",
    stakeDate: "2026-08-10",
  });

  assert.equal(
    evaluateKboBetPlacement({ ...valid, dailyNetStake: 49_000n }).status,
    "accepted",
  );
  assert.equal(
    evaluateKboBetPlacement({ ...valid, dailyNetStake: 40_000n, stake: 10_000n }).status,
    "accepted",
  );
});

test("denies account, game, balance, and daily-limit policy failures", () => {
  const cases: ReadonlyArray<[
    Partial<KboBetPlacementInput>,
    Exclude<ReturnType<typeof evaluateKboBetPlacement>, { status: "accepted" }>['reason'],
  ]> = [
    [{ enrollmentStatus: "missing" }, "not_enrolled"],
    [{ enrollmentStatus: "inactive" }, "not_enrolled"],
    [{ rightsStatus: "unavailable" }, "game_data_unavailable"],
    [{ evidenceStatus: "stale" }, "game_data_unavailable"],
    [{ evidenceStatus: "unknown" }, "game_data_unavailable"],
    [{ gameStatus: "postponed" }, "betting_closed"],
    [{ now: valid.scheduledStartAt }, "betting_closed"],
    [{ now: new Date("2026-08-10T09:00:00.001Z") }, "betting_closed"],
    [{ correctionDebt: 1n }, "correction_debt"],
    [{ availableBalance: 999n }, "insufficient_balance"],
    [{ dailyNetStake: 50_000n }, "daily_limit_exceeded"],
    [{ dailyNetStake: 49_000n, stake: 2_000n }, "daily_limit_exceeded"],
  ];

  for (const [overrides, reason] of cases) {
    assert.deepEqual(evaluateKboBetPlacement({ ...valid, ...overrides }), {
      status: "denied",
      reason,
    });
  }
});

test("rejects malformed placement input without reflecting it", () => {
  const malformed: ReadonlyArray<KboBetPlacementInput> = [
    { ...valid, stake: 0n },
    { ...valid, stake: 999n },
    { ...valid, stake: 1_001n },
    { ...valid, stake: 50_001n },
    { ...valid, availableBalance: -1n },
    { ...valid, correctionDebt: -1n },
    { ...valid, dailyNetStake: -1n },
    { ...valid, predictedHomeScore: 1 },
    { ...valid, predictedHomeScore: -1, predictedAwayScore: 0 },
    { ...valid, predictedHomeScore: 32_768, predictedAwayScore: 0 },
    { ...valid, now: new Date(Number.NaN) },
    { ...valid, scheduledStartAt: new Date(Number.NaN) },
    { ...valid, prediction: "invalid" as KboBetPlacementInput["prediction"] },
    { ...valid, gameStatus: "invalid" as KboBetPlacementInput["gameStatus"] },
  ];

  for (const input of malformed) {
    assert.throws(
      () => evaluateKboBetPlacement(input),
      (error) =>
        error instanceof KboBetPlacementInputError &&
        error.message === "invalid KBO bet placement input",
    );
  }
});

test("validates registration IDs and accepts only five-minute non-future evidence", () => {
  const registration: KboBetRegistrationInput = {
    operationId: "bet-operation-0001",
    betId: "kbo_bet:11111111-1111-4111-8111-111111111111",
    guildId: "92345678901234567",
    discordUserId: "92345678901234568",
    gameId: "game-id-0001",
    rightsStatus: "authorized",
    stake: 1_000n,
    prediction: "home_win",
    placedAt: new Date("2026-08-10T09:00:00.000Z"),
  };
  assert.doesNotThrow(() => assertKboBetRegistrationInput(registration));
  assert.throws(
    () => assertKboBetRegistrationInput({ ...registration, gameId: "short" }),
    KboBetPlacementInputError,
  );

  const now = registration.placedAt;
  const boundary = new Date(now.getTime() - KBO_BET_EVIDENCE_MAX_AGE_MS);
  assert.equal(isKboBetEvidenceFresh({ now, sourceUpdatedAt: boundary, collectedAt: now }), true);
  assert.equal(
    isKboBetEvidenceFresh({
      now,
      sourceUpdatedAt: new Date(boundary.getTime() - 1),
      collectedAt: now,
    }),
    false,
  );
  assert.equal(
    isKboBetEvidenceFresh({
      now,
      sourceUpdatedAt: now,
      collectedAt: new Date(now.getTime() + 1),
    }),
    false,
  );
});
