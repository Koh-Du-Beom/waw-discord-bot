import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { AuthService, AuthServiceResponse } from "../auth/auth-service.ts";
import {
  DASHBOARD_API_PATHS,
  type ApiErrorCode,
  type AuditEventsDto,
  type CommandLogPageDto,
  type ListCommandLogRequestDto,
  type DashboardOverviewDto,
  type LowRiskSettingsDto,
  type PendingRiotLinkRequestsDto,
  type ListPendingRiotLinksRequestDto,
  type ApproveRiotLinkRequestDto,
  type DecideRiotLinkRequestDto,
  type RiotLinkDecisionResponseDto,
  type UpdateLowRiskSettingsRequestDto,
} from "../contracts/dashboard.ts";
import type { AuthorizationTier } from "../contracts/local-command.ts";
import { readCsrfCookieToken } from "./session-boundary.ts";

const bodyLimitBytes = 8 * 1024;
const securityHeaders = {
  "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export type DashboardHttpPorts = {
  readDisplayName(): Promise<string>;
  readOverview(): Promise<DashboardOverviewDto>;
  readSettings(): Promise<LowRiskSettingsDto>;
  updateSettings(
    input: {
      request: UpdateLowRiskSettingsRequestDto;
      actorId: string;
      operationId: string;
    },
  ): Promise<
    | { kind: "updated"; settings: LowRiskSettingsDto }
    | { kind: "conflict" }
  >;
  readAudit(): Promise<AuditEventsDto>;
  readCommandLog(request: ListCommandLogRequestDto): Promise<CommandLogPageDto>;
  listPendingRiotLinks(input: {
    request: ListPendingRiotLinksRequestDto;
    actorId: string;
    authorizationTier: AuthorizationTier;
    operationId: string;
  }): Promise<PendingRiotLinkRequestsDto>;
  approveRiotLink(input: {
    request: ApproveRiotLinkRequestDto;
    actorId: string;
    authorizationTier: AuthorizationTier;
    operationId: string;
  }): Promise<RiotLinkDecisionResponseDto>;
  rejectRiotLink(input: {
    request: DecideRiotLinkRequestDto;
    actorId: string;
    authorizationTier: AuthorizationTier;
    operationId: string;
  }): Promise<RiotLinkDecisionResponseDto>;
};

export type OperationalLogEvent = Readonly<{
  timestamp: string;
  correlation_id: string;
  event_type: "http.request" | "http.error";
  route: string;
  outcome: "success" | "denied" | "failed";
  reason_code: string;
  duration: number;
  service_version: string;
}>;

export type DashboardServerOptions = {
  auth: AuthService;
  ports: DashboardHttpPorts;
  serviceVersion: string;
  operationalLog?: (event: OperationalLogEvent) => void;
  callbackOrigin?: string;
  spaRoot?: string;
};

export class HttpPortError extends Error {
  readonly code: "timeout" | "unavailable" | "conflict";
  readonly reasonCode: string;

  constructor(
    code: "timeout" | "unavailable" | "conflict",
    reasonCode: string,
  ) {
    super("dashboard dependency failed");
    this.name = "HttpPortError";
    this.code = code;
    this.reasonCode = reasonCode;
  }
}

const emptyObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "correlationId"],
      properties: {
        code: {
          type: "string",
          enum: [
            "unauthenticated",
            "forbidden",
            "invalid_request",
            "conflict",
            "timeout",
            "unavailable",
            "internal_error",
          ],
        },
        message: { type: "string" },
        correlationId: { type: "string" },
      },
    },
  },
} as const;

const sessionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["authenticated", "actor", "csrfToken"],
  properties: {
    authenticated: { type: "boolean", const: true },
    actor: {
      type: "object",
      additionalProperties: false,
      required: ["displayName", "tier"],
      properties: {
        displayName: { type: "string" },
        tier: { type: "string", enum: ["operator", "administrator"] },
      },
    },
    csrfToken: { type: "string", minLength: 32 },
  },
} as const;
const commandLogQuerySchema = {
  type: "object", additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100 },
    cursor: { type: "string", minLength: 16, maxLength: 512 },
    command: { type: "string", minLength: 1, maxLength: 80 },
    outcome: { type: "string", enum: ["success", "denied", "failed"] },
  },
} as const;

const componentHealthSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: {
      type: "string",
      enum: ["connected", "degraded", "unavailable"],
    },
  },
} as const;

const overviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["health", "lastBackup"],
  properties: {
    health: {
      type: "object",
      additionalProperties: false,
      required: ["status", "gateway", "storage"],
      properties: {
        status: {
          type: "string",
          enum: ["healthy", "degraded", "unavailable"],
        },
        gateway: componentHealthSchema,
        storage: componentHealthSchema,
      },
    },
    lastBackup: {
      type: "object",
      additionalProperties: false,
      required: ["status", "completedAt"],
      properties: {
        status: {
          type: "string",
          enum: ["published", "failed", "unknown"],
        },
        completedAt: {
          anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
        },
      },
    },
  },
} as const;

const settingsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summaryEnabled", "version"],
  properties: {
    summaryEnabled: { type: "boolean" },
    version: { type: "integer", minimum: 0 },
  },
} as const;

const updateSettingsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summaryEnabled", "expectedVersion"],
  properties: {
    summaryEnabled: { type: "boolean" },
    expectedVersion: { type: "integer", minimum: 0 },
  },
} as const;

const auditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "occurredAt",
          "actorId",
          "action",
          "outcome",
          "reasonCode",
        ],
        properties: {
          id: { type: "string" },
          occurredAt: { type: "string", format: "date-time" },
          actorId: { type: "string" },
          action: { type: "string", enum: ["settings.summary.update"] },
          outcome: {
            type: "string",
            enum: ["success", "denied", "failed"],
          },
          reasonCode: { type: "string" },
        },
      },
    },
  },
} as const;

const riotRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "requestId",
    "discordUserId",
    "platformId",
    "gameName",
    "tagLine",
    "requestedAt",
    "version",
  ],
  properties: {
    requestId: { type: "string" },
    discordUserId: { type: "string" },
    platformId: { type: "string" },
    gameName: { type: "string" },
    tagLine: { type: "string" },
    requestedAt: { type: "string", format: "date-time" },
    version: { type: "integer", minimum: 0 },
  },
} as const;

const riotRequestsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requests"],
  properties: {
    requests: { type: "array", maxItems: 100, items: riotRequestSchema },
    nextCursor: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

const listRiotLinksSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cursor: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

const riotDecisionBaseProperties = {
  requestId: { type: "string", minLength: 1, maxLength: 160 },
  expectedVersion: { type: "integer", minimum: 0 },
  confirmation: { type: "boolean", const: true },
} as const;

const approveRiotLinkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "expectedVersion", "confirmation"],
  properties: riotDecisionBaseProperties,
} as const;

const rejectRiotLinkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "expectedVersion", "confirmation"],
  properties: riotDecisionBaseProperties,
} as const;

const riotDecisionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: { message: { type: "string" } },
} as const;

