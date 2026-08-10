import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AuthService, AuthServiceResponse } from "../auth/auth-service.ts";
import type {
  AuditEventsDto,
  DashboardOverviewDto,
  LowRiskSettingsDto,
} from "../contracts/dashboard.ts";
import {
  buildDashboardServer,
  HttpPortError,
  type DashboardHttpPorts,
  type OperationalLogEvent,
} from "./dashboard-server.ts";

const sessionCookie = "__Host-waw_session=session_session_session_session_12";
const csrfToken = "ccccccccccccccccccccccccccccccccccccccccccc";
const mutationHeaders = {
  cookie: `${sessionCookie}; __Host-waw_csrf=${csrfToken}`,
  origin: "https://waw.dubeom.com",
  "x-csrf-token": csrfToken,
};

function authResponse(
  statusCode: number,
  body: Readonly<Record<string, string>>,
  headers: AuthServiceResponse["headers"] = {},
): AuthServiceResponse {
  return { statusCode, headers, body };
}

function authService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: async () => authResponse(302, { kind: "redirect" }),
    callback: async () => authResponse(303, { kind: "succeeded" }),
    authorize: async () =>
      authResponse(200, {
        kind: "authorized",
        actorId: "500",
        authorizationTier: "operator",
        source: "current-role",
      }),
    logout: async () => authResponse(204, {}),
    ...overrides,
  };
}

function ports(overrides: Partial<DashboardHttpPorts> = {}): DashboardHttpPorts {
  const overview: DashboardOverviewDto = {
    health: {
      status: "healthy",
      gateway: { status: "connected" },
      storage: { status: "connected" },
    },
    lastBackup: {
      status: "published",
      completedAt: "2026-07-24T10:00:00.000Z",
    },
  };
  const settings: LowRiskSettingsDto = {
    summaryEnabled: true,
    version: 3,
  };
  const audit: AuditEventsDto = {
    events: [
      {
        id: "audit-1",
        occurredAt: "2026-07-24T10:01:00.000Z",
        actorId: "actor-1",
        action: "settings.summary.update",
        outcome: "success",
        reasonCode: "updated",
      },
    ],
  };
  return {
    readDisplayName: async () => "Fixture Operator",
    readOverview: async () => overview,
    readActiveRiotLinks: async () => ({ links: [] }),
    readKboManagement: async () => ({
      accounts: [],
      provider: { games: 0, latestStatus: null, sourceUpdatedAt: null, collectedAt: null },
    }),
    readGameStacks: async () => ({ entries: [] }),
    readActiveGameObservations: async () => ({ entries: [] }),
    readGameIncidentHistory: async () => ({ entries: [] }),
    readSettings: async () => settings,
    updateSettings: async () => ({
      kind: "updated",
      settings: { summaryEnabled: false, version: 4 },
    }),
    readAudit: async () => audit,
    readCommandLog: async () => ({ entries: [] }),
    listPendingRiotLinks: async () => ({ requests: [] }),
    approveRiotLink: async () => ({ message: "승인했습니다." }),
    rejectRiotLink: async () => ({ message: "거절했습니다." }),
    removeRiotLink: async () => ({ message: "연결을 해제했습니다." }),
    adjustKboCredit: async () => ({
      message: "크레딧을 조정했습니다.",
      availableBalance: "0",
      version: 1,
    }),
    correctGameIncident: async () => ({ message: "사건을 정정했습니다." }),
    cancelGameIncident: async () => ({ message: "사건을 취소했습니다." }),
    ...overrides,
  };
}

function server(input: {
  auth?: Partial<AuthService>;
  ports?: Partial<DashboardHttpPorts>;
  logs?: OperationalLogEvent[];
  spaRoot?: string;
} = {}) {
  const logs = input.logs ?? [];
  return buildDashboardServer({
    auth: authService(input.auth),
    ports: ports(input.ports),
    serviceVersion: "test-version",
    operationalLog(event) {
      logs.push(event);
    },
    ...(input.spaRoot === undefined ? {} : { spaRoot: input.spaRoot }),
  });
}

