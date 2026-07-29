import { Events } from "discord.js";

import type { DiscordMemberLabel } from "../../persistence/discord-member-label-store.ts";

type Listener = (...arguments_: readonly unknown[]) => void;

export type DiscordMemberLabelSource = {
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
};

export async function refreshReconciledMemberLabels(input: {
  guildId: string;
  members: Iterable<{ id: string; displayName: string }>;
  observedAt: Date;
  refreshKnown(
    members: readonly DiscordMemberLabel[],
    observedAt: Date,
  ): Promise<void>;
}): Promise<void> {
  await input.refreshKnown(
    Array.from(input.members, (member) => ({
      guildId: input.guildId,
      discordUserId: member.id,
      displayLabel: member.displayName,
    })),
    input.observedAt,
  );
}

export function attachDiscordMemberLabelSync(input: {
  source: DiscordMemberLabelSource;
  allowedGuildId: string;
  refreshKnown(
    members: readonly DiscordMemberLabel[],
    observedAt: Date,
  ): Promise<void>;
  now: () => Date;
  reportFailure(): void;
}): { detach(): Promise<void>; whenIdle(): Promise<void> } {
  let queue = Promise.resolve();
  const listener: Listener = (...arguments_) => {
    const member = arguments_[1] as {
      id?: string;
      displayName?: string;
      guild?: { id?: string };
    } | undefined;
    if (
      member?.guild?.id !== input.allowedGuildId ||
      typeof member.id !== "string" ||
      typeof member.displayName !== "string"
    ) return;
    queue = queue
      .then(() => input.refreshKnown([{
        guildId: input.allowedGuildId,
        discordUserId: member.id!,
        displayLabel: member.displayName!,
      }], input.now()))
      .catch(() => input.reportFailure());
  };
  input.source.on(Events.GuildMemberUpdate, listener);
  return {
    async detach() {
      input.source.off(Events.GuildMemberUpdate, listener);
      await queue;
    },
    async whenIdle() {
      await queue;
    },
  };
}
