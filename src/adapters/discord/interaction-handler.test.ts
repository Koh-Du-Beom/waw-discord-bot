import assert from "node:assert/strict";
import test from "node:test";

import { KoreanCommandHandler, type CommandRequest } from "../../commands/command-handler.ts";
import {
  createDiscordInteractionHandler,
  type DiscordChatInputInteraction,
} from "./interaction-handler.ts";
import { KboCreditCommandExecutor } from "../../kbo/credit-command-executor.ts";
import { KboEnrollmentCommandExecutor } from "../../kbo/enrollment-command-executor.ts";
import { KBO_ENROLLMENT_POLICY } from "../../kbo/betting-enrollment.ts";

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
  assert.match(reply.content, /\/베팅 가입/);
  assert.match(reply.content, /관리자 전용/);
});

test("normalizes explicit KBO enrollment consent and replies ephemerally", async () => {
  const actors: unknown[] = [];
  const enrollments: unknown[] = [];
  const audits: unknown[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: new KboEnrollmentCommandExecutor(
      { async register(input) { actors.push(input); } },
      { async enroll(input) { enrollments.push(input); return "created"; } },
      () => "11111111-1111-4111-8111-111111111111",
      () => new Date("2026-08-07T05:00:00.000Z"),
    ),
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-08-07T05:00:00.000Z"),
  });
  await createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "enrollment-correlation",
  })({
    id: "enrollment-interaction",
    commandName: "베팅",
    user: { id: "22345678901234567" },
    member: { displayName: "가입 사용자" },
    guildId: "12345678901234567",
    channelId: "32345678901234567",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "가입",
      getString: () => { throw new Error("string option not requested"); },
      getUser: () => { throw new Error("user option not requested"); },
      getBoolean: () => true,
    },
    async reply(value) { replies.push(value); },
  });

  assert.equal(actors.length, 1);
  assert.equal(enrollments.length, 1);
  assert.deepEqual(replies, [{
    content: KBO_ENROLLMENT_POLICY.successMessage,
    ephemeral: true,
  }]);
  assert.deepEqual(
    (audits as Array<{ commandName: string; outcome: string }>).map(
      ({ commandName, outcome }) => ({ commandName, outcome }),
    ),
    [{ commandName: "베팅 가입", outcome: "success" }],
  );
});

test("normalizes KBO bet options and replies ephemerally", async () => {
  const requests: CommandRequest[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: {
      async execute(request) {
        requests.push(request);
        return "베팅 접수 완료";
      },
    },
    audit: { async append() {} },
    now: () => new Date("2026-08-10T00:42:00Z"),
  });
  await createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "bet-correlation",
  })({
    id: "bet-interaction",
    commandName: "베팅",
    user: { id: "22345678901234567" },
    guildId: "12345678901234567",
    channelId: "32345678901234567",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "하기",
      getString: (name) => name === "경기" ? "game-id-0001" : "away_win",
      getInteger: (name) => ({ 금액: 10_000, 홈점수: 2, 원정점수: 4 }[name] ?? null),
      getUser: () => null,
    },
    async reply(value) { replies.push(value); },
  });

  assert.deepEqual(requests[0], {
    eventId: "discord:bet-interaction",
    correlationId: "bet-correlation",
    actorId: "22345678901234567",
    actorLabel: "22345678901234567",
    guildId: "12345678901234567",
    channelId: "32345678901234567",
    isThread: false,
    commandName: "베팅 하기",
    options: {
      경기: "game-id-0001",
      결과: "away_win",
      금액: "10000",
      홈점수: "2",
      원정점수: "4",
    },
    signal: requests[0]!.signal,
  });
  assert.deepEqual(replies, [{ content: "베팅 접수 완료", ephemeral: true }]);
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

test("replies to the caller only with their formatted KBO credit balance and audits it", async () => {
  const inputs: unknown[] = [];
  const audits: unknown[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: new KboCreditCommandExecutor(
      {
        async read(input) {
          inputs.push(input);
          return { status: "active", availableBalance: 30_000n, correctionDebt: 20_000n };
        },
      },
      { async claim() { throw new Error("claim not requested"); } },
      () => "unused",
      () => new Date(),
    ),
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-08-07T04:00:00.000Z"),
  });
  const listen = createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "credit-correlation",
  });
  await listen({
    id: "credit-interaction",
    commandName: "크레딧",
    user: { id: "22345678901234567" },
    guildId: "12345678901234567",
    channelId: "32345678901234567",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "내정보",
      getString: () => { throw new Error("string option not requested"); },
      getUser: () => { throw new Error("user option not requested"); },
    },
    async reply(value) { replies.push(value); },
  });

  assert.deepEqual(inputs, [{
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
  }]);
  assert.deepEqual(replies, [{
    content: "**내 크레딧**\n가용 크레딧: 30,000 크레딧\n정정 부채: 20,000 크레딧",
    ephemeral: true,
  }]);
  assert.deepEqual(
    (audits as Array<{ commandName: string; outcome: string; reasonCode: string }>).map(
      ({ commandName, outcome, reasonCode }) => ({ commandName, outcome, reasonCode }),
    ),
    [{ commandName: "크레딧 내정보", outcome: "success", reasonCode: "completed" }],
  );
});

test("claims daily KBO credit from a normalized interaction and replies ephemerally", async () => {
  const inputs: unknown[] = [];
  const replies: unknown[] = [];
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: new KboCreditCommandExecutor(
      { async read() { throw new Error("balance not requested"); } },
      {
        async claim(input) {
          inputs.push(input);
          return {
            status: "claimed",
            claimDate: "2026-08-08",
            availablePaid: 50_000n,
            debtPaid: 0n,
          };
        },
      },
      () => "11111111-1111-4111-8111-111111111111",
      () => new Date("2026-08-07T15:00:00.000Z"),
    ),
    audit: { async append() {} },
    now: () => new Date("2026-08-07T15:00:00.000Z"),
  });
  await createDiscordInteractionHandler({
    handler,
    createCorrelationId: () => "claim-correlation",
  })({
    id: "claim-interaction",
    commandName: "크레딧",
    user: { id: "22345678901234567" },
    guildId: "12345678901234567",
    channelId: "32345678901234567",
    channel: { isThread: () => false },
    options: {
      getSubcommand: () => "받기",
      getString: () => { throw new Error("string option not requested"); },
      getUser: () => { throw new Error("user option not requested"); },
    },
    async reply(value) { replies.push(value); },
  });

  assert.deepEqual(inputs, [{
    operationId: "discord:claim-interaction",
    claimId: "kbo_daily_claim:11111111-1111-4111-8111-111111111111",
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
    claimedAt: new Date("2026-08-07T15:00:00.000Z"),
  }]);
  assert.deepEqual(replies, [{
    content: "**일일 크레딧**\n오늘 50,000 크레딧을 받았습니다.\n가용 크레딧 증가: 50,000 크레딧\n정정 부채 상계: 0 크레딧",
    ephemeral: true,
  }]);
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
