import type { Pool, PoolClient } from "pg";

import type { CommandAuditEvent } from "../commands/command-handler.ts";
import type {
  RiotCommandStore,
  RiotLinkListItem,
  RiotPendingRequestItem,
} from "../riot/riot-command-executor.ts";
import type {
  PendingRiotLinkRequest,
  RiotAdminStore,
} from "../riot/riot-admin-executor.ts";
import type {
  AdminCommandApplicationStore,
  TerminalAdminCommandResult,
} from "../ipc/admin-command-application.ts";
import type {
  AdminCommandName,
  AdminCommandReasonCode,
} from "../contracts/admin-command-ipc.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresRiotCommandStore
  implements RiotCommandStore, RiotAdminStore, AdminCommandApplicationStore
{
  constructor(private readonly pool: Pool) {}

  async requestLinkWithAudit(
    input: Parameters<RiotCommandStore["requestLinkWithAudit"]>[0],
  ): Promise<"created" | "already_linked" | "already_pending" | "duplicate_operation"> {
    return this.transaction("riot_link_request_failed", async (client) => {
      if (!(await claimOperation(client, input.operationId, input.discordUserId, input.requestedAt))) {
        return "duplicate_operation";
      }
      const active = await client.query(
        `select 1
           from riot_account_link
          where discord_user_id = $1
            and lower(platform_id) = lower($2)
            and lower(game_name) = lower($3)
            and lower(tag_line) = lower($4)
            and removed_at is null
          limit 1`,
        [input.discordUserId, input.platformId, input.gameName, input.tagLine],
      );
      if (active.rowCount === 1) {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_link_already_active",
        });
        return "already_linked";
      }
      const inserted = await client.query(
        `insert into riot_account_link_request (
          request_id, operation_id, discord_user_id, platform_id, game_name,
          tag_line, status, requested_at
        ) values ($1,$2,$3,$4,$5,$6,'pending_admin_approval',$7)
        on conflict do nothing`,
        [
          input.requestId,
          input.operationId,
          input.discordUserId,
          input.platformId,
          input.gameName,
          input.tagLine,
          input.requestedAt,
        ],
      );
      const created = inserted.rowCount === 1;
      await appendAudit(client, {
        ...input.audit,
        outcome: created ? "success" : "failure",
        reasonCode: created ? "riot_link_requested" : "riot_link_already_pending",
      });
      return created ? "created" : "already_pending";
    });
  }

  async list(input: {
    discordUserId: string;
    includePending: boolean;
  }): Promise<readonly (RiotLinkListItem | RiotPendingRequestItem)[]> {
    try {
      const active = await this.pool.query<{
        link_id: string;
        game_name: string;
        tag_line: string;
        platform_id: string;
        verification_method: RiotLinkListItem["verificationMethod"];
        is_primary: boolean;
      }>(
        `select link_id, game_name, tag_line, platform_id, verification_method, is_primary
           from riot_account_link
          where discord_user_id = $1 and removed_at is null
          order by is_primary desc, created_at, link_id`,
        [input.discordUserId],
      );
      const items: (RiotLinkListItem | RiotPendingRequestItem)[] =
        active.rows.map((row) => ({
          kind: "active",
          linkId: row.link_id,
          gameName: row.game_name,
          tagLine: row.tag_line,
          platformId: row.platform_id,
          verificationMethod: row.verification_method,
          isPrimary: row.is_primary,
        }));
      if (input.includePending) {
        const pending = await this.pool.query<{
          request_id: string;
          game_name: string;
          tag_line: string;
          platform_id: string;
        }>(
          `select request_id, game_name, tag_line, platform_id
             from riot_account_link_request
            where discord_user_id = $1 and status = 'pending_admin_approval'
            order by requested_at, request_id`,
          [input.discordUserId],
        );
        items.push(...pending.rows.map((row) => ({
          kind: "pending" as const,
          requestId: row.request_id,
          gameName: row.game_name,
          tagLine: row.tag_line,
          platformId: row.platform_id,
        })));
      }
      return items;
    } catch {
      throw new PersistenceError("riot_link_list_failed");
    }
  }

  async unlinkWithAudit(
    input: Parameters<RiotCommandStore["unlinkWithAudit"]>[0],
  ): Promise<"removed" | "not_found" | "duplicate_operation"> {
    return this.transaction("riot_link_unlink_failed", async (client) => {
      if (!(await claimOperation(client, input.operationId, input.discordUserId, input.removedAt))) {
        return "duplicate_operation";
      }
      const removed = await client.query(
        `update riot_account_link
            set removed_at = $3, is_primary = false
          where link_id = $1 and discord_user_id = $2 and removed_at is null`,
        [input.linkId, input.discordUserId, input.removedAt],
      );
      const found = removed.rowCount === 1;
      await appendAudit(client, {
        ...input.audit,
        outcome: found ? "success" : "failure",
        reasonCode: found ? "riot_link_removed" : "riot_link_not_found",
      });
      return found ? "removed" : "not_found";
    });
  }

  async listPending(): Promise<readonly PendingRiotLinkRequest[]> {
    try {
      const result = await this.pool.query<PendingRequestRow>(
        `${PENDING_REQUEST_SELECT}
          where status = 'pending_admin_approval'
          order by requested_at, request_id`,
      );
      return result.rows.map(mapPendingRequest);
    } catch {
      throw new PersistenceError("riot_link_pending_list_failed");
    }
  }

  async findPending(
    requestId: string,
  ): Promise<PendingRiotLinkRequest | undefined> {
    try {
      const result = await this.pool.query<PendingRequestRow>(
        `${PENDING_REQUEST_SELECT}
          where request_id = $1 and status = 'pending_admin_approval'`,
        [requestId],
      );
      const row = result.rows[0];
      return row && mapPendingRequest(row);
    } catch {
      throw new PersistenceError("riot_link_pending_read_failed");
    }
  }

  async listPendingPageWithResult(input: {
    operationId: string;
    actorId: string;
    guildId: string;
    limit: number;
    afterRequestId?: string;
    occurredAt: Date;
    audit: CommandAuditEvent;
  }): Promise<
    | {
        kind: "page";
        requests: readonly PendingRiotLinkRequest[];
        nextRequestId?: string;
      }
    | { kind: "duplicate"; result?: TerminalAdminCommandResult }
    | { kind: "cursor_invalid" }
  > {
    return this.transaction("riot_link_pending_page_failed", async (client) => {
      if (!(await claimOperation(client, input.operationId, input.actorId, input.occurredAt))) {
        const result = await findAdminCommandResult(client, input.operationId);
        return {
          kind: "duplicate" as const,
          ...(result === undefined ? {} : { result }),
        };
      }
      let anchor: { requested_at: Date; request_id: string } | undefined;
      if (input.afterRequestId !== undefined) {
        const found = await client.query<{
          requested_at: Date;
          request_id: string;
        }>(
          `select requested_at, request_id
             from riot_account_link_request
            where request_id = $1 and status = 'pending_admin_approval'`,
          [input.afterRequestId],
        );
        anchor = found.rows[0];
        if (!anchor) {
          const event = {
            ...input.audit,
            outcome: "failure" as const,
            reasonCode: "request_malformed",
          };
          await appendAudit(client, event);
          await appendAdminCommandResult(client, {
            operationId: input.operationId,
            commandName: "riot_link_request_list",
            outcome: "denied",
            reasonCode: "request_malformed",
            completedAt: input.occurredAt,
          });
          return { kind: "cursor_invalid" as const };
        }
      }
      const result = await client.query<PendingRequestRow>(
        `${PENDING_REQUEST_SELECT}
          where status = 'pending_admin_approval'
            and (
              $1::timestamptz is null
              or (requested_at, request_id) > ($1::timestamptz, $2::text)
            )
          order by requested_at, request_id
          limit $3`,
        [
          anchor?.requested_at ?? null,
          anchor?.request_id ?? null,
          input.limit + 1,
        ],
      );
      const hasNext = result.rows.length > input.limit;
      const rows = result.rows.slice(0, input.limit);
      await appendAudit(client, input.audit);
      await appendAdminCommandResult(client, {
        operationId: input.operationId,
        commandName: "riot_link_request_list",
        outcome: "success",
        reasonCode: "completed",
        completedAt: input.occurredAt,
      });
      return {
        kind: "page" as const,
        requests: rows.map(mapPendingRequest),
        ...(hasNext && rows.at(-1)
          ? { nextRequestId: rows.at(-1)!.request_id }
          : {}),
      };
    });
  }

  async approveRequestWithAudit(input: {
    operationId: string;
    requestId: string;
    expectedVersion: number;
    linkId: string;
    puuid: string;
    administratorId: string;
    decidedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<
    "approved" | "puuid_conflict" | "stale" | "request_unavailable" | "duplicate_operation"
  > {
    return this.transaction("riot_link_approval_failed", async (client) => {
      if (!(await claimOperation(client, input.operationId, input.administratorId, input.decidedAt))) {
        return "duplicate_operation";
      }
      const request = await client.query<{
        discord_user_id: string;
        platform_id: string;
        game_name: string;
        tag_line: string;
        status: string;
        version: string;
      }>(
        `select discord_user_id, platform_id, game_name, tag_line,
                status, version::text
           from riot_account_link_request
          where request_id = $1
          for update`,
        [input.requestId],
      );
      const row = request.rows[0];
      if (!row || row.status !== "pending_admin_approval") {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_link_request_unavailable",
        });
        await appendAdminCommandResult(client, terminal(
          input, "riot_link_request_approve", "failure",
          "riot_link_request_unavailable",
        ));
        return "request_unavailable";
      }
      if (Number(row.version) !== input.expectedVersion) {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_link_request_stale",
        });
        await appendAdminCommandResult(client, terminal(
          input, "riot_link_request_approve", "conflict",
          "riot_link_request_stale",
        ));
        return "stale";
      }
      const link = await client.query(
        `insert into riot_account_link (
          link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
          verification_method, is_primary, approved_by, created_at
        ) values (
          $1,$2,$3,$4,$5,$6,'admin_approved_unverified',
          not exists (
            select 1 from riot_account_link
             where discord_user_id = $2 and removed_at is null
          ),
          $7,$8
        )
        on conflict do nothing`,
        [
          input.linkId,
          row.discord_user_id,
          input.puuid,
          row.platform_id,
          row.game_name,
          row.tag_line,
          input.administratorId,
          input.decidedAt,
        ],
      );
      if (link.rowCount !== 1) {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_active_puuid_conflict",
        });
        await appendAdminCommandResult(client, terminal(
          input, "riot_link_request_approve", "conflict",
          "riot_active_puuid_conflict",
        ));
        return "puuid_conflict";
      }
      await client.query(
        `update riot_account_link_request
            set status = 'approved', decided_at = $2, decided_by = $3,
                approved_link_id = $4, version = version + 1
          where request_id = $1 and version = $5`,
        [
          input.requestId,
          input.decidedAt,
          input.administratorId,
          input.linkId,
          input.expectedVersion,
        ],
      );
      await appendAudit(client, {
        ...input.audit,
        outcome: "success",
        reasonCode: "riot_link_approved",
      });
      await appendAdminCommandResult(client, terminal(
        input, "riot_link_request_approve", "success", "completed",
      ));
      return "approved";
    });
  }

  async rejectRequestWithAudit(input: {
    operationId: string;
    requestId: string;
    expectedVersion: number;
    administratorId: string;
    decidedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<"rejected" | "stale" | "request_unavailable" | "duplicate_operation"> {
    return this.transaction("riot_link_rejection_failed", async (client) => {
      if (!(await claimOperation(client, input.operationId, input.administratorId, input.decidedAt))) {
        return "duplicate_operation";
      }
      const request = await client.query<{ status: string; version: string }>(
        `select status, version::text
           from riot_account_link_request
          where request_id = $1
          for update`,
        [input.requestId],
      );
      const row = request.rows[0];
      if (!row || row.status !== "pending_admin_approval") {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_link_request_unavailable",
        });
        await appendAdminCommandResult(client, terminal(
          input, "riot_link_request_reject", "failure",
          "riot_link_request_unavailable",
        ));
        return "request_unavailable";
      }
      if (Number(row.version) !== input.expectedVersion) {
        await appendAudit(client, {
          ...input.audit,
          outcome: "failure",
          reasonCode: "riot_link_request_stale",
        });
        await appendAdminCommandResult(client, terminal(
          input, "riot_link_request_reject", "conflict",
          "riot_link_request_stale",
        ));
        return "stale";
      }
      await client.query(
        `update riot_account_link_request
            set status = 'rejected', decided_at = $2, decided_by = $3,
                version = version + 1
          where request_id = $1 and version = $4`,
        [input.requestId, input.decidedAt, input.administratorId, input.expectedVersion],
      );
      await appendAudit(client, {
        ...input.audit,
        outcome: "success",
        reasonCode: "riot_link_rejected",
      });
      await appendAdminCommandResult(client, terminal(
        input, "riot_link_request_reject", "success", "completed",
      ));
      return "rejected";
    });
  }

  async recordAdminAudit(
    event: CommandAuditEvent,
    commandName?: AdminCommandName,
  ): Promise<void> {
    await this.transaction("riot_admin_audit_failed", async (client) => {
      const claimed = await claimOperation(
        client,
        event.eventId,
        event.actorId,
        event.occurredAt,
      );
      if (claimed) {
        await appendAudit(client, event);
        await appendAdminCommandResult(client, {
          operationId: event.eventId,
          commandName: commandName ?? adminCommandName(event.commandName),
          outcome:
            event.outcome === "success"
              ? "success"
              : event.outcome === "denied"
                ? "denied"
                : event.reasonCode.includes("stale") ||
                    event.reasonCode.includes("conflict")
                  ? "conflict"
                  : "failure",
          reasonCode: terminalReasonCode(event.reasonCode),
          completedAt: event.occurredAt,
        });
      }
    });
  }

  async findAdminCommandResult(
    operationId: string,
  ): Promise<TerminalAdminCommandResult | undefined> {
    try {
      return await findAdminCommandResult(this.pool, operationId);
    } catch {
      throw new PersistenceError("admin_command_result_read_failed");
    }
  }

  private async transaction<T>(
    reasonCode: string,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await action(client);
      await client.query("commit");
      return result;
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError(reasonCode);
    } finally {
      client.release();
    }
  }
}

