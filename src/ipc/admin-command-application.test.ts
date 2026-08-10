import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminCommandRequest } from "../contracts/admin-command-ipc.ts";
import {
  AdminCommandApplication,
  type AdminCommandApplicationStore,
  type TerminalAdminCommandResult,
} from "./admin-command-application.ts";

const now = new Date("2026-07-26T03:00:00.000Z");
const pending = {
  requestId: "riot-request-0001",
  discordUserId: "123456789012345678",
  platformId: "KR",
  gameName: "Summoner",
  tagLine: "KR1",
  requestedAt: new Date("2026-07-26T02:00:00.000Z"),
  version: 0,
};

function request(
  command: AdminCommandRequest["command"],
  payload: AdminCommandRequest["payload"],
  operationId = "operation-00000001",
): AdminCommandRequest {
  return {
    version: 1,
    requestId: "request_0000000001",
    operationId,
    actorId: "123456789012345678",
    guildId: "223456789012345678",
    requestedAt: new Date("2026-07-26T02:59:55.000Z"),
    expiresAt: new Date("2026-07-26T03:00:05.000Z"),
    command,
    payload,
  } as AdminCommandRequest;
}

function fakeStore(): AdminCommandApplicationStore & {
  calls: string[];
  terminal: TerminalAdminCommandResult | undefined;
} {
  const store: AdminCommandApplicationStore & {
    calls: string[];
    terminal: TerminalAdminCommandResult | undefined;
  } = {
    calls: [] as string[],
    terminal: undefined as TerminalAdminCommandResult | undefined,
    async listPendingPageWithResult(input) {
      store.calls.push(`list:${input.afterRequestId ?? ""}`);
      return {
        kind: "page" as const,
        requests: [pending],
        nextRequestId: "riot-request-0002",
      };
    },
    async findPending() {
      store.calls.push("findPending");
      return pending;
    },
    async approveRequestWithAudit() {
      store.calls.push("approve");
      return "approved" as const;
    },
    async rejectRequestWithAudit() {
      store.calls.push("reject");
      return "rejected" as const;
    },
    async removeLinkWithAudit() {
      store.calls.push("remove");
      return "removed" as const;
    },
    async recordAdminAudit(event) {
      store.calls.push(`audit:${event.reasonCode}`);
    },
    async findAdminCommandResult() {
      store.calls.push("terminal");
      return store.terminal;
    },
  };
  return store;
}

function fakeIncidents(result: "updated" | "conflict" | "not_found" | "duplicate_operation" = "updated") {
  const calls: string[] = [];
  return {
    calls,
    async mutateAdminIncidentWithAudit(input: { action: string; reason: string }) {
      calls.push(`${input.action}:${input.reason}`);
      return result;
    },
  };
}

test("checks current administrator role before reading targets or invoking validator", async () => {
  const store = fakeStore();
  let validations = 0;
  const application = new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        store.calls.push("authorization");
        return { kind: "authorized", authorizationTier: "operator" };
      },
    },
    validator: {
      async validate() {
        validations += 1;
        return { kind: "valid", normalizedPuuid: "A".repeat(64) };
      },
    },
    store,
    incidents: fakeIncidents(),
    now: () => now,
  });

  const response = await application.execute(
    request("riot_link_request_approve", {
      requestId: pending.requestId,
      expectedVersion: 0,
    }),
  );

  assert.equal(response.outcome, "denied");
  assert.equal(response.reasonCode, "administrator_required");
  assert.equal(validations, 0);
  assert.deepEqual(store.calls, [
    "authorization",
    "audit:administrator_required",
  ]);
});

test("uses an opaque cursor for bounded pending-request pagination", async () => {
  const store = fakeStore();
  const application = applicationWith(store);
  const first = await application.execute(
    request("riot_link_request_list", { limit: 1 }),
  );
  assert.equal(first.outcome, "success");
  assert.equal(first.result.kind, "riot_link_request_page");
  assert.equal(first.result.requests[0]?.requesterLabel, "서버 닉네임");
  assert.ok(first.result.nextCursor);

  await application.execute(
    request(
      "riot_link_request_list",
      { limit: 1, cursor: first.result.nextCursor },
      "operation-00000002",
    ),
  );
  assert.equal(store.calls.at(-1), "list:riot-request-0002");
});

test("returns the durable result for a duplicate before target lookup", async () => {
  const store = fakeStore();
  store.terminal = {
    operationId: "operation-00000001",
    commandName: "riot_link_request_approve",
    outcome: "conflict",
    reasonCode: "riot_link_request_stale",
    completedAt: now,
  };
  const response = await applicationWith(store).execute(
    request("riot_link_request_approve", {
      requestId: pending.requestId,
      expectedVersion: 0,
    }),
  );
  assert.equal(response.outcome, "success");
  assert.equal(response.result.kind, "operation_status");
  assert.equal(response.result.status, "conflict");
  assert.deepEqual(store.calls, ["terminal"]);
});

test("records validator unavailability without attempting approval", async () => {
  const store = fakeStore();
  const application = applicationWith(store, async () => {
    throw new Error("provider unavailable");
  });
  const response = await application.execute(
    request("riot_link_request_approve", {
      requestId: pending.requestId,
      expectedVersion: 0,
    }),
  );
  assert.equal(response.outcome, "unavailable");
  assert.equal(response.reasonCode, "validator_unavailable");
  assert.deepEqual(store.calls, [
    "terminal",
    "findPending",
    "audit:validator_unavailable",
  ]);
});

