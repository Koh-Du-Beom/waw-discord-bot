import type { KboGameOutcome } from "./bet-return.ts";
import { toKstClaimDate } from "./daily-credit-claim.ts";

export type KboBetPlacementInput = {
  now: Date;
  scheduledStartAt: Date;
  enrollmentStatus: "active" | "inactive" | "missing";
  rightsStatus: "authorized" | "unavailable";
  evidenceStatus: "fresh" | "stale" | "unknown";
  gameStatus:
    | "scheduled"
    | "postponed"
    | "cancelled"
    | "no_game"
    | "suspended"
    | "in_progress"
    | "final_pending"
    | "final"
    | "unknown";
  availableBalance: bigint;
  correctionDebt: bigint;
  dailyNetStake: bigint;
  stake: bigint;
  prediction: KboGameOutcome;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
};

export type KboBetPlacementResult =
  | { status: "accepted"; stakeDate: string }
  | {
      status: "denied";
      reason:
        | "not_enrolled"
        | "game_data_unavailable"
        | "betting_closed"
        | "correction_debt"
        | "insufficient_balance"
        | "daily_limit_exceeded";
    };

export type KboBetRegistrationInput = {
  operationId: string;
  betId: string;
  guildId: string;
  discordUserId: string;
  gameId: string;
  rightsStatus: KboBetPlacementInput["rightsStatus"];
  stake: bigint;
  prediction: KboGameOutcome;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  placedAt: Date;
};

export type KboBetRegistrationResult =
  | {
      status: "placed";
      betId: string;
      gameId: string;
      marketVersion: bigint;
      stakeDate: string;
    }
  | {
      status: "denied";
      reason:
        | Extract<KboBetPlacementResult, { status: "denied" }>["reason"]
        | "already_bet";
    }
  | { status: "duplicate_operation" };

export type KboBetRegistrationStore = {
  place(input: KboBetRegistrationInput): Promise<KboBetRegistrationResult>;
};

export const KBO_BET_EVIDENCE_MAX_AGE_MS = 5 * 60_000;

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const gameIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboBetPlacementInputError extends Error {
  constructor() {
    super("invalid KBO bet placement input");
    this.name = "KboBetPlacementInputError";
  }
}

export function evaluateKboBetPlacement(input: KboBetPlacementInput): KboBetPlacementResult {
  assertInput(input);

  if (input.enrollmentStatus !== "active") return denied("not_enrolled");
  if (input.rightsStatus !== "authorized" || input.evidenceStatus !== "fresh") {
    return denied("game_data_unavailable");
  }
  if (input.gameStatus !== "scheduled" || input.now >= input.scheduledStartAt) {
    return denied("betting_closed");
  }
  if (input.correctionDebt > 0n) return denied("correction_debt");
  if (input.availableBalance < input.stake) return denied("insufficient_balance");
  if (input.dailyNetStake + input.stake > 50_000n) return denied("daily_limit_exceeded");

  return { status: "accepted", stakeDate: toKstClaimDate(input.now) };
}

export function assertKboBetRegistrationInput(input: KboBetRegistrationInput): void {
  if (
    !operationIdPattern.test(input.operationId) ||
    !opaqueIdPattern.test(input.betId) ||
    !snowflakePattern.test(input.guildId) ||
    !snowflakePattern.test(input.discordUserId) ||
    !gameIdPattern.test(input.gameId) ||
    !(input.placedAt instanceof Date) ||
    !Number.isFinite(input.placedAt.getTime())
  ) {
    throw new KboBetPlacementInputError();
  }
  evaluateKboBetPlacement({
    now: input.placedAt,
    scheduledStartAt: new Date(input.placedAt.getTime() + 1),
    enrollmentStatus: "active",
    rightsStatus: input.rightsStatus,
    evidenceStatus: "fresh",
    gameStatus: "scheduled",
    availableBalance: input.stake,
    correctionDebt: 0n,
    dailyNetStake: 0n,
    stake: input.stake,
    prediction: input.prediction,
    ...(input.predictedHomeScore === undefined
      ? {}
      : { predictedHomeScore: input.predictedHomeScore }),
    ...(input.predictedAwayScore === undefined
      ? {}
      : { predictedAwayScore: input.predictedAwayScore }),
  });
}

export function isKboBetEvidenceFresh(input: {
  now: Date;
  sourceUpdatedAt: Date;
  collectedAt: Date;
}): boolean {
  const { now, sourceUpdatedAt, collectedAt } = input;
  if (![now, sourceUpdatedAt, collectedAt].every((date) => Number.isFinite(date.getTime()))) {
    return false;
  }
  return sourceUpdatedAt <= collectedAt &&
    collectedAt <= now &&
    now.getTime() - sourceUpdatedAt.getTime() <= KBO_BET_EVIDENCE_MAX_AGE_MS;
}

function assertInput(input: KboBetPlacementInput): void {
  const hasHomeScore = input.predictedHomeScore !== undefined;
  const hasAwayScore = input.predictedAwayScore !== undefined;
  if (
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    !(input.scheduledStartAt instanceof Date) ||
    !Number.isFinite(input.scheduledStartAt.getTime()) ||
    !["active", "inactive", "missing"].includes(input.enrollmentStatus) ||
    !["authorized", "unavailable"].includes(input.rightsStatus) ||
    !["fresh", "stale", "unknown"].includes(input.evidenceStatus) ||
    ![
      "scheduled",
      "postponed",
      "cancelled",
      "no_game",
      "suspended",
      "in_progress",
      "final_pending",
      "final",
      "unknown",
    ].includes(input.gameStatus) ||
    !["home_win", "draw", "away_win"].includes(input.prediction) ||
    !validAmount(input.availableBalance) ||
    !validAmount(input.correctionDebt) ||
    !validAmount(input.dailyNetStake) ||
    typeof input.stake !== "bigint" ||
    input.stake < 1_000n ||
    input.stake > 50_000n ||
    input.stake % 1_000n !== 0n ||
    hasHomeScore !== hasAwayScore ||
    (hasHomeScore && !validScore(input.predictedHomeScore)) ||
    (hasAwayScore && !validScore(input.predictedAwayScore))
  ) {
    throw new KboBetPlacementInputError();
  }
}

function validAmount(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

function validScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 32_767;
}

function denied(reason: Extract<KboBetPlacementResult, { status: "denied" }>["reason"]): KboBetPlacementResult {
  return { status: "denied", reason };
}
