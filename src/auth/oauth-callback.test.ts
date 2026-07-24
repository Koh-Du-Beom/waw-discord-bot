import assert from "node:assert/strict";
import test from "node:test";

import {
  completeOAuthCallback,
  type CallbackPersistence,
  type CurrentMemberReader,
  type OAuthIdentityProvider,
  type SessionCredentialSink,
} from "./oauth-callback.ts";
import { hashOpaqueSessionId, type OpaqueSession } from "../persistence/session-store.ts";

const now = new Date("2026-07-24T00:00:00.000Z");
const state = "state-canary-that-must-not-be-persisted";
const code = "code-canary-that-must-not-escape";
const accessToken = "access-token-canary-that-must-not-escape";
const refreshToken = "refresh-token-canary-that-must-not-escape";
const previousSession = "previous-session-canary-0123456789abcdef";
const nextSession = "next-session-canary-0123456789abcdef-unique";

class FakePersistence implements CallbackPersistence {
  readonly states = new Map([
    [hashOpaqueSessionId(state), new Date("2026-07-24T00:10:00.000Z")],
  ]);
  readonly sessions = new Map<string, OpaqueSession>();
  readonly roleCaches: unknown[] = [];
  lastInput: unknown;

  constructor() {
    this.sessions.set(hashOpaqueSessionId(previousSession), {
      sessionIdHash: hashOpaqueSessionId(previousSession),
      actorId: "100",
      authorizationTier: "operator",
      createdAt: new Date("2026-07-23T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-23T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-07-25T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-07-30T00:00:00.000Z"),
      lastOAuthCompletedAt: new Date("2026-07-23T00:00:00.000Z"),
    });
  }

  async isOAuthStateUsable(stateHash: string, observedAt: Date) {
    const expiresAt = this.states.get(stateHash);
    return expiresAt !== undefined && expiresAt.getTime() > observedAt.getTime();
  }

  async completeOAuthCallback(input: Parameters<CallbackPersistence["completeOAuthCallback"]>[0]) {
    this.lastInput = input;
    const expiresAt = this.states.get(input.stateHash);
    if (expiresAt === undefined) {
      return "state-invalid" as const;
    }
    if (expiresAt.getTime() <= input.completedAt.getTime()) {
      return "state-invalid" as const;
    }
    this.states.delete(input.stateHash);
    if (input.previousSessionIdHash !== undefined) {
      const previous = this.sessions.get(input.previousSessionIdHash);
      if (previous !== undefined) {
        this.sessions.set(input.previousSessionIdHash, {
          ...previous,
          revokedAt: input.completedAt,
        });
      }
    }
    this.sessions.set(input.session.sessionIdHash, input.session);
    this.roleCaches.push(input.roleCache);
    return "completed" as const;
  }
}

function provider(
  overrides: Partial<OAuthIdentityProvider> = {},
): OAuthIdentityProvider {
  return {
    async exchangeCode(receivedCode) {
      assert.equal(receivedCode, code);
      return { accessToken, refreshToken };
    },
    async fetchIdentity(receivedAccessToken) {
      assert.equal(receivedAccessToken, accessToken);
      return { id: "100" };
    },
    ...overrides,
  };
}

function memberReader(
  result: Awaited<ReturnType<CurrentMemberReader["readCurrentMember"]>> = {
    kind: "member",
    guildId: "200",
    guildOwnerId: "999",
    roleIds: ["300"],
  },
): CurrentMemberReader {
  return {
    async readCurrentMember(input) {
      assert.deepEqual(input, { actorId: "100", guildId: "200" });
      return result;
    },
  };
}

function sink(): SessionCredentialSink & { credentials: string[] } {
  const credentials: string[] = [];
  return {
    credentials,
    stage(rawSessionId) {
      return {
        release() {
          credentials.push(rawSessionId);
        },
      };
    },
    publish(rawSessionId) {
      credentials.push(rawSessionId);
    },
  };
}

function callbackInput(overrides: Record<string, unknown> = {}) {
  return {
    code,
    rawState: state,
    previousRawSessionId: previousSession,
    now,
    allowedGuildId: "200",
    operatorRoleIds: ["300"],
    administratorRoleIds: ["400"],
    generateSessionId: () => nextSession,
    ...overrides,
  };
}

test("consumes persistent state once, authorizes configured role, and rotates opaque session", async () => {
  const persistence = new FakePersistence();
  const credentialSink = sink();

  const outcome = await completeOAuthCallback({
    ...callbackInput(),
    provider: provider(),
    memberReader: memberReader(),
    persistence,
    credentialSink,
  });

  assert.deepEqual(outcome, { kind: "succeeded", authorizationTier: "operator" });
  assert.deepEqual(credentialSink.credentials, [nextSession]);
  assert.notEqual(nextSession, previousSession);
  assert.equal(persistence.sessions.get(hashOpaqueSessionId(previousSession))?.revokedAt, now);
  const stored = persistence.sessions.get(hashOpaqueSessionId(nextSession));
  assert.equal(stored?.actorId, "100");
  assert.equal(stored?.lastOAuthCompletedAt, now);
  assert.equal(stored?.idleExpiresAt.toISOString(), "2026-07-25T00:00:00.000Z");
  assert.equal(stored?.absoluteExpiresAt.toISOString(), "2026-07-31T00:00:00.000Z");
});

test("authorizes the allowed guild owner as administrator", async () => {
  const outcome = await completeOAuthCallback({
    ...callbackInput(),
    provider: provider(),
    memberReader: memberReader({
      kind: "member",
      guildId: "200",
      guildOwnerId: "100",
      roleIds: [],
    }),
    persistence: new FakePersistence(),
    credentialSink: sink(),
  });

  assert.deepEqual(outcome, {
    kind: "succeeded",
    authorizationTier: "administrator",
  });
});

