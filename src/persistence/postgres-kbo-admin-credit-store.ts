import type { Pool, PoolClient } from "pg";

import type { CommandAuditEvent } from "../commands/command-handler.ts";
import type { AdminCommandReasonCode } from "../contracts/admin-command-ipc.ts";
import type { KboAdminCreditAdjustmentStore } from "../kbo/admin-credit-adjustment.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type AccountRow = {
  available_balance: string;
  correction_debt: string;
  version: string;
  discord_user_id: string | null;
};

export class PostgresKboAdminCreditStore implements KboAdminCreditAdjustmentStore {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async adjust(input: Parameters<KboAdminCreditAdjustmentStore["adjust"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (!(await claimOperation(client, input))) {
        await client.query("commit");
        return { status: "duplicate_operation" as const };
      }
      const account = await client.query<AccountRow>(
        `select account.available_balance::text, account.correction_debt::text,
                account.version::text, enrollment.discord_user_id
           from credit_account account
           left join betting_enrollment enrollment
             on enrollment.account_id = account.account_id
          where account.account_id = $1
          for update of account`,
        [input.accountId],
      );
      const row = account.rows[0];
      if (!row) return await denied(client, input, "not_found", "credit_account_not_found");
      if (row.discord_user_id === input.administratorId) {
        return await denied(
          client,
          input,
          "self_adjustment",
          "credit_account_self_adjustment",
        );
      }
      const version = Number(row.version);
      if (!Number.isSafeInteger(version) || version !== input.expectedVersion) {
        return await denied(client, input, "stale", "credit_account_stale");
      }
      const availableBefore = BigInt(row.available_balance);
      const availableAfter = availableBefore + input.delta;
      if (availableAfter < 0n) {
        return await denied(
          client,
          input,
          "insufficient_balance",
          "credit_account_insufficient_balance",
        );
      }
      const nextVersion = version + 1;
      await client.query(
        `update credit_account
            set available_balance = $2, version = $3, updated_at = $4
          where account_id = $1`,
        [input.accountId, availableAfter.toString(), nextVersion, input.adjustedAt],
      );
      await client.query(
        `insert into credit_ledger_entry (
           account_id, reason_code, available_delta, debt_delta,
           available_before, available_after, debt_before, debt_after,
           operation_id, source_type, source_id, actor_type, actor_id, occurred_at
         ) values (
           $1,'admin_adjustment',$2,0,$3,$4,$5,$5,$6,
           $9,$6,'administrator',$7,$8
         )`,
        [
          input.accountId,
          input.delta.toString(),
          availableBefore.toString(),
          availableAfter.toString(),
          row.correction_debt,
          input.operationId,
          input.administratorId,
          input.adjustedAt,
          `admin_adjustment_${input.reasonCode}`,
        ],
      );
      await appendAudit(client, input.audit);
      await appendResult(client, input, "success", "completed");
      await client.query("commit");
      return { status: "adjusted" as const, availableBalance: availableAfter, version: nextVersion };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_admin_credit_adjustment_failed");
    } finally {
      client.release();
    }
  }
}

async function claimOperation(
  client: PoolClient,
  input: Parameters<KboAdminCreditAdjustmentStore["adjust"]>[0],
): Promise<boolean> {
  const result = await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1,$2,$3,'accepted','credit_account_adjust')
     on conflict do nothing`,
    [input.operationId, input.administratorId, input.adjustedAt],
  );
  return result.rowCount === 1;
}

async function denied(
  client: PoolClient,
  input: Parameters<KboAdminCreditAdjustmentStore["adjust"]>[0],
  status: "not_found" | "stale" | "self_adjustment" | "insufficient_balance",
  reasonCode: AdminCommandReasonCode,
) {
  await appendAudit(client, { ...input.audit, outcome: "denied", reasonCode });
  await appendResult(client, input, status === "stale" ? "conflict" : "denied", reasonCode);
  await client.query("commit");
  return { status } as const;
}

async function appendAudit(client: PoolClient, event: CommandAuditEvent): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id, channel_id, command_name
     ) values ($1,$1,$2,'discord.command',$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.eventId,
      event.occurredAt,
      event.actorId,
      event.outcome,
      event.reasonCode,
      event.correlationId,
      event.guildId,
      event.channelId,
      event.commandName,
    ],
  );
}

async function appendResult(
  client: PoolClient,
  input: Parameters<KboAdminCreditAdjustmentStore["adjust"]>[0],
  outcome: "success" | "denied" | "conflict",
  reasonCode: AdminCommandReasonCode,
): Promise<void> {
  await client.query(
    `insert into admin_command_result (
       operation_id, command_name, outcome, reason_code, completed_at
     ) values ($1,'credit_account_adjust',$2,$3,$4)`,
    [input.operationId, outcome, reasonCode, input.adjustedAt],
  );
}
