import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AuditEventsDto,
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
