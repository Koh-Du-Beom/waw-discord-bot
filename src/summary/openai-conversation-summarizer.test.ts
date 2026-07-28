import assert from "node:assert/strict";
import test from "node:test";

import { OpenAiConversationSummarizer } from "./openai-conversation-summarizer.ts";

test("sends synthetic conversation with store false and parses structured sections", async () => {
  let request: Request | undefined;
  const summarizer = new OpenAiConversationSummarizer(
    "sk-synthetic-summary-canary",
    async (input, init) => {
      request = new Request(input, init);
      return Response.json({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              coreDiscussion: ["합성 토론"],
              decisions: ["합성 결정"],
              actionItems: ["합성 할 일"],
              unresolved: [],
            }),
          }],
        }],
      });
    },
  );

  const result = await summarizer.summarize({
    messages: [{
      id: "synthetic-message",
      createdAt: new Date("2026-07-27T00:00:00Z"),
      authorLabel: "합성 사용자",
      content: "실제 Discord 원문이 아닌 합성 메시지",
    }],
    manifest: [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }],
    signal: new AbortController().signal,
  });

  const body = JSON.parse(await request!.text()) as Record<string, any>;
  assert.equal(request!.url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, "gpt-5.4-mini-2026-03-17");
  assert.equal(body.store, false);
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.text.format.type, "json_schema");
  assert.match(body.instructions, /marker.*정확히 한 번/u);
  assert.match(body.instructions, /CORE.*coreDiscussion/u);
  assert.match(body.input, /실제 Discord 원문이 아닌 합성 메시지/u);
  assert.deepEqual(result, {
    coreDiscussion: ["합성 토론"],
    decisions: ["합성 결정"],
    actionItems: ["합성 할 일"],
    unresolved: [],
  });
});

test("fails closed before dispatch when the coverage manifest has a gap", async () => {
  let called = false;
  const summarizer = new OpenAiConversationSummarizer(
    "sk-synthetic-summary-canary",
    async () => {
      called = true;
      return Response.json({});
    },
  );

  await assert.rejects(
    summarizer.summarize({
      messages: [{
        id: "synthetic-message",
        createdAt: new Date("2026-07-27T00:00:00Z"),
        authorLabel: "합성 사용자",
        content: "합성 메시지",
      }],
      manifest: [],
      signal: new AbortController().signal,
    }),
    /summary_manifest_invalid/u,
  );
  assert.equal(called, false);
});

test("aborts a provider call at the bounded deadline", async () => {
  const summarizer = new OpenAiConversationSummarizer(
    "sk-synthetic-summary-canary",
    async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
    1,
  );

  await assert.rejects(
    summarizer.summarize({
      messages: [{
        id: "synthetic-message",
        createdAt: new Date("2026-07-27T00:00:00Z"),
        authorLabel: "합성 사용자",
        content: "합성 메시지",
      }],
      manifest: [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }],
      signal: new AbortController().signal,
    }),
    /timeout|aborted/iu,
  );
});

test("rejects oversized input before provider dispatch", async () => {
  let called = false;
  const summarizer = new OpenAiConversationSummarizer(
    "sk-synthetic-summary-canary",
    async () => {
      called = true;
      return Response.json({});
    },
  );

  await assert.rejects(
    summarizer.summarize({
      messages: [{
        id: "synthetic-message",
        createdAt: new Date("2026-07-27T00:00:00Z"),
        authorLabel: "합성 사용자",
        content: "가".repeat(100_000),
      }],
      manifest: [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }],
      signal: new AbortController().signal,
    }),
    /provider budget/u,
  );
  assert.equal(called, false);
});
