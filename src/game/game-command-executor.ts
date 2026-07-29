import type { CurrentAuthorizationReader } from "../auth/member-role-ipc.ts";
import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { IncidentService, type IncidentMutationStore } from "./incident-service.ts";
import type { ComparisonState, EvidenceState } from "./observation-state.ts";

export type GameStatusItem = {
  incidentId: string;
  discordUserId: string;
  platformId: string;
  gameId: string;
  riotState: EvidenceState;
  goLiveState: EvidenceState;
  comparisonState: ComparisonState;
  status: "open" | "confirmed" | "corrected" | "cancelled";
  version: number;
  observedAt: Date;
};

export type GameCommandStore = IncidentMutationStore & {
  listStatus(discordUserId: string): Promise<readonly GameStatusItem[]>;
  listStacks(): Promise<readonly GameStackItem[]>;
  findIncidentVersion(incidentId: string): Promise<number | undefined>;
};

export type GameStackItem = {
  discordUserLabel: string;
  stack: number;
};

export class GameCommandExecutor implements FeatureCommandExecutor {
  private readonly incidents: IncidentService;

  constructor(
    private readonly store: GameCommandStore,
    private readonly authorization: CurrentAuthorizationReader,
    private readonly now: () => Date,
  ) {
    this.incidents = new IncidentService(store);
  }

  async execute(request: CommandRequest): Promise<string> {
    switch (request.commandName) {
      case "몰랭검거 현황":
        return this.status(request);
      case "몰랭검거 정정":
        return this.mutate(request, "correct");
      case "몰랭검거 취소":
        return this.mutate(request, "cancel");
      default:
        throw new CommandFailure(
          "feature_not_configured",
          "이 기능은 아직 운영 환경에 연결되지 않았습니다.",
        );
    }
  }

  private async status(request: CommandRequest): Promise<string> {
    const target = request.options["사용자"];
    if (target === undefined) {
      const stacks = await this.store.listStacks();
      if (stacks.length === 0) return "등록된 사용자가 없습니다.";
      const nameWidth = Math.max(4, ...stacks.map((item) => item.discordUserLabel.length));
      return [
        "```",
        `${"사용자".padEnd(nameWidth)} | 몰랭스택`,
        `${"-".repeat(nameWidth)}-|---------`,
        ...stacks.map((item) => `${item.discordUserLabel.padEnd(nameWidth)} | ${item.stack}`),
        "```",
      ].join("\n");
    }
    const items = await this.store.listStatus(target);
    if (items.length === 0) return "표시할 게임 관측 기록이 없습니다.";
    return items
      .map(
        (item) =>
          `- ${item.platformId} ${item.gameId} · Riot ${label(item.riotState)} · ` +
          `Go Live ${label(item.goLiveState)} · 판정 ${label(item.comparisonState)} · ` +
          `사건 ${item.incidentId} (${label(item.status)})`,
      )
      .join("\n");
  }

  private async mutate(
    request: CommandRequest,
    action: "correct" | "cancel",
  ): Promise<string> {
    const authorization = await this.authorization.readCurrentAuthorization({
      actorId: request.actorId,
      guildId: request.guildId,
    });
    if (
      authorization.kind !== "authorized" ||
      authorization.authorizationTier !== "administrator"
    ) {
      throw new CommandFailure(
        "administrator_required",
        "이 명령은 관리자만 사용할 수 있습니다.",
        "denied",
      );
    }
    const incidentId = required(request, "사건");
    const reason = required(request, "사유");
    const expectedVersion = await this.store.findIncidentVersion(incidentId);
    if (expectedVersion === undefined) {
      throw new CommandFailure(
        "game_incident_not_found",
        "게임 사건을 찾을 수 없습니다.",
      );
    }
    const result = await this.incidents.mutate({
      operationId: request.eventId,
      incidentId,
      expectedVersion,
      actorId: request.actorId,
      authorizationTier: "administrator",
      action,
      reason,
      occurredAt: this.now(),
    });
    if (result === "updated") {
      return action === "correct"
        ? "게임 사건을 정정했습니다."
        : "게임 사건을 취소했습니다.";
    }
    if (result === "conflict") {
      throw new CommandFailure(
        "game_incident_stale",
        "사건이 조회 이후 변경되었습니다. 현황을 다시 확인해 주세요.",
      );
    }
    throw new CommandFailure("game_incident_not_found", "게임 사건을 찾을 수 없습니다.");
  }
}

function required(request: CommandRequest, name: string): string {
  const value = request.options[name]?.trim();
  if (!value) {
    throw new CommandFailure("invalid_command_input", "필수 입력값을 확인해 주세요.");
  }
  return value;
}

function label(value: string): string {
  const labels: Record<string, string> = {
    active: "활성",
    inactive: "비활성",
    unknown: "알 수 없음",
    compliant: "정상",
    grace: "시작 유예",
    interrupted: "중단 허용",
    violation: "위반",
    open: "열림",
    confirmed: "확정",
    corrected: "정정됨",
    cancelled: "취소됨",
  };
  return labels[value] ?? value;
}
