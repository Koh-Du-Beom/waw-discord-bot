import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateSessionRequest,
  createSessionCookieBoundary,
  handleSessionLogout,
  sessionOutcomeLog,
  type SessionHttpPersistence,
} from "./session-boundary.ts";
import { parseAuthConfiguration } from "../auth/oauth-configuration.ts";
import { hashOpaqueSessionId, type OpaqueSession } from "../persistence/session-store.ts";

const now = new Date("2026-07-24T00:00:00.000Z");
const rawSession = "raw-session-canary-0123456789abcdef-unique";
const csrfKey = "csrf-key-canary-0123456789abcdef";

function productionConfiguration() {
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
  return configuration;
}

function session(overrides: Partial<OpaqueSession> = {}): OpaqueSession {
  return {
    sessionIdHash: hashOpaqueSessionId(rawSession),
    actorId: "500",
    authorizationTier: "operator",
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    lastSeenAt: new Date("2026-07-23T23:00:00.000Z"),
    idleExpiresAt: new Date("2026-07-25T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
    lastOAuthCompletedAt: new Date("2026-07-23T23:50:00.000Z"),
    ...overrides,
  };
}

class FakePersistence implements SessionHttpPersistence {
  readonly sessions = new Map<string, OpaqueSession>();
  touches: Array<{
    sessionIdHash: string;
    lastSeenAt: Date;
    proposedIdleExpiresAt: Date;
  }> = [];
  revocations: Array<{ sessionIdHash: string; revokedAt: Date }> = [];

  constructor(record: OpaqueSession = session()) {
    this.sessions.set(record.sessionIdHash, record);
  }

  async findSession(sessionIdHash: string) {
    return this.sessions.get(sessionIdHash);
  }

  async touchSession(
    sessionIdHash: string,
    lastSeenAt: Date,
    proposedIdleExpiresAt: Date,
  ) {
    this.touches.push({ sessionIdHash, lastSeenAt, proposedIdleExpiresAt });
    return this.sessions.has(sessionIdHash);
  }

  async revokeSession(sessionIdHash: string, revokedAt: Date) {
    this.revocations.push({ sessionIdHash, revokedAt });
    return this.sessions.has(sessionIdHash);
  }
}

function cookieHeader(setCookie: readonly string[]): string {
  return setCookie
    .map((cookie) => cookie.slice(0, cookie.indexOf(";")))
    .join("; ");
}

test("callback credential sink emits exact host-only session and CSRF cookies", () => {
  const boundary = createSessionCookieBoundary(productionConfiguration(), csrfKey);
  boundary.credentialSink.publish(rawSession);
  const headers = boundary.takeResponseHeaders();

  assert.equal(headers["set-cookie"]?.length, 2);
  const sessionCookie = headers["set-cookie"]?.find((value) =>
    value.startsWith("__Host-waw_session="),
  );
  const csrfCookie = headers["set-cookie"]?.find((value) =>
    value.startsWith("__Host-waw_csrf="),
  );
  assert.equal(
    sessionCookie,
    `__Host-waw_session=${rawSession}; Path=/; Secure; HttpOnly; SameSite=Lax`,
  );
  assert.equal(sessionCookie?.includes("Domain="), false);
  assert.match(
    csrfCookie ?? "",
    /^__Host-waw_csrf=[A-Za-z0-9_-]+; Path=\/; Secure; SameSite=Strict$/,
  );
  assert.equal(csrfCookie?.includes("HttpOnly"), false);
  assert.equal(JSON.stringify(headers).includes(csrfKey), false);
});

test("stages callback cookies without exposing them until one release", () => {
  const boundary = createSessionCookieBoundary(productionConfiguration(), csrfKey);
  const staged = boundary.credentialSink.stage(rawSession);

  assert.deepEqual(boundary.takeResponseHeaders(), { "set-cookie": [] });
  staged.release();
  assert.equal(boundary.takeResponseHeaders()["set-cookie"].length, 2);
  assert.throws(() => staged.release(), /session-credential-invalid/);
  assert.throws(
    () => boundary.credentialSink.stage(rawSession),
    /session-credential-invalid/,
  );
});

test("authenticates a valid cookie by hash and touches idle expiry by at most one day", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) return;
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  boundary.credentialSink.publish(rawSession);
  const persistence = new FakePersistence();

  const outcome = await authenticateSessionRequest(
    {
      kind: "read",
      headers: {
        cookie: cookieHeader(boundary.takeResponseHeaders()["set-cookie"] ?? []),
      },
    },
    configuration,
    persistence,
    boundary.csrfVerifier,
    now,
  );

  assert.deepEqual(outcome, {
    kind: "authenticated",
    actorId: "500",
    authorizationTier: "operator",
    lastOAuthCompletedAt: new Date("2026-07-23T23:50:00.000Z"),
  });
  assert.deepEqual(persistence.touches, [
    {
      sessionIdHash: hashOpaqueSessionId(rawSession),
      lastSeenAt: now,
      proposedIdleExpiresAt: new Date("2026-07-25T00:00:00.000Z"),
    },
  ]);
});

