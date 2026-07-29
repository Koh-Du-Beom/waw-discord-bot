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
    user: { id: "9002", username: "계정명" },
    member: { displayName: "서버 닉네임" },
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
  assert.equal(requests[0]?.actorLabel, "서버 닉네임");
  assert.equal(requests[0]?.options["사용자"], "9005");
  assert.deepEqual(replies, [
    { content: "🚨 몰랭 현황을 확인했습니다.", ephemeral: true },
  ]);
});

test("replies to 도움말 with private Korean usage guidance and audits it", async () => {
  const audits: string[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: {
      async execute() {
        throw new Error("help must not invoke a feature executor");
      },
    },
    audit: { async append(event) { audits.push(event.commandName); } },
    now: () => new Date("2026-07-27T00:00:00Z"),
  });
  const listen = createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "help-correlation",
  });
  const interaction: DiscordChatInputInteraction = {
    id: "9101",
    commandName: "도움말",
    user: { id: "9102" },
    guildId: "9103",
    channelId: "9104",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => {
        throw new Error("subcommand not requested");
      },
      getString: () => {
        throw new Error("string option not requested");
      },
      getUser: () => {
        throw new Error("user option not requested");
      },
    },
    async reply(value) {
      replies.push(value);
    },
  };

  await listen(interaction);

  assert.equal(audits[0], "도움말");
  assert.equal(replies.length, 1);
  const reply = replies[0] as { content: string; ephemeral: boolean };
  assert.equal(reply.ephemeral, true);
  assert.match(reply.content, /\/요약/);
  assert.match(reply.content, /\/라이엇계정 연결/);
  assert.match(reply.content, /\/몰랭검거 현황/);
  assert.match(reply.content, /관리자 전용/);
});

test("normalizes the Riot link display ID from the registered 계정 option", async () => {
  const requests: CommandRequest[] = [];
  const requestedOptions: string[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: {
      async execute(request) {
        requests.push(request);
        return "연결 요청을 등록했습니다.";
      },
    },
    audit: { async append() {} },
    now: () => new Date("2026-07-27T00:00:00Z"),
  });
  const listen = createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "riot-correlation",
  });

  await listen({
    id: "9201",
    commandName: "라이엇계정",
    user: { id: "9202" },
    guildId: "9203",
    channelId: "9204",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "연결",
      getString(name) {
        requestedOptions.push(name);
        if (name !== "계정") throw new Error("unexpected option");
        return "표시 이름#KR1";
      },
      getUser: () => null,
    },
    async reply() {},
  });

  assert.deepEqual(requestedOptions, ["계정"]);
  assert.deepEqual(requests[0]?.options, { 계정: "표시 이름#KR1" });
});

test("defers summary before waiting for provider work", async () => {
  const calls: string[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        calls.push("history");
        return {
          messages: [{
            id: "9305",
            createdAt: new Date("2026-07-26T23:30:00Z"),
            authorLabel: "사용자",
            content: "합성 대화",
          }],
          complete: true,
        };
      },
    },
    summarizer: {
      async summarize() {
        calls.push("provider");
        return {
          coreDiscussion: [],
          decisions: [],
          actionItems: [],
          unresolved: [],
        };
      },
    },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append() {} },
    now: () => new Date("2026-07-27T00:00:00Z"),
  });
  const listen = createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "summary-correlation",
  });

  await listen({
    id: "9301",
    commandName: "요약",
    user: { id: "9302" },
    guildId: "9303",
    channelId: "9304",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "최근",
      getString: () => "1시간",
      getUser: () => null,
    },
    async deferReply() {
      calls.push("defer");
    },
    async editReply() {
      calls.push("edit");
    },
    async reply() {
      throw new Error("summary must edit deferred reply");
    },
  });

  assert.deepEqual(calls, ["defer", "history", "provider", "edit"]);
});
