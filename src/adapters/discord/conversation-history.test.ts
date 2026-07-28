import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiscordConversationHistoryReader,
  DiscordHistoryReadError,
  type DiscordHistoryMessage,
} from "./conversation-history.ts";

const discordMessage = (index: number): DiscordHistoryMessage => ({
  id: String(10_000 + index),
  content: `메시지-${index}`,
  createdTimestamp: Date.UTC(2026, 6, 25, 0, 0, index),
  author: { id: String(20_000 + index) },
});

test("uses a stable oldest-message cursor without caching raw messages", async () => {
  const calls: unknown[] = [];
  const messages = Array.from({ length: 100 }, (_, index) => discordMessage(index));
  const reader = createDiscordConversationHistoryReader({
    async resolve() {
      return {
        messages: {
          async fetch(options) {
            calls.push(options);
            return new Map(messages.map((message) => [message.id, message]));
          },
        },
      };
    },
  });
  const page = await reader.readPage({ channelId: "123", limit: 100 });
  assert.equal(page.messages.length, 100);
  assert.equal(page.complete, false);
  assert.equal(page.before, "10000");
  assert.deepEqual(calls, [{ limit: 100, cache: false }]);
});

test("maps permission, rate limit and malformed pages to non-reflective incomplete errors", async () => {
  for (const fixture of [
    { status: 403, secret: "permission-body-canary" },
    { status: 429, secret: "rate-body-canary" },
  ]) {
    const reader = createDiscordConversationHistoryReader({
      async resolve() {
        return {
        messages: {
          async fetch() {
            throw fixture;
            },
          },
        };
      },
    });
    let failure: unknown;
    try {
      await reader.readPage({ channelId: "123", limit: 100 });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure instanceof DiscordHistoryReadError, true);
    assert.equal(JSON.stringify(failure).includes(fixture.secret), false);
  }

  const malformed = createDiscordConversationHistoryReader({
    async resolve() {
      return {
        messages: {
          async fetch() {
            const messages = [
              { ...discordMessage(1), id: "same" },
              { ...discordMessage(2), id: "same" },
            ];
            return new Map(messages.map((message, index) => [String(index), message]));
          },
        },
      };
    },
  });
  await assert.rejects(
    malformed.readPage({ channelId: "123", limit: 100 }),
    DiscordHistoryReadError,
  );
});
