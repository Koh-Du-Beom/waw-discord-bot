import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthConfiguration } from "../auth/oauth-configuration.ts";
import {
  createSessionCookieBoundary,
  type SessionHttpPersistence,
} from "../http/session-boundary.ts";
import { hashOpaqueSessionId, type OpaqueSession } from "../persistence/session-store.ts";
import { buildDashboardApp, type DashboardServices } from "./dashboard-app.ts";

const now = new Date("2026-07-24T00:00:00.000Z");
const rawSession = "raw-session-synthetic-0123456789abcdef";
const csrfKey = "csrf-key-synthetic-0123456789abcdef";

test("Fastify inject default-denies missing session and malformed mutation boundaries", async () => {
  const fixture = createFixture();
  const app = buildDashboardApp(fixture.options);
  try {
    const unauthenticated = await app.inject({ method: "GET", url: "/api/session" });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.json().error.code, "unauthenticated");

    const missingCsrf = await app.inject({
      method: "PUT",
      url: "/api/settings/summary",
      headers: {
        cookie: fixture.cookies,
        origin: "https://waw.dubeom.com",
      },
      payload: { summaryEnabled: false, expectedVersion: 4 },
    });
    assert.equal(missingCsrf.statusCode, 403);
    assert.equal(missingCsrf.json().error.code, "forbidden");

    const extraField = await app.inject({
      method: "PUT",
      url: "/api/settings/summary",
      headers: fixture.mutationHeaders,
      payload: { summaryEnabled: false, expectedVersion: 4, unexpected: true },
    });
    assert.equal(extraField.statusCode, 400);
    assert.equal(extraField.json().error.code, "invalid_request");
  } finally {
    await app.close();
  }
});

test("Fastify inject rechecks current role and returns allowlisted settings plus audit", async () => {
  const fixture = createFixture();
  const app = buildDashboardApp(fixture.options);
  try {
    const session = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: fixture.cookies },
    });
    assert.equal(session.statusCode, 200);
    assert.deepEqual(session.json(), {
      authenticated: true,
      actor: { displayName: "합성 운영자", tier: "operator" },
      csrfToken: fixture.csrfToken,
    });

    fixture.currentRole = undefined;
    const staleRole = await app.inject({
      method: "PUT",
      url: "/api/settings/summary",
      headers: fixture.mutationHeaders,
      payload: { summaryEnabled: false, expectedVersion: 4 },
    });
    assert.equal(staleRole.statusCode, 403);
    assert.equal(fixture.updates.length, 0);

    fixture.currentRole = "operator";
    const updated = await app.inject({
      method: "PUT",
      url: "/api/settings/summary",
      headers: fixture.mutationHeaders,
      payload: { summaryEnabled: false, expectedVersion: 4 },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(updated.json(), {
      settings: { summaryEnabled: false, version: 5 },
      auditEvent: {
        id: "audit-synthetic-1",
        occurredAt: "2026-07-24T00:00:00.000Z",
        actorId: "actor-synthetic",
        action: "settings.summary.update",
        outcome: "success",
        reasonCode: "updated",
      },
    });
    assert.deepEqual(fixture.updates, [
      {
        actorId: "actor-synthetic",
        authorizationTier: "operator",
        request: { summaryEnabled: false, expectedVersion: 4 },
      },
    ]);
  } finally {
    await app.close();
  }
});

function createFixture() {
  const configuration = parseAuthConfiguration({
    environment: "production",
    clientId: "100",
    clientSecret: "synthetic-client-secret",
    redirectUri: "https://waw.dubeom.com/auth/discord/callback",
    allowedOrigin: "https://waw.dubeom.com",
    allowedGuildId: "200",
    operatorRoleIds: "300",
    administratorRoleIds: "400",
    providerTimeoutMilliseconds: "2500",
  });
  assert.equal(configuration.enabled, true);
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  boundary.credentialSink.publish(rawSession);
  const cookies = boundary
    .takeResponseHeaders()
    ["set-cookie"].map((value) => value.slice(0, value.indexOf(";")))
    .join("; ");
  const csrfToken = cookies
    .split("; ")
    .find((value) => value.startsWith("__Host-waw_csrf="))
    ?.split("=")[1];
  assert.ok(csrfToken);

  const session: OpaqueSession = {
    sessionIdHash: hashOpaqueSessionId(rawSession),
    actorId: "actor-synthetic",
    authorizationTier: "operator",
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    lastSeenAt: new Date("2026-07-23T23:00:00.000Z"),
    idleExpiresAt: new Date("2026-07-25T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
    lastOAuthCompletedAt: new Date("2026-07-23T23:50:00.000Z"),
  };
  const persistence: SessionHttpPersistence = {
    async findSession(hash) {
      return hash === session.sessionIdHash ? session : undefined;
    },
    async touchSession() {
      return true;
    },
    async revokeSession() {
      return true;
    },
  };
  const updates: Parameters<DashboardServices["updateSettings"]>[0][] = [];
  const fixture: {
    currentRole: "operator" | "administrator" | undefined;
    updates: typeof updates;
    cookies: string;
    csrfToken: string;
    mutationHeaders: Record<string, string>;
    options: Parameters<typeof buildDashboardApp>[0];
  } = {
    currentRole: "operator",
    updates,
    cookies,
    csrfToken,
    mutationHeaders: {
      cookie: cookies,
      origin: "https://waw.dubeom.com",
      "x-csrf-token": csrfToken,
    },
    options: undefined as never,
  };
  fixture.options = {
    configuration,
    persistence,
    csrfVerifier: boundary.csrfVerifier,
    now: () => now,
    services: {
      async displayName() {
        return "합성 운영자";
      },
      readCurrentRole() {
        return fixture.currentRole;
      },
      async overview() {
        return {
          health: {
            status: "healthy",
            gateway: { status: "connected" },
            storage: { status: "connected" },
          },
          lastBackup: { status: "published", completedAt: now.toISOString() },
        };
      },
      async settings() {
        return { summaryEnabled: true, version: 4 };
      },
      async audit() {
        return { events: [] };
      },
      async updateSettings(input) {
        updates.push(input);
        return Object.assign({
          settings: {
            summaryEnabled: input.request.summaryEnabled,
            version: input.request.expectedVersion + 1,
          },
          auditEvent: {
            id: "audit-synthetic-1",
            occurredAt: now.toISOString(),
            actorId: input.actorId,
            action: "settings.summary.update" as const,
            outcome: "success" as const,
            reasonCode: "updated",
          },
        }, {
          internalCredential: "must-not-cross-response-boundary",
        });
      },
    },
  };
  return fixture;
}
