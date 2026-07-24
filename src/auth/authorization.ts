import { randomBytes } from "node:crypto";

import { hashOpaqueSessionId } from "../persistence/session-store.ts";

export type RequestKind = "read" | "mutation" | "high-risk";
export type CurrentRoleResult = "authorized" | "unauthorized" | "unavailable";

export type AuthorizationInput = {
  kind: RequestKind;
  currentRole: CurrentRoleResult;
  cachedRoleVerifiedAt?: Date;
  now: Date;
  csrfValid: boolean;
  lastOAuthCompletedAt?: Date;
  explicitConfirmation: boolean;
};

export type AuthorizationOutcome =
  | { kind: "allowed"; source: "current-role" | "role-cache" }
  | {
      kind: "denied";
      reason:
        | "unauthorized"
        | "unavailable"
        | "csrf-invalid"
        | "recent-auth-required"
        | "confirmation-required";
    };

export function authorize(input: AuthorizationInput): AuthorizationOutcome {
  if (input.kind === "read") {
    if (input.currentRole === "authorized") {
      return { kind: "allowed", source: "current-role" };
    }

    if (input.currentRole === "unavailable" && hasValidReadOnlyCache(input)) {
      return { kind: "allowed", source: "role-cache" };
    }

    return {
      kind: "denied",
      reason: input.currentRole === "unauthorized" ? "unauthorized" : "unavailable",
    };
  }

  if (input.currentRole !== "authorized") {
    return {
      kind: "denied",
      reason: input.currentRole === "unauthorized" ? "unauthorized" : "unavailable",
    };
  }

  if (!input.csrfValid) {
    return { kind: "denied", reason: "csrf-invalid" };
  }

  if (input.kind === "high-risk") {
    if (!hasRecentOAuth(input)) {
      return { kind: "denied", reason: "recent-auth-required" };
    }
    if (!input.explicitConfirmation) {
      return { kind: "denied", reason: "confirmation-required" };
    }
  }

  return { kind: "allowed", source: "current-role" };
}

export type OAuthStateRecord = {
  stateHash: string;
  expiresAt: Date;
  usedAt?: Date;
};

export function createOAuthState(now: Date): { rawState: string; record: OAuthStateRecord } {
  const rawState = randomBytes(32).toString("base64url");
  return {
    rawState,
    record: {
      stateHash: hashOpaqueSessionId(rawState),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
  };
}

export function consumeOAuthState(
  record: OAuthStateRecord,
  rawState: string,
  now: Date,
): OAuthStateRecord | undefined {
  if (
    record.usedAt !== undefined ||
    now.getTime() >= record.expiresAt.getTime() ||
    record.stateHash !== hashOpaqueSessionId(rawState)
  ) {
    return undefined;
  }

  return { ...record, usedAt: now };
}

function hasValidReadOnlyCache(input: AuthorizationInput): boolean {
  if (input.cachedRoleVerifiedAt === undefined) {
    return false;
  }

  const age = input.now.getTime() - input.cachedRoleVerifiedAt.getTime();
  return age >= 0 && age <= 5 * 60 * 1000;
}

function hasRecentOAuth(input: AuthorizationInput): boolean {
  if (input.lastOAuthCompletedAt === undefined) {
    return false;
  }

  const age = input.now.getTime() - input.lastOAuthCompletedAt.getTime();
  return age >= 0 && age <= 15 * 60 * 1000;
}
