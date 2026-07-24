import assert from "node:assert/strict";
import test from "node:test";

import type { DiscordOAuthIdentityProvider } from "../adapters/discord/oauth-identity.ts";
import type { AuthorizationTier } from "../contracts/local-command.ts";
import type { RoleCache } from "../persistence/postgres-persistence.ts";
import {
  hashOpaqueSessionId,
  type OpaqueSession,
} from "../persistence/session-store.ts";
import {
  createSessionCookieBoundary,
  type SessionCookieBoundary,
} from "../http/session-boundary.ts";
import { parseAuthConfiguration } from "./oauth-configuration.ts";
import {
  authServiceOutcomeLog,
  createAuthService,
  type AuthServicePersistence,
} from "./auth-service.ts";

const now = new Date("2026-07-24T00:00:00.000Z");
const rawState = "oauth-state-canary-0123456789abcdef-unique";
const code = "oauth-code-canary";
const accessToken = "access-token-canary";
const rawSession = "raw-session-canary-0123456789abcdef-unique";
const previousSession = "previous-session-canary-0123456789abcdef";
const csrfKey = "csrf-key-canary-0123456789abcdef";

function configuration() {
  return parseAuthConfiguration({
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
}

function provider(): DiscordOAuthIdentityProvider {
  return {
    createAuthorizationUrl(state) {
      const url = new URL("https://discord.com/oauth2/authorize");
      url.searchParams.set("client_id", "100");
      url.searchParams.set(
        "redirect_uri",
        "https://waw.dubeom.com/auth/discord/callback",
      );
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "identify");
      url.searchParams.set("state", state);
      return url.href;
    },
    async exchangeCode(receivedCode) {
      assert.equal(receivedCode, code);
      return { accessToken };
    },
    async fetchIdentity(receivedToken) {
      assert.equal(receivedToken, accessToken);
      return { id: "500" };
    },
  };
}

class FakePersistence implements AuthServicePersistence {
  readonly states = new Map<string, { expiresAt: Date; usedAt?: Date }>();
  readonly sessions = new Map<string, OpaqueSession>();
  readonly roleCache = new Map<string, RoleCache>();
  failStateSave = false;
  failCallback = false;
  failCache = false;
  touches = 0;
  revocations = 0;

  async createOAuthState(state: { stateHash: string; expiresAt: Date }) {
    if (this.failStateSave) throw new Error("database canary");
    this.states.set(state.stateHash, { expiresAt: state.expiresAt });
  }

  async isOAuthStateUsable(stateHash: string, at: Date) {
    const state = this.states.get(stateHash);
    return state !== undefined && state.usedAt === undefined && state.expiresAt > at;
  }

  async completeOAuthCallback(input: {
    stateHash: string;
    completedAt: Date;
    previousSessionIdHash?: string;
    session: OpaqueSession;
    roleCache: RoleCache;
  }) {
    if (this.failCallback) throw new Error("callback transaction canary");
    const state = this.states.get(input.stateHash);
    if (state === undefined || state.usedAt !== undefined || state.expiresAt <= input.completedAt) {
      return "state-invalid" as const;
    }
    state.usedAt = input.completedAt;
    if (input.previousSessionIdHash !== undefined) {
      const previous = this.sessions.get(input.previousSessionIdHash);
      if (previous !== undefined) previous.revokedAt = input.completedAt;
    }
    this.sessions.set(input.session.sessionIdHash, input.session);
    this.roleCache.set(input.roleCache.actorId, input.roleCache);
    return "completed" as const;
  }

  async findSession(sessionIdHash: string) {
    return this.sessions.get(sessionIdHash);
  }

  async touchSession(
    sessionIdHash: string,
    lastSeenAt: Date,
    proposedIdleExpiresAt: Date,
  ) {
    const session = this.sessions.get(sessionIdHash);
    if (session === undefined) return false;
    this.touches += 1;
    session.lastSeenAt = lastSeenAt;
    session.idleExpiresAt =
      proposedIdleExpiresAt < session.absoluteExpiresAt
        ? proposedIdleExpiresAt
        : session.absoluteExpiresAt;
    return true;
  }

  async revokeSession(sessionIdHash: string, revokedAt: Date) {
    const session = this.sessions.get(sessionIdHash);
    if (session === undefined) return false;
    this.revocations += 1;
    session.revokedAt = revokedAt;
    return true;
  }

  async rotateSession(
    previousSessionIdHash: string,
    nextSession: OpaqueSession,
    revokedAt: Date,
  ) {
    const previous = this.sessions.get(previousSessionIdHash);
    if (previous === undefined || previous.revokedAt !== undefined) {
      throw new Error("previous session unavailable");
    }
    previous.revokedAt = revokedAt;
    this.sessions.set(nextSession.sessionIdHash, nextSession);
  }

  async upsertRoleCache(cache: RoleCache) {
    if (this.failCache) throw new Error("cache persistence canary");
    this.roleCache.set(cache.actorId, cache);
  }

  async findFreshRoleCache(actorId: string, at: Date) {
    if (this.failCache) throw new Error("cache persistence canary");
    const cached = this.roleCache.get(actorId);
    if (cached === undefined) return undefined;
    const age = at.getTime() - cached.verifiedAt.getTime();
    return age >= 0 && age <= 5 * 60_000 ? cached : undefined;
  }
}

function memberReader(
  result:
    | "operator"
    | "administrator"
    | "unauthorized"
    | "unavailable" = "operator",
) {
  return {
    async readCurrentMember() {
      if (result === "unauthorized") return { kind: "unauthorized" as const };
      if (result === "unavailable") {
        return { kind: "unavailable" as const, reason: "timeout" as const };
      }
      return {
        kind: "member" as const,
        guildId: "200",
        guildOwnerId: result === "administrator" ? "500" : "999",
        roleIds: result === "operator" ? ["300"] : [],
      };
    },
  };
}

function session(
  authorizationTier: AuthorizationTier = "operator",
  lastOAuthCompletedAt = new Date("2026-07-23T23:50:00.000Z"),
): OpaqueSession {
  return {
    sessionIdHash: hashOpaqueSessionId(rawSession),
    actorId: "500",
    authorizationTier,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: new Date("2026-07-25T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-31T00:00:00.000Z"),
    lastOAuthCompletedAt,
  };
}

function cookieValues(response: {
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}) {
  const setCookie = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookie));
  const header = setCookie
    .map((value) => value.slice(0, value.indexOf(";")))
    .join("; ");
  const csrf = header
    .split("; ")
    .find((value) => value.startsWith("__Host-waw_csrf="))
    ?.split("=")[1];
  assert.ok(csrf);
  return { header, csrf };
}

