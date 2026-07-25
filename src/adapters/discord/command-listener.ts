import { Events } from "discord.js";

import type {
  DiscordChatInputInteraction,
} from "./interaction-handler.ts";

type DiscordInteraction = {
  isChatInputCommand(): boolean;
};

export type DiscordInteractionSource = {
  on(event: string, listener: (...arguments_: readonly unknown[]) => void): unknown;
  off(event: string, listener: (...arguments_: readonly unknown[]) => void): unknown;
};

export type DiscordCommandListener = {
  detach(): Promise<void>;
  whenIdle(): Promise<void>;
};

export function attachDiscordCommandListener(input: {
  source: DiscordInteractionSource;
  handle: (interaction: DiscordChatInputInteraction) => Promise<void>;
  reportFailure: (reason: "command_dispatch_failed") => void;
}): DiscordCommandListener {
  let detached = false;
  let eventQueue = Promise.resolve();
  const listener = (...arguments_: readonly unknown[]): void => {
    const interaction = arguments_[0];
    if (
      typeof interaction !== "object" ||
      interaction === null ||
      !("isChatInputCommand" in interaction) ||
      typeof interaction.isChatInputCommand !== "function"
    ) {
      input.reportFailure("command_dispatch_failed");
      return;
    }
    if (detached || !interaction.isChatInputCommand()) return;
    eventQueue = eventQueue
      .then(() =>
        input.handle(interaction as DiscordInteraction & DiscordChatInputInteraction),
      )
      .catch(() => input.reportFailure("command_dispatch_failed"));
  };
  input.source.on(Events.InteractionCreate, listener);
  return {
    async detach(): Promise<void> {
      if (detached) return;
      detached = true;
      input.source.off(Events.InteractionCreate, listener);
      await eventQueue;
    },
    async whenIdle(): Promise<void> {
      await eventQueue;
    },
  };
}
