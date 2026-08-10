export type KboGameOutcome = "home_win" | "draw" | "away_win";

export type FinalBetReturn = {
  classification: "miss" | "result_hit" | "exact_score_hit";
  multiplier: 0 | 2 | 3;
  returnAmount: number;
};

export function calculateFinalBetReturn(input: {
  stake: number;
  prediction: KboGameOutcome;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  finalHomeScore: number;
  finalAwayScore: number;
}): FinalBetReturn {
  requirePositiveSafeInteger(input.stake, "stake");
  requireScore(input.finalHomeScore, "finalHomeScore");
  requireScore(input.finalAwayScore, "finalAwayScore");
  if (!isOutcome(input.prediction)) throw new Error("invalid prediction");

  const hasHomePrediction = input.predictedHomeScore !== undefined;
  const hasAwayPrediction = input.predictedAwayScore !== undefined;
  if (hasHomePrediction !== hasAwayPrediction) {
    throw new Error("predicted scores must be provided together");
  }
  if (hasHomePrediction && hasAwayPrediction) {
    requireScore(input.predictedHomeScore!, "predictedHomeScore");
    requireScore(input.predictedAwayScore!, "predictedAwayScore");
  }

  const outcome = gameOutcome(input.finalHomeScore, input.finalAwayScore);
  if (input.prediction !== outcome) {
    return { classification: "miss", multiplier: 0, returnAmount: 0 };
  }

  const exactScore =
    input.predictedHomeScore === input.finalHomeScore &&
    input.predictedAwayScore === input.finalAwayScore;
  const multiplier = exactScore ? 3 : 2;
  const returnAmount = input.stake * multiplier;
  if (!Number.isSafeInteger(returnAmount)) throw new Error("return amount is too large");
  return {
    classification: exactScore ? "exact_score_hit" : "result_hit",
    multiplier,
    returnAmount,
  };
}

function gameOutcome(homeScore: number, awayScore: number): KboGameOutcome {
  if (homeScore > awayScore) return "home_win";
  if (homeScore < awayScore) return "away_win";
  return "draw";
}

function isOutcome(value: unknown): value is KboGameOutcome {
  return value === "home_win" || value === "draw" || value === "away_win";
}

function requireScore(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid ${field}`);
}

function requirePositiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid ${field}`);
}
