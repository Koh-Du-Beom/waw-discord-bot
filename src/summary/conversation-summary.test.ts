import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCompleteConversation,
  createManifest,
  SummaryIncompleteError,
  SummaryRangeError,
  validateSummaryRange,
  type ConversationMessage,
} from "./conversation-summary.ts";

const message = (index: number): ConversationMessage => ({
  id: String(index).padStart(4, "0"),
  createdAt: new Date(Date.UTC(2026, 6, 25, 12, 0, index)),
  authorLabel: `사용자-${index}`,
  content: `원문-${index}`,
});

test("collects over 100 messages with stable cursor pagination and exact range", async () => {
  const newestFirst = Array.from({ length: 205 }, (_, index) => message(index)).reverse();
  const pages = [newestFirst.slice(0, 100), newestFirst.slice(100, 200), newestFirst.slice(200)];
  let call = 0;
  const values = await collectCompleteConversation({
    reader: {
      async readPage() {
        const messages = pages[call] ?? [];
        call += 1;
        return {
          messages,
          ...(call < pages.length ? { before: `cursor-${call}` } : {}),
          complete: call >= pages.length,
        };
      },
    },
    channelId: "channel",
    start: new Date("2026-07-25T12:00:00Z"),
    end: new Date("2026-07-25T12:04:00Z"),
    signal: new AbortController().signal,
  });
  assert.equal(values.length, 205);
  assert.deepEqual(createManifest(values, 100), [
    { firstOrdinal: 0, lastOrdinal: 99, count: 100 },
    { firstOrdinal: 100, lastOrdinal: 199, count: 100 },
    { firstOrdinal: 200, lastOrdinal: 204, count: 5 },
  ]);
});

test("fails explicitly for an unverified cursor and a range over 24 hours", async () => {
  validateSummaryRange(new Date("2026-07-25T00:00:00Z"), new Date("2026-07-26T00:00:00Z"));
  assert.throws(
    () =>
      validateSummaryRange(
        new Date("2026-07-25T00:00:00Z"),
        new Date("2026-07-26T00:00:00.001Z"),
      ),
    SummaryRangeError,
  );
  await assert.rejects(
    collectCompleteConversation({
      reader: {
        async readPage() {
          return { messages: [message(0)], before: "same", complete: false };
        },
      },
      channelId: "channel",
      start: new Date("2026-07-25T00:00:00Z"),
      end: new Date("2026-07-26T00:00:00Z"),
      signal: new AbortController().signal,
    }),
    SummaryIncompleteError,
  );
});