type PendingRequestRow = {
  request_id: string;
  discord_user_id: string;
  platform_id: string;
  game_name: string;
  tag_line: string;
  requested_at: Date;
  version: string;
};

const PENDING_REQUEST_SELECT = `select request_id, discord_user_id, platform_id,
  game_name, tag_line, requested_at, version::text
  from riot_account_link_request`;

function mapPendingRequest(row: PendingRequestRow): PendingRiotLinkRequest {
  return {
    requestId: row.request_id,
    discordUserId: row.discord_user_id,
    platformId: row.platform_id,
    gameName: row.game_name,
    tagLine: row.tag_line,
    requestedAt: row.requested_at,
    version: Number(row.version),
  };
}

async function claimOperation(
  client: PoolClient,
  operationId: string,
  actorId: string,
  acceptedAt: Date,
): Promise<boolean> {
  const result = await client.query(
    `insert into operation_ledger (
      operation_id, actor_id, accepted_at, outcome, reason_code
    ) values ($1,$2,$3,'accepted','accepted')
    on conflict do nothing`,
    [operationId, actorId, acceptedAt],
  );
  return result.rowCount === 1;
}

async function appendAudit(
  client: PoolClient,
  event: CommandAuditEvent,
): Promise<void> {
  await client.query(
    `insert into audit_event (
      event_id, operation_id, occurred_at, event_type, actor_id, outcome,
      reason_code, correlation_id, guild_id, channel_id, command_name
    ) values ($1,$1,$2,'discord.command',$3,$4,$5,$6,$7,$8,$9)
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
}

async function appendAdminCommandResult(
  client: PoolClient,
  result: TerminalAdminCommandResult,
): Promise<void> {
  await client.query(
    `insert into admin_command_result (
      operation_id, command_name, outcome, reason_code, completed_at
    ) values ($1,$2,$3,$4,$5)`,
    [
      result.operationId,
      result.commandName,
      result.outcome,
      result.reasonCode,
      result.completedAt,
    ],
  );
}

async function findAdminCommandResult(
  queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  operationId: string,
): Promise<TerminalAdminCommandResult | undefined> {
  const result = await queryable.query<{
    operation_id: string;
    command_name: AdminCommandName;
    outcome: TerminalAdminCommandResult["outcome"];
    reason_code: AdminCommandReasonCode;
    completed_at: Date;
  }>(
    `select operation_id, command_name, outcome, reason_code, completed_at
       from admin_command_result
      where operation_id = $1`,
    [operationId],
  );
  const row = result.rows[0];
  return row && {
    operationId: row.operation_id,
    commandName: row.command_name,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    completedAt: row.completed_at,
  };
}

function terminal(
  input: { operationId: string; decidedAt: Date },
  commandName: AdminCommandName,
  outcome: TerminalAdminCommandResult["outcome"],
  reasonCode: AdminCommandReasonCode,
): TerminalAdminCommandResult {
  return {
    operationId: input.operationId,
    commandName,
    outcome,
    reasonCode,
    completedAt: input.decidedAt,
  };
}

function adminCommandName(
  commandName: CommandAuditEvent["commandName"],
): AdminCommandName {
  switch (commandName) {
    case "라이엇계정 승인":
      return "riot_link_request_approve";
    case "라이엇계정 거절":
      return "riot_link_request_reject";
    default:
      return "riot_link_request_list";
  }
}

function terminalReasonCode(reasonCode: string): AdminCommandReasonCode {
  const allowlisted = new Set<AdminCommandReasonCode>([
    "completed",
    "administrator_required",
    "request_expired",
    "request_malformed",
    "request_unavailable",
    "operation_duplicate",
    "operation_unknown",
    "riot_link_request_stale",
    "riot_link_request_unavailable",
    "riot_active_puuid_conflict",
    "invalid_puuid",
    "platform_mismatch",
    "validator_unavailable",
    "persistence_unavailable",
  ]);
  if (allowlisted.has(reasonCode as AdminCommandReasonCode)) {
    return reasonCode as AdminCommandReasonCode;
  }
  if (reasonCode === "riot_link_approved" || reasonCode === "riot_link_rejected") {
    return "completed";
  }
  return "request_unavailable";
}
