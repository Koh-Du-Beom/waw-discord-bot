import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_COMMAND_MAXIMUM_FRAME_BYTES,
  parseAdminCommandRequest,
  parseAdminCommandResponse,
  serializeAdminCommandRequest,
  serializeAdminCommandResponse,
  type AdminCommandRequest,
  type AdminCommandResponse,
} from "./admin-command-ipc.ts";

const requestId = "request_id_000001";
const operationId = "operation:000001";
const actorId = "123456789012345678";
const guildId = "223456789012345678";
const requestedAt = new Date("2026-07-26T00:00:00.000Z");
const expiresAt = new Date("2026-07-26T00:00:15.000Z");
const puuid = "p".repeat(64);

function base() {
  return {
    version: 1,
    requestId,
    operationId,
    actorId,
    guildId,
    requestedAt: requestedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

test("parses and serializes all seven exact command payloads", () => {
  const wires = [
    {
      ...base(),
      command: "game_incident_correct",
      payload: {
        incidentId: "incident:000001",
        expectedVersion: 3,
        reason: "오탐 정정",
        confirmation: true,
      },
    },
    {
      ...base(),
      command: "game_incident_cancel",
      payload: {
        incidentId: "incident:000001",
        expectedVersion: 3,
        reason: "중복 사건",
        confirmation: true,
      },
    },
    {
      ...base(),
      command: "riot_link_remove",
      payload: { linkId: "link:active0001", expectedVersion: 3, confirmation: true },
    },
    {
      ...base(),
      command: "riot_link_request_list",
      payload: { limit: 50, cursor: "cursor_1" },
    },
    {
      ...base(),
      command: "riot_link_request_approve",
      payload: {
        requestId: "request:pending1",
        expectedVersion: 3,
      },
    },
    {
      ...base(),
      command: "riot_link_request_reject",
      payload: { requestId: "request:pending1", expectedVersion: 3 },
    },
    {
      ...base(),
      command: "operation_status",
      payload: { operationId: "operation:target1" },
    },
  ];
  for (const wire of wires) {
    const parsed = parseAdminCommandRequest(JSON.stringify(wire));
    assert.ok(parsed);
    assert.equal(parsed.command, wire.command);
    assert.deepEqual(
      parseAdminCommandRequest(serializeAdminCommandRequest(parsed)),
      parsed,
    );
  }
});

test("enforces positive TTL no greater than fifteen seconds and exact ISO dates", () => {
  assert.ok(parseAdminCommandRequest(JSON.stringify({
    ...base(),
    command: "operation_status",
    payload: { operationId: "operation:target1" },
  })));
  for (const [requested, expires] of [
    [requestedAt.toISOString(), requestedAt.toISOString()],
    [requestedAt.toISOString(), "2026-07-26T00:00:15.001Z"],
    ["2026-07-26T00:00:00Z", expiresAt.toISOString()],
    [expiresAt.toISOString(), requestedAt.toISOString()],
  ]) {
    assert.equal(parseAdminCommandRequest(JSON.stringify({
      ...base(),
      requestedAt: requested,
      expiresAt: expires,
      command: "operation_status",
      payload: { operationId: "operation:target1" },
    })), undefined);
  }
});

test("rejects unknown, missing and command-specific payload fields", () => {
  const valid = {
    ...base(),
    command: "riot_link_request_approve",
    payload: {
      requestId: "request:pending1",
      expectedVersion: 0,
    },
  };
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...base(),
    command: "game_incident_correct",
    payload: {
      incidentId: "incident:000001",
      expectedVersion: 0,
      reason: " ",
      confirmation: true,
    },
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...valid,
    authorizationTier: "administrator",
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...base(),
    command: "riot_link_remove",
    payload: { linkId: "link:active0001", expectedVersion: 0, confirmation: false },
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...valid,
    payload: { ...valid.payload, confirmation: true },
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...valid,
    payload: { ...valid.payload, expectedVersion: -1 },
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...valid,
    payload: { ...valid.payload, puuid: "short" },
  })), undefined);
  assert.equal(parseAdminCommandRequest(JSON.stringify({
    ...base(),
    command: "arbitrary_sql",
    payload: { sql: "select 1" },
  })), undefined);
});

