export const ADMIN_COMMAND_PROTOCOL_VERSION = 1 as const;
export const ADMIN_COMMAND_MAXIMUM_FRAME_BYTES = 32 * 1024;
export const ADMIN_COMMAND_MAXIMUM_TTL_MILLISECONDS = 15_000;

export type AdminCommandName =
  | "riot_link_request_list"
  | "riot_link_request_approve"
  | "riot_link_request_reject"
  | "riot_link_remove"
  | "credit_account_adjust"
  | "operation_status";

export type CreditAdjustmentReasonCode =
  | "support_correction"
  | "policy_correction"
  | "incident_recovery";

type RequestBase = {
  version: 1;
  requestId: string;
  operationId: string;
  actorId: string;
  guildId: string;
  requestedAt: Date;
  expiresAt: Date;
};

export type AdminCommandRequest =
  | (RequestBase & {
      command: "riot_link_request_list";
      payload: { limit: number; cursor?: string };
    })
  | (RequestBase & {
      command: "riot_link_request_approve";
      payload: {
        requestId: string;
        expectedVersion: number;
      };
    })
  | (RequestBase & {
      command: "riot_link_request_reject";
      payload: { requestId: string; expectedVersion: number };
    })
  | (RequestBase & {
      command: "riot_link_remove";
      payload: { linkId: string; expectedVersion: number; confirmation: true };
    })
  | (RequestBase & {
      command: "credit_account_adjust";
      payload: {
        accountId: string;
        expectedVersion: number;
        delta: number;
        reasonCode: CreditAdjustmentReasonCode;
        confirmation: true;
      };
    })
  | (RequestBase & {
      command: "operation_status";
      payload: { operationId: string };
    });

export type AdminCommandReasonCode =
  | "completed"
  | "administrator_required"
  | "request_expired"
  | "request_malformed"
  | "request_unavailable"
  | "operation_duplicate"
  | "operation_unknown"
  | "riot_link_request_stale"
  | "riot_link_request_unavailable"
  | "riot_link_not_found"
  | "riot_link_stale"
  | "riot_active_puuid_conflict"
  | "invalid_puuid"
  | "platform_mismatch"
  | "validator_unavailable"
  | "credit_account_not_found"
  | "credit_account_stale"
  | "credit_account_self_adjustment"
  | "credit_account_insufficient_balance"
  | "credit_account_adjustment_unavailable"
  | "persistence_unavailable";

export type PendingRiotLinkIpcItem = {
  requestId: string;
  discordUserId: string;
  requesterLabel: string;
  platformId: string;
  gameName: string;
  tagLine: string;
  requestedAt: string;
  version: number;
};

export type AdminCommandResponse =
  | {
      version: 1;
      requestId: string;
      operationId: string;
      outcome: "success";
      reasonCode: "completed";
      result:
        | {
            kind: "riot_link_request_page";
            requests: readonly PendingRiotLinkIpcItem[];
            nextCursor?: string;
          }
        | {
            kind: "riot_link_decision";
            status: "approved" | "rejected";
          }
        | { kind: "riot_link_removal"; status: "removed" }
        | {
            kind: "credit_account_adjustment";
            status: "adjusted";
            availableBalance: string;
            version: number;
          }
        | {
            kind: "operation_status";
            status: "success" | "denied" | "conflict" | "failure" | "unknown";
            reasonCode: AdminCommandReasonCode;
          };
    }
  | {
      version: 1;
      requestId: string;
      operationId: string;
      outcome:
        | "denied"
        | "conflict"
        | "duplicate"
        | "unavailable"
        | "outcome_unknown";
      reasonCode: AdminCommandReasonCode;
    };

