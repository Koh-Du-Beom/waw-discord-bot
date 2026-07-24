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

export const DASHBOARD_API_PATHS = {
  login: "/auth/login",
  callback: "/auth/discord/callback",
  session: "/api/session",
  logout: "/api/logout",
  overview: "/api/overview",
  settings: "/api/settings/summary",
  audit: "/api/audit",
} as const;
