import type { Pool, PoolClient } from "pg";

import { calculateFinalBetReturn } from "../kbo/bet-return.ts";
import {
  allocateSettlementDelta,
  assertKboSettlementInput,
  type KboSettlementInput,
  type KboSettlementResult,
  type KboSettlementStore,
} from "../kbo/bet-settlement.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type AccountRow = {
  account_id: string;
  available_balance: string;
  correction_debt: string;
};

type GameRow = {
  current_revision: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

type BetRow = {
  account_id: string;
  prediction: "home_win" | "draw" | "away_win";
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  stake: string;
  status: "pending" | "settled" | "void";
  current_settlement_id: string | null;
  current_game_revision: string | null;
  current_return_amount: string | null;
};

type SettlementRow = {
  settlement_id: string;
  result: "lost" | "outcome_hit" | "score_hit" | "void";
  multiplier: 0 | 1 | 2 | 3;
  return_amount: string;
  applied_delta: string;
  available_delta: string;
  debt_delta: string;
  game_revision: string;
};

type DenialReason = Extract<KboSettlementResult, { status: "denied" }>["reason"];

export class PostgresKboSettlementStore implements KboSettlementStore {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async settle(input: KboSettlementInput): Promise<KboSettlementResult> {
    assertKboSettlementInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const duplicate = await findSettlementByOperation(client, input.operationId);
      if (duplicate) return await commitSettled(client, duplicate);
      if (input.rightsStatus !== "authorized") {
        return await commitDenied(client, input, "rights_unauthorized");
      }

      const owner = await client.query<{ account_id: string }>(
        `select account_id from kbo_bet
          where bet_id = $1 and guild_id = $2 and game_id = $3`,
        [input.betId, input.guildId, input.gameId],
      );
      const accountId = owner.rows[0]?.account_id;
      if (!accountId) return await commitDenied(client, input, "bet_not_found");

      const account = await lockAccount(client, accountId);
      if (!account) return await commitDenied(client, input, "bet_not_found");
      const concurrentDuplicate = await findSettlementByOperation(client, input.operationId);
      if (concurrentDuplicate) return await commitSettled(client, concurrentDuplicate);

      const game = await lockGame(client, input.gameId);
      if (!game) return await commitDenied(client, input, "game_data_unavailable");
      if (BigInt(game.current_revision) !== input.gameRevision) {
        return await commitDenied(client, input, "revision_not_current");
      }

      const bet = await lockBet(client, input);
      if (!bet || bet.account_id !== accountId) {
        return await commitDenied(client, input, "bet_not_found");
      }
      if (bet.current_game_revision !== null) {
        const previousRevision = BigInt(bet.current_game_revision);
        if (previousRevision === input.gameRevision) {
          return await commitDenied(client, input, "already_settled");
        }
        if (previousRevision > input.gameRevision) {
          return await commitDenied(client, input, "revision_not_newer");
        }
      }

      const calculated = calculateSettlement(bet, game);
      if (!calculated) return await commitDenied(client, input, "game_not_terminal");
      const previousReturn = BigInt(bet.current_return_amount ?? "0");
      const appliedDelta = calculated.returnAmount - previousReturn;
      const allocation = allocateSettlementDelta({
        availableBalance: BigInt(account.available_balance),
        correctionDebt: BigInt(account.correction_debt),
        delta: appliedDelta,
        voidRefund: bet.current_settlement_id === null && calculated.result === "void",
      });

      if (!(await claimOperation(client, input, "settled"))) {
        const claimed = await findSettlementByOperation(client, input.operationId);
        return claimed
          ? await commitSettled(client, claimed)
          : await commitDuplicate(client);
      }

      const ledgerEntryId = await applyAccountDelta(
        client,
        input,
        account,
        allocation,
        bet.current_settlement_id === null
          ? calculated.result === "void" ? "bet_void_refund" : "bet_payout"
          : "settlement_correction",
      );
      await client.query(
        `insert into bet_settlement (
           settlement_id, bet_id, game_id, game_revision, result, multiplier,
           return_amount, applied_delta, operation_id, ledger_entry_id,
           supersedes_settlement_id, settled_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.settlementId,
          input.betId,
          input.gameId,
          input.gameRevision.toString(),
          calculated.result,
          calculated.multiplier,
          calculated.returnAmount.toString(),
          appliedDelta.toString(),
          input.operationId,
          ledgerEntryId,
          bet.current_settlement_id,
          input.settledAt,
        ],
      );
      await client.query(
        `update kbo_bet set status = $2, current_settlement_id = $3 where bet_id = $1`,
        [input.betId, calculated.result === "void" ? "void" : "settled", input.settlementId],
      );
      await appendAudit(client, input, "settled");
      await client.query("commit");
      return {
        status: "settled",
        settlementId: input.settlementId,
        ...calculated,
        appliedDelta,
        ...allocation,
        gameRevision: input.gameRevision,
      };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_settlement_failed");
    } finally {
      client.release();
    }
  }
}

async function lockAccount(client: PoolClient, accountId: string): Promise<AccountRow | undefined> {
  const result = await client.query<AccountRow>(
    `select account_id, available_balance::text, correction_debt::text
       from credit_account where account_id = $1 for update`,
    [accountId],
  );
  return result.rows[0];
}

async function lockGame(client: PoolClient, gameId: string): Promise<GameRow | undefined> {
  const result = await client.query<GameRow>(
    `select current_revision::text, status, home_score, away_score
       from kbo_game where game_id = $1 for update`,
    [gameId],
  );
  return result.rows[0];
}

async function lockBet(client: PoolClient, input: KboSettlementInput): Promise<BetRow | undefined> {
  const result = await client.query<BetRow>(
    `select bet.account_id, bet.prediction, bet.predicted_home_score,
            bet.predicted_away_score, bet.stake::text, bet.status,
            bet.current_settlement_id,
            settlement.game_revision::text current_game_revision,
            settlement.return_amount::text current_return_amount
       from kbo_bet bet
       left join bet_settlement settlement
         on settlement.settlement_id = bet.current_settlement_id
      where bet.bet_id = $1 and bet.guild_id = $2 and bet.game_id = $3
      for update of bet`,
    [input.betId, input.guildId, input.gameId],
  );
  return result.rows[0];
}

function calculateSettlement(
  bet: BetRow,
  game: GameRow,
): {
  result: "lost" | "outcome_hit" | "score_hit" | "void";
  multiplier: 0 | 1 | 2 | 3;
  returnAmount: bigint;
} | undefined {
  const stake = Number(bet.stake);
  if (game.status === "cancelled" || game.status === "no_game" || game.status === "postponed") {
    return { result: "void", multiplier: 1, returnAmount: BigInt(bet.stake) };
  }
  if (game.status !== "final" || game.home_score === null || game.away_score === null) {
    return undefined;
  }
  const result = calculateFinalBetReturn({
    stake,
    prediction: bet.prediction,
    ...(bet.predicted_home_score === null ? {} : { predictedHomeScore: bet.predicted_home_score }),
    ...(bet.predicted_away_score === null ? {} : { predictedAwayScore: bet.predicted_away_score }),
    finalHomeScore: game.home_score,
    finalAwayScore: game.away_score,
  });
  return {
    result:
      result.classification === "miss"
        ? "lost"
        : result.classification === "result_hit" ? "outcome_hit" : "score_hit",
    multiplier: result.multiplier,
    returnAmount: BigInt(result.returnAmount),
  };
}

async function applyAccountDelta(
  client: PoolClient,
  input: KboSettlementInput,
  account: AccountRow,
  delta: { availableDelta: bigint; debtDelta: bigint },
  reasonCode: "bet_payout" | "bet_void_refund" | "settlement_correction",
): Promise<string | null> {
  if (delta.availableDelta === 0n && delta.debtDelta === 0n) return null;
  const availableBefore = BigInt(account.available_balance);
  const debtBefore = BigInt(account.correction_debt);
  const availableAfter = availableBefore + delta.availableDelta;
  const debtAfter = debtBefore + delta.debtDelta;
  await client.query(
    `update credit_account
        set available_balance = $2, correction_debt = $3,
            version = version + 1, updated_at = $4
      where account_id = $1`,
    [account.account_id, availableAfter.toString(), debtAfter.toString(), input.settledAt],
  );
  const ledger = await client.query<{ entry_id: string }>(
    `insert into credit_ledger_entry (
       account_id, reason_code, available_delta, debt_delta,
       available_before, available_after, debt_before, debt_after,
       operation_id, source_type, source_id, actor_type, occurred_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'settlement',$10,'system',$11)
     returning entry_id::text`,
    [
      account.account_id,
      reasonCode,
      delta.availableDelta.toString(),
      delta.debtDelta.toString(),
      availableBefore.toString(),
      availableAfter.toString(),
      debtBefore.toString(),
      debtAfter.toString(),
      input.operationId,
      input.settlementId,
      input.settledAt,
    ],
  );
  return ledger.rows[0]!.entry_id;
}

async function findSettlementByOperation(
  client: PoolClient,
  operationId: string,
): Promise<SettlementRow | undefined> {
  const result = await client.query<SettlementRow>(
    `select settlement.settlement_id, settlement.result, settlement.multiplier,
            settlement.return_amount::text, settlement.applied_delta::text,
            coalesce(ledger.available_delta, 0)::text available_delta,
            coalesce(ledger.debt_delta, 0)::text debt_delta,
            settlement.game_revision::text
       from bet_settlement settlement
       left join credit_ledger_entry ledger
         on ledger.entry_id = settlement.ledger_entry_id
      where settlement.operation_id = $1`,
    [operationId],
  );
  return result.rows[0];
}

async function commitSettled(client: PoolClient, row: SettlementRow): Promise<KboSettlementResult> {
  await client.query("commit");
  return {
    status: "settled",
    settlementId: row.settlement_id,
    result: row.result,
    multiplier: row.multiplier,
    returnAmount: BigInt(row.return_amount),
    appliedDelta: BigInt(row.applied_delta),
    availableDelta: BigInt(row.available_delta),
    debtDelta: BigInt(row.debt_delta),
    gameRevision: BigInt(row.game_revision),
  };
}

async function commitDuplicate(client: PoolClient): Promise<KboSettlementResult> {
  await client.query("commit");
  return { status: "duplicate_operation" };
}

async function commitDenied(
  client: PoolClient,
  input: KboSettlementInput,
  reason: DenialReason,
): Promise<KboSettlementResult> {
  if (!(await claimOperation(client, input, reason))) return await commitDuplicate(client);
  await appendAudit(client, input, reason);
  await client.query("commit");
  return { status: "denied", reason };
}

async function claimOperation(
  client: PoolClient,
  input: KboSettlementInput,
  result: "settled" | DenialReason,
): Promise<boolean> {
  const claimed = await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1,'system:kbo-settlement',$2,$3,$4) on conflict do nothing`,
    [
      input.operationId,
      input.settledAt,
      result === "settled" ? "accepted" : "denied",
      `kbo_settlement_${result}`,
    ],
  );
  return claimed.rowCount === 1;
}

async function appendAudit(
  client: PoolClient,
  input: KboSettlementInput,
  result: "settled" | DenialReason,
): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id
     ) values ($1,$2,$3,'kbo.settlement',null,$4,$5,$2,$6)`,
    [
      `kbo-settlement:${input.operationId}`,
      input.operationId,
      input.settledAt,
      result === "settled" ? "success" : "denied",
      `kbo_settlement_${result}`,
      input.guildId,
    ],
  );
}
