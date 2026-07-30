export type DiscordAnnouncementChannel = {
  send(input: {
    content: string;
    allowedMentions: { users: readonly string[] };
  }): Promise<unknown>;
};

export function createGameViolationAnnouncer(input: {
  channelId: string;
  resolveChannel: (
    channelId: string,
  ) => Promise<DiscordAnnouncementChannel | undefined>;
}) {
  return {
    async notify(violation: {
      guildId: string;
      discordUserId: string;
    }): Promise<void> {
      const channel = await input.resolveChannel(input.channelId);
      if (channel === undefined) throw new Error("game alert channel unavailable");
      await channel.send({
        content:
          "🚨🚨🚨🚨🚨🚨🚨 몰랭검거!!!! 🚨🚨🚨🚨🚨🚨🚨\n" +
          `<@${violation.discordUserId}> 님의 몰랭이 적발되었습니다!`,
        allowedMentions: { users: [violation.discordUserId] },
      });
    },
  };
}
