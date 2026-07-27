import type { Pool, PoolClient } from "pg";

import {
  assertQuotaInstant,
  type SummaryQuotaReservationDecision,
  type SummaryQuotaReservationInput,
  type SummaryQuotaReservationPort,
} from "../summary/summary-quota-contract.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresSummaryQuotaStore implements SummaryQuotaReservationPort {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async reserve(input: SummaryQuotaReservationInput): Promise<SummaryQuotaReservationDecision> {
    assertQuotaInstant(input.receivedAt);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query<{
        decision: "reserved" | "cooldown";
      }>(
        `select decision from summary_quota_reservation where operation_id=$1`,
        [input.operationId],
      );
      if (existing.rowCount) {
        await client.query("commit");
        return { kind: "duplicate", decision: existing.rows[0]!.decision };
      }
      await ensureAndLockUser(client, input);
      const latest = await client.query<{ occurred_at: Date }>(
        `select occurred_at from summary_quota_reservation
          where guild_id=$1 and discord_user_id=$2 and decision='reserved'
          order by occurred_at desc limit 1`,
        [input.guildId, input.discordUserId],
      );
      const previous = latest.rows[0]?.occurred_at;
      const availableAt = previous && new Date(previous.getTime() + 60 * 60 * 1000);
      const decision = availableAt && input.receivedAt < availableAt ? "cooldown" : "reserved";
      await client.query(
        `insert into operation_ledger values ($1,$2,$3,$4,$5)`,
        [input.operationId, input.discordUserId, input.receivedAt,
          decision === "reserved" ? "accepted" : "denied", `summary_quota_${decision}`],
      );
      await client.query(
        `insert into summary_quota_reservation
         (operation_id,guild_id,discord_user_id,decision,occurred_at)
         values ($1,$2,$3,$4,$5)`,
        [input.operationId, input.guildId, input.discordUserId, decision, input.receivedAt],
      );
      await client.query(
        `insert into audit_event
         (event_id,occurred_at,event_type,actor_id,outcome,reason_code,correlation_id,guild_id,command_name)
         values ($1,$2,'summary.quota',$3,$4,$5,$1,$6,'요약')`,
        [`quota:${input.operationId}`, input.receivedAt, input.discordUserId,
          decision === "reserved" ? "success" : "denied", `summary_quota_${decision}`, input.guildId],
      );
      await client.query("commit");
      return decision === "reserved"
        ? { kind: "reserved" }
        : { kind: "cooldown", availableAt: availableAt! };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("summary_quota_reservation_failed");
    } finally {
      client.release();
    }
  }
}

async function ensureAndLockUser(
  client: PoolClient,
  input: SummaryQuotaReservationInput,
): Promise<void> {
  await client.query(
    `insert into registered_discord_user
     (guild_id,discord_user_id,display_label,created_at,updated_at)
     values ($1,$2,'서버 멤버',$3,$3) on conflict do nothing`,
    [input.guildId, input.discordUserId, input.receivedAt],
  );
  await client.query(
    `select 1 from registered_discord_user
      where guild_id=$1 and discord_user_id=$2 for update`,
    [input.guildId, input.discordUserId],
  );
}
