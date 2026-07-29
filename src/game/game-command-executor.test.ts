import assert from "node:assert/strict";
import test from "node:test";

import {
  KoreanCommandHandler,
  type CommandAuditEvent,
  type CommandRequest,
} from "../commands/command-handler.ts";
import {
  GameCommandExecutor,
  type GameCommandStore,
} from "./game-command-executor.ts";

function request(commandName: CommandRequest["commandName"]): CommandRequest {
  return {
    eventId: `event:${commandName}`,
    correlationId: "correlation",
    actorId: "actor",
    guildId: "guild",
    channelId: "channel",
    isThread: false,
    commandName,
    options:
      commandName === "몰랭검거 현황"
        ? {}
        : { 사건: "incident", 사유: " API 장애로 인한 오탐 " },
    signal: new AbortController().signal,
  };
}

function store(
  overrides: Partial<GameCommandStore> = {},
): GameCommandStore {
  return {
    async listStatus() {
      return [{
        incidentId: "incident",
        discordUserId: "actor",
        platformId: "KR",
        gameId: "game",
        riotState: "active",
        goLiveState: "unknown",
        comparisonState: "unknown",
        status: "open",
        version: 2,
        observedAt: new Date("2026-07-25T00:00:00Z"),
      }];
    },
    async listStacks() {
      return [{ discordUserLabel: "사용자", stack: 2 }];
    },
    async findIncidentVersion() {
      return 2;
    },
    async mutateWithAudit() {
      return "updated";
    },
    ...overrides,
  };
}

test("renders Riot and Go Live evidence separately in Korean", async () => {
  const executor = new GameCommandExecutor(
    store(),
    { async readCurrentAuthorization() { return { kind: "unauthorized" }; } },
    () => new Date(),
  );
  const targetRequest = { ...request("몰랭검거 현황"), options: { 사용자: "actor" } };
  const response = await executor.execute(targetRequest);
  assert.match(response, /Riot 활성/);
  assert.match(response, /Go Live 알 수 없음/);
  assert.match(response, /판정 알 수 없음/);
});

test("renders every registered user's confirmed incident stack as a table", async () => {
  const executor = new GameCommandExecutor(
    store(),
    { async readCurrentAuthorization() { return { kind: "unauthorized" }; } },
    () => new Date(),
  );
  const response = await executor.execute(request("몰랭검거 현황"));
  assert.match(response, /사용자\s+\| 몰랭스택/);
  assert.match(response, /사용자\s+\| 2/);
});

test("denies before incident reads and lets the command audit record the denial", async () => {
  const calls: string[] = [];
  const audits: CommandAuditEvent[] = [];
  const executor = new GameCommandExecutor(
    store({
      async findIncidentVersion() {
        calls.push("incident-read");
        return 1;
      },
    }),
    {
      async readCurrentAuthorization() {
        calls.push("authorization");
        return { kind: "authorized", authorizationTier: "operator" };
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  const handler = new KoreanCommandHandler({
    history: { async readPage() { return { messages: [], complete: true }; } },
    features: executor,
    audit: { async append(event) { audits.push(event); } },
    now: () => new Date("2026-07-25T00:00:00Z"),
  });
  assert.match(await handler.handle(request("몰랭검거 취소")), /관리자만/);
  assert.deepEqual(calls, ["authorization"]);
  assert.equal(audits[0]?.outcome, "denied");
  assert.equal(audits[0]?.reasonCode, "administrator_required");
});

test("uses the freshly read version and reports a concurrent stale mutation", async () => {
  let receivedVersion = -1;
  const executor = new GameCommandExecutor(
    store({
      async findIncidentVersion() {
        return 7;
      },
      async mutateWithAudit(input) {
        receivedVersion = input.expectedVersion;
        return "conflict";
      },
    }),
    {
      async readCurrentAuthorization() {
        return { kind: "authorized", authorizationTier: "administrator" };
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  await assert.rejects(
    executor.execute(request("몰랭검거 정정")),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "reasonCode" in error &&
      error.reasonCode === "game_incident_stale",
  );
  assert.equal(receivedVersion, 7);
});
