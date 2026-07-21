import assert from "node:assert/strict";
import test from "node:test";

import {
  hashOpaqueSessionId,
  InMemorySessionStore,
  isActiveSession,
  type OpaqueSession,
} from "./session-store.ts";

const createdAt = new Date("2026-07-21T00:00:00.000Z");

function session(overrides: Partial<OpaqueSession> = {}): OpaqueSession {
  return {
    sessionIdHash: hashOpaqueSessionId("synthetic-session-id"),
    actorId: "discord-user-1",
    authorizationTier: "operator",
    createdAt,
    lastSeenAt: createdAt,
    idleExpiresAt: new Date("2026-07-22T00:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-07-28T00:00:00.000Z"),
    ...overrides,
  };
}

test("stores only a one-way opaque session id hash", () => {
  const rawSessionId = "synthetic-session-id";
  const hash = hashOpaqueSessionId(rawSessionId);

  assert.notEqual(hash, rawSessionId);
  assert.equal(hash, hashOpaqueSessionId(rawSessionId));
  assert.equal(hash.length > 20, true);
});

test("treats an unrevoked unexpired session as active", () => {
  assert.equal(isActiveSession(session(), new Date("2026-07-21T12:00:00.000Z")), true);
});

test("denies session after idle or absolute expiry", () => {
  assert.equal(isActiveSession(session(), new Date("2026-07-22T00:00:00.000Z")), false);
  assert.equal(
    isActiveSession(
      session({ idleExpiresAt: new Date("2026-07-30T00:00:00.000Z") }),
      new Date("2026-07-28T00:00:00.000Z"),
    ),
    false,
  );
});

test("revokes an existing session without retaining the raw id", () => {
  const store = new InMemorySessionStore();
  const record = session();
  store.save(record);
  store.revoke(record.sessionIdHash, new Date("2026-07-21T01:00:00.000Z"));

  const revoked = store.find(record.sessionIdHash);
  assert.equal(revoked?.revokedAt?.toISOString(), "2026-07-21T01:00:00.000Z");
  assert.equal(isActiveSession(revoked!, new Date("2026-07-21T01:01:00.000Z")), false);
});
