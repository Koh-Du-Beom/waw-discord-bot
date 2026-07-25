import { randomBytes } from "node:crypto";

import type { DiscordOAuthIdentityProvider } from "../adapters/discord/oauth-identity.ts";
import type { AuthorizationTier } from "../contracts/local-command.ts";
import {
  handleOAuthCallbackRequest,
  createOAuthLoginResponse,
  type FrameworkNeutralRequest,
} from "../http/oauth-dto.ts";
import {
  authenticateSessionRequest,
  createSessionCookieBoundary,
  handleSessionLogout,
  readSessionCredential,
  type SessionCookieBoundary,
  type SessionHttpPersistence,
} from "../http/session-boundary.ts";
import {
  hashOpaqueSessionId,
  type OpaqueSession,
} from "../persistence/session-store.ts";
import type {
  OAuthState,
  RoleCache,
} from "../persistence/postgres-persistence.ts";
import {
  authorize,
  type RequestKind,
} from "./authorization.ts";
import {
  completeOAuthCallback,
  resolveAuthorizationTier,
  type CallbackPersistence,
  type CurrentMemberReader,
  type CurrentMemberResult,
} from "./oauth-callback.ts";
import type {
  CurrentAuthorizationReader,
  CurrentAuthorizationResult,
} from "./member-role-ipc.ts";
import type { AuthConfiguration } from "./oauth-configuration.ts";

const oauthStateLifetimeMilliseconds = 10 * 60 * 1000;
const sessionIdleLifetimeMilliseconds = 24 * 60 * 60 * 1000;
const oauthStateCookieName = "__Host-waw_oauth_state";
const oauthStateCookieAttributes =
  "Path=/; Secure; HttpOnly; SameSite=Lax";

export type AuthServicePersistence =
  & CallbackPersistence
  & SessionHttpPersistence
  & {
    createOAuthState(state: OAuthState): Promise<void>;
    rotateSession(
      previousSessionIdHash: string,
      nextSession: OpaqueSession,
      revokedAt: Date,
    ): Promise<void>;
    upsertRoleCache(cache: RoleCache): Promise<void>;
    findFreshRoleCache(actorId: string, now: Date): Promise<RoleCache | undefined>;
  };

export type AuthServiceResponse = {
  statusCode: number;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  body: Readonly<Record<string, string>>;
};

export type AuthService = {
  login(): Promise<AuthServiceResponse>;
  callback(request: FrameworkNeutralRequest): Promise<AuthServiceResponse>;
  authorize(input: {
    kind: RequestKind;
    headers: Readonly<Record<string, string | undefined>>;
    explicitConfirmation?: boolean;
  }): Promise<AuthServiceResponse>;
  logout(request: {
    method: string;
    headers: Readonly<Record<string, string | undefined>>;
  }): Promise<AuthServiceResponse>;
};

export type AuthServiceDependencies = {
  configuration: AuthConfiguration;
  provider?: DiscordOAuthIdentityProvider;
  memberReader?: CurrentMemberReader | undefined;
  authorizationReader?: CurrentAuthorizationReader;
  persistence: AuthServicePersistence;
  csrfKey: string;
  now?: () => Date;
  generateOAuthState?: () => string;
  generateSessionId?: () => string;
  createSessionBoundary?: (
    configuration: AuthConfiguration,
    csrfKey: string,
  ) => SessionCookieBoundary;
};

