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
const csrfToken = "csrf_csrf_csrf_csrf_csrf_csrf_csrf_123";
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
    readSettings: async () => settings,
    updateSettings: async () => ({
      kind: "updated",
      settings: { summaryEnabled: false, version: 4 },
    }),
    readAudit: async () => audit,
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
    headers: { cookie: sessionCookie },
  });
  assert.deepEqual(session.json(), {
    authenticated: true,
    actor: { displayName: "Fixture Operator", tier: "operator" },
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
