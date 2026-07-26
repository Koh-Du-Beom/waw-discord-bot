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

function applicationWith(
  store: ReturnType<typeof fakeStore>,
  validate: () => Promise<
    | { kind: "valid"; normalizedPuuid: string }
    | { kind: "invalid"; reasonCode: "invalid_puuid" | "platform_mismatch" }
  > = async () => ({ kind: "valid", normalizedPuuid: "A".repeat(64) }),
) {
  return new AdminCommandApplication({
    authorization: {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "administrator" };
      },
    },
    validator: { validate },
    store,
    now: () => now,
  });
}