test("accepts exactly 32 KiB and rejects larger, multi-frame and invalid UTF-8", () => {
  const minimal = JSON.stringify({
    ...base(),
    command: "operation_status",
    payload: { operationId: "operation:target1" },
  });
  const exact = minimal + " ".repeat(
    ADMIN_COMMAND_MAXIMUM_FRAME_BYTES - Buffer.byteLength(minimal),
  );
  assert.equal(Buffer.byteLength(exact), ADMIN_COMMAND_MAXIMUM_FRAME_BYTES);
  assert.ok(parseAdminCommandRequest(exact));
  assert.equal(parseAdminCommandRequest(`${exact} `), undefined);
  assert.equal(parseAdminCommandRequest(`${minimal}\n${minimal}`), undefined);
  assert.equal(parseAdminCommandRequest(new Uint8Array([0xff, 0xfe])), undefined);
});

test("parses only allowlisted response shapes and binds the request ID", () => {
  const page: AdminCommandResponse = {
    version: 1,
    requestId,
    operationId,
    outcome: "success",
    reasonCode: "completed",
    result: {
      kind: "riot_link_request_page",
      requests: [{
        requestId: "request:pending1",
        discordUserId: actorId,
        requesterLabel: "서버 닉네임",
        platformId: "KR",
        gameName: "게임이름",
        tagLine: "KR1",
        requestedAt: requestedAt.toISOString(),
        version: 2,
      }],
      nextCursor: "cursor_2",
    },
  };
  assert.deepEqual(
    parseAdminCommandResponse(serializeAdminCommandResponse(page), requestId),
    page,
  );
  assert.equal(
    parseAdminCommandResponse(JSON.stringify(page), "different_req_001"),
    undefined,
  );
  assert.equal(parseAdminCommandResponse(JSON.stringify({
    ...page,
    result: { ...page.result, providerBody: "secret" },
  }), requestId), undefined);
  assert.equal(parseAdminCommandResponse(JSON.stringify({
    version: 1,
    requestId,
    operationId,
    outcome: "conflict",
    reasonCode: "riot_link_request_stale",
  }), requestId)?.outcome, "conflict");
  const removal: AdminCommandResponse = {
    version: 1,
    requestId,
    operationId,
    outcome: "success",
    reasonCode: "completed",
    result: { kind: "riot_link_removal", status: "removed" },
  };
  assert.deepEqual(
    parseAdminCommandResponse(serializeAdminCommandResponse(removal), requestId),
    removal,
  );
});

test("never reflects PUUID, Riot ID or provider input in parser failures", () => {
  const canaries = [
    "puuid-secret-canary",
    "riot-id-secret-canary",
    "provider-body-secret-canary",
  ] as const;
  const malformed = JSON.stringify({
    ...base(),
    command: "riot_link_request_approve",
    payload: {
      requestId: "request:pending1",
      expectedVersion: 0,
      riotId: canaries[1],
      providerBody: canaries[2],
    },
  });
  const parsed = parseAdminCommandRequest(malformed);
  assert.equal(parsed, undefined);
  assert.equal(JSON.stringify(parsed), undefined);

  let failure: unknown;
  try {
    serializeAdminCommandRequest({
      version: 1,
      requestId,
      operationId,
      actorId,
      guildId,
      command: "riot_link_request_approve",
      requestedAt,
      expiresAt,
      payload: {
        requestId: "request:pending1",
        expectedVersion: 0,
        forbiddenIdentifier: canaries[0],
      },
    } as unknown as AdminCommandRequest);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error);
  for (const canary of canaries) {
    assert.equal(JSON.stringify(failure).includes(canary), false);
  }
});
