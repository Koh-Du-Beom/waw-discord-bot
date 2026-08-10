import assert from "node:assert/strict";
import test from "node:test";

import {
  KoreanCommandHandler,
  type CommandAuditEvent,
  type CommandRequest,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import { KBO_ENROLLMENT_POLICY } from "./betting-enrollment.ts";
import { KboEnrollmentCommandExecutor } from "./enrollment-command-executor.ts";

const request = (agreed = "true"): CommandRequest => ({
  eventId: "discord:enrollment-operation",
  correlationId: "enrollment-correlation",
  actorId: "22345678901234567",
  actorLabel: "가입 사용자",
  guildId: "12345678901234567",
  channelId: "32345678901234567",
  isThread: false,
  commandName: "베팅 가입",
  options: { 동의: agreed },
  signal: new AbortController().signal,
});

test("registers the actor before creating one policy-v1 zero-balance enrollment", async () => {
  const calls: Array<{ kind: string; input: unknown }> = [];
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const enrolledAt = new Date("2026-08-07T05:00:00.000Z");
  const executor = new KboEnrollmentCommandExecutor(
    { async register(input) { calls.push({ kind: "register", input }); } },
    { async enroll(input) { calls.push({ kind: "enroll", input }); return "created"; } },
    () => ids.shift()!,
    () => enrolledAt,
  );

  const response = await executor.execute(request());
  assert.deepEqual(calls, [
    {
      kind: "register",
      input: {
        guildId: "12345678901234567",
        discordUserId: "22345678901234567",
        displayLabel: "가입 사용자",
        registeredAt: enrolledAt,
      },
    },
    {
      kind: "enroll",
      input: {
        operationId: "discord:enrollment-operation",
        enrollmentId: "kbo_enrollment:11111111-1111-4111-8111-111111111111",
        accountId: "kbo_account:22222222-2222-4222-8222-222222222222",
        guildId: "12345678901234567",
        discordUserId: "22345678901234567",
        policyVersion: 1,
        enrolledAt,
      },
    },
  ]);
  assert.equal(response, KBO_ENROLLMENT_POLICY.successMessage);
  assert.match(response, /0 크레딧/u);
  assert.match(response, /공개 랭킹/u);
  assert.match(response, /1년/u);
  assert.match(response, /30일/u);
  assert.equal(/[₩$€]|\d[\d,]*\s*원(?:\s|$)/u.test(response), false);
  assert.equal(response.includes("11111111-1111"), false);
  assert.equal(response.includes(request().actorId), false);
});

test("requires explicit consent before registration or enrollment", async () => {
  let calls = 0;
  const executor = new KboEnrollmentCommandExecutor(
    { async register() { calls += 1; } },
    { async enroll() { calls += 1; return "created"; } },
    () => "unused",
    () => new Date(),
  );
  await assert.rejects(
    executor.execute(request("false")),
    (error) =>
      error instanceof Error &&
      "reasonCode" in error &&
      error.reasonCode === "kbo_enrollment_consent_required",
  );
  assert.equal(calls, 0);
});

test("audits enrollment denial and failure with fixed reasons", async () => {
  const cases = [
    { result: "already_enrolled" as const, outcome: "denied", reason: "kbo_already_enrolled" },
    { result: "duplicate_operation" as const, outcome: "denied", reason: "kbo_enrollment_duplicate" },
    { result: "not_registered" as const, outcome: "failure", reason: "kbo_enrollment_unavailable" },
  ];
  for (const item of cases) {
    const audits: CommandAuditEvent[] = [];
    const executor = new KboEnrollmentCommandExecutor(
      { async register() {} },
      { async enroll() { return item.result; } },
      () => "11111111-1111-4111-8111-111111111111",
      () => new Date("2026-08-07T05:00:00.000Z"),
    );
    const handler = new KoreanCommandHandler({
      history: { async readPage() { return { messages: [], complete: true }; } },
      features: executor,
      audit: { async append(event) { audits.push(event); } },
      now: () => new Date("2026-08-07T05:00:00.000Z"),
    });
    await handler.handle(request());
    assert.deepEqual(
      audits.map(({ outcome, reasonCode }) => ({ outcome, reasonCode })),
      [{ outcome: item.outcome, reasonCode: item.reason }],
    );
  }

  const failing = new KboEnrollmentCommandExecutor(
    { async register() { throw new PersistenceError("database-secret-canary"); } },
    { async enroll() { throw new Error("must not enroll"); } },
    () => "unused",
    () => new Date(),
  );
  await assert.rejects(
    failing.execute(request()),
    (error) =>
      error instanceof Error &&
      "reasonCode" in error &&
      error.reasonCode === "kbo_enrollment_unavailable" &&
      !error.message.includes("database-secret-canary"),
  );
});