const topLevelRequestKeys = [
  "actorId",
  "command",
  "expiresAt",
  "guildId",
  "operationId",
  "payload",
  "requestId",
  "requestedAt",
  "version",
] as const;
const requestIdPattern = /^[A-Za-z0-9_-]{16,128}$/;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const entityIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;
const cursorPattern = /^[A-Za-z0-9_-]{1,256}$/;
const puuidPattern = /^[A-Za-z0-9_-]{32,128}$/;
const platformPattern = /^[A-Z0-9]{2,8}$/;
const reasonCodes = new Set<AdminCommandReasonCode>([
  "completed",
  "administrator_required",
  "request_expired",
  "request_malformed",
  "request_unavailable",
  "operation_duplicate",
  "operation_unknown",
  "riot_link_request_stale",
  "riot_link_request_unavailable",
  "riot_link_not_found",
  "riot_link_stale",
  "riot_active_puuid_conflict",
  "invalid_puuid",
  "platform_mismatch",
  "validator_unavailable",
  "credit_account_not_found",
  "credit_account_stale",
  "credit_account_self_adjustment",
  "credit_account_insufficient_balance",
  "credit_account_adjustment_unavailable",
  "persistence_unavailable",
]);

export function parseAdminCommandRequest(
  frame: string | Uint8Array,
): AdminCommandRequest | undefined {
  const value = parseFrame(frame);
  if (
    value === undefined ||
    !hasExactKeys(value, topLevelRequestKeys) ||
    value.version !== ADMIN_COMMAND_PROTOCOL_VERSION ||
    !isPattern(value.requestId, requestIdPattern) ||
    !isPattern(value.operationId, operationIdPattern) ||
    !isPattern(value.actorId, snowflakePattern) ||
    !isPattern(value.guildId, snowflakePattern) ||
    typeof value.command !== "string"
  ) {
    return undefined;
  }
  const requestedAt = parseExactDate(value.requestedAt);
  const expiresAt = parseExactDate(value.expiresAt);
  if (
    requestedAt === undefined ||
    expiresAt === undefined ||
    expiresAt.getTime() <= requestedAt.getTime() ||
    expiresAt.getTime() - requestedAt.getTime() >
      ADMIN_COMMAND_MAXIMUM_TTL_MILLISECONDS
  ) {
    return undefined;
  }
  const payload = parsePayload(value.command, value.payload);
  if (payload === undefined) return undefined;
  return {
    version: ADMIN_COMMAND_PROTOCOL_VERSION,
    requestId: value.requestId,
    operationId: value.operationId,
    actorId: value.actorId,
    guildId: value.guildId,
    requestedAt,
    expiresAt,
    ...payload,
  };
}

export function serializeAdminCommandRequest(request: AdminCommandRequest): string {
  const wire = {
    version: request.version,
    requestId: request.requestId,
    operationId: request.operationId,
    actorId: request.actorId,
    guildId: request.guildId,
    command: request.command,
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    payload: request.payload,
  };
  const serialized = JSON.stringify(wire);
  if (parseAdminCommandRequest(serialized) === undefined) {
    throw new Error("invalid admin command request");
  }
  return serialized;
}

export function parseAdminCommandResponse(
  frame: string | Uint8Array,
  expectedRequestId?: string,
): AdminCommandResponse | undefined {
  const value = parseFrame(frame);
  if (
    value === undefined ||
    value.version !== ADMIN_COMMAND_PROTOCOL_VERSION ||
    !isPattern(value.requestId, requestIdPattern) ||
    (expectedRequestId !== undefined && value.requestId !== expectedRequestId) ||
    !isPattern(value.operationId, operationIdPattern) ||
    typeof value.outcome !== "string" ||
    !isReasonCode(value.reasonCode)
  ) {
    return undefined;
  }
  if (value.outcome === "success") {
    if (
      !hasExactKeys(value, [
        "operationId",
        "outcome",
        "reasonCode",
        "requestId",
        "result",
        "version",
      ]) ||
      value.reasonCode !== "completed"
    ) {
      return undefined;
    }
    const result = parseResult(value.result);
    return result === undefined
      ? undefined
      : {
          version: 1,
          requestId: value.requestId,
          operationId: value.operationId,
          outcome: "success",
          reasonCode: "completed",
          result,
        };
  }
  if (
    ![
      "denied",
      "conflict",
      "duplicate",
      "unavailable",
      "outcome_unknown",
    ].includes(value.outcome) ||
    !hasExactKeys(value, [
      "operationId",
      "outcome",
      "reasonCode",
      "requestId",
      "version",
    ])
  ) {
    return undefined;
  }
  return value as AdminCommandResponse;
}

