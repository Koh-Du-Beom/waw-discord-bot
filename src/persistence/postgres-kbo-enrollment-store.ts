import type { Pool, PoolClient } from "pg";

import {
  assertKboEnrollmentInput,
  type KboEnrollmentInput,
  type KboEnrollmentResult,
  type KboEnrollmentStore,
} from "../kbo/betting-enrollment.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresKboEnrollmentStore implements KboEnrollmentStore {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async enroll(input: KboEnrollmentInput): Promise<KboEnrollmentResult> {
    assertKboEnrollmentInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const registered = await client.query(
        `select 1 from registered_discord_user
          where guild_id = $1 and discord_user_id = $2
          for update`,
        [input.guildId, input.discordUserId],
      );
      const active = registered.rowCount === 1
        ? await client.query(
            `select 1 from betting_enrollment
              where guild_id = $1 and discord_user_id = $2 and status = 'active'
              limit 1`,
            [input.guildId, input.discordUserId],
          )
        : undefined;
      const result: Exclude<KboEnrollmentResult, "duplicate_operation"> =
        registered.rowCount !== 1
          ? "not_registered"
          : active?.rowCount === 1
            ? "already_enrolled"
            : "created";

      if (!(await claimOperation(client, input, result))) {
        await client.query("commit");
        return "duplicate_operation";
      }
      if (result === "created") {
        await client.query(
          `insert into credit_account (account_id, created_at, updated_at)
           values ($1, $2, $2)`,
          [input.accountId, input.enrolledAt],
        );
        await client.query(
          `insert into betting_enrollment (
             enrollment_id, account_id, guild_id, discord_user_id, status,
             policy_version, enrolled_at
           ) values ($1, $2, $3, $4, 'active', $5, $6)`,
          [
            input.enrollmentId,
            input.accountId,
            input.guildId,
            input.discordUserId,
            input.policyVersion,
            input.enrolledAt,
          ],
        );
      }
      await appendAudit(client, input, result);
      await client.query("commit");
      return result;
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_enrollment_failed");
    } finally {
      client.release();
    }
  }
}

async function claimOperation(
  client: PoolClient,
  input: KboEnrollmentInput,
  result: Exclude<KboEnrollmentResult, "duplicate_operation">,
): Promise<boolean> {
  const claimed = await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1, $2, $3, $4, $5)
     on conflict do nothing`,
    [
      input.operationId,
      input.discordUserId,
      input.enrolledAt,
      result === "created" ? "accepted" : "denied",
      `kbo_enrollment_${result}`,
    ],
  );
  return claimed.rowCount === 1;
}

async function appendAudit(
  client: PoolClient,
  input: KboEnrollmentInput,
  result: Exclude<KboEnrollmentResult, "duplicate_operation">,
): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id
     ) values ($1, $2, $3, 'kbo.enrollment', $4, $5, $6, $2, $7)`,
    [
      `kbo-enrollment:${input.operationId}`,
      input.operationId,
      input.enrolledAt,
      input.discordUserId,
      result === "created" ? "success" : "denied",
      `kbo_enrollment_${result}`,
      input.guildId,
    ],
  );
}
