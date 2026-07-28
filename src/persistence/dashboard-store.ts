import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AuditEventsDto,
  CommandLogPageDto,
  ListCommandLogRequestDto,
  LowRiskSettingsDto,
  UpdateLowRiskSettingsRequestDto,
} from "../contracts/dashboard.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type UpdateSettingsInput = {
  request: UpdateLowRiskSettingsRequestDto;
  actorId: string;
  operationId: string;
};

type SettingsRow = {
  summary_enabled: boolean;
  version: string;
};

type AuditRow = {
  event_id: string;
  occurred_at: Date;
  actor_id: string;
  outcome: "success" | "denied" | "failure";
  reason_code: string;
};

export class PostgresDashboardStore {
  constructor(
    private readonly pool: Pool,
    private readonly generateEventId: () => string = randomUUID,
  ) {}

  async readSettings(): Promise<LowRiskSettingsDto> {
    try {
      const result = await this.pool.query<SettingsRow>(
        `select summary_enabled, version::text
           from dashboard_setting
          where singleton = true`,
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("settings row missing");
      return mapSettings(row);
    } catch {
      throw new PersistenceError("dashboard_settings_read_failed");
    }
  }

  async updateSettings(
    input: UpdateSettingsInput,
  ): Promise<
    | { kind: "updated"; settings: LowRiskSettingsDto }
    | { kind: "conflict" }
  > {
    return this.transaction(async (client) => {
      const updated = await client.query<SettingsRow>(
        `update dashboard_setting
            set summary_enabled = $1,
                version = version + 1,
                updated_at = clock_timestamp()
          where singleton = true
            and version = $2
        returning summary_enabled, version::text`,
        [input.request.summaryEnabled, input.request.expectedVersion],
      );
      if (updated.rowCount !== 1 || updated.rows[0] === undefined) {
        await recordAttempt(client, {
          ...input,
          eventId: this.generateEventId(),
          operationOutcome: "denied",
          auditOutcome: "denied",
          reasonCode: "version_conflict",
        });
        return { kind: "conflict" };
      }
      await recordAttempt(client, {
        ...input,
        eventId: this.generateEventId(),
        operationOutcome: "accepted",
        auditOutcome: "success",
        reasonCode: "updated",
      });
      return { kind: "updated", settings: mapSettings(updated.rows[0]) };
    });
  }

  async readAudit(limit = 50): Promise<AuditEventsDto> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new PersistenceError("dashboard_audit_limit_invalid");
    }
    try {
      const result = await this.pool.query<AuditRow>(
        `select event_id, occurred_at, actor_id, outcome, reason_code
           from audit_event
          where event_type = 'settings.summary.update'
            and actor_id is not null
          order by occurred_at desc, event_id desc
          limit $1`,
        [limit],
      );
      return {
        events: result.rows.map((row) => ({
          id: row.event_id,
          occurredAt: row.occurred_at.toISOString(),
          actorId: row.actor_id,
          action: "settings.summary.update",
          outcome: row.outcome === "failure" ? "failed" : row.outcome,
          reasonCode: row.reason_code,
        })),
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("dashboard_audit_read_failed");
    }
  }