test("composes auth and protected read routes with allowlisted DTOs", async () => {
  const app = server({
    auth: {
      login: async () =>
        authResponse(
          302,
          { kind: "redirect", leaked: "not-serialized" },
          { location: "https://discord.com/oauth2/authorize" },
        ),
      callback: async () =>
        authResponse(
          303,
          { kind: "succeeded", leaked: "not-serialized" },
          { location: "/", "set-cookie": ["safe=one", "safe=two"] },
        ),
    },
  });

  const login = await app.inject({ method: "GET", url: "/auth/login" });
  assert.equal(login.statusCode, 302);
  assert.equal(login.headers.location, "https://discord.com/oauth2/authorize");
  assert.equal(login.body, "");

  const callback = await app.inject({
    method: "GET",
    url: `/auth/discord/callback?code=${"a".repeat(32)}&state=${"b".repeat(32)}`,
  });
  assert.equal(callback.statusCode, 303);
  assert.equal(callback.headers.location, "/");
  assert.deepEqual(callback.headers["set-cookie"], ["safe=one", "safe=two"]);
  assert.equal(callback.body, "");

  const session = await app.inject({
    method: "GET",
    url: "/api/session",
    headers: { cookie: `${sessionCookie}; __Host-waw_csrf=${csrfToken}` },
  });
  assert.deepEqual(session.json(), {
    authenticated: true,
    actor: { displayName: "Fixture Operator", tier: "operator" },
    csrfToken,
  });

  for (const url of ["/api/overview", "/api/settings/summary", "/api/audit"]) {
    const result = await app.inject({
      method: "GET",
      url,
      headers: { cookie: sessionCookie },
    });
    assert.equal(result.statusCode, 200);
  }

  const logout = await app.inject({
    method: "POST",
    url: "/api/logout",
    headers: mutationHeaders,
  });
  assert.equal(logout.statusCode, 204);
  await app.close();
});

test("game read APIs allow operators and administrators with allowlisted responses", async () => {
  for (const tier of ["operator", "administrator"] as const) {
    const calls: string[] = [];
    const observation = {
      incidentId: "incident-1",
      memberLabel: "등록 사용자",
      riotId: null,
      gameKey: "KR:game-1",
      riotState: "active" as const,
      riotObservedAt: "2026-08-01T00:05:00.000Z",
      goLiveState: "unknown" as const,
      goLiveObservedAt: null,
      comparisonState: "unknown" as const,
      incidentStatus: "open" as const,
      expectedVersion: 2,
      gameStartedAt: "2026-08-01T00:00:00.000Z",
    };
    const app = server({
      auth: {
        authorize: async (input) => {
          assert.equal(input.kind, "read");
          return authResponse(200, {
            kind: "authorized",
            actorId: "500",
            authorizationTier: tier,
            source: "current-role",
          });
        },
      },
      ports: {
        async readGameStacks() {
          calls.push("stacks");
          return { entries: [{ memberLabel: "등록 사용자", stack: 1 }] };
        },
        async readActiveGameObservations() {
          calls.push("active");
          return { entries: [{ ...observation, leaked: "not-serialized" }] };
        },
        async readGameIncidentHistory(request) {
          calls.push(`history:${request.limit}:${request.status}:${request.memberLabel}`);
          return {
            entries: [{
              ...observation,
              gameEndedAt: null,
              incidentUpdatedAt: "2026-08-01T00:06:00.000Z",
              leaked: "not-serialized",
            }],
          };
        },
      },
    });

    const requests = [
      { url: "/api/game/stacks", call: "stacks" },
      { url: "/api/game/active", call: "active" },
      {
        url: "/api/game/incidents?limit=25&status=open&memberLabel=%EB%93%B1%EB%A1%9D%20%EC%82%AC%EC%9A%A9%EC%9E%90",
        call: "history:25:open:등록 사용자",
      },
    ];
    for (const request of requests) {
      const response = await app.inject({
        method: "GET",
        url: request.url,
        headers: { cookie: sessionCookie },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.stringify(response.json()).includes("leaked"), false);
      assert.equal(calls.at(-1), request.call);
    }
    await app.close();
  }
});

test("game read APIs deny invalid roles and unavailable or expired role evidence before ports", async () => {
  const denials = [
    {
      response: authResponse(401, { kind: "denied", reason: "session-invalid" }),
      code: "unauthenticated",
    },
    {
      response: authResponse(403, { kind: "denied", reason: "unauthorized" }),
      code: "forbidden",
    },
    {
      response: authResponse(503, { kind: "denied", reason: "unavailable" }),
      code: "unavailable",
    },
  ] as const;
  for (const denial of denials) {
    let portCalls = 0;
    const app = server({
      auth: { authorize: async () => denial.response },
      ports: {
        async readGameStacks() { portCalls += 1; return { entries: [] }; },
        async readActiveGameObservations() { portCalls += 1; return { entries: [] }; },
        async readGameIncidentHistory() { portCalls += 1; return { entries: [] }; },
      },
    });
    for (const url of [
      "/api/game/stacks",
      "/api/game/active",
      "/api/game/incidents",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { cookie: sessionCookie },
      });
      assert.equal(response.statusCode, denial.response.statusCode);
      assert.equal(response.json().error.code, denial.code);
    }
    assert.equal(portCalls, 0);
    await app.close();
  }
});

