import assert from "node:assert/strict";
import test from "node:test";
import { Events } from "discord.js";

import { createDiscordInteractionHandler } from "../adapters/discord/interaction-handler.ts";
import {
  KoreanCommandHandler,
  type CommandAuditEvent,
  type KoreanCommandName,
} from "../commands/command-handler.ts";
import type { DiscordJsClientFacade } from "../gateway/discordjs-adapter.ts";
import type { SingletonLease } from "../gateway/singleton-lease.ts";
import { startDiscordJsBot } from "./discordjs-bot.ts";

class FakeDiscordClient implements DiscordJsClientFacade {
  readonly listeners = new Map<string, Set<(...arguments_: readonly unknown[]) => void>>();

  on(event: string, listener: (...arguments_: readonly unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (...arguments_: readonly unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  destroy(): void {}

  emit(event: string, value: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

const lease = (): SingletonLease => ({
  claim: async () => true,
  release: async () => true,
});

test("dispatches all eight Korean commands through the bot listener and audits each attempt", async () => {
  const client = new FakeDiscordClient();
  const audits: CommandAuditEvent[] = [];
  const featureCommands: KoreanCommandName[] = [];
  const replies: string[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return {
          messages: [{
            id: "3001",
            createdAt: new Date("2026-07-25T00:30:00Z"),
            authorLabel: "3002",
            content: "통합 테스트 원문 canary",
          }],
          complete: true,
        };
      },
    },
    summarizer: {
      async summarize() {
        return {
          coreDiscussion: ["요약됨"],
          decisions: [],
          actionItems: [],
          unresolved: [],
        };
      },
    },
    features: {
      async execute(request) {
        featureCommands.push(request.commandName);
        return `${request.commandName} 완료`;
      },
    },
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });
  let correlation = 0;
  const assembly = await startDiscordJsBot({
    ownerId: "owner",
    lease: lease(),
    client,
    startClient: async () => {},
    diagnostics: { subscribe: () => () => {} },
    reconcileMembers: async () => [],
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
    shutdownTimeoutMs: 100,
    reconciliationTimeoutMs: 100,
    reconciliationRetryDelaysMs: [],
    timeout: () => new Promise(() => {}),
    reportFailure: () => {},
    commands: {
      source: client,
      handle: createDiscordInteractionHandler({
        handler,
        createCorrelationId: () => `correlation-${++correlation}`,
      }),
    },
  });

  const fixtures = [
    fixture("도움말", null, {}),
    fixture("요약", "최근", { 범위: "1시간" }),
    fixture("라이엇계정", "연결", { 계정: "name#KR1" }),
    fixture("라이엇계정", "목록", {}, "4001"),
    fixture("라이엇계정", "연결해제", { 계정: "link-1" }),
    fixture("몰랭검거", "현황", {}, "4001"),
    fixture("몰랭검거", "정정", { 사건: "incident-1", 사유: "오탐" }),
    fixture("몰랭검거", "취소", { 사건: "incident-1", 사유: "API 장애" }),
  ];
  for (const interaction of fixtures) {
    interaction.reply = async ({ content }) => { replies.push(content); };
    interaction.editReply = async ({ content }) => { replies.push(content); };
    client.emit(Events.InteractionCreate, interaction);
  }
  await assembly.commands?.whenIdle();

  assert.equal(replies.length, 8);
  assert.deepEqual(featureCommands, [
    "라이엇계정 연결",
    "라이엇계정 목록",
    "라이엇계정 연결해제",
    "몰랭검거 현황",
    "몰랭검거 정정",
    "몰랭검거 취소",
  ]);
  assert.equal(audits.length, 8);
  assert.equal(JSON.stringify(audits).includes("통합 테스트 원문 canary"), false);
  await assembly.process.shutdown();
  assert.equal(client.listeners.get(Events.InteractionCreate)?.size, 0);
});

test("reports a fixed dispatch failure and sends no reply when command audit persistence fails", async () => {
  const client = new FakeDiscordClient();
  const failures: string[] = [];
  let replies = 0;
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: { async execute() { return "기능 결과가 전송되면 안 됩니다."; } },
    audit: { async append() { throw new Error("database-secret-canary"); } },
    now: () => new Date(),
  });
  const assembly = await startDiscordJsBot({
    ownerId: "owner",
    lease: lease(),
    client,
    startClient: async () => {},
    diagnostics: { subscribe: () => () => {} },
    reconcileMembers: async () => [],
    now: () => 0,
    sleep: async () => {},
    heartbeatStaleAfterMs: 100,
    reconnectDelaysMs: [0],
    shutdownTimeoutMs: 100,
    reconciliationTimeoutMs: 100,
    reconciliationRetryDelaysMs: [],
    timeout: () => new Promise(() => {}),
    reportFailure: (reason) => failures.push(reason),
    commands: {
      source: client,
      handle: createDiscordInteractionHandler({
        handler,
        createCorrelationId: () => "correlation",
      }),
    },
  });
  const interaction = fixture("몰랭검거", "현황", {});
  interaction.reply = async () => { replies += 1; };
  client.emit(Events.InteractionCreate, interaction);
  await assembly.commands?.whenIdle();
  assert.equal(replies, 0);
  assert.deepEqual(failures, ["command_dispatch_failed"]);
  assert.equal(JSON.stringify(failures).includes("database-secret-canary"), false);
  await assembly.process.shutdown();
});

let fixtureId = 0;

function fixture(
  commandName: string,
  subcommand: string | null,
  strings: Record<string, string>,
  userId?: string,
) {
  return {
    id: String(++fixtureId),
    commandName,
    user: { id: "1001" },
    guildId: "1002",
    channelId: "1003",
    channel: { isThread: () => false },
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => strings[name]!,
      getUser: () => userId === undefined ? null : { id: userId },
    },
    deferReply: async (_input: { ephemeral: true }) => {},
    editReply: async (_input: { content: string }) => {},
    reply: async (_input: { content: string; ephemeral: true }) => {},
  };
}