  async readCommandLog(input: ListCommandLogRequestDto): Promise<CommandLogPageDto> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new PersistenceError("command_log_request_invalid");
    }
    const cursor = input.cursor === undefined
      ? undefined
      : decodeCursor(input.cursor);
    try {
      const result = await this.pool.query<{
        occurred_at: Date; event_id: string; command_name: string;
        display_label: string | null; outcome: "success" | "denied" | "failure";
        reason_code: string;
      }>(
        `select a.occurred_at,a.event_id,a.command_name,
                u.display_label,a.outcome,a.reason_code
           from audit_event a
           left join registered_discord_user u
             on u.guild_id=a.guild_id and u.discord_user_id=a.actor_id
          where a.event_type='discord.command'
            and ($1::timestamptz is null or (a.occurred_at,a.event_id)<($1,$2))
            and ($3::text is null or a.command_name=$3)
            and ($4::text is null or a.outcome=$4)
          order by a.occurred_at desc,a.event_id desc limit $5`,
        [cursor?.occurredAt ?? null, cursor?.eventId ?? null,
          input.command ?? null, input.outcome === "failed" ? "failure" : input.outcome ?? null,
          limit + 1],
      );
      const visible = result.rows.slice(0, limit);
      const last = visible.at(-1);
      return {
        entries: visible.map((row) => ({
          occurredAt: row.occurred_at.toISOString(),
          commandLabel: `/${row.command_name}`,
          actorLabel: row.display_label ?? "서버 멤버",
          outcome: row.outcome === "failure" ? "failed" : row.outcome,
          reasonLabel: publicReason(row.reason_code),
        })),
        ...(result.rows.length > limit && last
          ? { nextCursor: encodeCursor(last.occurred_at, last.event_id) }
          : {}),
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("command_log_read_failed");
    }
  }


  async recordAdminCommandDispatch(input: {
    eventId: string;
    operationId: string;
    occurredAt: Date;
    actorId: string;
    guildId: string;
    commandName: string;
  }): Promise<void> {
    try {
      await this.pool.query(
        `insert into audit_event (
           event_id, occurred_at, event_type, actor_id, outcome, reason_code,
           correlation_id, guild_id, channel_id, command_name
         ) values (
           $1,$2,'dashboard.admin_command.dispatch',$3,'success',
           'dispatch_authorized',$4,$5,'dashboard',$6
         )`,
        [
          input.eventId,
          input.occurredAt,
          input.actorId,
          input.operationId,
          input.guildId,
          input.commandName,
        ],
      );
    } catch {
      throw new PersistenceError("dashboard_admin_dispatch_audit_failed");
    }
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch {
      await client?.query("rollback").catch(() => undefined);
      throw new PersistenceError("dashboard_settings_update_failed");
    } finally {
      client?.release();
    }
  }
}

async function recordAttempt(
  client: PoolClient,
  input: UpdateSettingsInput & {
    eventId: string;
    operationOutcome: "accepted" | "denied";
    auditOutcome: "success" | "denied";
    reasonCode: string;
  },
): Promise<void> {
  await client.query(
    `insert into operation_ledger (
       operation_id, actor_id, accepted_at, outcome, reason_code
     ) values ($1, $2, clock_timestamp(), $3, $4)`,
    [
      input.operationId,
      input.actorId,
      input.operationOutcome,
      input.reasonCode,
    ],
  );
  await client.query(
    `insert into audit_event (
       event_id, operation_id, occurred_at, event_type, actor_id, outcome,
       reason_code, correlation_id
     ) values (
       $1, $2, clock_timestamp(), 'settings.summary.update', $3, $4, $5, $2
     )`,
    [
      input.eventId,
      input.operationId,
      input.actorId,
      input.auditOutcome,
      input.reasonCode,
    ],
  );
}

function mapSettings(row: SettingsRow): LowRiskSettingsDto {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("settings version invalid");
  }
  return {
    summaryEnabled: row.summary_enabled,
    version,
  };
}

function encodeCursor(occurredAt: Date, eventId: string): string {
  return Buffer.from(JSON.stringify([occurredAt.toISOString(), eventId]))
    .toString("base64url");
}

function decodeCursor(value: string): { occurredAt: string; eventId: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 ||
        typeof parsed[0] !== "string" || !Number.isFinite(Date.parse(parsed[0])) ||
        typeof parsed[1] !== "string" || parsed[1].length < 1 || parsed[1].length > 160) {
      throw new Error();
    }
    return { occurredAt: parsed[0], eventId: parsed[1] };
  } catch {
    throw new PersistenceError("command_log_cursor_invalid");
  }
}

function publicReason(code: string): string {
  const labels: Record<string, string> = {
    completed: "완료",
    invalid_summary_range: "입력 범위 오류",
    summary_range_incomplete: "범위 수집 미완료",
    summary_quota_cooldown: "1시간 대기",
  };
  return labels[code] ?? "처리 결과";
}