test("game incident read rejects malformed filters before the port", async () => {
  let portCalls = 0;
  const app = server({
    ports: {
      async readGameIncidentHistory() {
        portCalls += 1;
        return { entries: [] };
      },
    },
  });
  for (const url of [
    "/api/game/incidents?limit=0",
    "/api/game/incidents?limit=101",
    "/api/game/incidents?status=invalid",
    "/api/game/incidents?unexpected=true",
  ]) {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { cookie: sessionCookie },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_request");
  }
  assert.equal(portCalls, 0);
  await app.close();
});

test("game incident mutation requires administrator high-risk authorization and exact body", async () => {
  const authorizationCalls: Array<{ kind: string; explicitConfirmation?: boolean }> = [];
  const mutations: string[] = [];
  const app = server({
    auth: {
      async authorize(input) {
        authorizationCalls.push(input);
        return authResponse(200, {
          kind: "authorized",
          actorId: "administrator-1",
          authorizationTier: "administrator",
          source: "current-role",
        });
      },
    },
    ports: {
      async correctGameIncident(input) {
        mutations.push(`correct:${input.request.incidentId}:${input.request.expectedVersion}:${input.request.reason}`);
        return { message: "사건을 정정했습니다." };
      },
      async cancelGameIncident() {
        throw new HttpPortError("conflict", "game_incident_stale");
      },
    },
  });
  const correct = await app.inject({
    method: "POST",
    url: "/api/game/incidents/correct",
    headers: mutationHeaders,
    payload: {
      incidentId: "incident:000001",
      expectedVersion: 4,
      reason: "오탐 정정",
      confirmation: true,
    },
  });
  assert.equal(correct.statusCode, 200);
  const cancel = await app.inject({
    method: "POST",
    url: "/api/game/incidents/cancel",
    headers: mutationHeaders,
    payload: {
      incidentId: "incident:000001",
      expectedVersion: 3,
      reason: "중복 사건",
      confirmation: true,
    },
  });
  assert.equal(cancel.statusCode, 409);
  assert.deepEqual(mutations, ["correct:incident:000001:4:오탐 정정"]);
  assert.deepEqual(
    authorizationCalls.map((call) => [call.kind, call.explicitConfirmation]),
    [["high-risk", true], ["high-risk", true]],
  );

  for (const payload of [
    { incidentId: "incident:000001", expectedVersion: 4, reason: "오탐 정정" },
    { incidentId: "incident:000001", expectedVersion: 4, reason: " ", confirmation: true },
    { incidentId: "incident:000001", expectedVersion: 4, reason: "line\nbreak", confirmation: true },
    { incidentId: "incident:000001", expectedVersion: 4, reason: "x".repeat(501), confirmation: true },
  ]) {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/game/incidents/correct",
      headers: mutationHeaders,
      payload,
    });
    assert.equal(invalid.statusCode, 400);
  }
  await app.close();
});