export function serializeAdminCommandResponse(
  response: AdminCommandResponse,
): string {
  const serialized = JSON.stringify(response);
  if (parseAdminCommandResponse(serialized, response.requestId) === undefined) {
    throw new Error("invalid admin command response");
  }
  return serialized;
}

function parsePayload(
  command: string,
  value: unknown,
):
  | Pick<
      Extract<AdminCommandRequest, { command: "riot_link_request_list" }>,
      "command" | "payload"
    >
  | Pick<
      Extract<AdminCommandRequest, { command: "riot_link_request_approve" }>,
      "command" | "payload"
    >
  | Pick<
      Extract<AdminCommandRequest, { command: "riot_link_request_reject" }>,
      "command" | "payload"
    >
  | Pick<
      Extract<AdminCommandRequest, { command: "riot_link_remove" }>,
      "command" | "payload"
    >
  | Pick<
      Extract<AdminCommandRequest, { command: "credit_account_adjust" }>,
      "command" | "payload"
    >
  | Pick<
      Extract<AdminCommandRequest, { command: "operation_status" }>,
      "command" | "payload"
    >
  | undefined {
  if (!isObject(value)) return undefined;
  switch (command) {
    case "riot_link_request_list":
      if (
        !hasExactOptionalKeys(value, ["limit"], ["cursor"]) ||
        !Number.isInteger(value.limit) ||
        Number(value.limit) < 1 ||
        Number(value.limit) > 50 ||
        (value.cursor !== undefined && !isPattern(value.cursor, cursorPattern))
      ) {
        return undefined;
      }
      return {
        command,
        payload: {
          limit: Number(value.limit),
          ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
        },
      };
    case "riot_link_request_approve":
      if (
        !hasExactKeys(value, ["expectedVersion", "requestId"]) ||
        !isPattern(value.requestId, entityIdPattern) ||
        !isVersion(value.expectedVersion)
      ) {
        return undefined;
      }
      return {
        command,
        payload: {
          requestId: value.requestId,
          expectedVersion: value.expectedVersion,
        },
      };
    case "riot_link_request_reject":
      if (
        !hasExactKeys(value, ["expectedVersion", "requestId"]) ||
        !isPattern(value.requestId, entityIdPattern) ||
        !isVersion(value.expectedVersion)
      ) {
        return undefined;
      }
      return {
        command,
        payload: {
          requestId: value.requestId,
          expectedVersion: value.expectedVersion,
        },
      };
    case "riot_link_remove":
      if (
        !hasExactKeys(value, ["confirmation", "expectedVersion", "linkId"]) ||
        value.confirmation !== true ||
        !isPattern(value.linkId, entityIdPattern) ||
        !isVersion(value.expectedVersion)
      ) {
        return undefined;
      }
      return {
        command,
        payload: {
          linkId: value.linkId,
          expectedVersion: value.expectedVersion,
          confirmation: true,
        },
      };
    case "credit_account_adjust":
      if (
        !hasExactKeys(value, [
          "accountId", "confirmation", "delta", "expectedVersion", "reasonCode",
        ]) ||
        !isPattern(value.accountId, entityIdPattern) ||
        !isVersion(value.expectedVersion) ||
        !Number.isSafeInteger(value.delta) ||
        Number(value.delta) === 0 ||
        Math.abs(Number(value.delta)) > 1_000_000 ||
        !["support_correction", "policy_correction", "incident_recovery"].includes(
          String(value.reasonCode),
        ) ||
        value.confirmation !== true
      ) {
        return undefined;
      }
      return {
        command,
        payload: {
          accountId: value.accountId,
          expectedVersion: value.expectedVersion,
          delta: Number(value.delta),
          reasonCode: value.reasonCode as CreditAdjustmentReasonCode,
          confirmation: true,
        },
      };
    case "operation_status":
      if (
        !hasExactKeys(value, ["operationId"]) ||
        !isPattern(value.operationId, operationIdPattern)
      ) {
        return undefined;
      }
      return { command, payload: { operationId: value.operationId } };
    default:
      return undefined;
  }
}