export function buildDashboardServer(
  options: DashboardServerOptions,
): FastifyInstance {
  const app = Fastify({
    bodyLimit: bodyLimitBytes,
    logger: false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
  });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: {
              status: {
                type: "string",
                enum: ["healthy", "degraded", "unavailable"],
              },
            },
          },
          503: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: {
              status: { type: "string", const: "unavailable" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        const overview = await options.ports.readOverview();
        if (overview.health.status === "unavailable") reply.code(503);
        return { status: overview.health.status };
      } catch {
        reply.code(503);
        return { status: "unavailable" };
      }
    },
  );
  const callbackOrigin = options.callbackOrigin ?? "https://waw.dubeom.com";

  app.addHook("onRequest", async (_request, reply) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      reply.header(name, value);
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    options.operationalLog?.({
      timestamp: new Date().toISOString(),
      correlation_id: request.id,
      event_type: "http.request",
      route: request.routeOptions.url ?? "unmatched",
      outcome:
        reply.statusCode < 400
          ? "success"
          : reply.statusCode < 500
            ? "denied"
            : "failed",
      reason_code: normalizedStatus(reply.statusCode),
      duration: Math.max(0, Math.round(reply.elapsedTime)),
      service_version: options.serviceVersion,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const errorMetadata = error as { code?: unknown; name?: unknown };
    options.operationalLog?.({
      timestamp: new Date().toISOString(),
      correlation_id: request.id,
      event_type: "http.error",
      route: request.routeOptions.url ?? "unmatched",
      outcome: "failed",
      reason_code:
        typeof errorMetadata.code === "string"
          ? errorMetadata.code
          : typeof errorMetadata.name === "string"
            ? errorMetadata.name
            : "unknown_error",
      duration: Math.max(0, Math.round(reply.elapsedTime)),
      service_version: options.serviceVersion,
    });
    const httpError = error as {
      statusCode?: number;
      validation?: unknown;
    };
    const statusCode =
      httpError.statusCode === 413
        ? 413
        : httpError.statusCode === 400 || httpError.validation !== undefined
          ? 400
          : 500;
    sendError(
      reply,
      statusCode,
      statusCode === 500 ? "internal_error" : "invalid_request",
      request.id,
    );
  });

  app.get(
    DASHBOARD_API_PATHS.login,
    { schema: { querystring: emptyObjectSchema } },
    async (_request, reply) => {
      sendAuthResponse(reply, await safeAuthCall(() => options.auth.login()));
    },
  );
  app.get(
    DASHBOARD_API_PATHS.callback,
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["code", "state"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 2048 },
            state: {
              type: "string",
              minLength: 32,
              maxLength: 128,
              pattern: "^[A-Za-z0-9_-]+$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const url = new URL(request.raw.url ?? "", callbackOrigin).href;
      sendAuthResponse(
        reply,
        await safeAuthCall(() =>
          options.auth.callback({
            method: request.method,
            url,
            headers: authHeaders(request),
          }),
        ),
      );
    },
  );

  app.get(
    DASHBOARD_API_PATHS.session,
    {
      schema: {
        querystring: emptyObjectSchema,
        response: { 200: sessionSchema, "4xx": errorSchema, "5xx": errorSchema },
      },
    },
    async (request, reply) => {
      const authorization = await authorize(options.auth, request, "read");
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      try {
        const csrfToken = readCsrfCookieToken(stringHeader(request.headers.cookie));
        if (!csrfToken) {
          sendError(reply, 403, "forbidden", request.id);
          return;
        }
        reply.send({
          authenticated: true,
          actor: {
            displayName: await options.ports.readDisplayName(),
            tier: authorization.tier,
          },
          csrfToken,
        });
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );
  app.post(
    DASHBOARD_API_PATHS.logout,
    {
      schema: {
        querystring: emptyObjectSchema,
        response: { "4xx": errorSchema, "5xx": errorSchema },
      },
    },
    async (request, reply) => {
      sendAuthResponse(
        reply,
        await safeAuthCall(() =>
          options.auth.logout({
            method: request.method,
            headers: authHeaders(request),
          }),
        ),
      );
    },
  );
  app.get(
    DASHBOARD_API_PATHS.overview,
    {
      schema: {
        querystring: emptyObjectSchema,
        response: { 200: overviewSchema, "4xx": errorSchema, "5xx": errorSchema },
      },
    },
    protectedRead(options.auth, options.ports.readOverview),
  );
  app.get(
    DASHBOARD_API_PATHS.settings,
    {
      schema: {
        querystring: emptyObjectSchema,
        response: { 200: settingsSchema, "4xx": errorSchema, "5xx": errorSchema },
      },
    },
    protectedRead(options.auth, options.ports.readSettings),
  );
  app.put<{ Body: UpdateLowRiskSettingsRequestDto }>(
    DASHBOARD_API_PATHS.settings,
    {
      schema: {
        querystring: emptyObjectSchema,
        body: updateSettingsSchema,
        response: {
          200: settingsSchema,
          409: errorSchema,
          "4xx": errorSchema,
          "5xx": errorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = await authorize(options.auth, request, "mutation");
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      if (authorization.tier !== "administrator") {
        sendError(reply, 403, "forbidden", request.id);
        return;
      }
      try {
        const result = await options.ports.updateSettings({
          request: request.body,
          actorId: authorization.actorId,
          operationId: request.id,
        });
        if (result.kind === "conflict") {
          sendError(reply, 409, "conflict", request.id);
          return;
        }
        reply.send(result.settings);
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );
  app.get(
    DASHBOARD_API_PATHS.audit,
    {
      schema: {
        querystring: emptyObjectSchema,
        response: { 200: auditSchema, "4xx": errorSchema, "5xx": errorSchema },
      },
    },
    protectedRead(options.auth, options.ports.readAudit),
  );
  app.get<{ Querystring: ListCommandLogRequestDto }>(
    DASHBOARD_API_PATHS.commandLog,
    { schema: { querystring: commandLogQuerySchema } },
    async (request, reply) => {
      const authorization = await authorize(options.auth, request, "read");
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      try {
        reply.send(await options.ports.readCommandLog(request.query));
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );
  app.post<{ Body: ListPendingRiotLinksRequestDto }>(
    DASHBOARD_API_PATHS.riotRequests,
    {
      schema: {
        querystring: emptyObjectSchema,
        body: listRiotLinksSchema,
        response: {
          200: riotRequestsSchema,
          "4xx": errorSchema,
          "5xx": errorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = await authorize(options.auth, request, "mutation");
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      if (authorization.tier !== "administrator") {
        sendError(reply, 403, "forbidden", request.id);
        return;
      }
      try {
        reply.send(await options.ports.listPendingRiotLinks({
          request: request.body,
          actorId: authorization.actorId,
          authorizationTier: authorization.tier,
          operationId: request.id,
        }));
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );
  app.post<{ Body: ApproveRiotLinkRequestDto }>(
    DASHBOARD_API_PATHS.riotApprove,
    {
      schema: {
        querystring: emptyObjectSchema,
        body: approveRiotLinkSchema,
        response: {
          200: riotDecisionResponseSchema,
          409: errorSchema,
          "4xx": errorSchema,
          "5xx": errorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = await authorize(
        options.auth,
        request,
        "high-risk",
        request.body.confirmation,
      );
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      if (authorization.tier !== "administrator") {
        sendError(reply, 403, "forbidden", request.id);
        return;
      }
      try {
        reply.send(await options.ports.approveRiotLink({
          request: request.body,
          actorId: authorization.actorId,
          authorizationTier: authorization.tier,
          operationId: request.id,
        }));
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );
  app.post<{ Body: DecideRiotLinkRequestDto }>(
    DASHBOARD_API_PATHS.riotReject,
    {
      schema: {
        querystring: emptyObjectSchema,
        body: rejectRiotLinkSchema,
        response: {
          200: riotDecisionResponseSchema,
          409: errorSchema,
          "4xx": errorSchema,
          "5xx": errorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = await authorize(
        options.auth,
        request,
        "high-risk",
        request.body.confirmation,
      );
      if (!authorization.allowed) {
        sendAuthorizationError(reply, authorization.response, request.id);
        return;
      }
      if (authorization.tier !== "administrator") {
        sendError(reply, 403, "forbidden", request.id);
        return;
      }
      try {
        reply.send(await options.ports.rejectRiotLink({
          request: request.body,
          actorId: authorization.actorId,
          authorizationTier: authorization.tier,
          operationId: request.id,
        }));
      } catch (error) {
        sendPortError(reply, error, request.id);
      }
    },
  );

  if (options.spaRoot !== undefined) {
    void app.register(fastifyStatic, {
      root: resolve(options.spaRoot),
      maxAge: "1y",
      immutable: true,
      index: false,
      wildcard: false,
    });
  }
  app.setNotFoundHandler(async (request, reply) => {
    if (
      request.url.startsWith("/api/") ||
      request.url.startsWith("/auth/") ||
      request.method !== "GET" ||
      options.spaRoot === undefined
    ) {
      sendError(reply, 404, "invalid_request", request.id);
      return;
    }
    reply.header("cache-control", "no-store");
    reply.type("text/html; charset=utf-8");
    reply.send(await readFile(resolve(options.spaRoot, "index.html")));
  });
  return app;
}

function protectedRead<T>(
  auth: AuthService,
  read: () => Promise<T>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = await authorize(auth, request, "read");
    if (!authorization.allowed) {
      sendAuthorizationError(reply, authorization.response, request.id);
      return;
    }
    try {
      reply.send(await read());
    } catch (error) {
      sendPortError(reply, error, request.id);
    }
  };
}

async function authorize(
  auth: AuthService,
  request: FastifyRequest,
  kind: "read" | "mutation" | "high-risk",
  explicitConfirmation = false,
): Promise<
  | { allowed: true; tier: AuthorizationTier; actorId: string }
  | { allowed: false; response: AuthServiceResponse }
> {
  const response = await safeAuthCall(() =>
    auth.authorize({
      kind,
      headers: authHeaders(request),
      ...(kind === "high-risk" ? { explicitConfirmation } : {}),
    }),
  );
  const tier = response.body.authorizationTier;
  const actorId = response.body.actorId;
  if (
    response.statusCode === 200 &&
    (tier === "operator" || tier === "administrator") &&
    typeof actorId === "string"
  ) {
    return { allowed: true, tier, actorId };
  }
  return { allowed: false, response };
}

function authHeaders(
  request: FastifyRequest,
): Readonly<Record<string, string | undefined>> {
  return {
    cookie: stringHeader(request.headers.cookie),
    origin: stringHeader(request.headers.origin),
    "x-csrf-token": stringHeader(request.headers["x-csrf-token"]),
  };
}

function stringHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function safeAuthCall(
  call: () => Promise<AuthServiceResponse>,
): Promise<AuthServiceResponse> {
  try {
    return await call();
  } catch {
    return {
      statusCode: 503,
      headers: {},
      body: { kind: "denied", reason: "auth-unavailable" },
    };
  }
}

function sendAuthResponse(
  reply: FastifyReply,
  response: AuthServiceResponse,
): void {
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined && (name === "location" || name === "set-cookie")) {
      reply.header(name, value);
    }
  }
  if (response.statusCode >= 300 && response.statusCode < 400) {
    reply.status(response.statusCode).send();
    return;
  }
  if (response.statusCode === 204) {
    reply.status(204).send();
    return;
  }
  if (response.statusCode >= 400) {
    sendAuthorizationError(reply, response, reply.request.id);
    return;
  }
  reply.status(response.statusCode).send();
}

function sendAuthorizationError(
  reply: FastifyReply,
  response: AuthServiceResponse,
  correlationId: string,
): void {
  const statusCode =
    response.statusCode === 401 ||
    response.statusCode === 403 ||
    response.statusCode === 404 ||
    response.statusCode === 503
      ? response.statusCode
      : 503;
  const code: ApiErrorCode =
    statusCode === 401
      ? "unauthenticated"
      : statusCode === 503
        ? "unavailable"
        : "forbidden";
  sendError(reply, statusCode, code, correlationId);
}

function sendPortError(
  reply: FastifyReply,
  error: unknown,
  correlationId: string,
): void {
  if (error instanceof HttpPortError) {
    sendError(
      reply,
      error.code === "timeout" ? 504 : error.code === "conflict" ? 409 : 503,
      error.code,
      correlationId,
    );
    return;
  }
  sendError(reply, 500, "internal_error", correlationId);
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  correlationId: string,
): void {
  reply.status(statusCode).send({
    error: {
      code,
      message: publicMessage(code),
      correlationId,
    },
  });
}

function publicMessage(code: ApiErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Authentication is required.";
    case "forbidden":
      return "This operation is not allowed.";
    case "invalid_request":
      return "The request is invalid.";
    case "conflict":
      return "The resource changed. Refresh and try again.";
    case "timeout":
      return "A dependency timed out.";
    case "unavailable":
      return "The service is temporarily unavailable.";
    case "internal_error":
      return "The request could not be completed.";
  }
}

function normalizedStatus(statusCode: number): string {
  if (statusCode < 400) {
    return "completed";
  }
  if (statusCode < 500) {
    return "request_denied";
  }
  return "request_failed";
}
