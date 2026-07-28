import {
  collectCompleteConversation,
  createManifest,
  SummaryCapacityError,
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
    const { start, end } = summaryRange(request.options, this.input.now());
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
    if (messages.length === 0) {
      throw new CommandFailure(
        "summary_range_empty",
        "선택한 시간 범위에 요약할 대화가 없습니다. 더 긴 범위를 선택해 주세요.",
      );
    }
    if (messages.every((message) => message.content.trim().length === 0)) {
      throw new CommandFailure(
        "summary_content_unavailable",
        "읽을 수 있는 대화 본문이 없습니다. 봇의 메시지 콘텐츠 권한을 확인해 주세요.",
      );
    }
    const summaryInput = {
      messages,
      manifest: createManifest(messages, 100),
      signal: request.signal,
    };
    this.input.summarizer.validate?.(summaryInput);
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
    const sections = await this.input.summarizer.summarize(summaryInput);
    return [
      section("핵심 논의", sections.coreDiscussion),
      section("결정", sections.decisions),
      section("할 일", sections.actionItems),
      section("미해결", sections.unresolved),
    ].join("\n\n");
  }
}

const RECENT_RANGES_MS: Readonly<Record<string, number>> = {
  "10분": 10 * 60_000,
  "30분": 30 * 60_000,
  "1시간": 60 * 60_000,
  "3시간": 3 * 60 * 60_000,
  "6시간": 6 * 60 * 60_000,
  "12시간": 12 * 60 * 60_000,
  "24시간": 24 * 60 * 60_000,
};

export function summaryRange(
  options: Readonly<Record<string, string | undefined>>,
  now: Date,
): { start: Date; end: Date } {
  if (options["방식"] === "최근") {
    const duration = RECENT_RANGES_MS[options["범위"] ?? ""];
    if (!duration) throw new SummaryRangeError("invalid recent range");
    return { start: new Date(now.getTime() - duration), end: new Date(now) };
  }
  if (options["방식"] !== "직접") {
    throw new SummaryRangeError("invalid summary mode");
  }
  const start = koreanWallTime(options["시작"] ?? "", now);
  const end = koreanWallTime(options["종료"] ?? "", now);
  if (!(start < end) || end > now || end.getTime() - start.getTime() > 24 * 60 * 60_000) {
    throw new SummaryRangeError("invalid direct range");
  }
  return { start, end };
}

function koreanWallTime(value: string, now: Date): Date {
  const match = /^(?:(오늘|어제)\s+)?([01]\d|2[0-3]):([0-5]\d)$/u.exec(value.trim());
  if (!match) throw new SummaryRangeError("invalid Korean wall time");
  const korea = new Date(now.getTime() + 9 * 60 * 60_000);
  const dayOffset = match[1] === "어제" ? -1 : 0;
  return new Date(Date.UTC(
    korea.getUTCFullYear(),
    korea.getUTCMonth(),
    korea.getUTCDate() + dayOffset,
    Number(match[2]) - 9,
    Number(match[3]),
  ));
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
  if (error instanceof SummaryCapacityError) {
    return {
      outcome: "failure",
      reasonCode: "summary_range_too_large",
      message: "요약 범위가 처리 한도를 넘었습니다. 더 짧은 범위로 다시 요청해 주세요.",
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
