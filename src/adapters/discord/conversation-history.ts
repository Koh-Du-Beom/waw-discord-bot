import {
  SummaryIncompleteError,
  type ConversationHistoryReader,
  type ConversationMessage,
  type MessagePage,
} from "../../summary/conversation-summary.ts";

export type DiscordHistoryMessage = {
  id: string;
  content: string;
  createdTimestamp: number;
  author: { id: string };
};

export type DiscordHistoryChannel = {
  messages: {
    fetch(options: {
      limit: 100;
      before?: string;
      cache: false;
    }): Promise<Iterable<DiscordHistoryMessage>>;
  };
};

export type DiscordHistoryChannelResolver = {
  resolve(channelId: string): Promise<DiscordHistoryChannel | undefined>;
};

export class DiscordHistoryReadError extends SummaryIncompleteError {
  constructor(readonly reasonCode: string) {
    super("Discord history is incomplete");
    this.name = "DiscordHistoryReadError";
  }
}

export function createDiscordConversationHistoryReader(
  resolver: DiscordHistoryChannelResolver,
): ConversationHistoryReader {
  return {
    async readPage(input): Promise<MessagePage> {
      try {
        const channel = await resolver.resolve(input.channelId);
        if (!channel) throw new DiscordHistoryReadError("channel_unavailable");
        const fetched = await channel.messages.fetch({
          limit: 100,
          ...(input.before === undefined ? {} : { before: input.before }),
          cache: false,
        });
        const values = [...fetched];
        validatePage(values);
        const messages = values
          .map(mapMessage)
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime() ||
              right.id.localeCompare(left.id),
          );
        const oldest = messages.at(-1);
        return {
          messages,
          ...(messages.length === 100 && oldest
            ? { before: oldest.id }
            : {}),
          complete: messages.length < 100,
        };
      } catch (error) {
        if (error instanceof DiscordHistoryReadError) throw error;
        throw new DiscordHistoryReadError(providerReason(error));
      }
    },
  };
}

function validatePage(messages: readonly DiscordHistoryMessage[]): void {
  if (messages.length > 100) throw new DiscordHistoryReadError("page_oversized");
  const ids = new Set<string>();
  for (const message of messages) {
    if (
      !/^\d{1,32}$/.test(message.id) ||
      !/^\d{1,32}$/.test(message.author.id) ||
      typeof message.content !== "string" ||
      !Number.isFinite(message.createdTimestamp) ||
      ids.has(message.id)
    ) {
      throw new DiscordHistoryReadError("page_invalid");
    }
    ids.add(message.id);
  }
}

function mapMessage(message: DiscordHistoryMessage): ConversationMessage {
  return {
    id: message.id,
    createdAt: new Date(message.createdTimestamp),
    authorLabel: message.author.id,
    content: message.content,
  };
}

function providerReason(error: unknown): string {
  if (typeof error !== "object" || error === null) return "discord_history_failure";
  const value = error as { code?: unknown; status?: unknown; name?: unknown };
  if (value.status === 429) return "discord_rate_limited";
  if (value.status === 401 || value.status === 403) return "discord_permission_denied";
  if (value.code === 10_003 || value.code === "10003") return "channel_unavailable";
  if (value.name === "AbortError") return "discord_history_timeout";
  return "discord_history_failure";
}
