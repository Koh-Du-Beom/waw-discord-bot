import type { Pool, PoolClient } from "pg";

import {
  assertKboDepartureInput,
  type KboDepartureInput,
  type KboDepartureResult,
  type KboDepartureStore,
} from "../kbo/departure.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresKboDepartureStore implements KboDepartureStore {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async listActiveDiscordUserIds(guildId: string): Promise<readonly string[]> {
    if (!/^[1-9][0-9]{16,19}$/.test(guildId)) {
      throw new PersistenceError("kbo_departure_guild_invalid");
    }
    try {
      const result = await this.pool.query<{ discord_user_id: string }>(
        `select discord_user_id
           from betting_enrollment
          where guild_id = $1 and status = 'active'
          order by discord_user_id`,
        [guildId],
      );
      return result.rows.map((row) => row.discord_user_id);
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("kbo_departure_active_read_failed");
    }
  }

  async depart(input: KboDepartureInput): Promise<KboDepartureResult> {
    assertKboDepartureInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const enrollment = await client.query<{ enrollment_id: string }>(
        `select enrollment_id
           from betting_enrollment
          where guild_id = $1 and discord_user_id = $2 and status = 'active'
          for update`,
        [input.guildId, input.discordUserId],
      );
      if (enrollment.rowCount !== 1) {
        await client.query("commit");
        return "not_enrolled";
      }
      await client.query(
         `insert into operation_ledger (
           operation_id, actor_id, accepted_at, outcome, reason_code
         ) values ($1, 'system:kbo-departure', $2, 'accepted', 'kbo_member_departed')`,
        [input.operationId, input.departedAt],
      );
      await client.query(
        `update betting_enrollment
            set status = 'departed', discord_user_id = null, departed_at = $2
          where enrollment_id = $1`,
        [enrollment.rows[0]!.enrollment_id, input.departedAt],
      );
      await appendAudit(client, input);
      await client.query("commit");
      return "departed";
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("kbo_departure_failed");
    } finally {
      client.release();
    }
  }
}

async function appendAudit(client: PoolClient, input: KboDepartureInput): Promise<void> {
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id, guild_id
     ) values ($1, $2, $3, 'kbo.departure', null, 'success',
               'kbo_member_departed', $2, $4)`,
    [`kbo-departure:${input.operationId}`, input.operationId, input.departedAt, input.guildId],
  );
}
