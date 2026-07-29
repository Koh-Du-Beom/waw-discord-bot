import {
  KoreanCommandHandler,
  type CommandRequest,
  type KoreanCommandName,
} from "../../commands/command-handler.ts";

export type DiscordCommandOptions = {
  getSubcommand(required?: boolean): string | null;
  getString(name: string, required: true): string;
  getUser(name: string, required?: boolean): { id: string } | null;
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
