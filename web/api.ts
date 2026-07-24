import {
  DASHBOARD_API_PATHS,
  type ApiErrorDto,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type LowRiskSettingsDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
  type UpdateLowRiskSettingsResponseDto,
} from "../src/contracts/dashboard.ts";
import type { DashboardApi } from "./app.tsx";

type ApiFailure = Error & { code?: string; correlationId?: string };
let csrfToken: string | undefined;

export const browserApi: DashboardApi = {
  async getSession() {
    const response = await fetch(DASHBOARD_API_PATHS.session, requestInit());
    if (response.status === 401) {
      csrfToken = undefined;
      return null;
    }
    const session = await readJson<SessionDto>(response);
    csrfToken = session.csrfToken;
    return session;
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
  async updateSettings(request: UpdateLowRiskSettingsRequestDto) {
    if (csrfToken === undefined) {
      const failure: ApiFailure = new Error(
        "설정 변경 전에 세션을 다시 확인해야 합니다.",
      );
      failure.code = "unauthenticated";
      throw failure;
    }
    const response = await readJson<UpdateLowRiskSettingsResponseDto>(
      await fetch(DASHBOARD_API_PATHS.settings, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(request),
      }),
    );
    return response.settings;
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
