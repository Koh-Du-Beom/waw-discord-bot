import {
  DASHBOARD_API_PATHS,
  type ApiErrorDto,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type LowRiskSettingsDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
} from "../src/contracts/dashboard.ts";
import type { DashboardApi } from "./app.tsx";

type ApiFailure = Error & { code?: string; correlationId?: string };

export const browserApi: DashboardApi = {
  async getSession() {
    const response = await fetch(DASHBOARD_API_PATHS.session, requestInit());
    if (response.status === 401) return null;
    return readJson<SessionDto>(response);
  },
  async getOverview() {
    return readJson<DashboardOverviewDto>(
      await fetch(DASHBOARD_API_PATHS.overview, requestInit()),
    );
  },
  async getSettings() {
    return readJson<LowRiskSettingsDto>(
      await fetch(DASHBOARD_API_PATHS.settings, requestInit()),
    );
  },
  async updateSettings(_request: UpdateLowRiskSettingsRequestDto) {
    const failure: ApiFailure = new Error(
      "CSRF 계약이 통합될 때까지 설정 변경을 사용할 수 없습니다.",
    );
    failure.code = "unavailable";
    throw failure;
  },
  async getAudit() {
    return readJson<AuditEventsDto>(await fetch(DASHBOARD_API_PATHS.audit, requestInit()));
  },
};

function requestInit(): RequestInit {
  return {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;

  let body: ApiErrorDto | undefined;
  try {
    body = (await response.json()) as ApiErrorDto;
  } catch {
    // A generic, non-sensitive message is safer than reflecting an unknown response.
  }
  const failure: ApiFailure = new Error(body?.error.message ?? "요청을 처리하지 못했습니다.");
  if (body) {
    failure.code = body.error.code;
    failure.correlationId = body.error.correlationId;
  }
  throw failure;
}
