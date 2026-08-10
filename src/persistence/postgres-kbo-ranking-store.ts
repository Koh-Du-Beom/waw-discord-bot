import type { Pool } from "pg";

import {
  assertKboRankingInput,
  type KboRankingInput,
  type KboRankingRow,
  type KboRankingStore,
} from "../kbo/rankings.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type CreditRow = {
  position: string;
  display_label: string;
  is_self: boolean;
  available_balance: string;
  admin_adjusted: boolean;
};

type PerformanceRow = {
  position: string;
  display_label: string;
  is_self: boolean;
  valid_settlements: string;
  outcome_hits: string;
  score_hits: string;
};

export class PostgresKboRankingStore implements KboRankingStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async read(input: KboRankingInput): Promise<readonly KboRankingRow[]> {
    assertKboRankingInput(input);
    try {
      return input.metric === "credits"
        ? await this.readCredits(input)
        : await this.readPerformance(input);
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("kbo_ranking_read_failed");
    }
  }

  private async readCredits(input: KboRankingInput): Promise<readonly KboRankingRow[]> {
    const result = await this.pool.query<CreditRow>(
      `with ranked as (
         select rank() over (order by account.available_balance desc) position,
                users.display_label,
                enrollment.discord_user_id = $2 is_self,
                account.available_balance::text,
                exists (
                  select 1 from credit_ledger_entry ledger
                   where ledger.account_id = account.account_id
                     and ledger.reason_code = 'admin_adjustment'
                ) admin_adjusted
           from betting_enrollment enrollment
           join credit_account account on account.account_id = enrollment.account_id
           join registered_discord_user users
             on users.guild_id = enrollment.guild_id
            and users.discord_user_id = enrollment.discord_user_id
          where enrollment.guild_id = $1 and enrollment.status = 'active'
       )
       select position::text, display_label, is_self, available_balance, admin_adjusted
         from ranked order by position, display_label
        limit 10 offset $3`,
      [input.guildId, input.discordUserId, (input.page - 1) * 10],
    );
    return result.rows.map((row) => ({
      rank: BigInt(row.position),
      displayLabel: row.display_label,
      isSelf: row.is_self,
      availableBalance: BigInt(row.available_balance),
      adminAdjusted: row.admin_adjusted,
    }));
  }

  private async readPerformance(input: KboRankingInput): Promise<readonly KboRankingRow[]> {
    const result = await this.pool.query<PerformanceRow>(
      `with stats as (
         select users.display_label,
                enrollment.discord_user_id = $2 is_self,
                count(*) filter (
                  where game.competition_id = $3 and game.season_id = $4
                    and settlement.result <> 'void'
                ) valid_settlements,
                count(*) filter (
                  where game.competition_id = $3 and game.season_id = $4
                    and settlement.result in ('outcome_hit', 'score_hit')
                ) outcome_hits,
                count(*) filter (
                  where game.competition_id = $3 and game.season_id = $4
                    and settlement.result = 'score_hit'
                ) score_hits
           from betting_enrollment enrollment
           join registered_discord_user users
             on users.guild_id = enrollment.guild_id
            and users.discord_user_id = enrollment.discord_user_id
           left join kbo_bet bet on bet.account_id = enrollment.account_id
           left join kbo_game game on game.game_id = bet.game_id
           left join bet_settlement settlement
             on settlement.settlement_id = bet.current_settlement_id
          where enrollment.guild_id = $1 and enrollment.status = 'active'
          group by enrollment.enrollment_id, users.display_label
       ), eligible as (
         select *, case $5
           when 'outcome_hits' then outcome_hits::numeric
           when 'score_hits' then score_hits::numeric
           else outcome_hits::numeric / valid_settlements
         end metric_value
           from stats
          where valid_settlements > 0
            and ($5 <> 'hit_rate' or valid_settlements >= 10)
       ), ranked as (
         select rank() over (order by metric_value desc) position, * from eligible
       )
       select position::text, display_label, is_self,
              valid_settlements::text, outcome_hits::text, score_hits::text
         from ranked order by position, display_label
        limit 10 offset $6`,
      [
        input.guildId,
        input.discordUserId,
        input.competitionId,
        input.seasonId,
        input.metric,
        (input.page - 1) * 10,
      ],
    );
    return result.rows.map((row) => ({
      rank: BigInt(row.position),
      displayLabel: row.display_label,
      isSelf: row.is_self,
      validSettlements: BigInt(row.valid_settlements),
      outcomeHits: BigInt(row.outcome_hits),
      scoreHits: BigInt(row.score_hits),
    }));
  }
}