test("rejects a generated session credential that would preserve fixation", async () => {
  const credentialSink = sink();
  const outcome = await completeOAuthCallback({
    ...callbackInput({ generateSessionId: () => previousSession }),
    provider: provider(),
    memberReader: memberReader(),
    persistence: new FakePersistence(),
    credentialSink,
  });

  assert.deepEqual(outcome, { kind: "denied", reason: "session-fixation" });
  assert.deepEqual(credentialSink.credentials, []);
});

test("allows only one of two concurrent callbacks for the same state", async () => {
  const persistence = new FakePersistence();
  const sinks = [sink(), sink()];
  const outcomes = await Promise.all(
    sinks.map((credentialSink) =>
      completeOAuthCallback({
        ...callbackInput(),
        provider: provider(),
        memberReader: memberReader(),
        persistence,
        credentialSink,
      }),
    ),
  );

  assert.equal(outcomes.filter((outcome) => outcome.kind === "succeeded").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.kind === "denied").length, 1);
  assert.equal(sinks.flatMap((value) => value.credentials).length, 1);
});

test("denies mismatched, reused, and expired persistent state", async () => {
  for (const input of [callbackInput({ rawState: "wrong-state" })]) {
    const credentialSink = sink();
    const outcome = await completeOAuthCallback({
      ...input,
      provider: provider(),
      memberReader: memberReader(),
      persistence: new FakePersistence(),
      credentialSink,
    });
    assert.deepEqual(outcome, { kind: "denied", reason: "state-invalid" });
    assert.deepEqual(credentialSink.credentials, []);
  }

  const expiredPersistence = new FakePersistence();
  expiredPersistence.states.set(hashOpaqueSessionId(state), now);
  assert.deepEqual(
    await completeOAuthCallback({
      ...callbackInput(),
      provider: provider(),
      memberReader: memberReader(),
      persistence: expiredPersistence,
      credentialSink: sink(),
    }),
    { kind: "denied", reason: "state-invalid" },
  );

  const persistence = new FakePersistence();
  const first = await completeOAuthCallback({
    ...callbackInput(),
    provider: provider(),
    memberReader: memberReader(),
    persistence,
    credentialSink: sink(),
  });
  const second = await completeOAuthCallback({
    ...callbackInput(),
    provider: provider(),
    memberReader: memberReader(),
    persistence,
    credentialSink: sink(),
  });
  assert.equal(first.kind, "succeeded");
  assert.deepEqual(second, { kind: "denied", reason: "state-invalid" });
});

test("default-denies malformed identity, wrong guild, wrong role, and unavailable member lookup", async () => {
  const cases = [
    {
      identityProvider: provider({ fetchIdentity: async () => ({ id: "not-a-snowflake" }) }),
      reader: memberReader(),
      reason: "identity-invalid",
    },
    {
      identityProvider: provider(),
      reader: memberReader({
        kind: "member",
        guildId: "wrong-guild",
        guildOwnerId: "999",
        roleIds: ["300"],
      }),
      reason: "unauthorized",
    },
    {
      identityProvider: provider(),
      reader: memberReader({
        kind: "member",
        guildId: "200",
        guildOwnerId: "999",
        roleIds: ["unconfigured-role"],
      }),
      reason: "unauthorized",
    },
    {
      identityProvider: provider(),
      reader: memberReader({ kind: "unauthorized" }),
      reason: "unauthorized",
    },
    {
      identityProvider: provider(),
      reader: memberReader({ kind: "unavailable", reason: "rate-limited" }),
      reason: "provider-unavailable",
    },
  ] as const;

  for (const fixture of cases) {
    const outcome = await completeOAuthCallback({
      ...callbackInput(),
      provider: fixture.identityProvider,
      memberReader: fixture.reader,
      persistence: new FakePersistence(),
      credentialSink: sink(),
    });
    assert.deepEqual(outcome, { kind: "denied", reason: fixture.reason });
  }
});

test("normalizes provider timeout, 401, 403, 429, and 5xx without leaking secrets", async () => {
  for (const providerReason of [
    "timeout",
    "unauthorized",
    "forbidden",
    "rate-limited",
    "server-error",
  ] as const) {
    const outcome = await completeOAuthCallback({
      ...callbackInput(),
      provider: provider({
        exchangeCode: async () => {
          throw Object.assign(new Error(`${providerReason}: ${code} ${accessToken}`), {
            reason: providerReason,
          });
        },
      }),
      memberReader: memberReader(),
      persistence: new FakePersistence(),
      credentialSink: sink(),
    });
    assert.deepEqual(outcome, { kind: "denied", reason: "provider-unavailable" });
    const serialized = JSON.stringify(outcome);
    assert.equal(serialized.includes(code), false);
    assert.equal(serialized.includes(accessToken), false);
  }
});

test("keeps code, tokens, raw state, and raw sessions out of persistence and public outcome", async () => {
  const persistence = new FakePersistence();
  const outcome = await completeOAuthCallback({
    ...callbackInput(),
    provider: provider(),
    memberReader: memberReader(),
    persistence,
    credentialSink: sink(),
  });
  const serialized = JSON.stringify({ outcome, persistenceInput: persistence.lastInput });

  for (const canary of [
    code,
    accessToken,
    refreshToken,
    state,
    previousSession,
    nextSession,
  ]) {
    assert.equal(serialized.includes(canary), false, `leaked ${canary}`);
  }
});
