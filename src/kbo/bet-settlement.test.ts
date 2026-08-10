import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateSettlementDelta,
  assertKboSettlementInput,
  KboSettlementInputError,
} from "./bet-settlement.ts";

test("allocates KBO settlement payouts, void refunds, and corrections", () => {
  assert.deepEqual(
    allocateSettlementDelta({ availableBalance: 100n, correctionDebt: 500n, delta: 1_000n, voidRefund: false }),
    { availableDelta: 500n, debtDelta: -500n },
  );
  assert.deepEqual(
    allocateSettlementDelta({ availableBalance: 100n, correctionDebt: 500n, delta: 1_000n, voidRefund: true }),
    { availableDelta: 1_000n, debtDelta: 0n },
  );
  assert.deepEqual(
    allocateSettlementDelta({ availableBalance: 700n, correctionDebt: 0n, delta: -1_000n, voidRefund: false }),
    { availableDelta: -700n, debtDelta: 300n },
  );
  assert.deepEqual(
    allocateSettlementDelta({ availableBalance: 700n, correctionDebt: 300n, delta: 0n, voidRefund: false }),
    { availableDelta: 0n, debtDelta: 0n },
  );
});

test("validates KBO settlement trust-boundary input", () => {
  const valid = {
    operationId: "settlement-operation-1",
    settlementId: "settlement-id-00000001",
    guildId: "92345678901234567",
    betId: "bet-id-0000000001",
    gameId: "game-id-0001",
    gameRevision: 1n,
    rightsStatus: "authorized" as const,
    settledAt: new Date("2026-08-10T00:00:00Z"),
  };
  assert.doesNotThrow(() => assertKboSettlementInput(valid));
  for (const invalid of [
    { ...valid, operationId: "short" },
    { ...valid, settlementId: "short" },
    { ...valid, guildId: "invalid" },
    { ...valid, gameRevision: 0n },
    { ...valid, rightsStatus: "unknown" },
    { ...valid, settledAt: new Date("invalid") },
  ]) {
    assert.throws(
      () => assertKboSettlementInput(invalid as typeof valid),
      KboSettlementInputError,
    );
  }
});
