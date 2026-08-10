import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandFailure,
  KoreanCommandHandler,
  type CommandAuditEvent,
  type CommandRequest,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import { PostgresKboCreditBalanceStore } from "../persistence/postgres-kbo-credit-balance-store.ts";
import { KboCreditCommandExecutor } from "./credit-command-executor.ts";
import type { KboCreditBalanceStore } from "./credit-balance.ts";

const request = (): CommandRequest => ({
  eventId: "discord:credit-command",
  correlationId: "credit-correlation",
  actorId: "22345678901234567",
  guildId: "12345678901234567",
  channelId: "32345678901234567",
  isThread: false,
  commandName: "크레딧 내정보",
  options: {},
  signal: new AbortController().signal,
});

const balanceExecutor = (balances: KboCreditBalanceStore) =>
  new KboCreditCommandExecutor(
    balances,
    { async claim() { throw new Error("claim not requested"); } },
    () => "unused",
    () => new Date(),
  );

test("formats only the caller's exact bigint credit balances", async () => {
  const inputs: unknown[] = [];
  const executor = balanceExecutor({
    async read(input) {
      inputs.push(input);
      return {
        status: "active",
        availableBalance: 9_007_199_254_740_993n,
        correctionDebt: 50_000n,
      };
    },
  });
  const response = await executor.execute(request());
  assert.deepEqual(inputs, [{
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
  }]);
  assert.equal(
    response,
    "**내 크레딧**\n가용 크레딧: 9,007,199,254,740,993 크레딧\n정정 부채: 50,000 크레딧",
  );
  assert.equal(/[₩$€]|원|account|operation|ledger/u.test(response), false);
});

test("maps missing enrollment and persistence failure to fixed command failures", async () => {
  const notEnrolled = balanceExecutor({
    async read() { return { status: "not_enrolled" }; },
  });
  await assert.rejects(
    notEnrolled.execute(request()),
    (error) =>
      error instanceof CommandFailure &&
      error.reasonCode === "kbo_not_enrolled" &&
      error.outcome === "denied",
  );

  const failing = balanceExecutor({
    async read() { throw new PersistenceError("secret-database-detail"); },
  });
  await assert.rejects(
    failing.execute(request()),
    (error) =>
      error instanceof CommandFailure &&
      error.reasonCode === "kbo_credit_balance_unavailable" &&
      !error.userMessage.includes("secret-database-detail"),
  );
});

test("audits denied and unavailable credit reads with fixed reasons", async () => {
  const cases = [
    {
      executor: balanceExecutor({
        async read() { return { status: "not_enrolled" }; },
      }),
      message: /가입된 계정이 없습니다/u,
      outcome: "denied",
      reasonCode: "kbo_not_enrolled",
    },
    {
      executor: balanceExecutor({
        async read() { throw new PersistenceError("database-secret-canary"); },
      }),
      message: /잠시 후 다시/u,
      outcome: "failure",
      reasonCode: "kbo_credit_balance_unavailable",
    },
  ] as const;
  for (const item of cases) {
    const audits: CommandAuditEvent[] = [];
    const handler = new KoreanCommandHandler({
      history: { async readPage() { return { messages: [], complete: true }; } },
      features: item.executor,
      audit: { async append(event) { audits.push(event); } },
      now: () => new Date("2026-08-07T04:00:00.000Z"),
    });
    const response = await handler.handle(request());
    assert.match(response, item.message);
    assert.equal(response.includes("database-secret-canary"), false);
    assert.deepEqual(
      audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })),
      [{ outcome: item.outcome, reasonCode: item.reasonCode }],
    );
  }
});

test("fails a direct-message guild before querying without reflecting it", async () => {
  let queried = false;
  const executor = balanceExecutor(new PostgresKboCreditBalanceStore({
    query: async () => {
      queried = true;
      throw new Error("unexpected query");
    },
  } as never));
  await assert.rejects(
    executor.execute({ ...request(), guildId: "direct-message" }),
    (error) =>
      error instanceof CommandFailure &&
      error.reasonCode === "kbo_credit_balance_unavailable" &&
      !error.userMessage.includes("direct-message"),
  );
  assert.equal(queried, false);
});

test("claims today's 50,000 credits with debt-first allocation", async () => {
  const inputs: unknown[] = [];
  const claimedAt = new Date("2026-08-07T15:00:00.000Z");
  const executor = new KboCreditCommandExecutor(
    { async read() { throw new Error("balance not requested"); } },
    {
      async claim(input) {
        inputs.push(input);
        return {
          status: "claimed",
          claimDate: "2026-08-08",
          availablePaid: 30_000n,
          debtPaid: 20_000n,
        };
      },
    },
    () => "11111111-1111-4111-8111-111111111111",
    () => claimedAt,
  );
  const response = await executor.execute({ ...request(), commandName: "크레딧 받기" });
  assert.deepEqual(inputs, [{
    operationId: "discord:credit-command",
    claimId: "kbo_daily_claim:11111111-1111-4111-8111-111111111111",
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
    claimedAt,
  }]);
  assert.equal(
    response,
    "**일일 크레딧**\n오늘 50,000 크레딧을 받았습니다.\n가용 크레딧 증가: 30,000 크레딧\n정정 부채 상계: 20,000 크레딧",
  );
  assert.equal(/[₩$€]|원|2026-08-08|11111111|223456/u.test(response), false);
});

test("audits fixed daily credit denials and persistence failure", async () => {
  const cases = [
    { status: "already_claimed" as const, outcome: "denied", reasonCode: "kbo_daily_credit_already_claimed" },
    { status: "not_enrolled" as const, outcome: "denied", reasonCode: "kbo_not_enrolled" },
    { status: "duplicate_operation" as const, outcome: "denied", reasonCode: "kbo_daily_credit_duplicate" },
  ];
  for (const item of cases) {
    const audits: CommandAuditEvent[] = [];
    const executor = new KboCreditCommandExecutor(
      { async read() { throw new Error("balance not requested"); } },
      { async claim() { return { status: item.status, claimDate: "2026-08-08" }; } },
      () => "11111111-1111-4111-8111-111111111111",
      () => new Date("2026-08-07T15:00:00.000Z"),
    );
    const handler = new KoreanCommandHandler({
      history: { async readPage() { return { messages: [], complete: true }; } },
      features: executor,
      audit: { async append(event) { audits.push(event); } },
      now: () => new Date("2026-08-07T15:00:00.000Z"),
    });
    await handler.handle({ ...request(), commandName: "크레딧 받기" });
    assert.deepEqual(
      audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })),
      [{ outcome: item.outcome, reasonCode: item.reasonCode }],
    );
  }

  const failing = new KboCreditCommandExecutor(
    { async read() { throw new Error("balance not requested"); } },
    { async claim() { throw new PersistenceError("database-secret-canary"); } },
    () => "11111111-1111-4111-8111-111111111111",
    () => new Date(),
  );
  await assert.rejects(
    failing.execute({ ...request(), commandName: "크레딧 받기" }),
    (error) =>
      error instanceof CommandFailure &&
      error.reasonCode === "kbo_daily_credit_unavailable" &&
      !error.userMessage.includes("database-secret-canary"),
  );
});
