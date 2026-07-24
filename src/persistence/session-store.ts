import { createHash } from "node:crypto";

import type { AuthorizationTier } from "../contracts/local-command.ts";

export type OpaqueSession = {
  sessionIdHash: string;
  actorId: string;
  authorizationTier: AuthorizationTier;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastOAuthCompletedAt: Date;
  revokedAt?: Date;
};

export type SessionStore = {
  save(session: OpaqueSession): void;
  find(sessionIdHash: string): OpaqueSession | undefined;
  revoke(sessionIdHash: string, revokedAt: Date): void;
};

export function hashOpaqueSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("base64url");
}

export function isActiveSession(session: OpaqueSession, now: Date): boolean {
  return (
    session.revokedAt === undefined &&
    now.getTime() < session.idleExpiresAt.getTime() &&
    now.getTime() < session.absoluteExpiresAt.getTime()
  );
}

export class InMemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, OpaqueSession>();

  save(session: OpaqueSession): void {
    this.sessions.set(session.sessionIdHash, session);
  }

  find(sessionIdHash: string): OpaqueSession | undefined {
    return this.sessions.get(sessionIdHash);
  }

  revoke(sessionIdHash: string, revokedAt: Date): void {
    const session = this.sessions.get(sessionIdHash);
    if (session === undefined) {
      return;
    }

    this.sessions.set(sessionIdHash, { ...session, revokedAt });
  }
}
