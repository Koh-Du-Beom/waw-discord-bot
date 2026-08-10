import { randomUUID } from "node:crypto";
import { Events } from "discord.js";

import type { KboDepartureStore } from "../../kbo/departure.ts";

type Listener = (...arguments_: readonly unknown[]) => void;

export type KboDepartureSource = {
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
};

export async function reconcileKboDepartures(input: {
  guildId: string;
  currentDiscordUserIds: Iterable<string>;
  store: KboDepartureStore;
  now: () => Date;
  generateId?: () => string;
}): Promise<void> {
  const current = new Set(input.currentDiscordUserIds);
  for (const discordUserId of await input.store.listActiveDiscordUserIds(input.guildId)) {
    if (!current.has(discordUserId)) {
      await input.store.depart({
        operationId: (input.generateId ?? randomUUID)(),
        guildId: input.guildId,
        discordUserId,
        departedAt: input.now(),
      });
    }
  }
}

export function attachKboDepartureSync(input: {
  source: KboDepartureSource;
  allowedGuildId: string;
  store: KboDepartureStore;
  now: () => Date;
  generateId?: () => string;
  reportFailure(): void;
}): { detach(): Promise<void>; whenIdle(): Promise<void> } {
  let queue = Promise.resolve();
  const listener: Listener = (...arguments_) => {
    const member = arguments_[0] as { id?: string; guild?: { id?: string } } | undefined;
    if (member?.guild?.id !== input.allowedGuildId || typeof member.id !== "string") return;
    queue = queue
      .then(() => input.store.depart({
        operationId: (input.generateId ?? randomUUID)(),
        guildId: input.allowedGuildId,
        discordUserId: member.id!,
        departedAt: input.now(),
      }))
      .then(() => undefined)
      .catch(() => input.reportFailure());
  };
  input.source.on(Events.GuildMemberRemove, listener);
  return {
    async detach() {
      input.source.off(Events.GuildMemberRemove, listener);
      await queue;
    },
    async whenIdle() { await queue; },
  };
}
