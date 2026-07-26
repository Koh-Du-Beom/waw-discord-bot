import type { QueryResult } from "pg";

import type {
  CommandAuditEvent,
  CommandAuditSink,
} from "../commands/command-handler.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type Queryable = {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<Record<string, unknown>>>;
};

export class PostgresCommandAuditSink implements CommandAuditSink {
  constructor(private readonly database: Queryable) {}

  async append(event: CommandAuditEvent): Promise<void> {
    try {
      await this.database.query(
        `insert into audit_event (
          event_id, occurred_at, event_type, actor_id, outcome, reason_code,
          correlation_id, guild_id, channel_id, command_name
        ) values ($1,$2,'discord.command',$3,$4,$5,$6,$7,$8,$9)
        on conflict do nothing`,
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
    } catch {
      throw new PersistenceError("command_audit_write_failed");
    }
  }
}