export function createAuthService(
  dependencies: AuthServiceDependencies,
): AuthService {
  const clock = dependencies.now ?? (() => new Date());
  const sessionBoundaryFactory =
    dependencies.createSessionBoundary ?? createSessionCookieBoundary;

  return {
    async login(): Promise<AuthServiceResponse> {
      if (!isReady(dependencies)) {
        return disabledResponse();
      }
      const rawState =
        dependencies.generateOAuthState?.() ??
        randomBytes(32).toString("base64url");
      if (!isValidOpaqueSecret(rawState)) {
        return unavailableResponse("persistence-unavailable");
      }
      const createdAt = clock();
      try {
        await dependencies.persistence.createOAuthState({
          stateHash: hashOpaqueSessionId(rawState),
          expiresAt: new Date(
            createdAt.getTime() + oauthStateLifetimeMilliseconds,
          ),
        });
      } catch {
        return unavailableResponse("persistence-unavailable");
      }
      const response = createOAuthLoginResponse(
        dependencies.configuration,
        dependencies.provider,
        rawState,
      );
      return {
        ...response,
        headers: {
          ...response.headers,
          "set-cookie": [
            `${oauthStateCookieName}=${rawState}; ${oauthStateCookieAttributes}; Max-Age=600`,
          ],
        },
      };
    },

    async callback(request): Promise<AuthServiceResponse> {
      if (!isReady(dependencies)) {
        return disabledResponse();
      }
      const boundary = sessionBoundaryFactory(
        dependencies.configuration,
        dependencies.csrfKey,
      );
      const callbackState = readCallbackState(request.url);
      const browserState = readExactCookie(
        request.headers?.cookie,
        oauthStateCookieName,
      );
      if (
        callbackState === undefined ||
        browserState === undefined ||
        callbackState !== browserState
      ) {
        return {
          statusCode: 403,
          headers: { "set-cookie": [expiredOAuthStateCookie()] },
          body: { kind: "denied", reason: "state-browser-mismatch" },
        };
      }
      const response = await handleOAuthCallbackRequest(
        request,
        dependencies.configuration,
        async (command) =>
          completeOAuthCallback({
            ...command,
            now: clock(),
            allowedGuildId: dependencies.configuration.allowedGuildId,
            operatorRoleIds: dependencies.configuration.operatorRoleIds,
            administratorRoleIds:
              dependencies.configuration.administratorRoleIds,
            provider: dependencies.provider,
            ...(dependencies.memberReader === undefined
              ? {}
              : { memberReader: dependencies.memberReader }),
            ...(dependencies.authorizationReader === undefined
              ? {}
              : { authorizationReader: dependencies.authorizationReader }),
            persistence: dependencies.persistence,
            credentialSink: boundary.credentialSink,
            ...(dependencies.generateSessionId === undefined
              ? {}
              : { generateSessionId: dependencies.generateSessionId }),
          }),
      );
      if (response.statusCode !== 303) {
        return {
          ...response,
          headers: {
            ...response.headers,
            "set-cookie": [expiredOAuthStateCookie()],
          },
        };
      }
      const published = boundary.takeResponseHeaders()["set-cookie"] ?? [];
      if (published.length === 0) {
        return unavailableResponse("callback-unavailable");
      }
      return {
        ...response,
        headers: {
          ...response.headers,
          "set-cookie": [...published, expiredOAuthStateCookie()],
        },
      };
    },

    async authorize(input): Promise<AuthServiceResponse> {
      if (!isReady(dependencies)) {
        return disabledResponse();
      }
      const boundary = sessionBoundaryFactory(
        dependencies.configuration,
        dependencies.csrfKey,
      );
      const session = await authenticateSessionRequest(
        {
          kind: input.kind === "read" ? "read" : "mutation",
          headers: input.headers,
        },
        dependencies.configuration,
        dependencies.persistence,
        boundary.csrfVerifier,
        clock(),
      );
      if (session.kind === "denied") {
        return sessionDeniedResponse(session.reason);
      }

      const checkedAt = clock();
      let currentRole: "authorized" | "unauthorized" | "unavailable";
      let authorizationTier: AuthorizationTier | undefined;
      let cachedRoleVerifiedAt: Date | undefined;
      const currentAuthorization = await readCurrentAuthorization(
        dependencies,
        session.actorId,
      );
      if (currentAuthorization.kind === "authorized") {
        authorizationTier = currentAuthorization.authorizationTier;
        currentRole = "authorized";
        if (authorizationTier !== undefined) {
          try {
            await dependencies.persistence.upsertRoleCache({
              actorId: session.actorId,
              authorizationTier,
              verifiedAt: checkedAt,
            });
          } catch {
            return unavailableResponse("persistence-unavailable");
          }
        }
      } else if (currentAuthorization.kind === "unavailable") {
        currentRole = "unavailable";
        if (input.kind === "read") {
          let cached: RoleCache | undefined;
          try {
            cached = await dependencies.persistence.findFreshRoleCache(
              session.actorId,
              checkedAt,
            );
          } catch {
            return unavailableResponse("persistence-unavailable");
          }
          authorizationTier = cached?.authorizationTier;
          cachedRoleVerifiedAt = cached?.verifiedAt;
        }
      } else {
        currentRole = "unauthorized";
      }

      const outcome = authorize({
        kind: input.kind,
        currentRole,
        ...(cachedRoleVerifiedAt === undefined
          ? {}
          : { cachedRoleVerifiedAt }),
        now: checkedAt,
        csrfValid: true,
        lastOAuthCompletedAt: session.lastOAuthCompletedAt,
        explicitConfirmation: input.explicitConfirmation === true,
      });
      if (outcome.kind === "denied") {
        return {
          statusCode: outcome.reason === "unavailable" ? 503 : 403,
          headers: {},
          body: { kind: "denied", reason: outcome.reason },
        };
      }
      let responseCookies: readonly string[] | undefined;
      if (
        currentRole === "authorized" &&
        authorizationTier !== undefined &&
        authorizationTier !== session.authorizationTier
      ) {
        const parsed = readSessionCredential(input.headers.cookie);
        if (parsed.kind !== "present") {
          return sessionDeniedResponse("session-invalid");
        }
        const previousSessionIdHash = hashOpaqueSessionId(parsed.rawSessionId);
        let previousSession: OpaqueSession | undefined;
        try {
          previousSession =
            await dependencies.persistence.findSession(previousSessionIdHash);
        } catch {
          return unavailableResponse("persistence-unavailable");
        }
        if (previousSession === undefined) {
          return sessionDeniedResponse("session-invalid");
        }
        const rawSessionId =
          dependencies.generateSessionId?.() ??
          randomBytes(32).toString("base64url");
        if (
          !isValidOpaqueSecret(rawSessionId) ||
          rawSessionId === parsed.rawSessionId
        ) {
          return unavailableResponse("session-rotation-unavailable");
        }
        const idleExpiresAt = new Date(
          Math.min(
            checkedAt.getTime() + sessionIdleLifetimeMilliseconds,
            previousSession.absoluteExpiresAt.getTime(),
          ),
        );
        try {
          const stagedCredential =
            boundary.credentialSink.stage(rawSessionId);
          await dependencies.persistence.rotateSession(
            previousSessionIdHash,
            {
              sessionIdHash: hashOpaqueSessionId(rawSessionId),
              actorId: session.actorId,
              authorizationTier,
              createdAt: checkedAt,
              lastSeenAt: checkedAt,
              idleExpiresAt,
              absoluteExpiresAt: previousSession.absoluteExpiresAt,
              lastOAuthCompletedAt: session.lastOAuthCompletedAt,
            },
            checkedAt,
          );
          stagedCredential.release();
          responseCookies =
            boundary.takeResponseHeaders()["set-cookie"] ?? [];
        } catch {
          return unavailableResponse("session-rotation-unavailable");
        }
      }
      return {
        statusCode: 200,
        headers:
          responseCookies === undefined
            ? {}
            : { "set-cookie": responseCookies },
        body: {
          kind: "authorized",
          authorizationTier:
            authorizationTier ?? session.authorizationTier,
          source: outcome.source,
        },
      };
    },

    async logout(request): Promise<AuthServiceResponse> {
      if (!isReady(dependencies)) {
        return disabledResponse();
      }
      const boundary = sessionBoundaryFactory(
        dependencies.configuration,
        dependencies.csrfKey,
      );
      return handleSessionLogout(
        request,
        dependencies.configuration,
        dependencies.persistence,
        boundary.csrfVerifier,
        clock(),
      );
    },
  };
}

