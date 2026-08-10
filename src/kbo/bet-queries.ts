export type KboOpenGame = {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledStartAt: Date;
  sourceUpdatedAt: Date;
  collectedAt: Date;
};

export type KboRecentBet = {
  homeTeamId: string;
  awayTeamId: string;
  scheduledStartAt: Date;
  prediction: "home_win" | "draw" | "away_win";
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  stake: bigint;
  status: "pending" | "settled" | "void";
  corrected: boolean;
  actualHomeScore?: number;
  actualAwayScore?: number;
  returnAmount?: bigint;
  placedAt: Date;
};

export type KboBetQueryStore = {
  listOpenGames(input: { now: Date }): Promise<readonly KboOpenGame[]>;
  readRecent(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<{ status: "ok"; bets: readonly KboRecentBet[] } | { status: "not_enrolled" }>;
};

const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboBetQueryInputError extends Error {
  constructor() {
    super("invalid KBO bet query input");
    this.name = "KboBetQueryInputError";
  }
}

export function assertKboOpenGameInput(input: { now: Date }): void {
  if (!Number.isFinite(input.now.getTime())) throw new KboBetQueryInputError();
}

export function assertKboRecentBetInput(input: {
  guildId: string;
  discordUserId: string;
}): void {
  if (!snowflakePattern.test(input.guildId) || !snowflakePattern.test(input.discordUserId)) {
    throw new KboBetQueryInputError();
  }
}
