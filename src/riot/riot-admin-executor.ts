import type { AuthorizationTier } from "../contracts/local-command.ts";
import type { CommandAuditEvent } from "../commands/command-handler.ts";

export type PendingRiotLinkRequest = {
  requestId: string;
  discordUserId: string;
  platformId: string;
  gameName: string;
  tagLine: string;
  requestedAt: Date;
  version: number;
};

export type PuuidValidationPort = {
  validate(input: {
    puuid: string;
    platformId: string;
  }): Promise<
    | { kind: "valid"; normalizedPuuid: string }
    | { kind: "invalid"; reasonCode: "invalid_puuid" | "platform_mismatch" }
  >;
};

export type RiotAdminStore = {
  listPending(): Promise<readonly PendingRiotLinkRequest[]>;
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
  recordAdminAudit(event: CommandAuditEvent): Promise<void>;
};

type AdminContext = {
  operationId: string;
  correlationId: string;
  actorId: string;
  authorizationTier: AuthorizationTier;
  guildId: string;
  channelId: string;
};

export class RiotAdminExecutor {
  constructor(
    private readonly store: RiotAdminStore,
    private readonly validator: PuuidValidationPort,
    private readonly now: () => Date,
  ) {}

  async list(context: AdminContext): Promise<readonly PendingRiotLinkRequest[]> {
    await this.requireAdministrator(context, "라이엇계정 승인대기목록");
    return this.store.listPending();
  }

  async approve(input: AdminContext & {
    requestId: string;
    expectedVersion: number;
    linkId: string;
    puuid: string;
  }): Promise<string> {
    await this.requireAdministrator(input, "라이엇계정 승인");
    const pending = await this.store.findPending(input.requestId);
    if (!pending) {
      await this.store.recordAdminAudit(
        audit(input, this.now(), "라이엇계정 승인", "failure", "riot_link_request_unavailable"),
      );
      return "승인 대기 요청을 찾을 수 없거나 이미 결정되었습니다.";
    }
    const validation = await this.validator.validate({
      puuid: input.puuid,
      platformId: pending.platformId,
    });
    if (validation.kind === "invalid") {
      await this.store.recordAdminAudit(
        audit(input, this.now(), "라이엇계정 승인", "failure", validation.reasonCode),
      );
      return "PUUID 검증에 실패하여 요청을 승인하지 않았습니다.";
    }
    const decidedAt = this.now();
    const result = await this.store.approveRequestWithAudit({
      operationId: input.operationId,
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      linkId: input.linkId,
      puuid: validation.normalizedPuuid,
      administratorId: input.actorId,
      decidedAt,
      audit: audit(input, decidedAt, "라이엇계정 승인", "success", "riot_link_approved"),
    });
    switch (result) {
      case "approved":
        return "라이엇 계정 연결 요청을 승인했습니다. 소유권 미검증 상태로 표시됩니다.";
      case "puuid_conflict":
        return "같은 PUUID가 이미 다른 활성 사용자에게 연결되어 승인하지 않았습니다.";
      case "stale":
        return "요청이 목록 조회 이후 변경되었습니다. 새로 조회한 뒤 다시 시도해 주세요.";
      case "request_unavailable":
        return "승인 대기 요청을 찾을 수 없거나 이미 결정되었습니다.";
      case "duplicate_operation":
        return "이미 처리한 관리자 작업입니다.";
    }
  }

  async reject(input: AdminContext & {
    requestId: string;
    expectedVersion: number;
  }): Promise<string> {
    await this.requireAdministrator(input, "라이엇계정 거절");
    const decidedAt = this.now();
    const result = await this.store.rejectRequestWithAudit({
      operationId: input.operationId,
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      administratorId: input.actorId,
      decidedAt,
      audit: audit(input, decidedAt, "라이엇계정 거절", "success", "riot_link_rejected"),
    });
    switch (result) {
      case "rejected":
        return "라이엇 계정 연결 요청을 거절했습니다.";
      case "stale":
        return "요청이 목록 조회 이후 변경되었습니다. 새로 조회한 뒤 다시 시도해 주세요.";
      case "request_unavailable":
        return "승인 대기 요청을 찾을 수 없거나 이미 결정되었습니다.";
      case "duplicate_operation":
        return "이미 처리한 관리자 작업입니다.";
    }
  }

  private async requireAdministrator(
    context: AdminContext,
    commandName:
      | "라이엇계정 승인대기목록"
      | "라이엇계정 승인"
      | "라이엇계정 거절",
  ): Promise<void> {
    if (context.authorizationTier === "administrator") return;
    await this.store.recordAdminAudit(
      audit(context, this.now(), commandName, "denied", "administrator_required"),
    );
    throw new RiotAdminAuthorizationError();
  }
}

export class RiotAdminAuthorizationError extends Error {
  constructor() {
    super("administrator required");
    this.name = "RiotAdminAuthorizationError";
  }
}

function audit(
  context: Pick<AdminContext, "operationId" | "correlationId" | "actorId" | "guildId" | "channelId">,
  occurredAt: Date,
  commandName: CommandAuditEvent["commandName"],
  outcome: CommandAuditEvent["outcome"],
  reasonCode: string,
): CommandAuditEvent {
  return {
    eventId: context.operationId,
    correlationId: context.correlationId,
    occurredAt,
    actorId: context.actorId,
    guildId: context.guildId,
    channelId: context.channelId,
    commandName,
    outcome,
    reasonCode,
  };
}
