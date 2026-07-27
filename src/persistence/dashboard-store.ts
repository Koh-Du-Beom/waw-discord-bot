import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AuditEventsDto,
  CommandLogPageDto,
  ListCommandLogRequestDto,
  LowRiskSettingsDto,
  SummaryQuotaSettingsDto,
  UpdateSummaryQuotaDefaultRequestDto,
  UpdateSummaryQuotaUserRequestDto,
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

  async readSummaryQuotas(now = new Date()): Promise<SummaryQuotaSettingsDto> {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const settings = await this.pool.query<{ summary_daily_limit: number; version: string }>(
      `select summary_daily_limit,version::text from dashboard_setting where singleton`,
    );
    const users = await this.pool.query<{
      user_key: string; display_label: string; used: number; effective_limit: number;
      enabled: boolean; daily_limit: number | null; version: string;
    }>(
      `select md5(u.guild_id||':'||u.discord_user_id) user_key,
              u.display_label,coalesce(c.used,0)::integer used,
              coalesce(o.daily_limit,s.summary_daily_limit)::integer effective_limit,
              coalesce(o.enabled,true) enabled,o.daily_limit,o.version::text
         from registered_discord_user u cross join dashboard_setting s
         left join summary_quota_override o using(guild_id,discord_user_id)
         left join summary_quota_counter c on c.guild_id=u.guild_id
          and c.discord_user_id=u.discord_user_id and c.quota_date=$1
        order by u.display_label,u.guild_id,u.discord_user_id`,
      [date],
    );
    const defaultLimit = settings.rows[0]?.summary_daily_limit;
    const version = Number(settings.rows[0]?.version);
    if (!defaultLimit || !Number.isSafeInteger(version)) throw new PersistenceError("summary_quota_read_failed");
    return {
      defaultLimit, version,
      users: users.rows.map((row) => ({
        userKey: row.user_key, displayLabel: row.display_label, used: row.used,
        effectiveLimit: row.effective_limit,
        remaining: Math.max(0, row.effective_limit - row.used),
        limitSource: row.daily_limit === null ? "default" : "override",
        enabled: row.enabled,
        nextResetAt: nextSeoulReset(now).toISOString(),
        version: Number(row.version ?? "0"),
      })),
    };
  }

  async updateSummaryQuotaDefault(input: {
    request: UpdateSummaryQuotaDefaultRequestDto; actorId: string; operationId: string;
  }): Promise<"updated" | "conflict"> {
    if (!Number.isInteger(input.request.dailyLimit) ||
        input.request.dailyLimit < 1 || input.request.dailyLimit > 100) {
      throw new PersistenceError("summary_quota_limit_invalid");
    }
    return this.transaction(async (client) => {
      const result = await client.query(
        `update dashboard_setting set summary_daily_limit=$1,version=version+1,
          updated_at=clock_timestamp() where singleton and version=$2`,
        [input.request.dailyLimit, input.request.expectedVersion],
      );
      await recordQuotaMutation(client, input, result.rowCount === 1 ? "updated" : "conflict");
      return result.rowCount === 1 ? "updated" : "conflict";
    });
  }

  async updateSummaryQuotaUser(input: {
    request: UpdateSummaryQuotaUserRequestDto; actorId: string; operationId: string;
  }): Promise<"updated" | "conflict" | "unavailable"> {
    const { request } = input;
    if (!/^[a-f0-9]{32}$/u.test(request.userKey) ||
        (request.dailyLimit !== null &&
          (!Number.isInteger(request.dailyLimit) || request.dailyLimit < 1 || request.dailyLimit > 100))) {
      throw new PersistenceError("summary_quota_user_request_invalid");
    }
    return this.transaction(async (client) => {
      const user = await client.query<{ guild_id: string; discord_user_id: string }>(
        `select guild_id,discord_user_id from registered_discord_user
          where md5(guild_id||':'||discord_user_id)=$1`, [request.userKey],
      );
      if (!user.rows[0]) return "unavailable";
      const row = user.rows[0];
      const result = await client.query(
        `insert into summary_quota_override
          (guild_id,discord_user_id,enabled,daily_limit,version,updated_at)
         select $1,$2,$3,$4,1,clock_timestamp() where $5=0
         on conflict (guild_id,discord_user_id) do update
           set enabled=excluded.enabled,daily_limit=excluded.daily_limit,
               version=summary_quota_override.version+1,updated_at=clock_timestamp()
         where summary_quota_override.version=$5`,
        [row.guild_id, row.discord_user_id, request.enabled, request.dailyLimit, request.expectedVersion],
      );
      await recordQuotaMutation(client, input, result.rowCount === 1 ? "updated" : "conflict");
      return result.rowCount === 1 ? "updated" : "conflict";
    });
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

function nextSeoulReset(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1) - 9 * 60 * 60 * 1000);
}

async function recordQuotaMutation(
  client: PoolClient,
  input: { actorId: string; operationId: string },
  result: "updated" | "conflict",
): Promise<void> {
  await client.query(
    `insert into operation_ledger(operation_id,actor_id,accepted_at,outcome,reason_code)
     values($1,$2,clock_timestamp(),$3,$4)`,
    [input.operationId, input.actorId, result === "updated" ? "accepted" : "denied",
      `summary_quota_${result}`],
  );
  await client.query(
    `insert into audit_event(event_id,operation_id,occurred_at,event_type,actor_id,
      outcome,reason_code,correlation_id)
     values($1,$1,clock_timestamp(),'settings.summary.quota',$2,$3,$4,$1)`,
    [input.operationId, input.actorId, result === "updated" ? "success" : "denied",
      `summary_quota_${result}`],
  );
}
