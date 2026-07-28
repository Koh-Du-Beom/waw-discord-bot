import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandFailure,
  KoreanCommandHandler,
  summaryRange,
  type CommandAuditEvent,
  type CommandRequest,
} from "./command-handler.ts";
import { SummaryCapacityError } from "../summary/conversation-summary.ts";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../contracts/summary-disclosure.ts";

const baseRequest = (): CommandRequest => ({
  eventId: "event-1",
  correlationId: "correlation-1",
  actorId: "actor-1",
  guildId: "guild-1",
  channelId: "channel-1",
  isThread: false,
  commandName: "요약",
  options: {
    방식: "최근",
    범위: "3시간",
  },
  signal: new AbortController().signal,
});

test("resolves recent choices and Korean direct wall times in Asia/Seoul", () => {
  const now = new Date("2026-07-28T12:00:00Z");
  assert.deepEqual(summaryRange({ 방식: "최근", 범위: "3시간" }, now), {
    start: new Date("2026-07-28T09:00:00Z"),
    end: now,
  });
  assert.deepEqual(
    summaryRange(
      { 방식: "직접", 시작: "어제 23:30", 종료: "오늘 00:30" },
      now,
    ),
    {
      start: new Date("2026-07-27T14:30:00Z"),
      end: new Date("2026-07-27T15:30:00Z"),
    },
  );
  assert.throws(
    () => summaryRange({ 방식: "직접", 시작: "20시", 종료: "21:00" }, now),
    /invalid Korean wall time/u,
  );
});

test("publishes the approved external-processing disclosure in help", async () => {
  const handler = new KoreanCommandHandler({
    history: { async readPage() { throw new Error("not used"); } },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append() {} },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });
  const response = await handler.handle({
    ...baseRequest(),
    commandName: "도움말",
    options: {},
  });
  assert.match(response, /외부 처리 안내/);
  assert.equal(response.includes(SUMMARY_EXTERNAL_PROCESSING_NOTICE), true);
});

test("handles a Korean summary and audits metadata without raw content", async () => {
  const audits: CommandAuditEvent[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return {
          messages: [
            {
              id: "message-1",
              createdAt: new Date("2026-07-25T00:30:00Z"),
              authorLabel: "사용자",
              content: "원문 비밀 canary",
            },
          ],
          complete: true,
        };
      },
    },
    summarizer: {
      async summarize({ messages, manifest }) {
        assert.equal(messages.length, 1);
        assert.deepEqual(manifest, [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }]);
        return {
          coreDiscussion: ["배포 논의"],
          decisions: ["한국어 명령 사용"],
          actionItems: ["handler 연결"],
          unresolved: [],
        };
      },
    },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });
  const response = await handler.handle(baseRequest());
  assert.match(response, /\*\*핵심 논의\*\*/);
  assert.match(response, /\*\*미해결\*\*\n- 없음/);
  assert.equal(JSON.stringify(audits).includes("원문 비밀 canary"), false);
  assert.equal(audits[0]?.outcome, "success");
});

test("audits denied and incomplete attempts with stable reason codes", async () => {
  const audits: CommandAuditEvent[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return { messages: [], complete: false };
      },
    },
    summarizer: {
      async summarize() {
        throw new Error("must not summarize incomplete history");
      },
    },
    features: {
      async execute() {
        throw new CommandFailure("administrator_required", "관리자만 사용할 수 있습니다.", "denied");
      },
    },
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });
  assert.match(await handler.handle(baseRequest()), /전체 대화 범위/);
  const denied = { ...baseRequest(), commandName: "몰랭검거 취소" as const };
  assert.match(await handler.handle(denied), /관리자만/);
  assert.deepEqual(
    audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })),
    [
      { outcome: "failure", reasonCode: "summary_range_incomplete" },
      { outcome: "denied", reasonCode: "administrator_required" },
    ],
  );
});

test("does not reserve quota or call the provider when message content is unavailable", async () => {
  let reservations = 0;
  let providerCalls = 0;
  const audits: CommandAuditEvent[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return {
          messages: [{
            id: "message-1",
            createdAt: new Date("2026-07-25T00:30:00Z"),
            authorLabel: "사용자",
            content: "",
          }],
          complete: true,
        };
      },
    },
    summarizer: {
      async summarize() {
        providerCalls += 1;
        throw new Error("must not summarize empty content");
      },
    },
    quota: {
      async reserve() {
        reservations += 1;
        return { kind: "reserved" };
      },
    },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });

  const response = await handler.handle(baseRequest());

  assert.match(response, /메시지 콘텐츠 권한/u);
  assert.equal(reservations, 0);
  assert.equal(providerCalls, 0);
  assert.deepEqual(audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })), [
    { outcome: "failure", reasonCode: "summary_content_unavailable" },
  ]);
});

test("distinguishes an empty selected range from unavailable message content", async () => {
  const audits: CommandAuditEvent[] = [];
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return { messages: [], complete: true };
      },
    },
    summarizer: {
      async summarize() {
        throw new Error("must not summarize an empty range");
      },
    },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });

  const response = await handler.handle(baseRequest());

  assert.match(response, /더 긴 범위/u);
  assert.deepEqual(audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })), [
    { outcome: "failure", reasonCode: "summary_range_empty" },
  ]);
});

test("does not invoke history when no summary provider is configured", async () => {
  let reads = 0;
  const handler = new KoreanCommandHandler({
    history: { async readPage() { reads += 1; return { messages: [], complete: true }; } },
    features: { async execute() { return "완료"; } },
    audit: { async append() {} },
    now: () => new Date(),
  });
  assert.match(await handler.handle(baseRequest()), /아직 설정되지 않았습니다/);
  assert.equal(reads, 0);
});

test("rejects provider capacity before consuming the hourly reservation", async () => {
  let reservations = 0;
  const handler = new KoreanCommandHandler({
    history: {
      async readPage() {
        return {
          messages: [{
            id: "message-1",
            createdAt: new Date("2026-07-25T00:30:00Z"),
            authorLabel: "합성 사용자",
            content: "합성 메시지",
          }],
          complete: true,
        };
      },
    },
    summarizer: {
      validate() {
        throw new SummaryCapacityError();
      },
      async summarize() {
        throw new Error("must not dispatch");
      },
    },
    quota: {
      async reserve() {
        reservations += 1;
        return { kind: "reserved" };
      },
    },
    features: { async execute() { throw new Error("not used"); } },
    audit: { async append() {} },
    now: () => new Date("2026-07-25T02:00:00Z"),
  });

  assert.match(await handler.handle(baseRequest()), /더 짧은 범위/u);
  assert.equal(reservations, 0);
});
