import {
  DASHBOARD_API_PATHS,
  type ApiErrorDto,
  type ActiveRiotLinksDto,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type CommandLogPageDto,
  type ListCommandLogRequestDto,
  type LowRiskSettingsDto,
  type PendingRiotLinkRequestsDto,
  type ApproveRiotLinkRequestDto,
  type DecideRiotLinkRequestDto,
  type RiotLinkDecisionResponseDto,
  type RemoveRiotLinkRequestDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
  type UpdateLowRiskSettingsResponseDto,
} from "../src/contracts/dashboard.ts";
import type { DashboardApi } from "./app.tsx";

type ApiFailure = Error & { code?: string; correlationId?: string };

export function createBrowserApi(fetcher: typeof fetch = fetch): DashboardApi {
  let csrfToken: string | undefined;
  return {
    async getSession() {
      const response = await fetcher(DASHBOARD_API_PATHS.session, requestInit());
      if (response.status === 401) {
        csrfToken = undefined;
        return null;
      }
      const session = await readJson<SessionDto>(response);
      csrfToken = session.csrfToken;
      return session;
    },
    async logout() {
      if (csrfToken === undefined) {
        const failure: ApiFailure = new Error("세션을 다시 확인해야 합니다.");
        failure.code = "unauthenticated";
        throw failure;
      }
      const response = await fetcher(DASHBOARD_API_PATHS.logout, {
        ...requestInit(),
        body: "{}",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        method: "POST",
      });
      if (!response.ok) await readJson<never>(response);
      csrfToken = undefined;
    },
    async getOverview() {
      return readJson<DashboardOverviewDto>(
        await fetcher(DASHBOARD_API_PATHS.overview, requestInit()),
      );
    },
    async getRiotLinks() {
      return readJson<ActiveRiotLinksDto>(
        await fetcher(DASHBOARD_API_PATHS.riotLinks, requestInit()),
      );
    },
    async getSettings() {
      return readJson<LowRiskSettingsDto>(
        await fetcher(DASHBOARD_API_PATHS.settings, requestInit()),
      );
    },
    async updateSettings(request: UpdateLowRiskSettingsRequestDto) {
      if (csrfToken === undefined) {
        const failure: ApiFailure = new Error("세션을 다시 확인해야 합니다.");
        failure.code = "unauthenticated";
        throw failure;
      }
      const response = await readJson<UpdateLowRiskSettingsResponseDto>(
        await fetcher(DASHBOARD_API_PATHS.settings, {
          ...requestInit(),
          body: JSON.stringify(request),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "PUT",
        }),
      );
      return response.settings;
    },
    async getAudit() {
      return readJson<AuditEventsDto>(
        await fetcher(DASHBOARD_API_PATHS.audit, requestInit()),
      );
    },
    async getCommandLog(request: ListCommandLogRequestDto = {}) {
      const query = new URLSearchParams();
      if (request.limit !== undefined) query.set("limit", String(request.limit));
      if (request.cursor !== undefined) query.set("cursor", request.cursor);
      return readJson<CommandLogPageDto>(
        await fetcher(
          `${DASHBOARD_API_PATHS.commandLog}${query.size ? `?${query}` : ""}`,
          requestInit(),
        ),
      );
    },
    async getRiotRequests() {
      return mutate<PendingRiotLinkRequestsDto>(DASHBOARD_API_PATHS.riotRequests, {});
    },
    async approveRiotRequest(request: ApproveRiotLinkRequestDto) {
      return mutate<RiotLinkDecisionResponseDto>(DASHBOARD_API_PATHS.riotApprove, request);
    },
    async rejectRiotRequest(request: DecideRiotLinkRequestDto) {
      return mutate<RiotLinkDecisionResponseDto>(DASHBOARD_API_PATHS.riotReject, request);
    },
    async removeRiotLink(request: RemoveRiotLinkRequestDto) {
      return mutate<RiotLinkDecisionResponseDto>(DASHBOARD_API_PATHS.riotRemove, request);
    },
  };

  async function mutate<T>(path: string, body: object): Promise<T> {
    if (csrfToken === undefined) {
      const failure: ApiFailure = new Error("세션을 다시 확인해야 합니다.");
      failure.code = "unauthenticated";
      throw failure;
    }
    return readJson<T>(await fetcher(path, {
      ...requestInit(),
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      method: "POST",
    }));
  }
}

export const browserApi = createBrowserApi();

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
