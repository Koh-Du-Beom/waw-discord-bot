import type { HealthStatus } from "../runtime/health.ts";
import type { AuthorizationTier } from "./local-command.ts";

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "conflict"
  | "timeout"
  | "unavailable"
  | "internal_error";

export type ApiErrorDto = {
  error: {
    code: ApiErrorCode;
    message: string;
    correlationId: string;
  };
};

export type SessionDto = {
  authenticated: true;
  actor: {
    displayName: string;
    tier: AuthorizationTier;
  };
  csrfToken: string;
};

export type ComponentHealthDto = {
  status: "connected" | "degraded" | "unavailable";
};

export type BackupStatusDto = {
  status: "published" | "failed" | "unknown";
  completedAt: string | null;
};

export type DashboardOverviewDto = {
  health: {
    status: HealthStatus;
    gateway: ComponentHealthDto;
    storage: ComponentHealthDto;
  };
  lastBackup: BackupStatusDto;
};

export type LowRiskSettingsDto = {
  summaryEnabled: boolean;
  version: number;
};

export type UpdateLowRiskSettingsRequestDto = {
  summaryEnabled: boolean;
  expectedVersion: number;
};

export type AuditOutcome = "success" | "denied" | "failed";

export type AuditEventDto = {
  id: string;
  occurredAt: string;
  actorId: string;
  action: "settings.summary.update";
  outcome: AuditOutcome;
  reasonCode: string;
};

export type AuditEventsDto = {
  events: AuditEventDto[];
};

export type UpdateLowRiskSettingsResponseDto = {
  settings: LowRiskSettingsDto;
  auditEvent: AuditEventDto;
};

export type PendingRiotLinkRequestDto = {
  requestId: string;
  discordUserId: string;
  requesterLabel: string;
  platformId: string;
  gameName: string;
  tagLine: string;
  requestedAt: string;
  version: number;
};

export type PendingRiotLinkRequestsDto = {
  requests: PendingRiotLinkRequestDto[];
  nextCursor?: string;
};

export type ActiveRiotLinkDto = {
  linkId: string;
  expectedVersion: number;
  requesterLabel: string;
  platformId: string;
  gameName: string;
  tagLine: string;
  isPrimary: boolean;
};

export type ActiveRiotLinksDto = {
  links: ActiveRiotLinkDto[];
};

export type GameEvidenceStateDto = "active" | "inactive" | "unknown";
export type GameComparisonStateDto =
  | "compliant"
  | "grace"
  | "interrupted"
  | "violation"
  | "unknown";
export type GameIncidentStatusDto =
  | "open"
  | "confirmed"
  | "corrected"
  | "cancelled";

export type GameStackDto = {
  memberLabel: string;
  stack: number;
};

export type GameStacksDto = {
  entries: GameStackDto[];
};

export type GameRiotIdDto = {
  platformId: string;
  gameName: string;
  tagLine: string;
};

export type ActiveGameObservationDto = {
  incidentId: string;
  memberLabel: string;
  riotId: GameRiotIdDto | null;
  gameKey: string;
  riotState: GameEvidenceStateDto;
  riotObservedAt: string | null;
  goLiveState: GameEvidenceStateDto;
  goLiveObservedAt: string | null;
  comparisonState: GameComparisonStateDto;
  incidentStatus: GameIncidentStatusDto;
  expectedVersion: number;
  gameStartedAt: string;
};

export type ActiveGameObservationsDto = {
  entries: ActiveGameObservationDto[];
};

export type GameIncidentHistoryEntryDto = ActiveGameObservationDto & {
  gameEndedAt: string | null;
  incidentUpdatedAt: string;
};

export type GameIncidentHistoryPageDto = {
  entries: GameIncidentHistoryEntryDto[];
  nextCursor?: string;
};

export type ListGameIncidentHistoryRequestDto = {
  limit?: number;
  cursor?: string;
  status?: GameIncidentStatusDto;
  memberLabel?: string;
};

export type ListPendingRiotLinksRequestDto = {
  cursor?: string;
};

export type DecideRiotLinkRequestDto = {
  requestId: string;
  expectedVersion: number;
  confirmation: true;
};

export type ApproveRiotLinkRequestDto = DecideRiotLinkRequestDto & {
};

export type RemoveRiotLinkRequestDto = {
  linkId: string;
  expectedVersion: number;
  confirmation: true;
};

export type RiotLinkDecisionResponseDto = {
  message: string;
};

export type MutateGameIncidentRequestDto = {
  incidentId: string;
  expectedVersion: number;
  reason: string;
  confirmation: true;
};

export type GameIncidentMutationResponseDto = {
  message: string;
};

export type CommandLogOutcomeDto = "success" | "denied" | "failed";

export type CommandLogEntryDto = {
  occurredAt: string;
  commandLabel: string;
  actorLabel: string;
  outcome: CommandLogOutcomeDto;
  reasonLabel: string;
};

export type CommandLogPageDto = {
  entries: CommandLogEntryDto[];
  nextCursor?: string;
};

export type ListCommandLogRequestDto = {
  limit?: number;
  cursor?: string;
  command?: string;
  outcome?: CommandLogOutcomeDto;
  from?: string;
  to?: string;
};

export const DASHBOARD_API_PATHS = {
  login: "/auth/login",
  callback: "/auth/discord/callback",
  session: "/api/session",
  logout: "/api/logout",
  overview: "/api/overview",
  settings: "/api/settings/summary",
  audit: "/api/audit",
  riotRequests: "/api/riot/requests/list",
  riotLinks: "/api/riot/links",
  riotApprove: "/api/riot/requests/approve",
  riotReject: "/api/riot/requests/reject",
  riotRemove: "/api/riot/links/remove",
  commandLog: "/api/command-log",
  gameStacks: "/api/game/stacks",
  activeGames: "/api/game/active",
  gameIncidents: "/api/game/incidents",
  gameIncidentCorrect: "/api/game/incidents/correct",
  gameIncidentCancel: "/api/game/incidents/cancel",
} as const;
