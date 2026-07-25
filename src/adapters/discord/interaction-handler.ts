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
  user: { id: string };
  guildId: string | null;
  channelId: string | null;
  channel: { isThread(): boolean } | null;
  options: DiscordCommandOptions;
  reply(input: { content: string; ephemeral: true }): Promise<unknown>;
};

export function createDiscordInteractionHandler(input: {
  handler: KoreanCommandHandler;
  createCorrelationId: () => string;
}): (interaction: DiscordChatInputInteraction) => Promise<void> {
  return async (interaction) => {
    const request = normalizeInteraction(interaction, input.createCorrelationId());
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
    case "요약":
      return request(interaction, correlationId, guildId, channelId, "요약", {
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
            라이엇아이디: interaction.options.getString("라이엇아이디", true),
            플랫폼: interaction.options.getString("플랫폼", true),
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
    guildId,
    channelId,
    isThread: interaction.channel?.isThread() ?? false,
    commandName,
    options,
    signal: new AbortController().signal,
  };
}
