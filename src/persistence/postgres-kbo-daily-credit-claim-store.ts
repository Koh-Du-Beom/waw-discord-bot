import type { Pool, PoolClient } from "pg";

import {
  allocateDailyCredit,
  assertKboDailyCreditClaimInput,
  toKstClaimDate,
  type KboDailyCreditClaimInput,
  type KboDailyCreditClaimResult,
  type KboDailyCreditClaimStore,
} from "../kbo/daily-credit-claim.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type AccountRow = {
  account_id: string;
  available_balance: string;
  correction_debt: string;
};

type ClaimRow = {
  available_delta: string;
  debt_delta: string;
  claim_date: string;
};

export class PostgresKboDailyCreditClaimStore implements KboDailyCreditClaimStore {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async claim(input: KboDailyCreditClaimInput): Promise<KboDailyCreditClaimResult> {
    assertKboDailyCreditClaimInput(input);
    const claimDate = toKstClaimDate(input.claimedAt);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const account = await lockActiveAccount(client, input);
      if (!account) {
        const result = await recordTerminal(client, input, claimDate, "not_enrolled");
        await client.query("commit");
        return result;
      }

      const previous = await findClaimByOperation(client, account.account_id, input.operationId);
      if (previous) {
        await client.query("commit");
        return previous;
      }

      const claimedToday = await client.query(
        `select 1 from daily_credit_claim
          where account_id = $1 and claim_date = $2::date`,
        [account.account_id, claimDate],
      );
      if (claimedToday.rowCount) {
        const result = await recordTerminal(client, input, claimDate, "already_claimed");
        await client.query("commit");
        return result;
      }

      if (!(await claimOperation(client, input, "claimed"))) {
        const duplicate = await findClaimByOperation(client, account.account_id, input.operationId);
        await client.query("commit");
        return duplicate ?? { status: "duplicate_operation", claimDate };
      }

      const availableBefore = BigInt(account.available_balance);
      const debtBefore = BigInt(account.correction_debt);
      const { availablePaid, debtPaid } = allocateDailyCredit(debtBefore);
      const availableAfter = availableBefore + availablePaid;
      const debtAfter = debtBefore - debtPaid;
      await client.query(
        `update credit_account
            set available_balance = $2, correction_debt = $3,
                version = version + 1, updated_at = $4
          where account_id = $1`,
        [account.account_id, availableAfter.toString(), debtAfter.toString(), input.claimedAt],
      );
      const ledger = await client.query<{ entry_id: string }>(
        `insert into credit_ledger_entry (
           account_id, reason_code, available_delta, debt_delta,
           available_before, available_after, debt_before, debt_after,
           operation_id, source_type, source_id, actor_type, occurred_at
         ) values (
           $1, 'daily_claim', $2, $3, $4, $5, $6, $7,
           $8, 'daily_claim', $9, 'system', $10
         ) returning entry_id::text`,
        [
          account.account_id,
          availablePaid.toString(),
          (-debtPaid).toString(),
          availableBefore.toString(),
          availableAfter.toString(),
          debtBefore.toString(),
          debtAfter.toString(),
          input.operationId,
          claimDate,
          input.claimedAt,
        ],
      );
      await client.query(
        `insert into daily_credit_claim (
           claim_id, account_id, claim_date, operation_id, ledger_entry_id, claimed_at
         ) values ($1, $2, $3::date, $4, $5, $6)`,
        [
          input.claimId,
          account.account_id,
          claimDate,
          input.operationId,
          ledger.rows[0]!.entry_id,
          input.claimedAt,
        ],
      );
      await appendAudit(client, input, "claimed");
      await client.query("commit");
      return { status: "claimed", claimDate, availablePaid, debtPaid };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_daily_credit_claim_failed");
    } finally {
      client.release();
    }
  }
}

async function lockActiveAccount(
  client: PoolClient,
  input: KboDailyCreditClaimInput,
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

async function findClaimByOperation(
  client: PoolClient,
  accountId: string,
  operationId: string,
): Promise<KboDailyCreditClaimResult | undefined> {
  const result = await client.query<ClaimRow>(
    `select ledger.available_delta::text, ledger.debt_delta::text,
            claim.claim_date::text
       from daily_credit_claim claim
       join credit_ledger_entry ledger on ledger.entry_id = claim.ledger_entry_id
      where claim.account_id = $1 and claim.operation_id = $2`,
    [accountId, operationId],
  );
  const row = result.rows[0];
  return row
    ? {
        status: "claimed",
        claimDate: row.claim_date,
        availablePaid: BigInt(row.available_delta),
        debtPaid: -BigInt(row.debt_delta),
      }
    : undefined;
}

async function recordTerminal(
  client: PoolClient,
  input: KboDailyCreditClaimInput,
  claimDate: string,
  status: "already_claimed" | "not_enrolled",
): Promise<KboDailyCreditClaimResult> {
  if (!(await claimOperation(client, input, status))) {
    return { status: "duplicate_operation", claimDate };
  }
  await appendAudit(client, input, status);
  return { status, claimDate };
}

async function claimOperation(
  client: PoolClient,
  input: KboDailyCreditClaimInput,
  status: "claimed" | "already_claimed" | "not_enrolled",
): Promise<boolean> {
  const claimed = await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1, $2, $3, $4, $5)
     on conflict do nothing`,
    [
      input.operationId,
      input.discordUserId,
      input.claimedAt,
      status === "claimed" ? "accepted" : "denied",
      `kbo_daily_claim_${status}`,
    ],
  );
  return claimed.rowCount === 1;
}

async function appendAudit(
  client: PoolClient,
  input: KboDailyCreditClaimInput,
  status: "claimed" | "already_claimed" | "not_enrolled",
): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id
     ) values ($1, $2, $3, 'kbo.daily_claim', $4, $5, $6, $2, $7)`,
    [
      `kbo-daily-claim:${input.operationId}`,
      input.operationId,
      input.claimedAt,
      input.discordUserId,
      status === "claimed" ? "success" : "denied",
      `kbo_daily_claim_${status}`,
      input.guildId,
    ],
  );
}
