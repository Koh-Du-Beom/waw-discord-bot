import { createHmac, timingSafeEqual } from "node:crypto";

import type { AuthorizationTier } from "../contracts/local-command.ts";
import type {
  AuthConfiguration,
  EnabledAuthConfiguration,
} from "../auth/oauth-configuration.ts";
import type { SessionCredentialSink } from "../auth/oauth-callback.ts";
import {
  hashOpaqueSessionId,
  isActiveSession,
  type OpaqueSession,
} from "../persistence/session-store.ts";

const sessionCookieName = "__Host-waw_session";
const csrfCookieName = "__Host-waw_csrf";
const sessionCookieAttributes = "Path=/; Secure; HttpOnly; SameSite=Lax";
const csrfCookieAttributes = "Path=/; Secure; SameSite=Strict";
const idleLifetimeMilliseconds = 24 * 60 * 60 * 1000;

export type SessionHttpPersistence = {
  findSession(sessionIdHash: string): Promise<OpaqueSession | undefined>;
  touchSession(
    sessionIdHash: string,
    lastSeenAt: Date,
    proposedIdleExpiresAt: Date,
  ): Promise<boolean>;
  revokeSession(sessionIdHash: string, revokedAt: Date): Promise<boolean>;
};

export type SessionRequest = {
  kind: "read" | "mutation";
  headers: Readonly<Record<string, string | undefined>>;
};

export type SessionOutcome =
  | {
      kind: "authenticated";
      actorId: string;
      authorizationTier: AuthorizationTier;
      lastOAuthCompletedAt: Date;
    }
  | {
      kind: "denied";
      reason:
        | "auth-disabled"
        | "session-invalid"
        | "session-unavailable"
        | "csrf-invalid";
    };

export type CsrfVerifier = {
  verify(input: {
    rawSessionId: string;
    cookieToken: string;
    headerToken: string;
  }): boolean;
};

export type SessionCookieBoundary = {
  credentialSink: SessionCredentialSink;
  csrfVerifier: CsrfVerifier;
  takeResponseHeaders(): Readonly<{ "set-cookie": readonly string[] }>;
};

export type SessionHttpResponse = {
  statusCode: number;
  headers: Readonly<{ "set-cookie"?: readonly string[] }>;
  body: Readonly<Record<string, string>>;
};

export function createSessionCookieBoundary(
  configuration: AuthConfiguration,
  csrfKey: string,
): SessionCookieBoundary {
  if (csrfKey.length < 32) {
    throw new Error("session-boundary-config-invalid");
  }
  let responseCookies: string[] = [];
  let credentialPrepared = false;
  const csrfVerifier = createCsrfVerifier(csrfKey);

  function stageCredential(rawSessionId: string) {
    if (!configuration.enabled) {
      throw new Error("auth-disabled");
    }
    if (credentialPrepared || !isValidCredential(rawSessionId)) {
      throw new Error("session-credential-invalid");
    }
    const stagedCookies = [
      `${sessionCookieName}=${rawSessionId}; ${sessionCookieAttributes}`,
      `${csrfCookieName}=${csrfToken(csrfKey, rawSessionId)}; ${csrfCookieAttributes}`,
    ];
    credentialPrepared = true;
    let released = false;
    return {
      release(): void {
        if (released) {
          throw new Error("session-credential-invalid");
        }
        released = true;
        responseCookies = stagedCookies;
      },
    };
  }

  return {
    credentialSink: {
      stage: stageCredential,
      publish(rawSessionId): void {
        stageCredential(rawSessionId).release();
      },
    },
    csrfVerifier,
    takeResponseHeaders() {
      return { "set-cookie": [...responseCookies] };
    },
  };
}

export async function authenticateSessionRequest(
  request: SessionRequest,
  configuration: AuthConfiguration,
  persistence: SessionHttpPersistence,
  csrfVerifier: CsrfVerifier,
  now: Date,
): Promise<SessionOutcome> {
  if (!configuration.enabled) {
    return { kind: "denied", reason: "auth-disabled" };
  }
  const parsedSession = readSessionCredential(request.headers.cookie);
  if (parsedSession.kind !== "present") {
    return { kind: "denied", reason: "session-invalid" };
  }

  if (
    request.kind === "mutation" &&
    !hasValidMutationBoundary(
      request.headers,
      configuration,
      parsedSession.rawSessionId,
      csrfVerifier,
    )
  ) {
    return { kind: "denied", reason: "csrf-invalid" };
  }

  const sessionIdHash = hashOpaqueSessionId(parsedSession.rawSessionId);
  let session: OpaqueSession | undefined;
  try {
    session = await persistence.findSession(sessionIdHash);
  } catch {
    return { kind: "denied", reason: "session-unavailable" };
  }
  if (session === undefined || !isActiveSession(session, now)) {
    return { kind: "denied", reason: "session-invalid" };
  }

  try {
    const touched = await persistence.touchSession(
      sessionIdHash,
      now,
      new Date(now.getTime() + idleLifetimeMilliseconds),
    );
    if (!touched) {
      return { kind: "denied", reason: "session-invalid" };
    }
  } catch {
    return { kind: "denied", reason: "session-unavailable" };
  }

  return {
    kind: "authenticated",
    actorId: session.actorId,
    authorizationTier: session.authorizationTier,
    lastOAuthCompletedAt: session.lastOAuthCompletedAt,
  };
}

