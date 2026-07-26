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
  features: {
    summaryQuotaDashboard: boolean;
  };
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

export type RiotLinkDecisionResponseDto = {
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

export type SummaryQuotaStatusDto = {
  userKey: string;
  displayLabel: string;
  used: number;
  effectiveLimit: number;
  remaining: number;
  limitSource: "default" | "override";
  enabled: boolean;
  nextResetAt: string;
  version: number;
};

export type SummaryQuotaPageDto = {
  users: SummaryQuotaStatusDto[];
  nextCursor?: string;
};

export type SummaryQuotaSettingsDto = {
  defaultLimit: number;
  version: number;
  users: SummaryQuotaStatusDto[];
};

export type UpdateSummaryQuotaDefaultRequestDto = {
  dailyLimit: number;
  expectedVersion: number;
};

export type UpdateSummaryQuotaUserRequestDto = {
  userKey: string;
  enabled: boolean;
  dailyLimit: number | null;
  expectedVersion: number;
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
  riotApprove: "/api/riot/requests/approve",
  riotReject: "/api/riot/requests/reject",
  commandLog: "/api/command-log",
  summaryQuotas: "/api/summary/quotas",
  summaryQuotaDefault: "/api/summary/quotas/default",
  summaryQuotaUser: "/api/summary/quotas/user",
} as const;
