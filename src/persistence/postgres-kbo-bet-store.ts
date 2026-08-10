import type { Pool, PoolClient } from "pg";

import {
  assertKboBetRegistrationInput,
  evaluateKboBetPlacement,
  isKboBetEvidenceFresh,
  type KboBetRegistrationInput,
  type KboBetRegistrationResult,
  type KboBetRegistrationStore,
} from "../kbo/bet-placement.ts";
import { toKstClaimDate } from "../kbo/daily-credit-claim.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type AccountRow = {
  account_id: string;
  available_balance: string;
  correction_debt: string;
};

type GameRow = {
  market_version: string;
  scheduled_start_at: Date;
  status: Parameters<typeof evaluateKboBetPlacement>[0]["gameStatus"];
  source_updated_at: Date;
  collected_at: Date;
};

type ExistingBetRow = {
  bet_id: string;
  game_id: string;
  market_version: string;
  stake_date: string;
};

type DenialReason = Extract<KboBetRegistrationResult, { status: "denied" }>["reason"];

export class PostgresKboBetStore implements KboBetRegistrationStore {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async place(input: KboBetRegistrationInput): Promise<KboBetRegistrationResult> {
    assertKboBetRegistrationInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const account = await lockActiveAccount(client, input);
      if (!account) return await commitDenied(client, input, "not_enrolled");

      const existing = await findBetByOperation(client, account.account_id, input.operationId);
      if (existing) {
        await client.query("commit");
        return placed(existing);
      }

      const game = await lockGame(client, input.gameId);
      if (!game) return await commitDenied(client, input, "game_data_unavailable");

      const stakeDate = toKstClaimDate(input.placedAt);
      const dailyStake = await client.query<{ total: string }>(
        `select coalesce(sum(stake), 0)::text total from kbo_bet
          where account_id = $1 and stake_date = $2::date and status <> 'void'`,
        [account.account_id, stakeDate],
      );
      const policy = evaluateKboBetPlacement({
        now: input.placedAt,
        scheduledStartAt: game.scheduled_start_at,
        enrollmentStatus: "active",
        rightsStatus: input.rightsStatus,
        evidenceStatus: isKboBetEvidenceFresh({
          now: input.placedAt,
          sourceUpdatedAt: game.source_updated_at,
          collectedAt: game.collected_at,
        }) ? "fresh" : "stale",
        gameStatus: game.status,
        availableBalance: BigInt(account.available_balance),
        correctionDebt: BigInt(account.correction_debt),
        dailyNetStake: BigInt(dailyStake.rows[0]!.total),
        stake: input.stake,
        prediction: input.prediction,
        ...(input.predictedHomeScore === undefined
          ? {}
          : { predictedHomeScore: input.predictedHomeScore }),
        ...(input.predictedAwayScore === undefined
          ? {}
          : { predictedAwayScore: input.predictedAwayScore }),
      });
      if (policy.status === "denied") return await commitDenied(client, input, policy.reason);

      const pending = await client.query(
        `select 1 from kbo_bet
          where guild_id = $1 and account_id = $2 and game_id = $3 and status = 'pending'`,
        [input.guildId, account.account_id, input.gameId],
      );
      if (pending.rowCount) return await commitDenied(client, input, "already_bet");

      if (!(await claimOperation(client, input, "placed"))) {
        const duplicate = await findBetByOperation(client, account.account_id, input.operationId);
        await client.query("commit");
        return duplicate ? placed(duplicate) : { status: "duplicate_operation" };
      }

