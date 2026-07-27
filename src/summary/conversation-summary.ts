export type ConversationMessage = {
  id: string;
  createdAt: Date;
  authorLabel: string;
  content: string;
};

export type MessagePage = {
  messages: readonly ConversationMessage[];
  before?: string;
  complete: boolean;
};

export type ConversationHistoryReader = {
  readPage(input: {
    channelId: string;
    before?: string;
    limit: 100;
  }): Promise<MessagePage>;
};

export type SummarySections = {
  coreDiscussion: readonly string[];
  decisions: readonly string[];
  actionItems: readonly string[];
  unresolved: readonly string[];
};

export type ConversationSummarizer = {
  validate?(input: {
    messages: readonly ConversationMessage[];
    manifest: readonly SummaryChunkManifest[];
    signal: AbortSignal;
  }): void;
  summarize(input: {
    messages: readonly ConversationMessage[];
    manifest: readonly SummaryChunkManifest[];
    signal: AbortSignal;
  }): Promise<SummarySections>;
};

export type SummaryChunkManifest = {
  firstOrdinal: number;
  lastOrdinal: number;
  count: number;
};

export class SummaryRangeError extends Error {}
export class SummaryIncompleteError extends Error {}
export class SummaryCapacityError extends Error {}

export function validateSummaryRange(start: Date, end: Date): void {
  const duration = end.getTime() - start.getTime();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    duration <= 0 ||
    duration > 24 * 60 * 60 * 1000
  ) {
    throw new SummaryRangeError("invalid summary range");
  }
}

export async function collectCompleteConversation(input: {
  reader: ConversationHistoryReader;
  channelId: string;
  start: Date;
  end: Date;
  signal: AbortSignal;
}): Promise<ConversationMessage[]> {
  validateSummaryRange(input.start, input.end);
  const collected = new Map<string, ConversationMessage>();
  let before: string | undefined;
  let previousCursor: string | undefined;
  for (;;) {
    if (input.signal.aborted) throw input.signal.reason;
    const page = await input.reader.readPage({
      channelId: input.channelId,
      ...(before === undefined ? {} : { before }),
      limit: 100,
    });
    for (const message of page.messages) {
      if (
        message.createdAt >= input.start &&
        message.createdAt < input.end
      ) {
        collected.set(message.id, message);
      }
    }
    const oldest = page.messages.at(-1);
    if (oldest === undefined) {
      if (!page.complete) throw new SummaryIncompleteError("empty incomplete page");
      break;
    }
    if (oldest.createdAt < input.start) break;
    if (page.complete) break;
    before = page.before;
    if (before === undefined || before === previousCursor) {
      throw new SummaryIncompleteError("pagination cursor did not advance");
    }
    previousCursor = before;
  }
  return [...collected.values()].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}

export function createManifest(
  messages: readonly ConversationMessage[],
  chunkSize: number,
): SummaryChunkManifest[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunk size must be positive");
  }
  const manifest: SummaryChunkManifest[] = [];
  for (let first = 0; first < messages.length; first += chunkSize) {
    const last = Math.min(first + chunkSize, messages.length) - 1;
    manifest.push({ firstOrdinal: first, lastOrdinal: last, count: last - first + 1 });
  }
  return manifest;
}
