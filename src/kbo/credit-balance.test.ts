import assert from "node:assert/strict";
import test from "node:test";

import {
  assertKboCreditBalanceInput,
  KboCreditBalanceInputError,
} from "./credit-balance.ts";
import { PostgresKboCreditBalanceStore } from "../persistence/postgres-kbo-credit-balance-store.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";

const valid = {
  guildId: "12345678901234567",
  discordUserId: "22345678901234567",
};

test("validates KBO self-balance input before querying", async () => {
  assert.doesNotThrow(() => assertKboCreditBalanceInput(valid));
  let queried = false;
  const store = new PostgresKboCreditBalanceStore({
    query: async () => {
      queried = true;
      throw new Error("unexpected query");
    },
  } as never);
  for (const input of [
    { ...valid, guildId: "invalid" },
    { ...valid, discordUserId: "9".repeat(21) },
  ]) {
    await assert.rejects(store.read(input), KboCreditBalanceInputError);
  }
  assert.equal(queried, false);
});

test("maps only exact bigint balances and normalizes database failures", async () => {
  const store = new PostgresKboCreditBalanceStore({
    query: async () => ({
      rows: [{ available_balance: "9007199254740993", correction_debt: "50000" }],
    }),
  } as never);
  assert.deepEqual(await store.read(valid), {
    status: "active",
    availableBalance: 9_007_199_254_740_993n,
    correctionDebt: 50_000n,
  });
  assert.deepEqual(Object.keys(await store.read(valid)).sort(), [
    "availableBalance",
    "correctionDebt",
    "status",
  ]);

  const failing = new PostgresKboCreditBalanceStore({
    query: async () => {
      throw new Error("database detail with 22345678901234567");
    },
  } as never);
  await assert.rejects(
    failing.read(valid),
    (error) =>
      error instanceof PersistenceError &&
      error.reasonCode === "kbo_credit_balance_read_failed" &&
      !error.message.includes(valid.discordUserId),
  );
});
