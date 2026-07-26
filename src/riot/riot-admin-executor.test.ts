import assert from "node:assert/strict";
import test from "node:test";

import {
  RiotAdminAuthorizationError,
  RiotAdminExecutor,
  type RiotAdminStore,
} from "./riot-admin-executor.ts";

test("denies non-admin access with audit before reading or validating PUUID", async () => {
  const audits: string[] = [];
  let reads = 0;
  let validations = 0;
  const executor = new RiotAdminExecutor(
    storeFixture({
      async listPending() { reads += 1; return []; },
      async recordAdminAudit(event) { audits.push(event.reasonCode); },
    }),
    {
      async validate() {
        validations += 1;
        return { kind: "valid", normalizedPuuid: "normalized" };
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  await assert.rejects(
    executor.list(context("operator", "denied-operation")),
    RiotAdminAuthorizationError,
  );
  assert.deepEqual(audits, ["administrator_required"]);
  assert.equal(reads, 0);
  assert.equal(validations, 0);
});

test("resolves the pending Riot ID and forwards only the normalized PUUID", async () => {
  let approvedPuuid = "";
  const audits: string[] = [];
  const executor = new RiotAdminExecutor(
    storeFixture({
      async approveRequestWithAudit(input) {
        approvedPuuid = input.puuid;
        return "approved";
      },
      async recordAdminAudit(event) {
        audits.push(event.reasonCode);
      },
    }),
    {
      async resolve(input) {
        assert.deepEqual(input, { gameName: "계정", tagLine: "KR1", platformId: "KR" });
        return { kind: "valid", normalizedPuuid: "normalized-puuid" };
      },
      async validate(input) {
        throw new Error(`legacy validator called: ${input.platformId}`);
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  assert.match(
    await executor.approve({
      ...context("administrator", "approve-operation"),
      requestId: "request",
      expectedVersion: 0,
    }),
    /승인했습니다/,
  );
  assert.equal(approvedPuuid, "normalized-puuid");
  assert.deepEqual(audits, []);
});

test("rejects invalid PUUID without mutation and reports stale and duplicate decisions", async () => {
  let approvals = 0;
  const audits: string[] = [];
  const store = storeFixture({
    async approveRequestWithAudit() {
      approvals += 1;
      return "stale";
    },
    async rejectRequestWithAudit() {
      return "duplicate_operation";
    },
    async recordAdminAudit(event) {
      audits.push(event.reasonCode);
    },
  });
  const invalid = new RiotAdminExecutor(
    store,
    {
      async validate() {
        return { kind: "invalid", reasonCode: "platform_mismatch" };
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  assert.match(
    await invalid.approve({
      ...context("administrator", "invalid-operation"),
      requestId: "request",
      expectedVersion: 0,
    }),
    /검증에 실패/,
  );
  assert.equal(approvals, 0);
  assert.deepEqual(audits, ["platform_mismatch"]);

  const valid = new RiotAdminExecutor(
    store,
    { async validate() { return { kind: "valid", normalizedPuuid: "puuid" }; } },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  assert.match(
    await valid.approve({
      ...context("administrator", "stale-operation"),
      requestId: "request",
      expectedVersion: 7,
    }),
    /새로 조회/,
  );
  assert.match(
    await valid.reject({
      ...context("administrator", "duplicate-operation"),
      requestId: "request",
      expectedVersion: 7,
    }),
    /이미 처리/,
  );
});

function context(
  authorizationTier: "operator" | "administrator",
  operationId: string,
) {
  return {
    operationId,
    correlationId: `correlation:${operationId}`,
    actorId: "actor",
    authorizationTier,
    guildId: "guild",
    channelId: "channel",
  };
}

function storeFixture(
  overrides: Partial<RiotAdminStore>,
): RiotAdminStore {
  return {
    async listPending() { return []; },
    async findPending() {
      return {
        requestId: "request",
        discordUserId: "member",
        platformId: "KR",
        gameName: "계정",
        tagLine: "KR1",
        requestedAt: new Date("2026-07-25T00:00:00Z"),
        version: 0,
      };
    },
    async approveRequestWithAudit() { return "approved"; },
    async rejectRequestWithAudit() { return "rejected"; },
    async recordAdminAudit() {},
    ...overrides,
  };
}
