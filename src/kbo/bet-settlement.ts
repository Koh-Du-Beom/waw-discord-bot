export type KboSettlementInput = {
  operationId: string;
  settlementId: string;
  guildId: string;
  betId: string;
  gameId: string;
  gameRevision: bigint;
  rightsStatus: "authorized" | "unauthorized";
  settledAt: Date;
};

export type KboSettlementResult =
  | {
      status: "settled";
      settlementId: string;
      result: "lost" | "outcome_hit" | "score_hit" | "void";
      multiplier: 0 | 1 | 2 | 3;
      returnAmount: bigint;
      appliedDelta: bigint;
      availableDelta: bigint;
      debtDelta: bigint;
      gameRevision: bigint;
    }
  | {
      status: "denied";
      reason:
        | "rights_unauthorized"
        | "bet_not_found"
        | "game_data_unavailable"
        | "revision_not_current"
        | "revision_not_newer"
        | "game_not_terminal"
        | "already_settled";
    }
  | { status: "duplicate_operation" };

export type KboSettlementStore = {
  settle(input: KboSettlementInput): Promise<KboSettlementResult>;
};

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const gameIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboSettlementInputError extends Error {
  constructor() {
    super("invalid KBO settlement input");
    this.name = "KboSettlementInputError";
  }
}

export function assertKboSettlementInput(input: KboSettlementInput): void {
  if (
    !operationIdPattern.test(input.operationId) ||
    !opaqueIdPattern.test(input.settlementId) ||
    !snowflakePattern.test(input.guildId) ||
    !opaqueIdPattern.test(input.betId) ||
    !gameIdPattern.test(input.gameId) ||
    input.gameRevision <= 0n ||
    (input.rightsStatus !== "authorized" && input.rightsStatus !== "unauthorized") ||
    !Number.isFinite(input.settledAt.getTime())
  ) {
    throw new KboSettlementInputError();
  }
}

export function allocateSettlementDelta(input: {
  availableBalance: bigint;
  correctionDebt: bigint;
  delta: bigint;
  voidRefund: boolean;
}): { availableDelta: bigint; debtDelta: bigint } {
  if (input.availableBalance < 0n || input.correctionDebt < 0n) {
    throw new Error("invalid account projection");
  }
  if (input.voidRefund) {
    if (input.delta <= 0n) throw new Error("invalid void refund");
    return { availableDelta: input.delta, debtDelta: 0n };
  }
  if (input.delta > 0n) {
    const debtPaid = input.delta < input.correctionDebt ? input.delta : input.correctionDebt;
    return { availableDelta: input.delta - debtPaid, debtDelta: -debtPaid };
  }
  if (input.delta < 0n) {
    const recovery = -input.delta < input.availableBalance ? -input.delta : input.availableBalance;
    return { availableDelta: -recovery, debtDelta: -input.delta - recovery };
  }
  return { availableDelta: 0n, debtDelta: 0n };
}
