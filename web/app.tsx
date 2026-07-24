import React, { useEffect, useRef, useState } from "react";

import {
  DASHBOARD_API_PATHS,
  type ApiErrorCode,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type LowRiskSettingsDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
} from "../src/contracts/dashboard.ts";

export type DashboardApi = {
  getSession(): Promise<SessionDto | null>;
  getOverview(): Promise<DashboardOverviewDto>;
  getSettings(): Promise<LowRiskSettingsDto>;
  updateSettings(request: UpdateLowRiskSettingsRequestDto): Promise<LowRiskSettingsDto>;
  getAudit(): Promise<AuditEventsDto>;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      session: SessionDto;
      overview: DashboardOverviewDto;
      settings: LowRiskSettingsDto;
      audit: AuditEventsDto;
    };

export function App({ api }: { api: DashboardApi }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ kind: "loading" });
    void loadDashboard(api).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [api, retryKey]);

  if (state.kind === "loading") {
    return <StatePanel role="status" title="Dashboard를 불러오는 중" detail="잠시만 기다려 주세요." />;
  }
  if (state.kind === "login") {
    return (
      <StatePanel title="로그인이 필요합니다" detail="승인된 Discord 운영자 계정으로 로그인하세요.">
        <a className="button" href={DASHBOARD_API_PATHS.login}>
          Discord로 로그인
        </a>
      </StatePanel>
    );
  }
  if (state.kind === "denied") {
    return (
      <StatePanel
        role="alert"
        title="접근 권한이 없습니다"
        detail="현재 계정에는 이 dashboard를 볼 권한이 없습니다. 권한은 서버에서 검증됩니다."
      />
    );
  }
  if (state.kind === "unavailable") {
    return (
      <StatePanel
        role="alert"
        title="서비스에 연결할 수 없습니다"
        detail="네트워크 또는 서버 상태를 확인한 뒤 다시 시도하세요."
      >
        <button type="button" onClick={() => setRetryKey((value) => value + 1)}>
          다시 시도
        </button>
      </StatePanel>
    );
  }

  return <Dashboard api={api} value={state} />;
}

function Dashboard({
  api,
  value,
}: {
  api: DashboardApi;
  value: Extract<ViewState, { kind: "ready" }>;
}) {
  const [settings, setSettings] = useState(value.settings);
  const [checked, setChecked] = useState(value.settings.summaryEnabled);
  const [audit, setAudit] = useState(value.audit);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string }>();
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setResult(undefined);
    try {
      const updated = await api.updateSettings({
        summaryEnabled: checked,
        expectedVersion: settings.version,
      });
      setSettings(updated);
      setChecked(updated.summaryEnabled);
      setAudit(await api.getAudit());
      setResult({ kind: "success", message: "설정을 저장했습니다." });
    } catch (error) {
      const message =
        errorCode(error) === "conflict"
          ? "다른 변경이 먼저 저장되었습니다. 다시 불러온 뒤 시도하세요."
          : "설정을 저장하지 못했습니다. 잠시 후 다시 시도하세요.";
      setResult({ kind: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WAW 운영 dashboard</p>
          <h1>운영 현황</h1>
        </div>
        <p className="operator">
          <span>{value.session.actor.displayName}</span>
          <span>{value.session.actor.tier === "administrator" ? "관리자" : "운영자"}</span>
        </p>
      </header>

      <main>
        <section aria-labelledby="health-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">실시간 상태</p>
              <h2 id="health-title">시스템 상태</h2>
            </div>
            <HealthBadge status={value.overview.health.status} />
          </div>
          {value.overview.health.status !== "healthy" && (
            <p className="notice" role="status">
              일부 상태가 정상이 아닙니다. 변경 작업 전에 구성요소 상태를 확인하세요.
            </p>
          )}
          <div className="card-grid">
            <MetricCard title="Discord Gateway" value={componentLabel(value.overview.health.gateway.status)} />
            <MetricCard title="저장소" value={componentLabel(value.overview.health.storage.status)} />
            <MetricCard
              title="마지막 백업"
              value={backupLabel(value.overview.lastBackup.status)}
              detail={formatDate(value.overview.lastBackup.completedAt)}
            />
          </div>
        </section>

        <div className="content-grid">
          <section className="panel" aria-labelledby="settings-title">
            <p className="eyebrow">낮은 위험 설정</p>
            <h2 id="settings-title">서버 요약</h2>
            <form onSubmit={(event) => void save(event)}>
              <label className="switch-row">
                <span>
                  <strong>서버 요약 기능 사용</strong>
                  <small>예약된 서버 활동 요약을 생성합니다.</small>
                </span>
                <input
                  aria-label="서버 요약 기능 사용"
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />
              </label>
              <button type="submit" disabled={saving || checked === settings.summaryEnabled}>
                {saving ? "저장 중…" : "설정 저장"}
              </button>
              {result && (
                <p
                  aria-label="저장 결과"
                  className={`result ${result.kind}`}
                  ref={resultRef}
                  role={result.kind === "error" ? "alert" : "status"}
                  tabIndex={-1}
                >
                  {result.message}
                </p>
              )}
            </form>
          </section>

          <section className="panel" aria-labelledby="audit-title">
            <p className="eyebrow">변경 추적</p>
            <h2 id="audit-title">최근 감사 결과</h2>
            {audit.events.length === 0 ? (
              <p className="empty">표시할 설정 변경 기록이 없습니다.</p>
            ) : (
              <ul className="audit-list" aria-label="최근 감사 결과">
                {audit.events.map((event) => (
                  <li key={event.id}>
                    <span className={`outcome ${event.outcome}`}>{outcomeLabel(event.outcome)}</span>
                    <span>서버 요약 설정 변경</span>
                    <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function StatePanel({
  children,
  detail,
  role,
  title,
}: {
  children?: React.ReactNode;
  detail: string;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <main className="state-page">
      <section className="state-panel" role={role}>
        <p className="eyebrow">WAW 운영 dashboard</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {children}
      </section>
    </main>
  );
}

function HealthBadge({ status }: { status: DashboardOverviewDto["health"]["status"] }) {
  return (
    <strong className={`health-badge ${status}`} aria-label="전체 상태" role="status">
      {status === "healthy" ? "정상" : status === "degraded" ? "일부 장애" : "사용 불가"}
    </strong>
  );
}

function MetricCard({ detail, title, value }: { detail?: string; title: string; value: string }) {
  return (
    <article className="metric-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

async function loadDashboard(api: DashboardApi): Promise<ViewState> {
  try {
    const session = await api.getSession();
    if (!session) return { kind: "login" };
    const [overview, settings, audit] = await Promise.all([
      api.getOverview(),
      api.getSettings(),
      api.getAudit(),
    ]);
    return { kind: "ready", session, overview, settings, audit };
  } catch (error) {
    return errorCode(error) === "forbidden" ? { kind: "denied" } : { kind: "unavailable" };
  }
}

function errorCode(error: unknown): ApiErrorCode | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? (error.code as ApiErrorCode) : undefined;
}

function componentLabel(status: "connected" | "degraded" | "unavailable") {
  return status === "connected" ? "연결됨" : status === "degraded" ? "불안정" : "사용 불가";
}

function backupLabel(status: "published" | "failed" | "unknown") {
  return status === "published" ? "게시 완료" : status === "failed" ? "실패" : "확인 불가";
}

function outcomeLabel(outcome: "success" | "denied" | "failed") {
  return outcome === "success" ? "성공" : outcome === "denied" ? "거부" : "실패";
}

function formatDate(value: string | null) {
  if (!value) return "관측 기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "잘못된 관측 시각";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}
