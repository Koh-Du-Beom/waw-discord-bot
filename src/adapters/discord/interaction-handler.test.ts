import assert from "node:assert/strict";
import test from "node:test";

import { KoreanCommandHandler, type CommandRequest } from "../../commands/command-handler.ts";
import {
  createDiscordInteractionHandler,
  type DiscordChatInputInteraction,
} from "./interaction-handler.ts";

test("normalizes Korean Discord subcommands and replies in Korean without registration", async () => {
  const requests: CommandRequest[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: {
      async execute(request) {
        requests.push(request);
        return "🚨 몰랭 현황을 확인했습니다.";
      },
    },
    audit: { async append() {} },
    now: () => new Date("2026-07-25T00:00:00Z"),
  });
  const listen = createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "correlation",
  });
  const interaction: DiscordChatInputInteraction = {
    id: "9001",
    commandName: "몰랭검거",
    user: { id: "9002" },
    guildId: "9003",
    channelId: "9004",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "현황",
      getString: () => {
        throw new Error("string option not requested");
      },
      getUser: () => ({ id: "9005" }),
    },
    async reply(value) {
      replies.push(value);
    },
  };
  await listen(interaction);
  assert.equal(requests[0]?.commandName, "몰랭검거 현황");
  assert.equal(requests[0]?.options["사용자"], "9005");
  assert.deepEqual(replies, [
    { content: "🚨 몰랭 현황을 확인했습니다.", ephemeral: true },
  ]);
});
