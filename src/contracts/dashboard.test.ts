import assert from "node:assert/strict";
import test from "node:test";

import {
  DASHBOARD_API_PATHS,
  type CommandLogEntryDto,
  type SessionDto,
  type SummaryQuotaStatusDto,
  type UpdateLowRiskSettingsResponseDto,
} from "./dashboard.ts";
import {
  koreanQuotaDate,
  parseCommandLogPageInput,
} from "../summary/summary-quota-contract.ts";

test("dashboard API paths remain same-origin and canonical", () => {
  assert.deepEqual(DASHBOARD_API_PATHS, {
    login: "/auth/login",
    callback: "/auth/discord/callback",
    session: "/api/session",
    logout: "/api/logout",
    overview: "/api/overview",
    settings: "/api/settings/summary",
    audit: "/api/audit",
    riotRequests: "/api/riot/requests/list",
    riotApprove: "/api/riot/requests/approve",
    riotReject: "/api/riot/requests/reject",
    commandLog: "/api/command-log",
    summaryQuotas: "/api/summary/quotas",
    summaryQuotaDefault: "/api/summary/quotas/default",
    summaryQuotaUser: "/api/summary/quotas/user",
  });

  for (const path of Object.values(DASHBOARD_API_PATHS)) {
    assert.match(path, /^\//);
    assert.equal(path.includes("://"), false);
  }
});

test("command-log and quota DTOs expose only exact redacted keys", () => {
  const log: CommandLogEntryDto = {
    occurredAt: "2026-07-27T00:00:00.000Z",
    commandLabel: "요약",
    actorLabel: "등록 사용자",
    outcome: "success",
    reasonLabel: "완료",
  };
  const quota: SummaryQuotaStatusDto = {
    userKey: "opaque_user_key",
    displayLabel: "등록 사용자",
    used: 3,
    effectiveLimit: 10,
    remaining: 7,
    limitSource: "default",
    enabled: true,
    nextResetAt: "2026-07-28T00:00:00+09:00",
    version: 1,
  };

  assert.deepEqual(Object.keys(log).sort(), [
    "actorLabel", "commandLabel", "occurredAt", "outcome", "reasonLabel",
  ]);
  assert.deepEqual(Object.keys(quota).sort(), [
    "displayLabel", "effectiveLimit", "enabled", "limitSource",
    "nextResetAt", "remaining", "used", "userKey", "version",
  ]);
  const rendered = JSON.stringify({ log, quota });
  for (const forbidden of [
    "discordUserId", "guildId", "channelId", "eventId", "operationId",
    "correlationId", "puuid", "messageContent", "commandOptions",
  ]) {
    assert.equal(rendered.includes(forbidden), false);
  }
});

test("command-log pagination bounds and opaque cursor format are fixed", () => {
  assert.deepEqual(parseCommandLogPageInput({}), { limit: 50 });
  assert.deepEqual(parseCommandLogPageInput({ limit: 1 }), { limit: 1 });
  assert.deepEqual(parseCommandLogPageInput({ limit: 100 }), { limit: 100 });
  assert.throws(() => parseCommandLogPageInput({ limit: 0 }), /invalid/u);
  assert.throws(() => parseCommandLogPageInput({ limit: 101 }), /invalid/u);
  assert.throws(() => parseCommandLogPageInput({ cursor: "raw:event:id" }), /invalid/u);
  assert.deepEqual(
    parseCommandLogPageInput({ cursor: "opaque_cursor_0123456789" }),
    { limit: 50, cursor: "opaque_cursor_0123456789" },
  );
});

test("quota dates use the Asia/Seoul calendar boundary", () => {
  assert.equal(koreanQuotaDate(new Date("2026-07-27T14:59:59.999Z")), "2026-07-27");
  assert.equal(koreanQuotaDate(new Date("2026-07-27T15:00:00.000Z")), "2026-07-28");
  assert.throws(() => koreanQuotaDate(new Date("invalid")), /invalid/u);
});

test("session and mutation contracts carry CSRF and audited version results", () => {
  const session: SessionDto = {
    authenticated: true,
    actor: { displayName: "synthetic operator", tier: "operator" },
    csrfToken: "csrf-synthetic",
  };
  const response: UpdateLowRiskSettingsResponseDto = {
    settings: { summaryEnabled: false, version: 2 },
    auditEvent: {
      id: "audit-synthetic",
      occurredAt: "2026-07-24T00:00:00.000Z",
      actorId: "actor-synthetic",
      action: "settings.summary.update",
      outcome: "success",
      reasonCode: "updated",
    },
  };

  assert.equal(session.csrfToken, "csrf-synthetic");
  assert.equal(response.settings.version, 2);
  assert.equal(response.auditEvent.outcome, "success");
});
