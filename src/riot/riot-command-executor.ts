import {
  CommandFailure,
  type CommandAuditEvent,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";

export type RiotLinkListItem = {
  kind: "active";
  linkId: string;
  gameName: string;
  tagLine: string;
  platformId: string;
  verificationMethod: "admin_approved_unverified" | "rso_verified";
  isPrimary: boolean;
};

export type RiotPendingRequestItem = {
  kind: "pending";
  requestId: string;
  gameName: string;
  tagLine: string;
  platformId: string;
};

export type RiotCommandStore = {
  requestLinkWithAudit(input: {
    requestId: string;
    operationId: string;
    discordUserId: string;
    platformId: string;
    gameName: string;
    tagLine: string;
    requestedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<"created" | "already_linked" | "already_pending" | "duplicate_operation">;
  list(input: {
    discordUserId: string;
    includePending: boolean;
  }): Promise<readonly (RiotLinkListItem | RiotPendingRequestItem)[]>;
  unlinkWithAudit(input: {
    operationId: string;
    linkId: string;
    discordUserId: string;
    removedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<"removed" | "not_found" | "duplicate_operation">;
};

export class RiotCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly store: RiotCommandStore,
    private readonly now: () => Date,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    switch (request.commandName) {
      case "라이엇계정 연결":
        return this.requestLink(request);
      case "라이엇계정 목록":
        return this.list(request);
      case "라이엇계정 연결해제":
        return this.unlink(request);
      default:
        throw new CommandFailure(
          "feature_not_configured",
          "이 기능은 아직 운영 환경에 연결되지 않았습니다.",
        );
    }
  }

  private async requestLink(request: CommandRequest): Promise<string> {
    const { gameName, tagLine } = parseRiotId(required(request, "계정"));
    const occurredAt = this.now();
    const result = await this.store.requestLinkWithAudit({
      requestId: `request:${request.eventId}`,
      operationId: request.eventId,
      discordUserId: request.actorId,
      platformId: "KR",
      gameName,
      tagLine,
      requestedAt: occurredAt,
      audit: audit(request, occurredAt, "success", "riot_link_requested"),
    });
    if (result === "created") {
      return "라이엇 계정 연결 요청을 등록했습니다. 관리자 승인 전까지 `승인 대기`로 표시됩니다.";
    }
    if (result === "already_linked") {
      return "같은 라이엇 계정이 이미 연결되어 있어 새 승인 요청을 만들지 않았습니다.";
    }
    return result === "already_pending"
      ? "같은 라이엇 계정의 관리자 승인 요청이 이미 대기 중입니다."
      : "이미 처리한 명령입니다.";
  }

  private async list(request: CommandRequest): Promise<string> {
    const target = request.options["사용자"] ?? request.actorId;
    const items = await this.store.list({
      discordUserId: target,
      includePending: target === request.actorId,
    });
    if (items.length === 0) return "표시할 라이엇 계정이나 승인 대기 요청이 없습니다.";
    return items
      .map((item) =>
        item.kind === "pending"
          ? `- ${item.gameName}#${item.tagLine} (${item.platformId}) · 승인 대기`
          : `- ${item.gameName}#${item.tagLine} (${item.platformId}) · ${
              item.verificationMethod === "rso_verified"
                ? "RSO 인증"
                : "관리자 승인·소유권 미검증"
            }${item.isPrimary ? " · 대표" : ""}`,
      )
      .join("\n");
  }

  private async unlink(request: CommandRequest): Promise<string> {
    const linkId = required(request, "계정");
    const occurredAt = this.now();
    const result = await this.store.unlinkWithAudit({
      operationId: request.eventId,
      linkId,
      discordUserId: request.actorId,
      removedAt: occurredAt,
      audit: audit(request, occurredAt, "success", "riot_link_removed"),
    });
    if (result === "removed") return "라이엇 계정 연결을 해제했습니다.";
    return result === "not_found"
      ? "해제할 수 있는 본인 소유의 활성 연결을 찾지 못했습니다."
      : "이미 처리한 명령입니다.";
  }
}

function required(request: CommandRequest, name: string): string {
  const value = request.options[name]?.trim();
  if (!value) throw new CommandFailure("invalid_command_input", "필수 입력값을 확인해 주세요.");
  return value;
}

function parseRiotId(value: string): { gameName: string; tagLine: string } {
  const separator = value.lastIndexOf("#");
  const gameName = value.slice(0, separator).trim();
  const tagLine = value.slice(separator + 1).trim().toUpperCase();
  if (
    separator <= 0 ||
    gameName.length > 32 ||
    /[\r\n\0/]/u.test(gameName) ||
    !/^[A-Z0-9]{2,8}$/u.test(tagLine)
  ) {
    throw new CommandFailure(
      "invalid_riot_id",
      "화면에 표시되는 Riot ID를 `이름#태그` 형식으로 입력해 주세요. 예: 이름#KR1",
    );
  }
  return { gameName, tagLine };
}

function audit(
  request: CommandRequest,
  occurredAt: Date,
  outcome: CommandAuditEvent["outcome"],
  reasonCode: string,
): CommandAuditEvent {
  return {
    eventId: request.eventId,
    correlationId: request.correlationId,
    occurredAt,
    actorId: request.actorId,
    guildId: request.guildId,
    channelId: request.channelId,
    commandName: request.commandName,
    outcome,
    reasonCode,
  };
}
