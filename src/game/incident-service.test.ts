import assert from "node:assert/strict";
import test from "node:test";

import {
  IncidentAuthorizationError,
  IncidentReasonError,
  IncidentService,
} from "./incident-service.ts";

test("allows only administrators and requires an auditable reason", async () => {
  const calls: string[] = [];
  const service = new IncidentService({
    async mutateWithAudit(input) {
      calls.push(`${input.action}:${input.reason}`);
      return "updated";
    },
  });
  const base = {
    operationId: "operation",
    incidentId: "incident",
    expectedVersion: 1,
    actorId: "actor",
    occurredAt: new Date("2026-07-25T00:00:00Z"),
    action: "cancel" as const,
  };
  await assert.rejects(
    service.mutate({ ...base, authorizationTier: "operator", reason: "오탐" }),
    IncidentAuthorizationError,
  );
  await assert.rejects(
    service.mutate({ ...base, authorizationTier: "administrator", reason: " " }),
    IncidentReasonError,
  );
  assert.equal(
    await service.mutate({
      ...base,
      authorizationTier: "administrator",
      reason: "  API 장애로 인한 오탐  ",
    }),
    "updated",
  );
  assert.deepEqual(calls, ["cancel:API 장애로 인한 오탐"]);
});