test("removes an active link only after current administrator authorization", async () => {
  const store = fakeStore();
  const response = await applicationWith(store).execute(
    request("riot_link_remove", {
      linkId: "link:active0001",
      expectedVersion: 4,
      confirmation: true,
    }),
  );
  assert.equal(response.outcome, "success");
  assert.equal(response.result.kind, "riot_link_removal");
  assert.deepEqual(store.calls, ["terminal", "remove"]);
});

test("adjusts one credit account only through the exact administrator command", async () => {
  const store = fakeStore();
  const adjustments: unknown[] = [];
  const application = new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "administrator" };
      },
    },
    validator: { async validate() { throw new Error("validator not requested"); } },
    store,
    credits: {
      async adjust(input) {
        adjustments.push(input);
        return { status: "adjusted", availableBalance: 75_000n, version: 4 };
      },
    },
    incidents: fakeIncidents(),
    now: () => now,
  });
  const response = await application.execute(request("credit_account_adjust", {
    accountId: "account:credit001",
    expectedVersion: 3,
    delta: -25_000,
    reasonCode: "support_correction",
    confirmation: true,
  }));
  assert.equal(response.outcome, "success");
  assert.deepEqual(response.result, {
    kind: "credit_account_adjustment",
    status: "adjusted",
    availableBalance: "75000",
    version: 4,
  });
  assert.equal((adjustments[0] as { audit: { commandName: string } }).audit.commandName, "크레딧 관리자조정");
});

test("denies incident mutation for a current operator before touching the incident store", async () => {
  const store = fakeStore();
  const incidents = fakeIncidents();
  const application = new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "operator" };
      },
    },
    validator: {
      async validate() {
        throw new Error("must not validate");
      },
    },
    store,
    incidents,
    now: () => now,
  });
  const response = await application.execute(request("game_incident_cancel", {
    incidentId: "incident:000001",
    expectedVersion: 2,
    reason: "관리자만 가능",
    confirmation: true,
  }));
  assert.equal(response.outcome, "denied");
  assert.equal(response.reasonCode, "administrator_required");
  assert.deepEqual(incidents.calls, []);
});

test("mutates an incident only after current administrator authorization", async () => {
  const store = fakeStore();
  const incidents = fakeIncidents();
  const response = await applicationWith(store, undefined, incidents).execute(
    request("game_incident_correct", {
      incidentId: "incident:000001",
      expectedVersion: 2,
      reason: "오탐 정정",
      confirmation: true,
    }),
  );
  assert.equal(response.outcome, "success");
  assert.equal(response.result.kind, "game_incident_mutation");
  assert.deepEqual(incidents.calls, ["correct:오탐 정정"]);
});

test("returns stale incident conflict and reconciles a duplicate terminal result", async () => {
  const staleStore = fakeStore();
  const stale = await applicationWith(
    staleStore,
    undefined,
    fakeIncidents("conflict"),
  ).execute(request("game_incident_cancel", {
    incidentId: "incident:000001",
    expectedVersion: 1,
    reason: "중복 사건",
    confirmation: true,
  }));
  assert.equal(stale.outcome, "conflict");
  assert.equal(stale.reasonCode, "game_incident_stale");

  const duplicateStore = fakeStore();
  duplicateStore.terminal = {
    operationId: "operation-00000001",
    commandName: "game_incident_cancel",
    outcome: "success",
    reasonCode: "completed",
    completedAt: now,
  };
  const duplicate = await applicationWith(duplicateStore).execute(
    request("game_incident_cancel", {
      incidentId: "incident:000001",
      expectedVersion: 1,
      reason: "중복 사건",
      confirmation: true,
    }),
  );
  assert.equal(duplicate.outcome, "success");
  assert.equal(duplicate.result.kind, "operation_status");
  assert.equal(duplicate.result.status, "success");
});

test("reconciles an incident timeout through operation_status with the same operation id", async () => {
  const store = fakeStore();
  store.terminal = {
    operationId: "incident-operation-01",
    commandName: "game_incident_correct",
    outcome: "success",
    reasonCode: "completed",
    completedAt: now,
  };
  const response = await applicationWith(store).execute(request(
    "operation_status",
    { operationId: "incident-operation-01" },
    "status-operation-0001",
  ));
  assert.equal(response.outcome, "success");
  assert.equal(response.result.kind, "operation_status");
  assert.equal(response.result.status, "success");
  assert.equal(response.result.reasonCode, "completed");
});

function applicationWith(
  store: ReturnType<typeof fakeStore>,
  validate: (() => Promise<
    | { kind: "valid"; normalizedPuuid: string }
    | { kind: "invalid"; reasonCode: "invalid_puuid" | "platform_mismatch" }
  >) | undefined = async () => ({ kind: "valid", normalizedPuuid: "A".repeat(64) }),
  incidents = fakeIncidents(),
) {
  return new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "administrator" };
      },
    },
    validator: { validate: validate ?? (async () => ({ kind: "valid" as const, normalizedPuuid: "A".repeat(64) })) },
    store,
    incidents,
    displayName: async () => "서버 닉네임",
    now: () => now,
  });
}