function parseResult(
  value: unknown,
): Extract<AdminCommandResponse, { outcome: "success" }>["result"] | undefined {
  if (!isObject(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "riot_link_decision") {
    return hasExactKeys(value, ["kind", "status"]) &&
      (value.status === "approved" || value.status === "rejected")
      ? { kind: value.kind, status: value.status }
      : undefined;
  }
  if (value.kind === "riot_link_removal") {
    return hasExactKeys(value, ["kind", "status"]) && value.status === "removed"
      ? { kind: value.kind, status: value.status }
      : undefined;
  }
  if (value.kind === "credit_account_adjustment") {
    return hasExactKeys(value, ["availableBalance", "kind", "status", "version"]) &&
      value.status === "adjusted" &&
      typeof value.availableBalance === "string" &&
      /^(0|[1-9][0-9]{0,18})$/.test(value.availableBalance) &&
      isVersion(value.version)
      ? {
          kind: value.kind,
          status: value.status,
          availableBalance: value.availableBalance,
          version: value.version,
        }
      : undefined;
  }
  if (value.kind === "operation_status") {
    return hasExactKeys(value, ["kind", "reasonCode", "status"]) &&
      ["success", "denied", "conflict", "failure", "unknown"].includes(
        String(value.status),
      ) &&
      isReasonCode(value.reasonCode)
      ? {
          kind: value.kind,
          status: value.status as
            | "success"
            | "denied"
            | "conflict"
            | "failure"
            | "unknown",
          reasonCode: value.reasonCode,
        }
      : undefined;
  }
  if (
    value.kind !== "riot_link_request_page" ||
    !hasExactOptionalKeys(value, ["kind", "requests"], ["nextCursor"]) ||
    !Array.isArray(value.requests) ||
    value.requests.length > 50 ||
    (value.nextCursor !== undefined &&
      !isPattern(value.nextCursor, cursorPattern))
  ) {
    return undefined;
  }
  const requests = value.requests.map(parsePendingItem);
  return requests.every((item) => item !== undefined)
    ? {
        kind: value.kind,
        requests: requests as PendingRiotLinkIpcItem[],
        ...(value.nextCursor === undefined
          ? {}
          : { nextCursor: value.nextCursor }),
      }
    : undefined;
}

function parsePendingItem(value: unknown): PendingRiotLinkIpcItem | undefined {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "discordUserId",
      "gameName",
      "platformId",
      "requestId",
      "requesterLabel",
      "requestedAt",
      "tagLine",
      "version",
    ]) ||
    !isPattern(value.requestId, entityIdPattern) ||
    !isPattern(value.discordUserId, snowflakePattern) ||
    typeof value.requesterLabel !== "string" ||
    value.requesterLabel.length < 1 ||
    value.requesterLabel.length > 80 ||
    !isPattern(value.platformId, platformPattern) ||
    typeof value.gameName !== "string" ||
    value.gameName.length < 1 ||
    value.gameName.length > 32 ||
    typeof value.tagLine !== "string" ||
    value.tagLine.length < 2 ||
    value.tagLine.length > 8 ||
    parseExactDate(value.requestedAt) === undefined ||
    !isVersion(value.version)
  ) {
    return undefined;
  }
  return value as PendingRiotLinkIpcItem;
}

function parseFrame(frame: string | Uint8Array): Record<string, unknown> | undefined {
  let text: string;
  try {
    if (
      typeof frame !== "string" &&
      frame.byteLength > ADMIN_COMMAND_MAXIMUM_FRAME_BYTES
    ) {
      return undefined;
    }
    text =
      typeof frame === "string"
        ? frame
        : new TextDecoder("utf-8", { fatal: true }).decode(frame);
  } catch {
    return undefined;
  }
  if (
    Buffer.byteLength(text, "utf8") > ADMIN_COMMAND_MAXIMUM_FRAME_BYTES ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseExactDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed
    : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function hasExactOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}

function isPattern(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

function isVersion(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0
  );
}

function isReasonCode(value: unknown): value is AdminCommandReasonCode {
  return typeof value === "string" && reasonCodes.has(value as AdminCommandReasonCode);
}
