import {
  collectCompleteConversation,
  createManifest,
  SummaryIncompleteError,
  SummaryRangeError,
  type ConversationHistoryReader,
  type ConversationSummarizer,
} from "../summary/conversation-summary.ts";
import { KOREAN_COMMAND_RESPONSES } from "./slash-commands.ts";
import type { SummaryQuotaReservationPort } from "../summary/summary-quota-contract.ts";

export type KoreanCommandName =
  | "도움말"
  | "요약"
  | "라이엇계정 연결"
  | "라이엇계정 목록"
  | "라이엇계정 연결해제"
  | "라이엇계정 승인대기목록"
  | "라이엇계정 승인"
  | "라이엇계정 거절"
  | "몰랭검거 현황"
  | "몰랭검거 정정"
  | "몰랭검거 취소";

export type CommandAuditEvent = {
  eventId: string;
  correlationId: string;
  occurredAt: Date;
  actorId: string;
  guildId: string;
  channelId: string;
  commandName: KoreanCommandName;
  outcome: "success" | "failure" | "denied";
  reasonCode: string;
};

export type CommandAuditSink = {
  append(event: CommandAuditEvent): Promise<void>;
};

export type CommandRequest = {
  eventId: string;
  correlationId: string;
  actorId: string;
  guildId: string;
  channelId: string;
  isThread: boolean;
  commandName: KoreanCommandName;
  options: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
};

export type FeatureCommandExecutor = {
  execute(request: CommandRequest): Promise<string>;
};

export class KoreanCommandHandler {
  constructor(
    private readonly input: {
      history: ConversationHistoryReader;
      summarizer?: ConversationSummarizer;
      quota?: SummaryQuotaReservationPort;
      features: FeatureCommandExecutor;
      audit: CommandAuditSink;
      now: () => Date;
    },
  ) {}

  async handle(request: CommandRequest): Promise<string> {
    let outcome: CommandAuditEvent["outcome"] = "failure";
    let reasonCode = "command_failed";
    try {
      const response =
        request.commandName === "도움말"
          ? KOREAN_COMMAND_RESPONSES.help
          : request.commandName === "요약"
          ? await this.summary(request)
          : await this.input.features.execute(request);
      outcome = "success";
      reasonCode = "completed";
      return response;
    } catch (error) {
      const failure = commandFailure(error);
      outcome = failure.outcome;
      reasonCode = failure.reasonCode;
      return failure.message;
    } finally {
      await this.input.audit.append({
        eventId: request.eventId,
        correlationId: request.correlationId,
        occurredAt: this.input.now(),
        actorId: request.actorId,
        guildId: request.guildId,
        channelId: request.channelId,
        commandName: request.commandName,
        outcome,
        reasonCode,
      });
    }
  }

  private async summary(request: CommandRequest): Promise<string> {
    const start = new Date(request.options["시작"] ?? "");
    const end = new Date(request.options["종료"] ?? "");
    if (!this.input.summarizer) {
      throw new CommandFailure(
        "provider_unavailable",
        KOREAN_COMMAND_RESPONSES.providerUnavailable,
      );
    }
    const messages = await collectCompleteConversation({
      reader: this.input.history,
      channelId: request.channelId,
      start,
      end,
      signal: request.signal,
    });
    if (this.input.quota) {
      const decision = await this.input.quota.reserve({
        operationId: request.eventId,
        guildId: request.guildId,
        discordUserId: request.actorId,
        receivedAt: this.input.now(),
      });
      if (decision.kind === "cooldown" ||
          (decision.kind === "duplicate" && decision.decision === "cooldown")) {
        throw new CommandFailure(
          "summary_quota_cooldown",
          "요약은 사용자별로 1시간에 한 번 사용할 수 있습니다.",
          "denied",
        );
      }
    }
    const sections = await this.input.summarizer.summarize({
      messages,
      manifest: createManifest(messages, 100),
      signal: request.signal,
    });
    return [
      section("핵심 논의", sections.coreDiscussion),
      section("결정", sections.decisions),
      section("할 일", sections.actionItems),
      section("미해결", sections.unresolved),
    ].join("\n\n");
  }
}

export class CommandFailure extends Error {
  constructor(
    readonly reasonCode: string,
    readonly userMessage: string,
    readonly outcome: "failure" | "denied" = "failure",
  ) {
    super("command failed");
    this.name = "CommandFailure";
  }
}

function commandFailure(error: unknown): {
  outcome: "failure" | "denied";
  reasonCode: string;
  message: string;
} {
  if (error instanceof CommandFailure) {
    return {
      outcome: error.outcome,
      reasonCode: error.reasonCode,
      message: error.userMessage,
    };
  }
  if (error instanceof SummaryRangeError) {
    return {
      outcome: "failure",
      reasonCode: "invalid_summary_range",
      message: KOREAN_COMMAND_RESPONSES.invalidRange,
    };
  }
  if (error instanceof SummaryIncompleteError) {
    return {
      outcome: "failure",
      reasonCode: "summary_range_incomplete",
      message: KOREAN_COMMAND_RESPONSES.incompleteSummary,
    };
  }
  return {
    outcome: "failure",
    reasonCode: "command_failed",
    message: "명령을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}

function section(title: string, items: readonly string[]): string {
  return `**${title}**\n${
    items.length === 0 ? "- 없음" : items.map((item) => `- ${item}`).join("\n")
  }`;
}
