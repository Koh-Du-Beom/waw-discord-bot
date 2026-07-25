import assert from "node:assert/strict";
import test from "node:test";

import {
  DASHBOARD_API_PATHS,
  type SessionDto,
  type UpdateLowRiskSettingsResponseDto,
} from "./dashboard.ts";

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
  });

  for (const path of Object.values(DASHBOARD_API_PATHS)) {
    assert.match(path, /^\//);
    assert.equal(path.includes("://"), false);
  }
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
