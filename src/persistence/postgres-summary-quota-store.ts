import type { Pool, PoolClient } from "pg";

import {
  koreanQuotaDate,
  type SummaryQuotaReservationDecision,
  type SummaryQuotaReservationInput,
  type SummaryQuotaReservationPort,
} from "../summary/summary-quota-contract.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresSummaryQuotaStore implements SummaryQuotaReservationPort {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async reserve(input: SummaryQuotaReservationInput): Promise<SummaryQuotaReservationDecision> {
    const client = await this.pool.connect();
    const quotaDate = koreanQuotaDate(input.receivedAt);
    try {
      await client.query("begin");
      const existing = await client.query<{
        decision: "reserved" | "disabled" | "exhausted";
        used: number;
        effective_limit: number;
      }>(
        `select r.decision, c.used,
          coalesce(o.daily_limit, s.summary_daily_limit)::integer as effective_limit
         from summary_quota_reservation r
         join summary_quota_counter c using (guild_id, discord_user_id, quota_date)
         join dashboard_setting s on s.singleton
         left join summary_quota_override o using (guild_id, discord_user_id)
         where r.operation_id = $1`,
        [input.operationId],
      );
      if (existing.rowCount) {
        await client.query("commit");
        const row = existing.rows[0]!;
        return row.decision === "reserved"
          ? { kind: "duplicate", quotaDate, used: row.used, effectiveLimit: row.effective_limit }
          : row.decision === "disabled"
            ? { kind: "disabled", quotaDate }
            : { kind: "exhausted", quotaDate, used: row.used, effectiveLimit: row.effective_limit };
      }
      await ensureUserAndCounter(client, input, quotaDate);
      const state = await client.query<{
        used: number; effective_limit: number; enabled: boolean;
      }>(
        `select c.used,
          coalesce(o.daily_limit, s.summary_daily_limit)::integer as effective_limit,
          coalesce(o.enabled, true) as enabled
         from summary_quota_counter c
         join dashboard_setting s on s.singleton
         left join summary_quota_override o using (guild_id, discord_user_id)
         where c.guild_id=$1 and c.discord_user_id=$2 and c.quota_date=$3
         for update of c`,
        [input.guildId, input.discordUserId, quotaDate],
      );
      const row = state.rows[0]!;
      const decision = !row.enabled ? "disabled" : row.used >= row.effective_limit ? "exhausted" : "reserved";
      const used = decision === "reserved" ? row.used + 1 : row.used;
      if (decision === "reserved") {
        await client.query(
          `update summary_quota_counter set used=$4, updated_at=$5
           where guild_id=$1 and discord_user_id=$2 and quota_date=$3`,
          [input.guildId, input.discordUserId, quotaDate, used, input.receivedAt],
        );
      }
      await client.query(
        `insert into operation_ledger values ($1,$2,$3,$4,$5)`,
        [input.operationId, input.discordUserId, input.receivedAt,
          decision === "reserved" ? "accepted" : "denied", `summary_quota_${decision}`],
      );
      await client.query(
        `insert into summary_quota_reservation
         (operation_id,guild_id,discord_user_id,quota_date,decision,occurred_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [input.operationId, input.guildId, input.discordUserId, quotaDate, decision, input.receivedAt],
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
        ? { kind: "reserved", quotaDate, used, effectiveLimit: row.effective_limit }
        : decision === "disabled"
          ? { kind: "disabled", quotaDate }
          : { kind: "exhausted", quotaDate, used, effectiveLimit: row.effective_limit };
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("summary_quota_reservation_failed");
    } finally {
      client.release();
    }
  }
}

async function ensureUserAndCounter(
  client: PoolClient,
  input: SummaryQuotaReservationInput,
  quotaDate: string,
): Promise<void> {
  await client.query(
    `insert into registered_discord_user
     (guild_id,discord_user_id,display_label,created_at,updated_at)
     values ($1,$2,'서버 멤버',$3,$3) on conflict do nothing`,
    [input.guildId, input.discordUserId, input.receivedAt],
  );
  await client.query(
    `insert into summary_quota_counter
     (guild_id,discord_user_id,quota_date,used,updated_at)
     values ($1,$2,$3,0,$4) on conflict do nothing`,
    [input.guildId, input.discordUserId, quotaDate, input.receivedAt],
  );
}