test("game incident mutation denies operator and stale OAuth or CSRF before the port", async () => {
  const denials = [
    authResponse(200, {
      kind: "authorized",
      actorId: "operator-1",
      authorizationTier: "operator",
      source: "current-role",
    }),
    authResponse(403, { kind: "denied", reason: "recent-auth-required" }),
    authResponse(403, { kind: "denied", reason: "csrf-invalid" }),
  ];
  for (const denial of denials) {
    let calls = 0;
    const app = server({
      auth: { authorize: async () => denial },
      ports: {
        async correctGameIncident() {
          calls += 1;
          return { message: "unexpected" };
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/game/incidents/correct",
      headers: mutationHeaders,
      payload: {
        incidentId: "incident:000001",
        expectedVersion: 4,
        reason: "오탐 정정",
        confirmation: true,
      },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(calls, 0);
    await app.close();
  }
});

test("Riot administrator routes require current admin, CSRF, recent auth, confirmation and version", async () => {
  const authorizationCalls: {
    kind: string;
    explicitConfirmation?: boolean;
    headers: Readonly<Record<string, string | undefined>>;
  }[] = [];
  const portCalls: string[] = [];
  const app = server({
    auth: {
      async authorize(input) {
        authorizationCalls.push(input);
        return authResponse(200, {
          kind: "authorized",
          actorId: "administrator-1",
          authorizationTier: "administrator",
          source: "current-role",
        });
      },
    },
    ports: {
      async listPendingRiotLinks(input) {
        portCalls.push(`list:${input.authorizationTier}`);
        return {
          requests: [{
            requestId: "request-1",
            discordUserId: "member-1",
            requesterLabel: "요청자",
            platformId: "KR",
            gameName: "계정",
            tagLine: "KR1",
            requestedAt: "2026-07-25T00:00:00.000Z",
            version: 3,
          }],
        };
      },
      async approveRiotLink(input) {
        portCalls.push(`approve:${input.request.expectedVersion}`);
        return { message: "승인했습니다." };
      },
      async rejectRiotLink(input) {
        portCalls.push(`reject:${input.request.expectedVersion}`);
        throw new HttpPortError("conflict", "riot_link_request_stale");
      },
      async removeRiotLink(input) {
        portCalls.push(`remove:${input.request.linkId}:${input.request.expectedVersion}`);
        return { message: "연결을 해제했습니다." };
      },
    },
  });

  const list = await app.inject({
    method: "POST",
    url: "/api/riot/requests/list",
    headers: mutationHeaders,
    payload: {},
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().requests[0].version, 3);

  const approve = await app.inject({
    method: "POST",
    url: "/api/riot/requests/approve",
    headers: mutationHeaders,
    payload: {
      requestId: "request-1",
      expectedVersion: 3,
      confirmation: true,
    },
  });
  assert.equal(approve.statusCode, 200);

  const reject = await app.inject({
    method: "POST",
    url: "/api/riot/requests/reject",
    headers: mutationHeaders,
    payload: {
      requestId: "request-1",
      expectedVersion: 2,
      confirmation: true,
    },
  });
  assert.equal(reject.statusCode, 409);
  assert.equal(reject.json().error.code, "conflict");
  const remove = await app.inject({
    method: "POST",
    url: "/api/riot/links/remove",
    headers: mutationHeaders,
    payload: {
      linkId: "link:active0001",
      expectedVersion: 4,
      confirmation: true,
    },
  });
  assert.equal(remove.statusCode, 200);
  assert.deepEqual(
    authorizationCalls.map((call) => ({
      kind: call.kind,
      confirmation: call.explicitConfirmation ?? false,
      csrf: call.headers["x-csrf-token"],
    })),
    [
      { kind: "mutation", confirmation: false, csrf: csrfToken },
      { kind: "high-risk", confirmation: true, csrf: csrfToken },
      { kind: "high-risk", confirmation: true, csrf: csrfToken },
      { kind: "high-risk", confirmation: true, csrf: csrfToken },
    ],
  );
  assert.deepEqual(portCalls, [
    "list:administrator",
    "approve:3",
    "reject:2",
    "remove:link:active0001:4",
  ]);

  const missingConfirmation = await app.inject({
    method: "POST",
    url: "/api/riot/requests/approve",
    headers: mutationHeaders,
    payload: {
      requestId: "request-1",
      expectedVersion: 3,
    },
  });
  assert.equal(missingConfirmation.statusCode, 400);
  await app.close();
});

test("Riot administrator routes reject a current operator before invoking ports", async () => {
  let portCalls = 0;
  const app = server({
    ports: {
      async listPendingRiotLinks() {
        portCalls += 1;
        return { requests: [] };
      },
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/riot/requests/list",
    headers: mutationHeaders,
    payload: {},
  });
  assert.equal(response.statusCode, 403);
  assert.equal(portCalls, 0);
  await app.close();
});

test("KBO management is admin-only and credit adjustment uses high-risk authorization", async () => {
  const authorizationCalls: Array<{ kind: string; confirmation?: boolean }> = [];
  let adjustment: unknown;
  const app = server({
    auth: {
      async authorize(input) {
        authorizationCalls.push({
          kind: input.kind,
          ...(input.explicitConfirmation === undefined
            ? {}
            : { confirmation: input.explicitConfirmation }),
        });
        return authResponse(200, {
          kind: "authorized",
          actorId: "administrator-1",
          authorizationTier: "administrator",
          source: "current-role",
        });
      },
    },
    ports: {
      async readKboManagement() {
        return {
          accounts: [],
          provider: { games: 2, latestStatus: "scheduled", sourceUpdatedAt: null, collectedAt: null },
        };
      },
      async adjustKboCredit(input) {
        adjustment = input;
        return { message: "크레딧을 조정했습니다.", availableBalance: "1250", version: 8 };
      },
    },
  });
  const management = await app.inject({
    method: "GET",
    url: "/api/kbo/management",
    headers: { cookie: sessionCookie },
  });
  assert.equal(management.statusCode, 200);
  assert.equal(management.json().provider.games, 2);

  const adjusted = await app.inject({
    method: "POST",
    url: "/api/kbo/credits/adjust",
    headers: mutationHeaders,
    payload: {
      accountId: "account:active0001",
      expectedVersion: 7,
      delta: -250,
      reasonCode: "support_correction",
      confirmation: true,
    },
  });
  assert.equal(adjusted.statusCode, 200);
  assert.deepEqual(authorizationCalls, [
    { kind: "read" },
    { kind: "high-risk", confirmation: true },
  ]);
  assert.deepEqual(adjustment, {
    actorId: "administrator-1",
    authorizationTier: "administrator",
    operationId: "req-2",
    request: {
      accountId: "account:active0001",
      expectedVersion: 7,
      delta: -250,
      reasonCode: "support_correction",
      confirmation: true,
    },
  });

  const invalid = await app.inject({
    method: "POST",
    url: "/api/kbo/credits/adjust",
    headers: mutationHeaders,
    payload: {
      accountId: "account:active0001",
      expectedVersion: 7,
      delta: 0,
      reasonCode: "support_correction",
      confirmation: true,
    },
  });
  assert.equal(invalid.statusCode, 400);
  await app.close();

  let operatorPortCalls = 0;
  const operator = server({
    ports: { async readKboManagement() { operatorPortCalls += 1; return { accounts: [], provider: { games: 0, latestStatus: null, sourceUpdatedAt: null, collectedAt: null } }; } },
  });
  const denied = await operator.inject({
    method: "GET",
    url: "/api/kbo/management",
    headers: { cookie: sessionCookie },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(operatorPortCalls, 0);
  await operator.close();
});

test("exposes only allowlisted loopback health without a session", async () => {
  const app = server();
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "healthy" });
  await app.close();
});

test("default-denies missing, expired, revoked, wrong-role and unavailable sessions", async () => {
  const paths = [
    { response: authResponse(401, { kind: "denied", reason: "session-invalid" }), code: "unauthenticated" },
    { response: authResponse(403, { kind: "denied", reason: "unauthorized" }), code: "forbidden" },
    { response: authResponse(503, { kind: "denied", reason: "unavailable" }), code: "unavailable" },
  ] as const;
  for (const path of paths) {
    const app = server({
      auth: { authorize: async () => path.response },
    });
    const result = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: { cookie: sessionCookie },
    });
    assert.equal(result.statusCode, path.response.statusCode);
    assert.equal(result.json().error.code, path.code);
    assert.deepEqual(Object.keys(result.json().error).sort(), [
      "code",
      "correlationId",
      "message",
    ]);
    await app.close();
  }
});

test("requires mutation authorization and preserves duplicate semantics", async () => {
  let observedKind = "";
  const app = server({
    auth: {
      authorize: async (input) => {
        observedKind = input.kind;
        return authResponse(200, {
          kind: "authorized",
          actorId: "500",
          authorizationTier: "administrator",
          source: "current-role",
        });
      },
    },
  });
  const updated = await app.inject({
    method: "PUT",
    url: "/api/settings/summary",
    headers: mutationHeaders,
    payload: { summaryEnabled: false, expectedVersion: 3 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(observedKind, "mutation");
  assert.deepEqual(updated.json(), { summaryEnabled: false, version: 4 });
  await app.close();

  const conflict = server({
    auth: {
      authorize: async () =>
        authResponse(200, {
          kind: "authorized",
          actorId: "500",
          authorizationTier: "administrator",
          source: "current-role",
        }),
    },
    ports: {
      updateSettings: async () => ({ kind: "conflict" }),
    },
  });
  const duplicate = await conflict.inject({
    method: "PUT",
    url: "/api/settings/summary",
    headers: mutationHeaders,
    payload: { summaryEnabled: false, expectedVersion: 3 },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "conflict");
  await conflict.close();
});

test("rejects unknown fields, coercion, malformed JSON and oversized bodies", async () => {
  const app = server();
  const requests = [
    {
      payload: {
        summaryEnabled: false,
        expectedVersion: 3,
        unexpected: true,
      },
    },
    { payload: { summaryEnabled: "false", expectedVersion: "3" } },
    {
      payload: '{"summaryEnabled":',
      headers: { "content-type": "application/json" },
    },
    {
      payload: JSON.stringify({
        summaryEnabled: false,
        expectedVersion: 3,
        padding: "x".repeat(20_000),
      }),
      headers: { "content-type": "application/json" },
    },
  ];
  const statuses: number[] = [];
  for (const request of requests) {
    const result = await app.inject({
      method: "PUT",
      url: "/api/settings/summary",
      headers: { ...mutationHeaders, ...request.headers },
      payload: request.payload,
    });
    statuses.push(result.statusCode);
  }
  assert.deepEqual(statuses, [400, 400, 400, 413]);
  await app.close();
});

test("maps timeout, unavailable, degraded and partial failures without reflection", async () => {
  for (const path of [
    {
      error: new HttpPortError("timeout", "provider_timeout_canary"),
      status: 504,
      code: "timeout",
    },
    {
      error: new HttpPortError("unavailable", "storage_unavailable_canary"),
      status: 503,
      code: "unavailable",
    },
  ] as const) {
    const app = server({
      ports: {
        readOverview: async () => {
          throw path.error;
        },
      },
    });
    const result = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: { cookie: sessionCookie },
    });
    assert.equal(result.statusCode, path.status);
    assert.equal(result.json().error.code, path.code);
    assert.equal(result.body.includes(path.error.reasonCode), false);
    await app.close();
  }

  const app = server({
    ports: {
      readOverview: async () => ({
        health: {
          status: "degraded",
          gateway: { status: "degraded" },
          storage: { status: "connected" },
        },
        lastBackup: { status: "unknown", completedAt: null },
      }),
    },
  });
  const partial = await app.inject({
    method: "GET",
    url: "/api/overview",
    headers: { cookie: sessionCookie },
  });
  assert.equal(partial.statusCode, 200);
  assert.equal(partial.json().health.status, "degraded");
  assert.equal(partial.json().lastBackup.status, "unknown");
  await app.close();
});

test("uses security headers and normalized allowlisted operational logs", async () => {
  const logs: OperationalLogEvent[] = [];
  const app = server({ logs });
  const result = await app.inject({
    method: "GET",
    url: "/api/overview?forbidden=secret-query-canary",
    headers: {
      cookie: `${sessionCookie}; canary=forbidden-cookie-canary`,
      authorization: "Bearer forbidden-token-canary",
      "user-agent": "forbidden-agent-canary",
    },
  });
  assert.equal(result.statusCode, 400);
  assert.equal(result.headers["x-content-type-options"], "nosniff");
  assert.equal(result.headers["x-frame-options"], "DENY");
  assert.equal(result.headers["referrer-policy"], "no-referrer");
  const serialized = JSON.stringify(logs);
  for (const forbidden of [
    "secret-query-canary",
    "forbidden-cookie-canary",
    "forbidden-token-canary",
    "forbidden-agent-canary",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  await app.close();
});

test("serves immutable assets and SPA deep links without masking API 404s", async () => {
  const spaRoot = await mkdtemp(join(tmpdir(), "waw-http-"));
  await writeFile(join(spaRoot, "index.html"), "<main>fixture-spa</main>");
  await writeFile(join(spaRoot, "app.js"), "console.log('fixture')");
  const app = server({ spaRoot });
  const deepLink = await app.inject({ method: "GET", url: "/operations" });
  assert.equal(deepLink.statusCode, 200);
  assert.match(deepLink.body, /fixture-spa/);
  const asset = await app.inject({ method: "GET", url: "/app.js" });
  assert.match(asset.headers["cache-control"] ?? "", /immutable/);
  const missingApi = await app.inject({
    method: "GET",
    url: "/api/not-real",
  });
  assert.equal(missingApi.statusCode, 404);
  assert.match(missingApi.headers["content-type"] ?? "", /application\/json/);
  await app.close();
});
