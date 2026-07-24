import assert from "node:assert/strict";
import test from "node:test";

import {
  authorize,
  consumeOAuthState,
  createOAuthState,
  type AuthorizationInput,
} from "./authorization.ts";

const now = new Date("2026-07-21T00:00:00.000Z");

function input(overrides: Partial<AuthorizationInput> = {}): AuthorizationInput {
  return {
    kind: "read",
    currentRole: "authorized",
    now,
    csrfValid: true,
    explicitConfirmation: false,
    ...overrides,
  };
}

test("allows read-only request from a role cache no older than five minutes", () => {
  assert.deepEqual(
    authorize(
      input({
        currentRole: "unavailable",
        cachedRoleVerifiedAt: new Date("2026-07-20T23:55:00.000Z"),
      }),
    ),
    { kind: "allowed", source: "role-cache" },
  );
});

test("denies mutation when current role lookup is unavailable even with cache", () => {
  assert.deepEqual(
    authorize(
      input({
        kind: "mutation",
        currentRole: "unavailable",
        cachedRoleVerifiedAt: new Date("2026-07-20T23:59:00.000Z"),
      }),
    ),
    { kind: "denied", reason: "unavailable" },
  );
});

test("requires recent OAuth and explicit confirmation for high-risk action", () => {
  assert.deepEqual(
    authorize(input({ kind: "high-risk", explicitConfirmation: true })),
    { kind: "denied", reason: "recent-auth-required" },
  );
  assert.deepEqual(
    authorize(
      input({
        kind: "high-risk",
        lastOAuthCompletedAt: new Date("2026-07-20T23:50:00.000Z"),
      }),
    ),
    { kind: "denied", reason: "confirmation-required" },
  );
});

test("requires csrf for mutation", () => {
  assert.deepEqual(authorize(input({ kind: "mutation", csrfValid: false })), {
    kind: "denied",
    reason: "csrf-invalid",
  });
});

test("rejects future-dated role cache and recent OAuth evidence", () => {
  const future = new Date("2026-07-21T00:00:00.001Z");
  assert.deepEqual(
    authorize(
      input({
        currentRole: "unavailable",
        cachedRoleVerifiedAt: future,
      }),
    ),
    { kind: "denied", reason: "unavailable" },
  );
  assert.deepEqual(
    authorize(
      input({
        kind: "high-risk",
        lastOAuthCompletedAt: future,
        explicitConfirmation: true,
      }),
    ),
    { kind: "denied", reason: "recent-auth-required" },
  );
});

test("consumes OAuth state exactly once and never stores its raw value", () => {
  const transaction = createOAuthState(now);
  const consumed = consumeOAuthState(transaction.record, transaction.rawState, now);

  assert.notEqual(transaction.record.stateHash, transaction.rawState);
  assert.equal(consumed?.usedAt?.toISOString(), now.toISOString());
  assert.equal(consumeOAuthState(consumed!, transaction.rawState, now), undefined);
});

test("rejects expired OAuth state", () => {
  const transaction = createOAuthState(now);

  assert.equal(
    consumeOAuthState(transaction.record, transaction.rawState, new Date("2026-07-21T00:10:00.000Z")),
    undefined,
  );
});