export async function handleSessionLogout(
  request: {
    method: string;
    headers: Readonly<Record<string, string | undefined>>;
  },
  configuration: AuthConfiguration,
  persistence: SessionHttpPersistence,
  csrfVerifier: CsrfVerifier,
  now: Date,
): Promise<SessionHttpResponse> {
  if (!configuration.enabled) {
    return {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    };
  }
  if (request.method !== "POST") {
    return {
      statusCode: 405,
      headers: {},
      body: { kind: "denied", reason: "method-invalid" },
    };
  }
  const authenticated = await authenticateSessionRequest(
    { kind: "mutation", headers: request.headers },
    configuration,
    persistence,
    csrfVerifier,
    now,
  );
  if (authenticated.kind !== "authenticated") {
    return {
      statusCode: authenticated.reason === "session-unavailable" ? 503 : 403,
      headers: {},
      body: { kind: "denied", reason: authenticated.reason },
    };
  }

  const parsedSession = readSessionCredential(request.headers.cookie);
  if (parsedSession.kind !== "present") {
    return {
      statusCode: 403,
      headers: {},
      body: { kind: "denied", reason: "session-invalid" },
    };
  }
  try {
    if (
      !(await persistence.revokeSession(
        hashOpaqueSessionId(parsedSession.rawSessionId),
        now,
      ))
    ) {
      return {
        statusCode: 403,
        headers: {},
        body: { kind: "denied", reason: "session-invalid" },
      };
    }
  } catch {
    return {
      statusCode: 503,
      headers: {},
      body: { kind: "denied", reason: "session-unavailable" },
    };
  }

  return {
    statusCode: 204,
    headers: {
      "set-cookie": [
        `${sessionCookieName}=; ${sessionCookieAttributes}; Max-Age=0`,
        `${csrfCookieName}=; ${csrfCookieAttributes}; Max-Age=0`,
      ],
    },
    body: {},
  };
}

export function readSessionCredential(
  cookieHeader: string | undefined,
):
  | { kind: "missing" | "invalid" }
  | { kind: "present"; rawSessionId: string } {
  const parsed = parseCookies(cookieHeader);
  if (parsed === undefined) {
    return { kind: cookieHeader === undefined ? "missing" : "invalid" };
  }
  const values = parsed.get(sessionCookieName);
  if (
    values === undefined ||
    values.length !== 1 ||
    !isValidCredential(values[0] ?? "")
  ) {
    return { kind: values === undefined ? "missing" : "invalid" };
  }
  return { kind: "present", rawSessionId: values[0]! };
}

export function sessionOutcomeLog(
  outcome: SessionOutcome,
): Readonly<Record<string, string>> {
  if (outcome.kind === "authenticated") {
    return {
      event_type: "session.authenticate",
      outcome: "success",
      actor_id: outcome.actorId,
    };
  }
  return {
    event_type: "session.authenticate",
    outcome: "denied",
    reason_code: outcome.reason,
  };
}

function hasValidMutationBoundary(
  headers: Readonly<Record<string, string | undefined>>,
  configuration: EnabledAuthConfiguration,
  rawSessionId: string,
  csrfVerifier: CsrfVerifier,
): boolean {
  if (headers.origin !== configuration.allowedOrigin) {
    return false;
  }
  const parsed = parseCookies(headers.cookie);
  const csrfValues = parsed?.get(csrfCookieName);
  const headerToken = headers["x-csrf-token"];
  return (
    csrfValues !== undefined &&
    csrfValues.length === 1 &&
    headerToken !== undefined &&
    csrfVerifier.verify({
      rawSessionId,
      cookieToken: csrfValues[0] ?? "",
      headerToken,
    })
  );
}

function createCsrfVerifier(csrfKey: string): CsrfVerifier {
  return {
    verify({ rawSessionId, cookieToken, headerToken }): boolean {
      if (
        !isValidCsrfToken(cookieToken) ||
        !isValidCsrfToken(headerToken) ||
        cookieToken.length !== headerToken.length
      ) {
        return false;
      }
      const expected = csrfToken(csrfKey, rawSessionId);
      return (
        timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken)) &&
        timingSafeEqual(Buffer.from(cookieToken), Buffer.from(expected))
      );
    },
  };
}

function csrfToken(csrfKey: string, rawSessionId: string): string {
  return createHmac("sha256", csrfKey)
    .update(rawSessionId, "utf8")
    .digest("base64url");
}

function isValidCredential(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function isValidCsrfToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function parseCookies(
  cookieHeader: string | undefined,
): Map<string, string[]> | undefined {
  if (cookieHeader === undefined || cookieHeader.length === 0) {
    return cookieHeader === undefined ? new Map() : undefined;
  }
  const parsed = new Map<string, string[]>();
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      return undefined;
    }
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      !/^[\x21-\x7E]*$/.test(value)
    ) {
      return undefined;
    }
    const values = parsed.get(name) ?? [];
    values.push(value);
    parsed.set(name, values);
  }
  return parsed;
}
