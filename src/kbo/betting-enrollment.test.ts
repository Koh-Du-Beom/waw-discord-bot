import assert from "node:assert/strict";
import test from "node:test";

import {
  assertKboEnrollmentInput,
  KboEnrollmentInputError,
  type KboEnrollmentInput,
} from "./betting-enrollment.ts";
import { PostgresKboEnrollmentStore } from "../persistence/postgres-kbo-enrollment-store.ts";

const valid: KboEnrollmentInput = {
  operationId: "enrollment-operation-0001",
  enrollmentId: "enrollment_000000000001",
  accountId: "account_000000000001",
  guildId: "12345678901234567",
  discordUserId: "22345678901234567",
  policyVersion: 1,
  enrolledAt: new Date("2026-08-07T01:00:00.000Z"),
};

test("accepts the bounded KBO enrollment input", () => {
  assert.doesNotThrow(() => assertKboEnrollmentInput(valid));
});

test("rejects malformed KBO enrollment input without reflecting it", () => {
  for (const input of [
    { ...valid, operationId: "short" },
    { ...valid, enrollmentId: "short" },
    { ...valid, accountId: "x".repeat(129) },
    { ...valid, guildId: "not-a-snowflake" },
    { ...valid, discordUserId: "0" },
    { ...valid, policyVersion: 0 },
    { ...valid, enrolledAt: new Date(Number.NaN) },
  ]) {
    assert.throws(
      () => assertKboEnrollmentInput(input),
      (error) =>
        error instanceof KboEnrollmentInputError &&
        error.message === "invalid KBO enrollment input",
    );
  }
});

test("rejects malformed enrollment before opening a database connection", async () => {
  let connected = false;
  const store = new PostgresKboEnrollmentStore({
    connect: async () => {
      connected = true;
      throw new Error("database should not be reached");
    },
  } as never);

  await assert.rejects(
    store.enroll({ ...valid, operationId: "short" }),
    KboEnrollmentInputError,
  );
  assert.equal(connected, false);
});
