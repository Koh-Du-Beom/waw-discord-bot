import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AdminCommandRequest,
  AdminCommandResponse,
} from "../contracts/admin-command-ipc.ts";
import { HttpPortError } from "../http/dashboard-server.ts";
import { createAdminCommandDashboardPorts } from "./admin-command-dashboard-ports.ts";

const now = new Date("2026-07-26T07:00:00.000Z");
const context = {
  actorId: "123456789012345678",
  authorizationTier: "administrator" as const,
  operationId: "dashboard-operation-01",
};

test("audits before dispatch and maps a bounded page without reflecting approval input", async () => {
  const order: string[] = [];
  let captured: AdminCommandRequest | undefined;
  const ports = createAdminCommandDashboardPorts({
    guildId: "223456789012345678",
    now: () => now,
    generateId: ids(),
    audit: {
      async append(event) {
        order.push(`audit:${event.commandName}`);
      },
    },
    transport: {
      async execute(request) {
        order.push("transport");
        captured = request;
        return success(request, {
          kind: "riot_link_request_page",
          requests: [{
            requestId: "riot-request-0001",
            discordUserId: "323456789012345678",
            requesterLabel: "요청자",
            platformId: "KR",
            gameName: "Summoner",
            tagLine: "KR1",
            requestedAt: now.toISOString(),
            version: 2,
          }],
          nextCursor: "opaque_cursor_01",
        });
      },
    },
  });
  const result = await ports.listPendingRiotLinks({
    ...context,
    request: { cursor: "incoming_cursor_01" },
  });
  assert.deepEqual(order, ["audit:riot_link_request_list", "transport"]);
  assert.equal(captured?.command, "riot_link_request_list");
  assert.deepEqual(captured?.payload, {
    limit: 50,
    cursor: "incoming_cursor_01",
  });
  assert.equal(result.nextCursor, "opaque_cursor_01");
  assert.equal(result.requests.length, 1);
});

test("does not invoke transport when the permanent pre-dispatch audit fails", async () => {
  let transportCalls = 0;
  const ports = createAdminCommandDashboardPorts({
    guildId: "223456789012345678",
    now: () => now,
    generateId: ids(),
    audit: {
      async append() {
        throw new Error("audit unavailable");
      },
    },
    transport: {
      async execute(request) {
        transportCalls += 1;
        return success(request, {
          kind: "riot_link_decision",
          status: "approved",
        });
      },
    },
  });
  await assert.rejects(ports.approveRiotLink({
    ...context,
    request: {
      requestId: "riot-request-0001",
      expectedVersion: 0,
      confirmation: true,
    },
  }));
  assert.equal(transportCalls, 0);
});

test("maps unavailable, stale and mutation timeout to HTTP port outcomes", async () => {
  const cases = [
    {
      response: failure("unavailable", "request_unavailable"),
      code: "unavailable",
    },
    {
      response: failure("conflict", "riot_link_request_stale"),
      code: "conflict",
    },
    {
      response: failure("outcome_unknown", "request_unavailable"),
      code: "timeout",
    },
  ] as const;
  for (const item of cases) {
    const ports = portsReturning(item.response);
    await assert.rejects(
      ports.rejectRiotLink({
        ...context,
        request: {
          requestId: "riot-request-0001",
          expectedVersion: 0,
          confirmation: true,
        },
      }),
      (error) => error instanceof HttpPortError && error.code === item.code,
    );
  }
});

test("reconciles duplicate operation through operation_status without repeating mutation", async () => {
  const commands: string[] = [];
  const ports = createAdminCommandDashboardPorts({
    guildId: "223456789012345678",
    now: () => now,
    generateId: ids(),
    audit: { async append() {} },
    transport: {
      async execute(request) {
        commands.push(request.command);
        if (request.command !== "operation_status") {
          return failure("duplicate", "operation_duplicate", request);
        }
        assert.equal(request.payload.operationId, context.operationId);
        return success(request, {
          kind: "operation_status",
          status: "success",
          reasonCode: "completed",
        });
      },
    },
  });
  const result = await ports.approveRiotLink({
    ...context,
    request: {
      requestId: "riot-request-0001",
      expectedVersion: 0,
      confirmation: true,
    },
  });
  assert.equal(result.message, "승인했습니다.");
  assert.deepEqual(commands, [
    "riot_link_request_approve",
    "operation_status",
  ]);
});

function portsReturning(response: AdminCommandResponse) {
  return createAdminCommandDashboardPorts({
    guildId: "223456789012345678",
    now: () => now,
    generateId: ids(),
    audit: { async append() {} },
    transport: { async execute() { return response; } },
  });
}

function failure(
  outcome: "unavailable" | "conflict" | "outcome_unknown" | "duplicate",
  reasonCode:
    | "request_unavailable"
    | "riot_link_request_stale"
    | "operation_duplicate",
  request?: AdminCommandRequest,
): AdminCommandResponse {
  return {
    version: 1,
    requestId: request?.requestId ?? "generated-request-02",
    operationId: request?.operationId ?? context.operationId,
    outcome,
    reasonCode,
  };
}

function success(
  request: AdminCommandRequest,
  result: Extract<AdminCommandResponse, { outcome: "success" }>["result"],
): AdminCommandResponse {
  return {
    version: 1,
    requestId: request.requestId,
    operationId: request.operationId,
    outcome: "success",
    reasonCode: "completed",
    result,
  };
}

function ids() {
  let value = 0;
  return () => `generated-id-${String(++value).padStart(4, "0")}`;
}
