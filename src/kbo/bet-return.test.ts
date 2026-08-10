import assert from "node:assert/strict";
import test from "node:test";

import { calculateFinalBetReturn, type KboGameOutcome } from "./bet-return.ts";

test("calculates final KBO bet returns from the accepted 0x, 2x, and 3x table", () => {
  const cases: ReadonlyArray<{
    name: string;
    prediction: KboGameOutcome;
    final: readonly [number, number];
    predicted?: readonly [number, number];
    expected: ReturnType<typeof calculateFinalBetReturn>;
  }> = [
    {
      name: "miss",
      prediction: "away_win",
      final: [5, 3],
      expected: { classification: "miss", multiplier: 0, returnAmount: 0 },
    },
    {
      name: "home result hit",
      prediction: "home_win",
      final: [5, 3],
      expected: { classification: "result_hit", multiplier: 2, returnAmount: 20_000 },
    },
    {
      name: "draw result hit",
      prediction: "draw",
      final: [2, 2],
      predicted: [1, 1],
      expected: { classification: "result_hit", multiplier: 2, returnAmount: 20_000 },
    },
    {
      name: "away result hit",
      prediction: "away_win",
      final: [1, 4],
      expected: { classification: "result_hit", multiplier: 2, returnAmount: 20_000 },
    },
    {
      name: "exact score hit",
      prediction: "home_win",
      final: [5, 3],
      predicted: [5, 3],
      expected: {
        classification: "exact_score_hit",
        multiplier: 3,
        returnAmount: 30_000,
      },
    },
  ];

  for (const item of cases) {
    const [finalHomeScore, finalAwayScore] = item.final;
    const predictedScores = item.predicted === undefined
      ? {}
      : {
          predictedHomeScore: item.predicted[0],
          predictedAwayScore: item.predicted[1],
        };
    assert.deepEqual(
      calculateFinalBetReturn({
        stake: 10_000,
        prediction: item.prediction,
        finalHomeScore,
        finalAwayScore,
        ...predictedScores,
      }),
      item.expected,
      item.name,
    );
  }
});

test("rejects malformed amounts and scores", () => {
  const valid = {
    stake: 1_000,
    prediction: "home_win" as const,
    finalHomeScore: 2,
    finalAwayScore: 1,
  };

  for (const input of [
    { ...valid, stake: 0 },
    { ...valid, stake: 1.5 },
    { ...valid, finalHomeScore: -1 },
    { ...valid, finalAwayScore: 1.5 },
    { ...valid, predictedHomeScore: 2 },
    { ...valid, predictedHomeScore: -1, predictedAwayScore: 1 },
  ]) {
    assert.throws(() => calculateFinalBetReturn(input));
  }
});