export function authServiceOutcomeLog(
  operation: "login" | "callback" | "authorize" | "logout",
  response: AuthServiceResponse,
): Readonly<Record<string, string>> {
  return {
    event_type: `auth.${operation}`,
    outcome:
      response.statusCode >= 200 && response.statusCode < 400
        ? "success"
        : "denied",
    ...(response.body.reason === undefined
      ? {}
      : { reason_code: response.body.reason }),
  };
}

function isReady(
  dependencies: AuthServiceDependencies,
): dependencies is AuthServiceDependencies & {
  configuration: Extract<AuthConfiguration, { enabled: true }>;
  provider: DiscordOAuthIdentityProvider;
} {
  return (
    dependencies.configuration.enabled &&
    dependencies.provider !== undefined &&
    (dependencies.memberReader !== undefined ||
      dependencies.authorizationReader !== undefined)
  );
}

async function readCurrentAuthorization(
  dependencies: AuthServiceDependencies & {
    configuration: Extract<AuthConfiguration, { enabled: true }>;
  },
  actorId: string,
): Promise<CurrentAuthorizationResult> {
  try {
    if (dependencies.authorizationReader !== undefined) {
      return await dependencies.authorizationReader.readCurrentAuthorization({
        actorId,
        guildId: dependencies.configuration.allowedGuildId,
      });
    }
    if (dependencies.memberReader === undefined) return { kind: "unavailable" };
    const member: CurrentMemberResult =
      await dependencies.memberReader.readCurrentMember({
        actorId,
        guildId: dependencies.configuration.allowedGuildId,
      });
    if (member.kind === "unavailable") return { kind: "unavailable" };
    if (
      member.kind === "unauthorized" ||
      member.guildId !== dependencies.configuration.allowedGuildId
    ) {
      return { kind: "unauthorized" };
    }
    const authorizationTier = resolveAuthorizationTier({
      actorId,
      guildOwnerId: member.guildOwnerId,
      roleIds: member.roleIds,
      operatorRoleIds: dependencies.configuration.operatorRoleIds,
      administratorRoleIds:
        dependencies.configuration.administratorRoleIds,
    });
    return authorizationTier === undefined
      ? { kind: "unauthorized" }
      : { kind: "authorized", authorizationTier };
  } catch {
    return { kind: "unavailable" };
  }
}

