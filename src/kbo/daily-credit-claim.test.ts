import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateDailyCredit,
  assertKboDailyCreditClaimInput,
  KboDailyCreditClaimInputError,
  toKstClaimDate,
} from "./daily-credit-claim.ts";
import { PostgresKboDailyCreditClaimStore } from "../persistence/postgres-kbo-daily-credit-claim-store.ts";

test("calculates KST claim dates at the day boundary", () => {
  const cases = [
    ["2026-08-07T14:59:59.999Z", "2026-08-07"],
    ["2026-08-07T15:00:00.000Z", "2026-08-08"],
    ["2026-08-07T01:00:00.000Z", "2026-08-07"],
  ] as const;
  for (const [instant, expected] of cases) {
    assert.equal(toKstClaimDate(new Date(instant)), expected, instant);
  }
});

test("allocates 50,000 credits to debt before available balance", () => {
  const cases = [
    [0n, 50_000n, 0n],
    [1n, 49_999n, 1n],
    [49_999n, 1n, 49_999n],
    [50_000n, 0n, 50_000n],
    [50_001n, 0n, 50_000n],
  ] as const;
  for (const [debt, availablePaid, debtPaid] of cases) {
    assert.deepEqual(allocateDailyCredit(debt), { availablePaid, debtPaid });
  }
  assert.throws(() => allocateDailyCredit(-1n));
});

test("validates daily claim input without reflecting it", () => {
  const valid = {
    operationId: "daily-claim-operation-0001",
    claimId: "daily_claim_000000001",
    guildId: "12345678901234567",
    discordUserId: "22345678901234567",
    claimedAt: new Date("2026-08-07T15:00:00.000Z"),
  };
  assert.doesNotThrow(() => assertKboDailyCreditClaimInput(valid));
  for (const input of [
    { ...valid, operationId: "bad" },
    { ...valid, claimId: "x".repeat(129) },
    { ...valid, guildId: "not-a-snowflake" },
    { ...valid, claimedAt: new Date(Number.NaN) },
  ]) {
    assert.throws(
      () => assertKboDailyCreditClaimInput(input),
      (error) =>
        error instanceof KboDailyCreditClaimInputError &&
        error.message === "invalid KBO daily credit claim input",
    );
  }
});

test("rejects malformed daily claims before opening a database connection", async () => {
  let connected = false;
  const store = new PostgresKboDailyCreditClaimStore({
    connect: async () => {
      connected = true;
      throw new Error("unexpected connection");
    },
  });
  await assert.rejects(
    store.claim({
      operationId: "bad",
      claimId: "daily_claim_000000001",
      guildId: "12345678901234567",
      discordUserId: "22345678901234567",
      claimedAt: new Date("2026-08-07T15:00:00.000Z"),
    }),
    KboDailyCreditClaimInputError,
  );
  assert.equal(connected, false);
});
