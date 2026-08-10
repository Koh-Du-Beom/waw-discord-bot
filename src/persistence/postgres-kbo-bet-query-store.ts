import type { Pool } from "pg";

import {
  assertKboOpenGameInput,
  assertKboRecentBetInput,
  type KboBetQueryStore,
  type KboOpenGame,
  type KboRecentBet,
} from "../kbo/bet-queries.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type OpenGameRow = {
  game_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_start_at: Date;
  source_updated_at: Date;
  collected_at: Date;
};

type RecentBetRow = {
  home_team_id: string;
  away_team_id: string;
  scheduled_start_at: Date;
  prediction: KboRecentBet["prediction"];
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  stake: string;
  status: KboRecentBet["status"];
  settlement_count: string;
  home_score: number | null;
  away_score: number | null;
  return_amount: string | null;
  placed_at: Date;
};

export class PostgresKboBetQueryStore implements KboBetQueryStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async listOpenGames(input: { now: Date }): Promise<readonly KboOpenGame[]> {
    assertKboOpenGameInput(input);
    try {
      const result = await this.pool.query<OpenGameRow>(
        `select game_id, home_team_id, away_team_id, scheduled_start_at,
                source_updated_at, collected_at
           from kbo_game
          where status = 'scheduled' and scheduled_start_at > $1
            and source_updated_at between $1 - interval '5 minutes' and $1
            and collected_at between source_updated_at and $1
          order by scheduled_start_at, game_id
          limit 5`,
        [input.now],
      );
      return result.rows.map((row) => ({
        gameId: row.game_id,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        scheduledStartAt: row.scheduled_start_at,
        sourceUpdatedAt: row.source_updated_at,
        collectedAt: row.collected_at,
      }));
    } catch {
      throw new PersistenceError("kbo_open_games_read_failed");
    }
  }

  async readRecent(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<{ status: "ok"; bets: readonly KboRecentBet[] } | { status: "not_enrolled" }> {
    assertKboRecentBetInput(input);
    try {
      const enrollment = await this.pool.query<{ account_id: string }>(
        `select account_id from betting_enrollment
          where guild_id = $1 and discord_user_id = $2 and status = 'active'`,
        [input.guildId, input.discordUserId],
      );
      const accountId = enrollment.rows[0]?.account_id;
      if (!accountId) return { status: "not_enrolled" };
      const result = await this.pool.query<RecentBetRow>(
        `select game.home_team_id, game.away_team_id, game.scheduled_start_at,
                bet.prediction, bet.predicted_home_score, bet.predicted_away_score,
                bet.stake::text, bet.status, game.home_score, game.away_score,
                settlement.return_amount::text,
                (select count(*)::text from bet_settlement history
                  where history.bet_id = bet.bet_id) settlement_count,
                bet.placed_at
           from kbo_bet bet
           join kbo_game game on game.game_id = bet.game_id
           left join bet_settlement settlement
             on settlement.settlement_id = bet.current_settlement_id
          where bet.account_id = $1
          order by bet.placed_at desc, bet.bet_id desc
          limit 5`,
        [accountId],
      );
      return {
        status: "ok",
        bets: result.rows.map((row) => ({
          homeTeamId: row.home_team_id,
          awayTeamId: row.away_team_id,
          scheduledStartAt: row.scheduled_start_at,
          prediction: row.prediction,
          ...(row.predicted_home_score === null ? {} : { predictedHomeScore: row.predicted_home_score }),
          ...(row.predicted_away_score === null ? {} : { predictedAwayScore: row.predicted_away_score }),
          stake: BigInt(row.stake),
          status: row.status,
          corrected: BigInt(row.settlement_count) > 1n,
          ...(row.home_score === null ? {} : { actualHomeScore: row.home_score }),
          ...(row.away_score === null ? {} : { actualAwayScore: row.away_score }),
          ...(row.return_amount === null ? {} : { returnAmount: BigInt(row.return_amount) }),
          placedAt: row.placed_at,
        })),
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("kbo_recent_bets_read_failed");
    }
  }
}
