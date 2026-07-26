import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { AuthConfiguration } from "../auth/oauth-configuration.ts";
import type {
  ApiErrorCode,
  AuditEventsDto,
  DashboardOverviewDto,
  LowRiskSettingsDto,
  UpdateLowRiskSettingsRequestDto,
  UpdateLowRiskSettingsResponseDto,
} from "../contracts/dashboard.ts";
import type { AuthorizationTier } from "../contracts/local-command.ts";
import {
  authenticateSessionRequest,
  readCsrfCookieToken,
  type CsrfVerifier,
  type SessionHttpPersistence,
  type SessionOutcome,
} from "../http/session-boundary.ts";

export type DashboardServices = {
  displayName(actorId: string): Promise<string>;
  readCurrentRole(actorId: string): AuthorizationTier | undefined;
  overview(): Promise<DashboardOverviewDto>;
  settings(): Promise<LowRiskSettingsDto>;
  audit(): Promise<AuditEventsDto>;
  updateSettings(input: {
    actorId: string;
    authorizationTier: AuthorizationTier;
    request: UpdateLowRiskSettingsRequestDto;
  }): Promise<UpdateLowRiskSettingsResponseDto>;
};

export type DashboardAppOptions = {
  configuration: AuthConfiguration;
  persistence: SessionHttpPersistence;
  csrfVerifier: CsrfVerifier;
  now(): Date;
  services: DashboardServices;
};

const settingsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["summaryEnabled", "expectedVersion"],
  properties: {
    summaryEnabled: { type: "boolean" },
    expectedVersion: { type: "integer", minimum: 0 },
  },
} as const;

export function buildDashboardApp(options: DashboardAppOptions): FastifyInstance {
  const app = Fastify({
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
    logger: false,
  });

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error) {
      sendError(reply, request, 400, "invalid_request", "요청 형식이 올바르지 않습니다.");
      return;
    }
    sendError(reply, request, 500, "internal_error", "요청을 처리하지 못했습니다.");
  });

  app.get("/api/session", async (request, reply) => {
    const session = await authenticate(request, "read", options);
    if (session.kind !== "authenticated") {
      sendSessionDenial(reply, request, session);
      return;
    }
    const csrfToken = readCsrfCookieToken(request.headers.cookie);
    if (csrfToken === undefined) {
      sendError(reply, request, 401, "unauthenticated", "로그인이 필요합니다.");
      return;
    }
    return {
      authenticated: true,
      actor: {
        displayName: await options.services.displayName(session.actorId),
        tier: session.authorizationTier,
      },
      csrfToken,
      features: { summaryQuotaDashboard: false },
    };
  });

  app.get("/api/overview", async (request, reply) => {
    if (!(await requireRead(request, reply, options))) return;
    return overviewDto(await options.services.overview());
  });

  app.get("/api/settings/summary", async (request, reply) => {
    if (!(await requireRead(request, reply, options))) return;
    return settingsDto(await options.services.settings());
  });

  app.get("/api/audit", async (request, reply) => {
    if (!(await requireRead(request, reply, options))) return;
    return auditDto(await options.services.audit());
  });

  app.put<{ Body: UpdateLowRiskSettingsRequestDto }>(
    "/api/settings/summary",
    { schema: { body: settingsBodySchema } },
    async (request, reply) => {
      const session = await authenticate(request, "mutation", options);
      if (session.kind !== "authenticated") {
        sendSessionDenial(reply, request, session);
        return;
      }
      const currentRole = options.services.readCurrentRole(session.actorId);
      if (currentRole === undefined || currentRole !== session.authorizationTier) {
        sendError(reply, request, 403, "forbidden", "현재 권한으로 변경할 수 없습니다.");
        return;
      }
      try {
        return updateResponseDto(await options.services.updateSettings({
          actorId: session.actorId,
          authorizationTier: currentRole,
          request: request.body,
        }));
      } catch (error) {
        if (errorCode(error) === "conflict") {
          sendError(reply, request, 409, "conflict", "설정이 먼저 변경되었습니다.");
          return;
        }
        sendError(reply, request, 503, "unavailable", "설정을 변경할 수 없습니다.");
      }
    },
  );

  return app;
}

async function requireRead(
  request: FastifyRequest,
  reply: FastifyReply,
  options: DashboardAppOptions,
): Promise<boolean> {
  const session = await authenticate(request, "read", options);
  if (session.kind === "authenticated") return true;
  sendSessionDenial(reply, request, session);
  return false;
}

function authenticate(
  request: FastifyRequest,
  kind: "read" | "mutation",
  options: DashboardAppOptions,
) {
  return authenticateSessionRequest(
    { kind, headers: normalizedHeaders(request) },
    options.configuration,
    options.persistence,
    options.csrfVerifier,
    options.now(),
  );
}

function normalizedHeaders(request: FastifyRequest): Readonly<Record<string, string | undefined>> {
  const values: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

function sendSessionDenial(
  reply: FastifyReply,
  request: FastifyRequest,
  outcome: Exclude<SessionOutcome, { kind: "authenticated" }>,
): void {
  if (outcome.reason === "session-unavailable") {
    sendError(reply, request, 503, "unavailable", "세션을 확인할 수 없습니다.");
    return;
  }
  const mutation = request.method !== "GET" && request.method !== "HEAD";
  sendError(
    reply,
    request,
    mutation ? 403 : 401,
    mutation ? "forbidden" : "unauthenticated",
    mutation ? "현재 요청을 수행할 권한이 없습니다." : "로그인이 필요합니다.",
  );
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
): void {
  void reply.code(statusCode).send({
    error: {
      code,
      message,
      correlationId: request.id,
    },
  });
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function settingsDto(value: LowRiskSettingsDto): LowRiskSettingsDto {
  return {
    summaryEnabled: value.summaryEnabled,
    version: value.version,
  };
}

function overviewDto(value: DashboardOverviewDto): DashboardOverviewDto {
  return {
    health: {
      status: value.health.status,
      gateway: { status: value.health.gateway.status },
      storage: { status: value.health.storage.status },
    },
    lastBackup: {
      status: value.lastBackup.status,
      completedAt: value.lastBackup.completedAt,
    },
  };
}

function auditDto(value: AuditEventsDto): AuditEventsDto {
  return {
    events: value.events.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      action: event.action,
      outcome: event.outcome,
      reasonCode: event.reasonCode,
    })),
  };
}

function updateResponseDto(
  value: UpdateLowRiskSettingsResponseDto,
): UpdateLowRiskSettingsResponseDto {
  return {
    settings: settingsDto(value.settings),
    auditEvent: auditDto({ events: [value.auditEvent] }).events[0]!,
  };
}
