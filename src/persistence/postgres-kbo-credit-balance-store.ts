import type { Pool } from "pg";

import {
  assertKboCreditBalanceInput,
  type KboCreditBalanceInput,
  type KboCreditBalanceResult,
  type KboCreditBalanceStore,
} from "../kbo/credit-balance.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresKboCreditBalanceStore implements KboCreditBalanceStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async read(input: KboCreditBalanceInput): Promise<KboCreditBalanceResult> {
    assertKboCreditBalanceInput(input);
    try {
      const result = await this.pool.query<{
        available_balance: string;
        correction_debt: string;
      }>(
        `select account.available_balance::text, account.correction_debt::text
           from betting_enrollment enrollment
           join credit_account account on account.account_id = enrollment.account_id
          where enrollment.guild_id = $1 and enrollment.discord_user_id = $2
            and enrollment.status = 'active'`,
        [input.guildId, input.discordUserId],
      );
      const row = result.rows[0];
      return row
        ? {
            status: "active",
            availableBalance: BigInt(row.available_balance),
            correctionDebt: BigInt(row.correction_debt),
          }
        : { status: "not_enrolled" };
    } catch {
      throw new PersistenceError("kbo_credit_balance_read_failed");
    }
  }
}