      const availableBefore = BigInt(account.available_balance);
      const availableAfter = availableBefore - input.stake;
      await client.query(
        `update credit_account
            set available_balance = $2, version = version + 1, updated_at = $3
          where account_id = $1`,
        [account.account_id, availableAfter.toString(), input.placedAt],
      );
      const ledger = await client.query<{ entry_id: string }>(
        `insert into credit_ledger_entry (
           account_id, reason_code, available_delta, debt_delta,
           available_before, available_after, debt_before, debt_after,
           operation_id, source_type, source_id, actor_type, occurred_at
         ) values (
           $1, 'bet_stake', $2, 0, $3, $4, $5, $5,
           $6, 'bet', $7, 'system', $8
         ) returning entry_id::text`,
        [
          account.account_id,
          (-input.stake).toString(),
          availableBefore.toString(),
          availableAfter.toString(),
          account.correction_debt,
          input.operationId,
          input.betId,
          input.placedAt,
        ],
      );
      await client.query(
        `insert into kbo_bet (
           bet_id, guild_id, account_id, game_id, market_version, prediction,
           predicted_home_score, predicted_away_score, stake, stake_date,
           operation_id, ledger_entry_id, placed_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13)`,
        [
          input.betId,
          input.guildId,
          account.account_id,
          input.gameId,
          game.market_version,
          input.prediction,
          input.predictedHomeScore ?? null,
          input.predictedAwayScore ?? null,
          input.stake.toString(),
          policy.stakeDate,
          input.operationId,
          ledger.rows[0]!.entry_id,
          input.placedAt,
        ],
      );
      await appendAudit(client, input, "placed");
      await client.query("commit");
      return {
        status: "placed",
        betId: input.betId,
        gameId: input.gameId,
        marketVersion: BigInt(game.market_version),
        stakeDate: policy.stakeDate,
      };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_bet_registration_failed");
    } finally {
      client.release();
    }
  }
}

async function lockActiveAccount(
  client: PoolClient,
  input: KboBetRegistrationInput,
): Promise<AccountRow | undefined> {
  const result = await client.query<AccountRow>(
    `select account.account_id, account.available_balance::text,
            account.correction_debt::text
       from betting_enrollment enrollment
       join credit_account account on account.account_id = enrollment.account_id
      where enrollment.guild_id = $1 and enrollment.discord_user_id = $2
        and enrollment.status = 'active'
      for update of account`,
    [input.guildId, input.discordUserId],
  );
  return result.rows[0];
}

async function lockGame(client: PoolClient, gameId: string): Promise<GameRow | undefined> {
  const result = await client.query<GameRow>(
    `select market_version::text, scheduled_start_at, status,
            source_updated_at, collected_at
       from kbo_game where game_id = $1 for update`,
    [gameId],
  );
  return result.rows[0];
}

async function findBetByOperation(
  client: PoolClient,
  accountId: string,
  operationId: string,
): Promise<ExistingBetRow | undefined> {
  const result = await client.query<ExistingBetRow>(
    `select bet_id, game_id, market_version::text, stake_date::text
       from kbo_bet where account_id = $1 and operation_id = $2`,
    [accountId, operationId],
  );
  return result.rows[0];
}

async function commitDenied(
  client: PoolClient,
  input: KboBetRegistrationInput,
  reason: DenialReason,
): Promise<KboBetRegistrationResult> {
  if (!(await claimOperation(client, input, reason))) {
    await client.query("commit");
    return { status: "duplicate_operation" };
  }
  await appendAudit(client, input, reason);
  await client.query("commit");
  return { status: "denied", reason };
}

async function claimOperation(
  client: PoolClient,
  input: KboBetRegistrationInput,
  result: "placed" | DenialReason,
): Promise<boolean> {
  const claimed = await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [
      input.operationId,
      input.discordUserId,
      input.placedAt,
      result === "placed" ? "accepted" : "denied",
      `kbo_bet_${result}`,
    ],
  );
  return claimed.rowCount === 1;
}

async function appendAudit(
  client: PoolClient,
  input: KboBetRegistrationInput,
  result: "placed" | DenialReason,
): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id
     ) values ($1,$2,$3,'kbo.bet',$4,$5,$6,$2,$7)`,
    [
      `kbo-bet:${input.operationId}`,
      input.operationId,
      input.placedAt,
      input.discordUserId,
      result === "placed" ? "success" : "denied",
      `kbo_bet_${result}`,
      input.guildId,
    ],
  );
}

function placed(row: ExistingBetRow): KboBetRegistrationResult {
  return {
    status: "placed",
    betId: row.bet_id,
    gameId: row.game_id,
    marketVersion: BigInt(row.market_version),
    stakeDate: row.stake_date,
  };
}