test("default-denies missing, malformed, duplicate, revoked, idle-expired, and absolute-expired sessions", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) return;
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  const malformedCookies = [
    undefined,
    "__Host-waw_session=short",
    `__Host-waw_session=${rawSession}; __Host-waw_session=duplicate`,
    `__Host-waw_session=${rawSession}%0a`,
  ];
  for (const cookie of malformedCookies) {
    const outcome = await authenticateSessionRequest(
      {
        kind: "read",
        headers: cookie === undefined ? {} : { cookie },
      },
      configuration,
      new FakePersistence(),
      boundary.csrfVerifier,
      now,
    );
    assert.deepEqual(outcome, { kind: "denied", reason: "session-invalid" });
  }

  for (const record of [
    session({ revokedAt: new Date("2026-07-23T23:59:00.000Z") }),
    session({ idleExpiresAt: now }),
    session({ absoluteExpiresAt: now }),
  ]) {
    const outcome = await authenticateSessionRequest(
      {
        kind: "read",
        headers: { cookie: `__Host-waw_session=${rawSession}` },
      },
      configuration,
      new FakePersistence(record),
      boundary.csrfVerifier,
      now,
    );
    assert.deepEqual(outcome, { kind: "denied", reason: "session-invalid" });
  }
});

test("requires exact Origin and a session-bound CSRF cookie/header for mutation", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) return;
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  boundary.credentialSink.publish(rawSession);
  const cookies = cookieHeader(boundary.takeResponseHeaders()["set-cookie"] ?? []);
  const csrfToken = cookies
    .split("; ")
    .find((value) => value.startsWith("__Host-waw_csrf="))
    ?.split("=")[1];
  assert.ok(csrfToken);

  const valid = await authenticateSessionRequest(
    {
      kind: "mutation",
      headers: {
        cookie: cookies,
        origin: "https://waw.dubeom.com",
        "x-csrf-token": csrfToken,
      },
    },
    configuration,
    new FakePersistence(),
    boundary.csrfVerifier,
    now,
  );
  assert.equal(valid.kind, "authenticated");

  for (const headers of [
    { cookie: cookies, origin: "https://evil.example", "x-csrf-token": csrfToken },
    { cookie: cookies, origin: "https://waw.dubeom.com" },
    { cookie: cookies, origin: "https://waw.dubeom.com", "x-csrf-token": "wrong" },
    {
      cookie: cookies.replace("__Host-waw_csrf=", "__Host-waw_csrf=wrong"),
      origin: "https://waw.dubeom.com",
      "x-csrf-token": csrfToken,
    },
  ]) {
    const denied = await authenticateSessionRequest(
      { kind: "mutation", headers },
      configuration,
      new FakePersistence(),
      boundary.csrfVerifier,
      now,
    );
    assert.deepEqual(denied, { kind: "denied", reason: "csrf-invalid" });
  }
});

test("logout revokes the server session and deletes cookies with matching attributes", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) return;
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  boundary.credentialSink.publish(rawSession);
  const cookies = cookieHeader(boundary.takeResponseHeaders()["set-cookie"] ?? []);
  const csrfToken = cookies
    .split("; ")
    .find((value) => value.startsWith("__Host-waw_csrf="))
    ?.split("=")[1];
  assert.ok(csrfToken);
  const persistence = new FakePersistence();

  const response = await handleSessionLogout(
    {
      method: "POST",
      headers: {
        cookie: cookies,
        origin: "https://waw.dubeom.com",
        "x-csrf-token": csrfToken,
      },
    },
    configuration,
    persistence,
    boundary.csrfVerifier,
    now,
  );

  assert.deepEqual(persistence.revocations, [
    { sessionIdHash: hashOpaqueSessionId(rawSession), revokedAt: now },
  ]);
  assert.equal(response.statusCode, 204);
  assert.deepEqual(response.body, {});
  assert.deepEqual(response.headers["set-cookie"], [
    "__Host-waw_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    "__Host-waw_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0",
  ]);
});

test("disables session surfaces in arbitrary preview", async () => {
  const configuration = parseAuthConfiguration({
    environment: "arbitrary-preview",
  });
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  const persistence = new FakePersistence();

  assert.throws(() => boundary.credentialSink.publish(rawSession), /auth-disabled/);
  assert.deepEqual(
    await authenticateSessionRequest(
      { kind: "read", headers: {} },
      configuration,
      persistence,
      boundary.csrfVerifier,
      now,
    ),
    { kind: "denied", reason: "auth-disabled" },
  );
  assert.deepEqual(
    await handleSessionLogout(
      { method: "POST", headers: {} },
      configuration,
      persistence,
      boundary.csrfVerifier,
      now,
    ),
    {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    },
  );
});

test("keeps raw session, cookie, and CSRF values out of outcome, error, and log DTO", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) return;
  const boundary = createSessionCookieBoundary(configuration, csrfKey);
  boundary.credentialSink.publish(rawSession);
  const cookies = cookieHeader(boundary.takeResponseHeaders()["set-cookie"] ?? []);
  const outcome = await authenticateSessionRequest(
    {
      kind: "mutation",
      headers: {
        cookie: cookies,
        origin: "https://evil.example",
        "x-csrf-token": "csrf-token-canary",
      },
    },
    configuration,
    new FakePersistence(),
    boundary.csrfVerifier,
    now,
  );
  const serialized = JSON.stringify({
    outcome,
    log: sessionOutcomeLog(outcome),
  });
  for (const canary of [rawSession, cookies, csrfKey, "csrf-token-canary"]) {
    assert.equal(serialized.includes(canary), false);
  }
});
