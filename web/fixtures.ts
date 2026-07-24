import type {
  AuditEventsDto,
  DashboardOverviewDto,
  LowRiskSettingsDto,
  SessionDto,
} from "../src/contracts/dashboard.ts";

export const sessionFixture: SessionDto = {
  authenticated: true,
  actor: { displayName: "합성 운영자", tier: "operator" },
  csrfToken: "csrf-synthetic-browser-fixture",
};

export const healthyOverviewFixture: DashboardOverviewDto = {
  health: {
    status: "healthy",
    gateway: { status: "connected" },
    storage: { status: "connected" },
  },
  lastBackup: {
    status: "published",
    completedAt: "2026-07-24T03:00:00.000Z",
  },
};

export const settingsFixture: LowRiskSettingsDto = {
  summaryEnabled: true,
  version: 4,
};

export const emptyAuditFixture: AuditEventsDto = { events: [] };