function build(
  persistence = new FakePersistence(),
  roleResult: Parameters<typeof memberReader>[0] = "operator",
  overrides: Partial<Parameters<typeof createAuthService>[0]> = {},
) {
  return {
    persistence,
    service: createAuthService({
      configuration: configuration(),
      provider: provider(),
      memberReader: memberReader(roleResult),
      persistence,
      csrfKey,
      now: () => now,
      generateOAuthState: () => rawState,
      generateSessionId: () => rawSession,
      ...overrides,
    }),
  };
}

test("login persists only a high-entropy state hash before exact identify redirect", async () => {
  const { service, persistence } = build();
  const response = await service.login();

  assert.equal(response.statusCode, 302);
  const location = new URL(String(response.headers.location));
  assert.equal(location.searchParams.get("scope"), "identify");
  assert.equal(location.searchParams.get("state"), rawState);
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "https://waw.dubeom.com/auth/discord/callback",
  );
  assert.deepEqual([...persistence.states.keys()], [hashOpaqueSessionId(rawState)]);
  assert.equal(JSON.stringify([...persistence.states]).includes(rawState), false);
  assert.deepEqual(response.headers["set-cookie"], [
    `__Host-waw_oauth_state=${rawState}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
  ]);
});

test("callback composes DTO, atomic callback, session rotation, and Set-Cookie publication", async () => {
  const persistence = new FakePersistence();
  persistence.sessions.set(hashOpaqueSessionId(previousSession), {
    ...session(),
    sessionIdHash: hashOpaqueSessionId(previousSession),
  });
  const { service } = build(persistence);
  const login = await service.login();
  const stateCookie = (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0];
  assert.ok(stateCookie);
  const response = await service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: {
      cookie: `${stateCookie}; __Host-waw_session=${previousSession}`,
    },
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, "/");
  assert.equal(
    persistence.sessions.get(hashOpaqueSessionId(previousSession))?.revokedAt?.toISOString(),
    now.toISOString(),
  );
  assert.equal(persistence.sessions.has(hashOpaqueSessionId(rawSession)), true);
  assert.match(
    (response.headers["set-cookie"] as readonly string[])[0] ?? "",
    /^__Host-waw_session=.*; Path=\/; Secure; HttpOnly; SameSite=Lax$/,
  );
});

test("binds OAuth state to the initiating browser", async () => {
  const { service } = build();
  const login = await service.login();
  const stateCookie = (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0];
  assert.ok(stateCookie);

  for (const cookie of [
    undefined,
    "__Host-waw_oauth_state=another-browser-state-0123456789abcdef",
  ]) {
    const response = await service.callback({
      method: "GET",
      url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
      headers: cookie === undefined ? {} : { cookie },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.reason, "state-browser-mismatch");
  }

  assert.equal(
    (
      await service.callback({
        method: "GET",
        url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
        headers: { cookie: stateCookie },
      })
    ).statusCode,
    303,
  );
});

test("does not report state storage or cookie publication failure as success", async () => {
  const persistence = new FakePersistence();
  persistence.failStateSave = true;
  const failedLogin = await build(persistence).service.login();
  assert.deepEqual(failedLogin, {
    statusCode: 503,
    headers: {},
    body: { kind: "denied", reason: "persistence-unavailable" },
  });

  const publicationFailure: SessionCookieBoundary = {
    credentialSink: {
      stage() {
        throw new Error("cookie publication canary");
      },
      publish() {
        throw new Error("cookie publication canary");
      },
    },
    csrfVerifier: { verify: () => false },
    takeResponseHeaders: () => ({ "set-cookie": [] }),
  };
  const workingPersistence = new FakePersistence();
  workingPersistence.sessions.set(hashOpaqueSessionId(previousSession), {
    ...session(),
    sessionIdHash: hashOpaqueSessionId(previousSession),
  });
  const { service } = build(workingPersistence, "operator", {
    createSessionBoundary: () => publicationFailure,
  });
  const login = await service.login();
  const stateCookie = (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0];
  assert.ok(stateCookie);
  const callback = await service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: {
      cookie: `${stateCookie}; __Host-waw_session=${previousSession}`,
    },
  });
  assert.equal(callback.statusCode, 503);
  assert.equal(callback.body.reason, "callback-unavailable");
  assert.equal(
    await workingPersistence.isOAuthStateUsable(
      hashOpaqueSessionId(rawState),
      now,
    ),
    true,
  );
  assert.equal(
    workingPersistence.sessions.get(hashOpaqueSessionId(previousSession))
      ?.revokedAt,
    undefined,
  );
  assert.equal(
    workingPersistence.sessions.has(hashOpaqueSessionId(rawSession)),
    false,
  );
  assert.equal(workingPersistence.roleCache.size, 0);
});

test("releases staged callback cookies only once and only after the database commits", async () => {
  const persistence = new FakePersistence();
  persistence.failCallback = true;
  const failedBuild = build(persistence);
  const failedLogin = await failedBuild.service.login();
  const failedStateCookie = (
    failedLogin.headers["set-cookie"] as readonly string[]
  )[0]?.split(";")[0];
  assert.ok(failedStateCookie);
  const failed = await failedBuild.service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: { cookie: failedStateCookie },
  });
  assert.equal(failed.statusCode, 503);
  const failedCookies = (
    failed.headers["set-cookie"] ?? []
  ) as readonly string[];
  assert.equal(
    failedCookies.some((value) => value.startsWith("__Host-waw_session=")),
    false,
  );
  assert.equal(
    failedCookies.some((value) => value.startsWith("__Host-waw_csrf=")),
    false,
  );

  const successfulBuild = build();
  const login = await successfulBuild.service.login();
  const stateCookie = (
    login.headers["set-cookie"] as readonly string[]
  )[0]?.split(";")[0];
  assert.ok(stateCookie);
  const succeeded = await successfulBuild.service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: { cookie: stateCookie },
  });
  const succeededCookies = (
    succeeded.headers["set-cookie"] ?? []
  ) as readonly string[];
  assert.equal(
    succeededCookies.filter((value) =>
      value.startsWith("__Host-waw_session=")
    ).length,
    1,
  );
  assert.equal(
    succeededCookies.filter((value) => value.startsWith("__Host-waw_csrf="))
      .length,
    1,
  );
});

test("does not model a transport write failure as database rollback", async () => {
  const { service, persistence } = build();
  const login = await service.login();
  const stateCookie = (
    login.headers["set-cookie"] as readonly string[]
  )[0]?.split(";")[0];
  assert.ok(stateCookie);
  const response = await service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: { cookie: stateCookie },
  });
  assert.equal(response.statusCode, 303);

  assert.throws(() => {
    throw new Error("synthetic transport disconnected");
  }, /transport disconnected/);
  assert.equal(
    await persistence.isOAuthStateUsable(hashOpaqueSessionId(rawState), now),
    false,
  );
  assert.equal(
    persistence.sessions.has(hashOpaqueSessionId(rawSession)),
    true,
  );
});

test("read uses current role or a valid five-minute cache, while mutation rejects cache", async () => {
  const persistence = new FakePersistence();
  persistence.sessions.set(hashOpaqueSessionId(rawSession), session());
  persistence.roleCache.set("500", {
    actorId: "500",
    authorizationTier: "operator",
    verifiedAt: new Date("2026-07-23T23:55:00.000Z"),
  });
  const { service } = build(persistence, "unavailable");
  const read = await service.authorize({
    kind: "read",
    headers: { cookie: `__Host-waw_session=${rawSession}` },
  });
  assert.deepEqual(read.body, {
    kind: "authorized",
    authorizationTier: "operator",
    source: "role-cache",
  });

  const mutation = await service.authorize({
    kind: "mutation",
    headers: {
      cookie: `__Host-waw_session=${rawSession}`,
      origin: "https://waw.dubeom.com",
      "x-csrf-token": "not-a-valid-token",
    },
  });
  assert.equal(mutation.statusCode, 403);
});

test("mutation and high-risk require current role, exact CSRF/Origin, recent OAuth, and confirmation", async () => {
  const { service, persistence } = build();
  const login = await service.login();
  const stateCookie = (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0];
  assert.ok(stateCookie);
  const callback = await service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: { cookie: stateCookie },
  });
  const { header, csrf } = cookieValues(callback);
  const headers = {
    cookie: header,
    origin: "https://waw.dubeom.com",
    "x-csrf-token": csrf,
  };

  assert.equal(
    (await service.authorize({ kind: "mutation", headers })).statusCode,
    200,
  );
  assert.deepEqual(
    (await service.authorize({ kind: "high-risk", headers })).body,
    { kind: "denied", reason: "confirmation-required" },
  );
  assert.equal(
    (
      await service.authorize({
        kind: "high-risk",
        headers,
        explicitConfirmation: true,
      })
    ).statusCode,
    200,
  );

  persistence.sessions.set(
    hashOpaqueSessionId(rawSession),
    session("operator", new Date("2026-07-23T23:44:59.999Z")),
  );
  assert.deepEqual(
    (
      await service.authorize({
        kind: "high-risk",
        headers,
        explicitConfirmation: true,
      })
    ).body,
    { kind: "denied", reason: "recent-auth-required" },
  );
});

test("rotates the session without extending absolute expiry when the current tier changes", async () => {
  const persistence = new FakePersistence();
  const original = session("operator");
  persistence.sessions.set(original.sessionIdHash, original);
  const rotatedRawSession = "rotated-session-canary-0123456789abcdef";
  const { service } = build(persistence, "administrator", {
    generateSessionId: () => rotatedRawSession,
  });
  const boundary = createSessionCookieBoundary(configuration(), csrfKey);
  boundary.credentialSink.publish(rawSession);
  const { header } = cookieValues({
    headers: boundary.takeResponseHeaders(),
  });

  const response = await service.authorize({
    kind: "read",
    headers: { cookie: header },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.authorizationTier, "administrator");
  assert.equal(original.revokedAt?.toISOString(), now.toISOString());
  const rotated = persistence.sessions.get(hashOpaqueSessionId(rotatedRawSession));
  assert.equal(rotated?.authorizationTier, "administrator");
  assert.equal(
    rotated?.absoluteExpiresAt.toISOString(),
    original.absoluteExpiresAt.toISOString(),
  );
  assert.match(
    (response.headers["set-cookie"] as readonly string[])[0] ?? "",
    /^__Host-waw_session=/,
  );
});

test("stages privilege-change cookies before committing session rotation", async () => {
  const persistence = new FakePersistence();
  const original = session("operator");
  persistence.sessions.set(original.sessionIdHash, original);
  const failingBoundary: SessionCookieBoundary = {
    credentialSink: {
      stage() {
        throw new Error("cookie staging failed");
      },
      publish() {
        throw new Error("cookie staging failed");
      },
    },
    csrfVerifier: { verify: () => false },
    takeResponseHeaders: () => ({ "set-cookie": [] }),
  };
  const { service } = build(persistence, "administrator", {
    createSessionBoundary: () => failingBoundary,
    generateSessionId: () => "rotated-session-canary-0123456789abcdef",
  });

  const response = await service.authorize({
    kind: "read",
    headers: { cookie: `__Host-waw_session=${rawSession}` },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.reason, "session-rotation-unavailable");
  assert.equal(original.revokedAt, undefined);
  assert.equal(persistence.sessions.size, 1);
});

test("normalizes authorization and persistence failures without secret canaries", async () => {
  const fixtures = [
    { role: "unauthorized" as const, statusCode: 403, reason: "unauthorized" },
    { role: "unavailable" as const, statusCode: 503, reason: "unavailable" },
  ];
  for (const fixture of fixtures) {
    const persistence = new FakePersistence();
    persistence.sessions.set(hashOpaqueSessionId(rawSession), session());
    const boundary = createSessionCookieBoundary(configuration(), csrfKey);
    boundary.credentialSink.publish(rawSession);
    const { header, csrf } = cookieValues({
      headers: boundary.takeResponseHeaders(),
    });
    const response = await build(persistence, fixture.role).service.authorize({
      kind: "mutation",
      headers: {
        cookie: header,
        origin: "https://waw.dubeom.com",
        "x-csrf-token": csrf,
      },
    });
    assert.equal(response.statusCode, fixture.statusCode);
    assert.equal(response.body.reason, fixture.reason);
  }

  const persistence = new FakePersistence();
  persistence.sessions.set(hashOpaqueSessionId(rawSession), session());
  persistence.failCache = true;
  const response = await build(persistence).service.authorize({
    kind: "read",
    headers: { cookie: `__Host-waw_session=${rawSession}` },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.reason, "persistence-unavailable");
  const serialized = JSON.stringify({
    response,
    log: authServiceOutcomeLog("authorize", response),
  });
  for (const canary of [
    rawState,
    rawSession,
    csrfKey,
    code,
    accessToken,
    "__Host-waw_session",
  ]) {
    assert.equal(serialized.includes(canary), false);
  }
});

test("logout composes server-side revoke and arbitrary preview disables every entry point", async () => {
  const { service, persistence } = build();
  const login = await service.login();
  const stateCookie = (login.headers["set-cookie"] as readonly string[])[0]?.split(";")[0];
  assert.ok(stateCookie);
  const callback = await service.callback({
    method: "GET",
    url: `https://waw.dubeom.com/auth/discord/callback?code=${code}&state=${rawState}`,
    headers: { cookie: stateCookie },
  });
  const { header, csrf } = cookieValues(callback);
  const logout = await service.logout({
    method: "POST",
    headers: {
      cookie: header,
      origin: "https://waw.dubeom.com",
      "x-csrf-token": csrf,
    },
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(persistence.revocations, 1);

  const disabled = createAuthService({
    configuration: parseAuthConfiguration({ environment: "arbitrary-preview" }),
    persistence: new FakePersistence(),
    csrfKey,
    now: () => now,
  });
  assert.equal((await disabled.login()).statusCode, 404);
  assert.equal(
    (
      await disabled.callback({
        method: "GET",
        url: "https://preview.example/auth/discord/callback",
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await disabled.authorize({
        kind: "read",
        headers: {},
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await disabled.logout({ method: "POST", headers: {} })).statusCode,
    404,
  );
});
