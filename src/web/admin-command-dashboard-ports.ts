import { randomUUID } from "node:crypto";

import type {
  AdminCommandName,
  AdminCommandRequest,
  AdminCommandResponse,
} from "../contracts/admin-command-ipc.ts";
import type {
  ApproveRiotLinkRequestDto,
  DecideRiotLinkRequestDto,
  ListPendingRiotLinksRequestDto,
  PendingRiotLinkRequestsDto,
  RemoveRiotLinkRequestDto,
  KboCreditAdjustmentRequestDto,
  KboCreditAdjustmentResponseDto,
  RiotLinkDecisionResponseDto,
} from "../contracts/dashboard.ts";
import { HttpPortError } from "../http/dashboard-server.ts";
import type { AdminCommandTransport } from "../ipc/admin-command-ipc.ts";

type DispatchInput = {
  actorId: string;
  operationId: string;
};

export type AdminCommandDispatchAudit = {
  append(input: {
    eventId: string;
    operationId: string;
    occurredAt: Date;
    actorId: string;
    guildId: string;
    commandName: AdminCommandName;
  }): Promise<void>;
};

export function createAdminCommandDashboardPorts(input: {
  transport: AdminCommandTransport;
  audit: AdminCommandDispatchAudit;
  guildId: string;
  now?: () => Date;
  generateId?: () => string;
}) {
  const now = input.now ?? (() => new Date());
  const generateId = input.generateId ?? randomUUID;

  async function dispatch(
    context: DispatchInput,
    command: AdminCommandRequest["command"],
    payload: AdminCommandRequest["payload"],
  ): Promise<AdminCommandResponse> {
    const occurredAt = now();
    const operationId = validOperationId(context.operationId)
      ? context.operationId
      : generateId();
    await input.audit.append({
      eventId: generateId(),
      operationId,
      occurredAt,
      actorId: context.actorId,
      guildId: input.guildId,
      commandName: command,
    });
    const request = {
      version: 1,
      requestId: generateId(),
      operationId,
      actorId: context.actorId,
      guildId: input.guildId,
      command,
      requestedAt: occurredAt,
      expiresAt: new Date(occurredAt.getTime() + 15_000),
      payload,
    } as AdminCommandRequest;
    const response = await input.transport.execute(request);
    if (response.outcome !== "duplicate") return response;
    return input.transport.execute({
      ...request,
      requestId: generateId(),
      operationId: generateId(),
      command: "operation_status",
      payload: { operationId },
    });
  }

  return {
    async listPendingRiotLinks(
      context: DispatchInput & { request: ListPendingRiotLinksRequestDto },
    ): Promise<PendingRiotLinkRequestsDto> {
      const response = await dispatch(context, "riot_link_request_list", {
        limit: 50,
        ...(context.request.cursor === undefined
          ? {}
          : { cursor: context.request.cursor }),
      });
      if (
        response.outcome === "success" &&
        response.result.kind === "riot_link_request_page"
      ) {
        return {
          requests: [...response.result.requests],
          ...(response.result.nextCursor === undefined
            ? {}
            : { nextCursor: response.result.nextCursor }),
        };
      }
      throw mapFailure(response);
    },
    async approveRiotLink(
      context: DispatchInput & { request: ApproveRiotLinkRequestDto },
    ): Promise<RiotLinkDecisionResponseDto> {
      const response = await dispatch(context, "riot_link_request_approve", {
        requestId: context.request.requestId,
        expectedVersion: context.request.expectedVersion,
      });
      return decision(response, "승인했습니다.");
    },
    async rejectRiotLink(
      context: DispatchInput & { request: DecideRiotLinkRequestDto },
    ): Promise<RiotLinkDecisionResponseDto> {
      const response = await dispatch(context, "riot_link_request_reject", {
        requestId: context.request.requestId,
        expectedVersion: context.request.expectedVersion,
      });
      return decision(response, "거절했습니다.");
    },
    async removeRiotLink(
      context: DispatchInput & { request: RemoveRiotLinkRequestDto },
    ): Promise<RiotLinkDecisionResponseDto> {
      const response = await dispatch(context, "riot_link_remove", {
        linkId: context.request.linkId,
        expectedVersion: context.request.expectedVersion,
        confirmation: true,
      });
      return decision(response, "연결을 해제했습니다.");
    },
    async adjustKboCredit(
      context: DispatchInput & { request: KboCreditAdjustmentRequestDto },
    ): Promise<KboCreditAdjustmentResponseDto> {
      const response = await dispatch(context, "credit_account_adjust", context.request);
      if (
        response.outcome === "success" &&
        response.result.kind === "credit_account_adjustment"
      ) {
        return {
          message: "크레딧을 조정했습니다.",
          availableBalance: response.result.availableBalance,
          version: response.result.version,
        };
      }
      throw mapFailure(response);
    },
  };
}

function decision(
  response: AdminCommandResponse,
  message: string,
): RiotLinkDecisionResponseDto {
  if (
    response.outcome === "success" &&
    (response.result.kind === "riot_link_decision" ||
      response.result.kind === "riot_link_removal" ||
      (response.result.kind === "operation_status" &&
        response.result.status === "success"))
  ) {
    return { message };
  }
  throw mapFailure(response);
}

function mapFailure(response: AdminCommandResponse): HttpPortError {
  if (
    response.outcome === "conflict" ||
    (response.outcome === "success" &&
      response.result.kind === "operation_status" &&
      response.result.status === "conflict")
  ) {
    return new HttpPortError("conflict", response.reasonCode);
  }
  if (response.outcome === "outcome_unknown") {
    return new HttpPortError("timeout", response.reasonCode);
  }
  return new HttpPortError("unavailable", response.reasonCode);
}

function validOperationId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}
