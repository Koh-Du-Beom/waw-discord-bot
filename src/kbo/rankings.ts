export type KboRankingMetric = "credits" | "outcome_hits" | "score_hits" | "hit_rate";

export type KboRankingInput = {
  guildId: string;
  discordUserId: string;
  metric: KboRankingMetric;
  page: number;
  competitionId?: string;
  seasonId?: string;
};

export type KboRankingRow = {
  rank: bigint;
  displayLabel: string;
  isSelf: boolean;
  availableBalance?: bigint;
  adminAdjusted?: boolean;
  validSettlements?: bigint;
  outcomeHits?: bigint;
  scoreHits?: bigint;
};

export type KboRankingStore = {
  read(input: KboRankingInput): Promise<readonly KboRankingRow[]>;
};

const snowflakePattern = /^[1-9][0-9]{16,19}$/;
const scopePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class KboRankingInputError extends Error {
  constructor() {
    super("invalid KBO ranking input");
    this.name = "KboRankingInputError";
  }
}

export function assertKboRankingInput(input: KboRankingInput): void {
  const scoped = input.metric !== "credits";
  if (
    !snowflakePattern.test(input.guildId) ||
    !snowflakePattern.test(input.discordUserId) ||
    !["credits", "outcome_hits", "score_hits", "hit_rate"].includes(input.metric) ||
    !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 100 ||
    (scoped && (!scopePattern.test(input.competitionId ?? "") || !scopePattern.test(input.seasonId ?? ""))) ||
    (!scoped && (input.competitionId !== undefined || input.seasonId !== undefined))
  ) {
    throw new KboRankingInputError();
  }
}
