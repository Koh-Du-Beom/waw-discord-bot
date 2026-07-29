import type { CurrentAuthorizationReader } from "../auth/member-role-ipc.ts";
import type {
  AdminCommandName,
  AdminCommandReasonCode,
  AdminCommandRequest,
  AdminCommandResponse,
  PendingRiotLinkIpcItem,
} from "../contracts/admin-command-ipc.ts";
import type { CommandAuditEvent } from "../commands/command-handler.ts";
import type {
  PendingRiotLinkRequest,
  PuuidValidationPort,
} from "../riot/riot-admin-executor.ts";

export type TerminalAdminCommandResult = {
  operationId: string;
  commandName: AdminCommandName;
  outcome: "success" | "denied" | "conflict" | "failure";
  reasonCode: AdminCommandReasonCode;
  completedAt: Date;
};

export type AdminCommandApplicationStore = {
  listPendingPageWithResult(input: {
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
  >;
  findPending(requestId: string): Promise<PendingRiotLinkRequest | undefined>;
  approveRequestWithAudit(input: {
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
  >;
  rejectRequestWithAudit(input: {
    operationId: string;
    requestId: string;
    expectedVersion: number;
    administratorId: string;
    decidedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<"rejected" | "stale" | "request_unavailable" | "duplicate_operation">;
  removeLinkWithAudit(input: {
    operationId: string;
    linkId: string;
    expectedVersion: number;
    administratorId: string;
    removedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<"removed" | "not_found" | "stale" | "duplicate_operation">;
  recordAdminAudit(
    event: CommandAuditEvent,
    commandName?: AdminCommandName,
  ): Promise<void>;
  findAdminCommandResult(
    operationId: string,
  ): Promise<TerminalAdminCommandResult | undefined>;
};

export class AdminCommandApplication {
  constructor(
    private readonly input: {
      authorization: CurrentAuthorizationReader;
      validator: PuuidValidationPort;
      store: AdminCommandApplicationStore;
      displayName?: (discordUserId: string) => Promise<string | undefined>;
      now: () => Date;
    },
  ) {}

  async execute(request: AdminCommandRequest): Promise<AdminCommandResponse> {
    const receivedAt = this.input.now();
    if (request.expiresAt.getTime() <= receivedAt.getTime()) {
      await this.input.store.recordAdminAudit(
        audit(request, receivedAt, "failure", "request_expired"),
        request.command,
      );
      return failure(request, "denied", "request_expired");
    }
    const authorization =
      await this.input.authorization.readCurrentAuthorization({
        actorId: request.actorId,
        guildId: request.guildId,
      });
    if (
      authorization.kind !== "authorized" ||
      authorization.authorizationTier !== "administrator"
    ) {
      await this.input.store.recordAdminAudit(
        audit(request, receivedAt, "denied", "administrator_required"),
        request.command,
      );
      return failure(request, "denied", "administrator_required");
    }
    if (request.command !== "operation_status") {
      const existing = await this.input.store.findAdminCommandResult(
        request.operationId,
      );
      if (existing) return terminalResponse(request, existing);
    }
    switch (request.command) {
      case "riot_link_request_list":
        return this.list(request, receivedAt);
      case "riot_link_request_approve":
        return this.approve(request, receivedAt);
      case "riot_link_request_reject":
        return this.reject(request, receivedAt);
      case "riot_link_remove":
        return this.remove(request, receivedAt);
      case "operation_status":
        return this.operationStatus(request, receivedAt);
    }
  }

  private async list(
    request: Extract<AdminCommandRequest, { command: "riot_link_request_list" }>,
    occurredAt: Date,
  ): Promise<AdminCommandResponse> {
    const afterRequestId =
      request.payload.cursor === undefined
        ? undefined
        : decodeCursor(request.payload.cursor);
    if (request.payload.cursor !== undefined && afterRequestId === undefined) {
      await this.input.store.recordAdminAudit(
        audit(request, occurredAt, "failure", "request_malformed"),
        request.command,
      );
      return failure(request, "denied", "request_malformed");
    }
    const page = await this.input.store.listPendingPageWithResult({
      operationId: request.operationId,
      actorId: request.actorId,
      guildId: request.guildId,
      limit: request.payload.limit,
      ...(afterRequestId === undefined ? {} : { afterRequestId }),
      occurredAt,
      audit: audit(request, occurredAt, "success", "completed"),
    });
    if (page.kind === "duplicate") {
      return terminalResponse(request, page.result);
    }
    if (page.kind === "cursor_invalid") {
      return failure(request, "denied", "request_malformed");
    }
    return {
      ...responseBase(request),
      outcome: "success",
      reasonCode: "completed",
      result: {
        kind: "riot_link_request_page",
        requests: await Promise.all(page.requests.map(async (item) =>
          mapPending(item, await this.input.displayName?.(item.discordUserId))
        )),
        ...(page.nextRequestId === undefined
          ? {}
          : { nextCursor: encodeCursor(page.nextRequestId) }),
      },
    };
  }

  private async approve(
    request: Extract<AdminCommandRequest, { command: "riot_link_request_approve" }>,
    occurredAt: Date,
  ): Promise<AdminCommandResponse> {
    const pending = await this.input.store.findPending(request.payload.requestId);
    if (!pending) {
      await this.input.store.recordAdminAudit(
        audit(request, occurredAt, "failure", "riot_link_request_unavailable"),
        request.command,
      );
      return failure(request, "unavailable", "riot_link_request_unavailable");
    }
    let validation: Awaited<ReturnType<PuuidValidationPort["validate"]>>;
    try {
      validation = this.input.validator.resolve
        ? await this.input.validator.resolve({
            gameName: pending.gameName,
            tagLine: pending.tagLine,
            platformId: pending.platformId,
          })
        : await this.input.validator.validate({
            puuid: pending.gameName,
            platformId: pending.platformId,
          });
    } catch {
      await this.input.store.recordAdminAudit(
        audit(request, occurredAt, "failure", "validator_unavailable"),
        request.command,
      );
      return failure(request, "unavailable", "validator_unavailable");
    }
    if (validation.kind === "invalid") {
      await this.input.store.recordAdminAudit(
        audit(request, occurredAt, "failure", validation.reasonCode),
        request.command,
      );
      return failure(request, "denied", validation.reasonCode);
    }
    const result = await this.input.store.approveRequestWithAudit({
      operationId: request.operationId,
      requestId: request.payload.requestId,
      expectedVersion: request.payload.expectedVersion,
      linkId: `link:${request.operationId}`,
      puuid: validation.normalizedPuuid,
      administratorId: request.actorId,
      decidedAt: occurredAt,
      audit: audit(request, occurredAt, "success", "completed"),
    });
    if (result === "duplicate_operation") {
      return terminalResponse(
        request,
        await this.input.store.findAdminCommandResult(request.operationId),
      );
    }
    if (result === "approved") {
      return {
        ...responseBase(request),
        outcome: "success",
        reasonCode: "completed",
        result: { kind: "riot_link_decision", status: "approved" },
      };
    }
    return result === "stale"
      ? failure(request, "conflict", "riot_link_request_stale")
      : result === "puuid_conflict"
        ? failure(request, "conflict", "riot_active_puuid_conflict")
        : failure(request, "unavailable", "riot_link_request_unavailable");
  }

  private async reject(
    request: Extract<AdminCommandRequest, { command: "riot_link_request_reject" }>,
    occurredAt: Date,
  ): Promise<AdminCommandResponse> {
    const result = await this.input.store.rejectRequestWithAudit({
      operationId: request.operationId,
      requestId: request.payload.requestId,
      expectedVersion: request.payload.expectedVersion,
      administratorId: request.actorId,
      decidedAt: occurredAt,
      audit: audit(request, occurredAt, "success", "completed"),
    });
    if (result === "duplicate_operation") {
      return terminalResponse(
        request,
        await this.input.store.findAdminCommandResult(request.operationId),
      );
    }
    if (result === "rejected") {
      return {
        ...responseBase(request),
        outcome: "success",
        reasonCode: "completed",
        result: { kind: "riot_link_decision", status: "rejected" },
      };
    }
    return result === "stale"
      ? failure(request, "conflict", "riot_link_request_stale")
      : failure(request, "unavailable", "riot_link_request_unavailable");
  }

  private async operationStatus(
    request: Extract<AdminCommandRequest, { command: "operation_status" }>,
    occurredAt: Date,
  ): Promise<AdminCommandResponse> {
    const terminal = await this.input.store.findAdminCommandResult(
      request.payload.operationId,
    );
    await this.input.store.recordAdminAudit(
      audit(request, occurredAt, "success", "completed"),
      request.command,
    );
    return {
      ...responseBase(request),
      outcome: "success",
      reasonCode: "completed",
      result: {
        kind: "operation_status",
        status: terminal?.outcome ?? "unknown",
        reasonCode: terminal?.reasonCode ?? "operation_unknown",
      },
    };
  }

  private async remove(
    request: Extract<AdminCommandRequest, { command: "riot_link_remove" }>,
    occurredAt: Date,
  ): Promise<AdminCommandResponse> {
    const result = await this.input.store.removeLinkWithAudit({
      operationId: request.operationId,
      linkId: request.payload.linkId,
      expectedVersion: request.payload.expectedVersion,
      administratorId: request.actorId,
      removedAt: occurredAt,
      audit: audit(request, occurredAt, "success", "completed"),
    });
    if (result === "duplicate_operation") {
      return terminalResponse(
        request,
        await this.input.store.findAdminCommandResult(request.operationId),
      );
    }
    if (result === "removed") {
      return {
        ...responseBase(request),
        outcome: "success",
        reasonCode: "completed",
        result: { kind: "riot_link_removal", status: "removed" },
      };
    }
    return result === "stale"
      ? failure(request, "conflict", "riot_link_stale")
      : failure(request, "unavailable", "riot_link_not_found");
  }
}

function terminalResponse(
  request: AdminCommandRequest,
  terminal: TerminalAdminCommandResult | undefined,
): AdminCommandResponse {
  if (!terminal) return failure(request, "duplicate", "operation_duplicate");
  return {
    ...responseBase(request),
    outcome: "success",
    reasonCode: "completed",
    result: {
      kind: "operation_status",
      status: terminal.outcome,
      reasonCode: terminal.reasonCode,
    },
  };
}

function failure(
  request: AdminCommandRequest,
  outcome: "denied" | "conflict" | "duplicate" | "unavailable" | "outcome_unknown",
  reasonCode: AdminCommandReasonCode,
): AdminCommandResponse {
  return { ...responseBase(request), outcome, reasonCode };
}

function responseBase(request: AdminCommandRequest) {
  return {
    version: 1 as const,
    requestId: request.requestId,
    operationId: request.operationId,
  };
}

function audit(
  request: AdminCommandRequest,
  occurredAt: Date,
  outcome: CommandAuditEvent["outcome"],
  reasonCode: AdminCommandReasonCode,
): CommandAuditEvent {
  return {
    eventId: request.operationId,
    correlationId: request.requestId,
    occurredAt,
    actorId: request.actorId,
    guildId: request.guildId,
    channelId: "dashboard",
    commandName:
      request.command === "riot_link_request_list"
        ? "라이엇계정 승인대기목록"
        : request.command === "riot_link_request_approve"
          ? "라이엇계정 승인"
          : request.command === "riot_link_request_reject"
          ? "라이엇계정 거절"
          : request.command === "riot_link_remove"
            ? "라이엇계정 연결해제"
            : "라이엇계정 승인대기목록",
    outcome,
    reasonCode,
  };
}

function mapPending(
  item: PendingRiotLinkRequest,
  displayName?: string,
): PendingRiotLinkIpcItem {
  return {
    requestId: item.requestId,
    discordUserId: item.discordUserId,
    requesterLabel: displayName?.trim().slice(0, 80) || item.discordUserId,
    platformId: item.platformId,
    gameName: item.gameName,
    tagLine: item.tagLine,
    requestedAt: item.requestedAt.toISOString(),
    version: item.version,
  };
}

function encodeCursor(requestId: string): string {
  return Buffer.from(requestId, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string | undefined {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    return Buffer.from(decoded, "utf8").toString("base64url") === cursor &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(decoded)
      ? decoded
      : undefined;
  } catch {
    return undefined;
  }
}