function isValidOpaqueSecret(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function readCallbackState(url: string): string | undefined {
  try {
    const values = new URL(url).searchParams.getAll("state");
    return values.length === 1 && isValidOpaqueSecret(values[0] ?? "")
      ? values[0]
      : undefined;
  } catch {
    return undefined;
  }
}

function readExactCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (cookieHeader === undefined) return undefined;
  const values = cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.startsWith(`${name}=`))
    .map((segment) => segment.slice(name.length + 1));
  return values.length === 1 && isValidOpaqueSecret(values[0] ?? "")
    ? values[0]
    : undefined;
}

function expiredOAuthStateCookie(): string {
  return `${oauthStateCookieName}=; ${oauthStateCookieAttributes}; Max-Age=0`;
}

function disabledResponse(): AuthServiceResponse {
  return {
    statusCode: 404,
    headers: {},
    body: { kind: "denied", reason: "auth-disabled" },
  };
}

function unavailableResponse(reason: string): AuthServiceResponse {
  return {
    statusCode: 503,
    headers: {},
    body: { kind: "denied", reason },
  };
}

function sessionDeniedResponse(
  reason: "auth-disabled" | "session-invalid" | "session-unavailable" | "csrf-invalid",
): AuthServiceResponse {
  return {
    statusCode:
      reason === "auth-disabled"
        ? 404
        : reason === "session-unavailable"
          ? 503
          : reason === "session-invalid"
            ? 401
            : 403,
    headers: {},
    body: { kind: "denied", reason },
  };
}
