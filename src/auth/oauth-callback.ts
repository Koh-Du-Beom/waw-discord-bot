import { randomBytes } from "node:crypto";

import type { AuthorizationTier } from "../contracts/local-command.ts";
import {
  hashOpaqueSessionId,
  type OpaqueSession,
} from "../persistence/session-store.ts";

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
};

export type OAuthIdentityProvider = {
  exchangeCode(code: string): Promise<OAuthTokenSet>;
  fetchIdentity(accessToken: string): Promise<{ id: string }>;
};

export type CurrentMemberResult =
  | {
      kind: "member";
      guildId: string;
      guildOwnerId: string;
      roleIds: readonly string[];
    }
  | { kind: "unauthorized" }
  | {
      kind: "unavailable";
      reason: "timeout" | "unauthorized" | "forbidden" | "rate-limited" | "server-error";
    };

export type CurrentMemberReader = {
  readCurrentMember(input: {
    actorId: string;
    guildId: string;
  }): Promise<CurrentMemberResult>;
};

export type CallbackPersistenceInput = {
  stateHash: string;
  completedAt: Date;
  previousSessionIdHash?: string;
  session: OpaqueSession;
  roleCache: {
    actorId: string;
    authorizationTier: AuthorizationTier;
    verifiedAt: Date;
  };
};

export type CallbackPersistence = {
  isOAuthStateUsable(stateHash: string, now: Date): Promise<boolean>;
  completeOAuthCallback(
    input: CallbackPersistenceInput,
  ): Promise<"completed" | "state-invalid">;
};

export type SessionCredentialSink = {
  stage(rawSessionId: string): StagedSessionCredential;
  publish(rawSessionId: string): void;
};

export type StagedSessionCredential = {
  release(): void;
};

export type OAuthCallbackOutcome =
  | { kind: "succeeded"; authorizationTier: AuthorizationTier }
  | {
      kind: "denied";
      reason:
        | "state-invalid"
        | "identity-invalid"
        | "unauthorized"
        | "provider-unavailable"
        | "session-fixation";
    };

export type OAuthCallbackInput = {
  code: string;
  rawState: string;
  previousRawSessionId?: string;
  now: Date;
  allowedGuildId: string;
  operatorRoleIds: readonly string[];
  administratorRoleIds: readonly string[];
  provider: OAuthIdentityProvider;
  memberReader: CurrentMemberReader;
  persistence: CallbackPersistence;
  credentialSink: SessionCredentialSink;
  generateSessionId?: () => string;
};

export async function completeOAuthCallback(
  input: OAuthCallbackInput,
): Promise<OAuthCallbackOutcome> {
  const stateHash = hashOpaqueSessionId(input.rawState);
  if (!(await input.persistence.isOAuthStateUsable(stateHash, input.now))) {
    return { kind: "denied", reason: "state-invalid" };
  }

  let identity: { id: string };
  try {
    const tokens = await input.provider.exchangeCode(input.code);
    identity = await input.provider.fetchIdentity(tokens.accessToken);
  } catch {
    return { kind: "denied", reason: "provider-unavailable" };
  }

  if (!isDiscordSnowflake(identity.id)) {
    return { kind: "denied", reason: "identity-invalid" };
  }

  let member: CurrentMemberResult;
  try {
    member = await input.memberReader.readCurrentMember({
      actorId: identity.id,
      guildId: input.allowedGuildId,
    });
  } catch {
    return { kind: "denied", reason: "provider-unavailable" };
  }

  if (member.kind === "unavailable") {
    return { kind: "denied", reason: "provider-unavailable" };
  }
  if (member.kind === "unauthorized" || member.guildId !== input.allowedGuildId) {
    return { kind: "denied", reason: "unauthorized" };
  }

  const authorizationTier = resolveAuthorizationTier({
    actorId: identity.id,
    guildOwnerId: member.guildOwnerId,
    roleIds: member.roleIds,
    operatorRoleIds: input.operatorRoleIds,
    administratorRoleIds: input.administratorRoleIds,
  });
  if (authorizationTier === undefined) {
    return { kind: "denied", reason: "unauthorized" };
  }

  const rawSessionId = (input.generateSessionId ?? generateSessionId)();
  if (
    rawSessionId.length < 32 ||
    rawSessionId === input.previousRawSessionId
  ) {
    return { kind: "denied", reason: "session-fixation" };
  }

  const session: OpaqueSession = {
    sessionIdHash: hashOpaqueSessionId(rawSessionId),
    actorId: identity.id,
    authorizationTier,
    createdAt: input.now,
    lastSeenAt: input.now,
    idleExpiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
    absoluteExpiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
    lastOAuthCompletedAt: input.now,
  };
  const stagedCredential = input.credentialSink.stage(rawSessionId);
  const result = await input.persistence.completeOAuthCallback({
    stateHash,
    completedAt: input.now,
    ...(input.previousRawSessionId === undefined
      ? {}
      : { previousSessionIdHash: hashOpaqueSessionId(input.previousRawSessionId) }),
    session,
    roleCache: {
      actorId: identity.id,
      authorizationTier,
      verifiedAt: input.now,
    },
  });
  if (result !== "completed") {
    return { kind: "denied", reason: "state-invalid" };
  }

  // This only releases already-validated headers to the response DTO. A later
  // transport disconnect cannot roll back the committed session; cleanup of an
  // unreachable session remains a separate expiry/cleanup policy concern.
  stagedCredential.release();
  return { kind: "succeeded", authorizationTier };
}

export function resolveAuthorizationTier(input: {
  actorId: string;
  guildOwnerId: string;
  roleIds: readonly string[];
  operatorRoleIds: readonly string[];
  administratorRoleIds: readonly string[];
}): AuthorizationTier | undefined {
  if (
    input.actorId === input.guildOwnerId ||
    input.roleIds.some((roleId) => input.administratorRoleIds.includes(roleId))
  ) {
    return "administrator";
  }
  if (input.roleIds.some((roleId) => input.operatorRoleIds.includes(roleId))) {
    return "operator";
  }
  return undefined;
}

function isDiscordSnowflake(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value);
}

function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}
