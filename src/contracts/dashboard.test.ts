import assert from "node:assert/strict";
import test from "node:test";

import {
  DASHBOARD_API_PATHS,
  type ActiveGameObservationDto,
  type CommandLogEntryDto,
  type ActiveRiotLinkDto,
  type SessionDto,
  type UpdateLowRiskSettingsResponseDto,
} from "./dashboard.ts";
import {
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
    riotLinks: "/api/riot/links",
    riotApprove: "/api/riot/requests/approve",
    riotReject: "/api/riot/requests/reject",
    riotRemove: "/api/riot/links/remove",
    commandLog: "/api/command-log",
    gameStacks: "/api/game/stacks",
    activeGames: "/api/game/active",
    gameIncidents: "/api/game/incidents",
    gameIncidentCorrect: "/api/game/incidents/correct",
    gameIncidentCancel: "/api/game/incidents/cancel",
  });

  for (const path of Object.values(DASHBOARD_API_PATHS)) {
    assert.match(path, /^\//);
    assert.equal(path.includes("://"), false);
  }
});

test("command-log DTO exposes only exact redacted keys", () => {
  const log: CommandLogEntryDto = {
    occurredAt: "2026-07-27T00:00:00.000Z",
    commandLabel: "요약",
    actorLabel: "등록 사용자",
    outcome: "success",
    reasonLabel: "완료",
  };
  assert.deepEqual(Object.keys(log).sort(), [
    "actorLabel", "commandLabel", "occurredAt", "outcome", "reasonLabel",
  ]);
  const rendered = JSON.stringify({ log });
  for (const forbidden of [
    "discordUserId", "guildId", "channelId", "eventId", "operationId",
    "correlationId", "puuid", "messageContent", "commandOptions",
  ]) {
    assert.equal(rendered.includes(forbidden), false);
  }
});

test("active Riot link DTO exposes a stale-safe version without sensitive identifiers", () => {
  const link: ActiveRiotLinkDto = {
    linkId: "link-synthetic",
    expectedVersion: 3,
    requesterLabel: "등록 사용자",
    platformId: "KR",
    gameName: "표시 이름",
    tagLine: "KR1",
    isPrimary: false,
  };
  assert.deepEqual(Object.keys(link).sort(), [
    "expectedVersion", "gameName", "isPrimary", "linkId", "platformId",
    "requesterLabel", "tagLine",
  ]);
  const rendered = JSON.stringify(link);
  for (const forbidden of ["puuid", "discordUserId", "verificationMethod"]) {
    assert.equal(rendered.includes(forbidden), false);
  }
});

test("game observation DTO exposes separate evidence without persistent identifiers", () => {
  const observation: ActiveGameObservationDto = {
    incidentId: "incident-synthetic",
    memberLabel: "등록 사용자",
    riotId: { platformId: "KR", gameName: "표시 이름", tagLine: "KR1" },
    gameKey: "KR:game-synthetic",
    riotState: "active",
    riotObservedAt: "2026-08-01T00:05:00.000Z",
    goLiveState: "unknown",
    goLiveObservedAt: null,
    comparisonState: "unknown",
    incidentStatus: "open",
    expectedVersion: 1,
    gameStartedAt: "2026-08-01T00:00:00.000Z",
  };
  assert.deepEqual(Object.keys(observation).sort(), [
    "comparisonState", "expectedVersion", "gameKey", "gameStartedAt",
    "goLiveObservedAt", "goLiveState", "incidentId", "incidentStatus",
    "memberLabel", "riotId", "riotObservedAt", "riotState",
  ]);
  const rendered = JSON.stringify(observation);
  for (const forbidden of [
    "puuid", "discordUserId", "evidenceCode", "generation", "sourceObservedAt",
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
