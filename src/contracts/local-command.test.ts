import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLocalCommand, type LocalCommandRequest, type OperationLedger } from "./local-command.ts";

class InMemoryOperationLedger implements OperationLedger {
  readonly operationIds = new Set<string>();

  has(operationId: string): boolean {
    return this.operationIds.has(operationId);
  }

  record(operationId: string): void {
    this.operationIds.add(operationId);
  }
}

const requestedAt = new Date("2026-07-21T00:00:00.000Z");

function validRequest(overrides: Partial<LocalCommandRequest> = {}): LocalCommandRequest {
  return {
    operationId: "operation-0001",
    actorId: "discord-user-1",
    authorizationTier: "operator",
    requestedAt,
    expiresAt: new Date("2026-07-21T00:05:00.000Z"),
    ...overrides,
  };
}

test("accepts a valid first command and records its operation id", () => {
  const ledger = new InMemoryOperationLedger();

  assert.deepEqual(evaluateLocalCommand(validRequest(), ledger), {
    kind: "accepted",
    operationId: "operation-0001",
  });
  assert.equal(ledger.operationIds.has("operation-0001"), true);
});

test("rejects expired command before recording it", () => {
  const ledger = new InMemoryOperationLedger();

  assert.deepEqual(
    evaluateLocalCommand(validRequest({ expiresAt: requestedAt }), ledger),
    { kind: "denied", reason: "expired" },
  );
  assert.equal(ledger.operationIds.size, 0);
});

test("rejects malformed command before recording it", () => {
  const ledger = new InMemoryOperationLedger();

  assert.deepEqual(
    evaluateLocalCommand(validRequest({ operationId: "short" }), ledger),
    { kind: "denied", reason: "malformed" },
  );
  assert.equal(ledger.operationIds.size, 0);
});

test("returns duplicate without applying the same operation twice", () => {
  const ledger = new InMemoryOperationLedger();
  const request = validRequest();

  evaluateLocalCommand(request, ledger);

  assert.deepEqual(evaluateLocalCommand(request, ledger), {
    kind: "duplicate",
    operationId: "operation-0001",
  });
  assert.equal(ledger.operationIds.size, 1);
});
