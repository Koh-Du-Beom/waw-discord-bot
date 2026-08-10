import {
  KoreanCommandHandler,
  type CommandRequest,
  type KoreanCommandName,
} from "../../commands/command-handler.ts";

export type DiscordCommandOptions = {
  getSubcommand(required?: boolean): string | null;
  getString(name: string, required: true): string;
  getInteger?(name: string, required?: boolean): number | null;
  getUser(name: string, required?: boolean): { id: string } | null;
  getBoolean?(name: string, required?: boolean): boolean | null;
};

export type DiscordChatInputInteraction = {
  id: string;
  commandName: string;
  user: { id: string; globalName?: string | null; username?: string };
  member?: { displayName?: string } | null;
  guildId: string | null;
  channelId: string | null;
  channel: { isThread(): boolean } | null;
  options: DiscordCommandOptions;
  deferReply?(input: { ephemeral: true }): Promise<unknown>;
  editReply?(input: { content: string }): Promise<unknown>;
  reply(input: { content: string; ephemeral: true }): Promise<unknown>;
};

export function createDiscordInteractionHandler(input: {
  handler: KoreanCommandHandler;
  createCorrelationId: () => string;
}): (interaction: DiscordChatInputInteraction) => Promise<void> {
  return async (interaction) => {
    const request = normalizeInteraction(interaction, input.createCorrelationId());
    if (request.commandName === "요약") {
      if (!interaction.deferReply || !interaction.editReply) {
        throw new Error("summary interaction defer unavailable");
      }
      await interaction.deferReply({ ephemeral: true });
      const content = await input.handler.handle(request);
      await interaction.editReply({ content });
      return;
    }
    const content = await input.handler.handle(request);
    await interaction.reply({ content, ephemeral: true });
  };
}

function normalizeInteraction(
  interaction: DiscordChatInputInteraction,
  correlationId: string,
): CommandRequest {
  const guildId = interaction.guildId ?? "direct-message";
  const channelId = interaction.channelId ?? "unavailable";
  switch (interaction.commandName) {
    case "도움말":
      return request(interaction, correlationId, guildId, channelId, "도움말", {});
    case "요약":
      if (interaction.options.getSubcommand(true) === "최근") {
        return request(interaction, correlationId, guildId, channelId, "요약", {
          방식: "최근",
          범위: interaction.options.getString("범위", true),
        });
      }
      return request(interaction, correlationId, guildId, channelId, "요약", {
        방식: "직접",
        시작: interaction.options.getString("시작", true),
        종료: interaction.options.getString("종료", true),
      });
    case "라이엇계정": {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand === "연결") {
        return request(
          interaction,
          correlationId,
          guildId,
          channelId,
          "라이엇계정 연결",
          {
            계정: interaction.options.getString("계정", true),
          },
        );
      }
      if (subcommand === "목록") {
        return request(
          interaction,
          correlationId,
          guildId,
          channelId,
          "라이엇계정 목록",
          { 사용자: interaction.options.getUser("사용자")?.id },
        );
      }
      return request(
        interaction,
        correlationId,
        guildId,
        channelId,
        "라이엇계정 연결해제",
        { 계정: interaction.options.getString("계정", true) },
      );
    }
    case "크레딧": {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand !== "내정보" && subcommand !== "받기") {
        throw new Error("unsupported credit subcommand");
      }
      return request(
        interaction,
        correlationId,
        guildId,
        channelId,
        subcommand === "내정보" ? "크레딧 내정보" : "크레딧 받기",
        {},
      );
    }
    case "베팅": {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand === "가입") {
        return request(
          interaction,
          correlationId,
          guildId,
          channelId,
          "베팅 가입",
          { 동의: interaction.options.getBoolean?.("동의", true) === true ? "true" : "false" },
        );
      }
      if (subcommand === "경기" || subcommand === "내역") {
        return request(
          interaction,
          correlationId,
          guildId,
          channelId,
          subcommand === "경기" ? "베팅 경기" : "베팅 내역",
          {},
        );
      }
      if (subcommand !== "하기" || !interaction.options.getInteger) {
        throw new Error("unsupported betting subcommand");
      }
      const homeScore = interaction.options.getInteger("홈점수");
      const awayScore = interaction.options.getInteger("원정점수");
      return request(interaction, correlationId, guildId, channelId, "베팅 하기", {
        경기: interaction.options.getString("경기", true),
        결과: interaction.options.getString("결과", true),
        금액: String(interaction.options.getInteger("금액", true)),
        홈점수: homeScore === null ? undefined : String(homeScore),
        원정점수: awayScore === null ? undefined : String(awayScore),
      });
    }
    case "랭킹": {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand === null || !["크레딧", "결과", "점수", "적중률"].includes(subcommand)) {
        throw new Error("unsupported ranking subcommand");
      }
      const page = interaction.options.getInteger?.("페이지");
      return request(
        interaction,
        correlationId,
        guildId,
        channelId,
        `랭킹 ${subcommand}` as KoreanCommandName,
        {
          ...(subcommand === "크레딧" ? {} : {
            대회: interaction.options.getString("대회", true),
            시즌: interaction.options.getString("시즌", true),
          }),
          페이지: page === null || page === undefined ? undefined : String(page),
        },
      );
    }
    case "몰랭검거": {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand === "현황") {
        return request(
          interaction,
          correlationId,
          guildId,
          channelId,
          "몰랭검거 현황",
          { 사용자: interaction.options.getUser("사용자")?.id },
        );
      }
      const commandName =
        subcommand === "정정" ? "몰랭검거 정정" : "몰랭검거 취소";
      return request(interaction, correlationId, guildId, channelId, commandName, {
        사건: interaction.options.getString("사건", true),
        사유: interaction.options.getString("사유", true),
      });
    }
    default:
      throw new Error("unsupported Discord command");
  }
}

function request(
  interaction: DiscordChatInputInteraction,
  correlationId: string,
  guildId: string,
  channelId: string,
  commandName: KoreanCommandName,
  options: Readonly<Record<string, string | undefined>>,
): CommandRequest {
  return {
    eventId: `discord:${interaction.id}`,
    correlationId,
    actorId: interaction.user.id,
    actorLabel: displayName(interaction),
    guildId,
    channelId,
    isThread: interaction.channel?.isThread() ?? false,
    commandName,
    options,
    signal: new AbortController().signal,
  };
}

function displayName(interaction: DiscordChatInputInteraction): string {
  return (
    interaction.member?.displayName ??
    interaction.user.globalName ??
    interaction.user.username ??
    interaction.user.id
  ).trim().slice(0, 80) || interaction.user.id;
}
