import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AuditEventsDto,
  ActiveRiotLinksDto,
  ActiveGameObservationsDto,
  CommandLogPageDto,
  GameEvidenceStateDto,
  GameIncidentHistoryPageDto,
  GameIncidentStatusDto,
  GameComparisonStateDto,
  GameStacksDto,
  ListGameIncidentHistoryRequestDto,
  ListCommandLogRequestDto,
  LowRiskSettingsDto,
  KboManagementDto,
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

  async readActiveRiotLinks(): Promise<ActiveRiotLinksDto> {
    try {
      const result = await this.pool.query<{
        link_id: string; display_label: string | null; platform_id: string;
        game_name: string; tag_line: string; is_primary: boolean; version: string;
      }>(
        `select link.link_id, users.display_label, link.platform_id,
                link.game_name, link.tag_line, link.is_primary,
                link.version::text
           from riot_account_link link
           left join registered_discord_user users
             on users.discord_user_id = link.discord_user_id
          where link.removed_at is null
          order by coalesce(users.display_label, link.discord_user_id),
                   link.is_primary desc, link.created_at, link.link_id`,
      );
      return {
        links: result.rows.map((row) => ({
          linkId: row.link_id,
          expectedVersion: Number(row.version),
          requesterLabel: row.display_label ?? "서버 멤버",
          platformId: row.platform_id,
          gameName: row.game_name,
          tagLine: row.tag_line,
          isPrimary: row.is_primary,
        })),
      };
    } catch {
      throw new PersistenceError("dashboard_riot_links_read_failed");
    }
  }

  async readKboManagement(guildId: string): Promise<KboManagementDto> {
    if (!/^[1-9][0-9]{16,19}$/.test(guildId)) {
      throw new PersistenceError("dashboard_kbo_guild_invalid");
    }
    try {
      const [accounts, provider] = await Promise.all([
        this.pool.query<{
          account_id: string; display_label: string | null; status: "active" | "departed";
          available_balance: string; correction_debt: string; version: string;
          daily_claims: string; bets: string; pending_bets: string; settled_bets: string;
          void_bets: string; corrections: string; outcome_hits: string; score_hits: string;
          admin_adjusted: boolean; last_ledger_at: Date | null;
        }>(
          `select account.account_id, users.display_label, enrollment.status,
                  account.available_balance::text, account.correction_debt::text,
                  account.version::text,
                  (select count(*)::text from daily_credit_claim claim
                    where claim.account_id = account.account_id) daily_claims,
                  (select count(*)::text from kbo_bet bet
                    where bet.account_id = account.account_id) bets,
                  (select count(*)::text from kbo_bet bet
                    where bet.account_id = account.account_id and bet.status = 'pending') pending_bets,
                  (select count(*)::text from kbo_bet bet
                    where bet.account_id = account.account_id and bet.status = 'settled') settled_bets,
                  (select count(*)::text from kbo_bet bet
                    where bet.account_id = account.account_id and bet.status = 'void') void_bets,
                  (select coalesce(sum(greatest(history.count - 1, 0)), 0)::text
                     from kbo_bet bet
                     cross join lateral (
                       select count(*) count from bet_settlement settlement
                        where settlement.bet_id = bet.bet_id
                     ) history
                    where bet.account_id = account.account_id) corrections,
                  (select count(*)::text from kbo_bet bet
                     join bet_settlement settlement
                       on settlement.settlement_id = bet.current_settlement_id
                    where bet.account_id = account.account_id
                      and settlement.result in ('outcome_hit', 'score_hit')) outcome_hits,
                  (select count(*)::text from kbo_bet bet
                     join bet_settlement settlement
                       on settlement.settlement_id = bet.current_settlement_id
                    where bet.account_id = account.account_id
                      and settlement.result = 'score_hit') score_hits,
                  exists (select 1 from credit_ledger_entry ledger
                    where ledger.account_id = account.account_id
                      and ledger.reason_code = 'admin_adjustment') admin_adjusted,
                  (select max(occurred_at) from credit_ledger_entry ledger
                    where ledger.account_id = account.account_id) last_ledger_at
             from betting_enrollment enrollment
             join credit_account account on account.account_id = enrollment.account_id
             left join registered_discord_user users
               on users.guild_id = enrollment.guild_id
              and users.discord_user_id = enrollment.discord_user_id
            where enrollment.guild_id = $1
            order by (enrollment.status = 'active') desc,
                     coalesce(users.display_label, account.account_id), account.account_id
            limit 500`,
          [guildId],
        ),
        this.pool.query<{
          games: string; latest_status: string | null;
          source_updated_at: Date | null; collected_at: Date | null;
        }>(
          `select count(*)::text games,
                  (select status from kbo_game order by collected_at desc, game_id limit 1) latest_status,
                  max(source_updated_at) source_updated_at,
                  max(collected_at) collected_at
             from kbo_game`,
        ),
      ]);
      const source = provider.rows[0]!;
      return {
        accounts: accounts.rows.map((row) => ({
          accountId: row.account_id,
          displayLabel: row.display_label ?? "탈퇴 계정",
          enrollmentStatus: row.status,
          availableBalance: row.available_balance,
          correctionDebt: row.correction_debt,
          version: Number(row.version),
          dailyClaims: Number(row.daily_claims),
          bets: Number(row.bets),
          pendingBets: Number(row.pending_bets),
          settledBets: Number(row.settled_bets),
          voidBets: Number(row.void_bets),
          corrections: Number(row.corrections),
          outcomeHits: Number(row.outcome_hits),
          scoreHits: Number(row.score_hits),
          adminAdjusted: row.admin_adjusted,
          lastLedgerAt: row.last_ledger_at?.toISOString() ?? null,
        })),
        provider: {
          games: Number(source.games),
          latestStatus: source.latest_status,
          sourceUpdatedAt: source.source_updated_at?.toISOString() ?? null,
          collectedAt: source.collected_at?.toISOString() ?? null,
        },
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("dashboard_kbo_management_read_failed");
    }
  }

  async readGameStacks(): Promise<GameStacksDto> {
    try {
      const result = await this.pool.query<{ display_label: string; stack: string }>(
        `select users.display_label,
                count(incident.incident_id) filter (
                  where incident.status = 'confirmed'
                )::text stack
           from registered_discord_user users
           left join game_incident incident
             on incident.discord_user_id = users.discord_user_id
          group by users.guild_id, users.discord_user_id, users.display_label
          order by count(incident.incident_id) filter (
                     where incident.status = 'confirmed'
                   ) desc,
                   users.display_label,
                   users.discord_user_id`,
      );
      return {
        entries: result.rows.map((row) => ({
          memberLabel: row.display_label,
          stack: nonNegativeInteger(row.stack),
        })),
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("dashboard_game_stacks_read_failed");
    }
  }

  async readActiveGameObservations(): Promise<ActiveGameObservationsDto> {
    try {
      const result = await this.pool.query<GameDashboardRow>(
        `${GAME_DASHBOARD_SELECT}
          where game.ended_at is null
          order by game.started_at desc, incident.incident_id desc`,
      );
      return { entries: result.rows.map(mapActiveGameObservation) };
    } catch {
      throw new PersistenceError("dashboard_active_games_read_failed");
    }
  }

  async readGameIncidentHistory(
    input: ListGameIncidentHistoryRequestDto,
  ): Promise<GameIncidentHistoryPageDto> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        (input.status !== undefined &&
          !GAME_INCIDENT_STATUSES.includes(input.status)) ||
        (input.memberLabel !== undefined &&
          (input.memberLabel.trim() !== input.memberLabel ||
            input.memberLabel.length < 1 || input.memberLabel.length > 80 ||
            /[\r\n\0]/u.test(input.memberLabel)))) {
      throw new PersistenceError("game_incident_history_request_invalid");
    }
    const cursor = input.cursor === undefined
      ? undefined
      : decodeGameIncidentCursor(input.cursor);
    try {
      const result = await this.pool.query<GameDashboardRow>(
        `${GAME_DASHBOARD_SELECT}
          where ($1::timestamptz is null or
                 (incident.updated_at, incident.incident_id) < ($1, $2))
            and ($3::text is null or incident.status = $3)
            and ($4::text is null or users.display_label = $4)
          order by incident.updated_at desc, incident.incident_id desc
          limit $5`,
        [
          cursor?.updatedAt ?? null,
          cursor?.incidentId ?? null,
          input.status ?? null,
          input.memberLabel ?? null,
          limit + 1,
        ],
      );
      const visible = result.rows.slice(0, limit);
      const last = visible.at(-1);
      return {
        entries: visible.map((row) => ({
          ...mapActiveGameObservation(row),
          gameEndedAt: row.game_ended_at?.toISOString() ?? null,
          incidentUpdatedAt: row.incident_updated_at.toISOString(),
        })),
        ...(result.rows.length > limit && last
          ? { nextCursor: encodeGameIncidentCursor(
              last.incident_updated_at,
              last.incident_id,
            ) }
          : {}),
      };
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("dashboard_game_history_read_failed");
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
            and a.channel_id <> 'dashboard'
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

type GameDashboardRow = {
  incident_id: string;
  display_label: string;
  riot_platform_id: string | null;
  riot_game_name: string | null;
  riot_tag_line: string | null;
  game_key: string;
  riot_state: GameEvidenceStateDto | null;
  riot_observed_at: Date | null;
  go_live_state: GameEvidenceStateDto | null;
  go_live_observed_at: Date | null;
  comparison_state: GameComparisonStateDto;
  incident_status: GameIncidentStatusDto;
  incident_version: string;
  game_started_at: Date;
  game_ended_at: Date | null;
  incident_updated_at: Date;
};

const GAME_INCIDENT_STATUSES: readonly GameIncidentStatusDto[] = [
  "open",
  "confirmed",
  "corrected",
  "cancelled",
];

const GAME_DASHBOARD_SELECT = `select incident.incident_id,
  users.display_label, account.platform_id riot_platform_id,
  account.game_name riot_game_name, account.tag_line riot_tag_line,
  game.game_key, riot.state riot_state, riot.observed_at riot_observed_at,
  voice.state go_live_state,
  coalesce(voice.source_observed_at, voice.observed_at) go_live_observed_at,
  incident.comparison_state, incident.status incident_status,
  incident.version::text incident_version, game.started_at game_started_at,
  game.ended_at game_ended_at, incident.updated_at incident_updated_at
  from game_incident incident
  join riot_game game on game.game_key = incident.game_key
  join registered_discord_user users
    on users.discord_user_id = incident.discord_user_id
  left join lateral (
    select min(platform_id) platform_id, min(game_name) game_name,
           min(tag_line) tag_line
      from riot_account_link
     where discord_user_id = incident.discord_user_id and removed_at is null
    having count(*) = 1
  ) account on true
  left join lateral (
    select state, observed_at from game_observation
     where game_key = incident.game_key
       and discord_user_id = incident.discord_user_id
       and source = 'riot_spectator'
     order by observed_at desc, generation desc limit 1
  ) riot on true
  left join lateral (
    select state, observed_at, source_observed_at from game_observation
     where game_key = incident.game_key
       and discord_user_id = incident.discord_user_id
       and source = 'discord_voice'
     order by observed_at desc, generation desc limit 1
  ) voice on true`;

function mapActiveGameObservation(row: GameDashboardRow) {
  const hasRiotId = row.riot_platform_id !== null &&
    row.riot_game_name !== null && row.riot_tag_line !== null;
  return {
    incidentId: row.incident_id,
    memberLabel: row.display_label,
    riotId: hasRiotId
      ? {
          platformId: row.riot_platform_id!,
          gameName: row.riot_game_name!,
          tagLine: row.riot_tag_line!,
        }
      : null,
    gameKey: row.game_key,
    riotState: row.riot_state ?? "unknown",
    riotObservedAt: row.riot_observed_at?.toISOString() ?? null,
    goLiveState: row.go_live_state ?? "unknown",
    goLiveObservedAt: row.go_live_observed_at?.toISOString() ?? null,
    comparisonState: row.comparison_state,
    incidentStatus: row.incident_status,
    expectedVersion: nonNegativeInteger(row.incident_version),
    gameStartedAt: row.game_started_at.toISOString(),
  };
}

function nonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PersistenceError("dashboard_game_row_invalid");
  }
  return parsed;
}

function encodeGameIncidentCursor(updatedAt: Date, incidentId: string): string {
  return Buffer.from(JSON.stringify([updatedAt.toISOString(), incidentId]))
    .toString("base64url");
}

function decodeGameIncidentCursor(value: string): {
  updatedAt: string;
  incidentId: string;
} {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 ||
        typeof parsed[0] !== "string" || !Number.isFinite(Date.parse(parsed[0])) ||
        typeof parsed[1] !== "string" || parsed[1].length < 1 ||
        parsed[1].length > 160) {
      throw new Error();
    }
    return { updatedAt: parsed[0], incidentId: parsed[1] };
  } catch {
    throw new PersistenceError("game_incident_history_cursor_invalid");
  }
}
