import React, { useEffect, useRef, useState } from "react";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../src/contracts/summary-disclosure.ts";

import {
  DASHBOARD_API_PATHS,
  type ApiErrorCode,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type CommandLogPageDto,
  type ListCommandLogRequestDto,
  type LowRiskSettingsDto,
  type PendingRiotLinkRequestsDto,
  type ApproveRiotLinkRequestDto,
  type RiotLinkDecisionResponseDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
} from "../src/contracts/dashboard.ts";

export type DashboardApi = {
  getSession(): Promise<SessionDto | null>;
  logout(): Promise<void>;
  getOverview(): Promise<DashboardOverviewDto>;
  getSettings(): Promise<LowRiskSettingsDto>;
  updateSettings(request: UpdateLowRiskSettingsRequestDto): Promise<LowRiskSettingsDto>;
  getAudit(): Promise<AuditEventsDto>;
  getCommandLog(request?: ListCommandLogRequestDto): Promise<CommandLogPageDto>;
  getRiotRequests(): Promise<PendingRiotLinkRequestsDto>;
  approveRiotRequest(request: ApproveRiotLinkRequestDto): Promise<RiotLinkDecisionResponseDto>;
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
      riotRequests: PendingRiotLinkRequestsDto;
      commandLog: CommandLogPageDto;
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
    return (
      <StatePanel role="status" title="Dashboard를 불러오는 중" detail="잠시만 기다려 주세요.">
        <span className="loading-spinner" role="progressbar" aria-label="데이터 불러오는 중" />
      </StatePanel>
    );
  }
  if (state.kind === "login") {
    return <LoginPanel />;
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

  return (
    <Dashboard
      api={api}
      value={state}
      onLogout={() => setRetryKey((value) => value + 1)}
    />
  );
}

function Dashboard({
  api,
  onLogout,
  value,
}: {
  api: DashboardApi;
  onLogout(): void;
  value: Extract<ViewState, { kind: "ready" }>;
}) {
  const [settings, setSettings] = useState(value.settings);
  const [checked, setChecked] = useState(value.settings.summaryEnabled);
  const [audit, setAudit] = useState(value.audit);
  const [riotRequests, setRiotRequests] = useState(value.riotRequests);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string }>();
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "riot" | "commands" | "settings" | "operations">("dashboard");
  const [commandLog, setCommandLog] = useState(value.commandLog);
  const [commandHistory, setCommandHistory] = useState<CommandLogPageDto[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);

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

  async function logout() {
    setLoggingOut(true);
    try {
      await api.logout();
      onLogout();
    } catch {
      setResult({ kind: "error", message: "로그아웃하지 못했습니다. 다시 시도하세요." });
      setLoggingOut(false);
    }
  }

  async function approveRiotRequest(
    event: React.FormEvent<HTMLFormElement>,
    request: PendingRiotLinkRequestsDto["requests"][number],
  ) {
    event.preventDefault();
    setResult(undefined);
    try {
      await api.approveRiotRequest({
        requestId: request.requestId,
        expectedVersion: request.version,
        confirmation: true,
      });
      setResult({ kind: "success", message: "Riot 계정 연결 요청을 승인했습니다." });
      setRiotRequests(await api.getRiotRequests().catch(() => ({ requests: [] })));
    } catch (error) {
      const code = errorCode(error);
      setResult({
        kind: "error",
        message: code === "conflict"
          ? "요청 상태가 변경되었습니다. 목록을 새로 불러왔습니다."
          : code === "forbidden"
            ? "보안을 위해 Discord 재인증이 필요합니다. 로그아웃 후 다시 로그인하세요."
            : "Riot 계정 연결 요청을 승인하지 못했습니다.",
      });
      setRiotRequests(await api.getRiotRequests().catch(() => riotRequests));
    }
  }

  async function nextCommandPage() {
    if (!commandLog.nextCursor) return;
    setLoadingCommands(true);
    try {
      const next = await api.getCommandLog({ cursor: commandLog.nextCursor });
      setCommandHistory((pages) => [...pages, commandLog]);
      setCommandLog(next);
    } catch {
      setResult({ kind: "error", message: "다음 명령 기록을 불러오지 못했습니다." });
    } finally {
      setLoadingCommands(false);
    }
  }

  function previousCommandPage() {
    const previous = commandHistory.at(-1);
    if (!previous) return;
    setCommandLog(previous);
    setCommandHistory((pages) => pages.slice(0, -1));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="대시보드 탐색">
        <div className="brand">
          <span>WAW DISCORD BOT</span>
          <strong>관리 대시보드</strong>
          <small>SERVER OPERATIONS</small>
        </div>
        <nav aria-label="Dashboard 주요 영역">
          <NavButton active={tab === "dashboard"} icon="⌂" label="대시보드" onClick={() => setTab("dashboard")} />
          <NavButton active={tab === "riot"} count={riotRequests.requests.length} icon="R" label="Riot 계정 연결 요청" onClick={() => setTab("riot")} />
          <NavButton active={tab === "commands"} icon="≡" label="명령어 로그" onClick={() => setTab("commands")} />
          <NavButton active={tab === "settings"} icon="⚙" label="설정" onClick={() => setTab("settings")} />
          <NavButton active={tab === "operations"} icon="●" label="운영 기록" onClick={() => setTab("operations")} />
        </nav>
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{value.session.actor.displayName.slice(0, 1)}</span>
          <div>
            <strong>{value.session.actor.displayName}</strong>
            <small>{value.session.actor.tier === "administrator" ? "관리자" : "운영자"}</small>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p>WAW 관리 대시보드</p>
            <h1>{tabTitle(tab)}</h1>
          </div>
          <div className="operator-actions">
            <HealthBadge status={value.overview.health.status} />
            <button type="button" className="secondary" disabled={loggingOut} onClick={() => void logout()}>
              {loggingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
          </div>
        </header>

        <main id="main-content">
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
          {tab === "dashboard" && (
            <>
              <section aria-labelledby="health-title">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">실시간 상태</p>
                    <h2 id="health-title">서버와 데이터 관리 상태</h2>
                  </div>
                </div>
                {value.overview.health.status !== "healthy" && (
                  <p className="notice" role="status">
                    일부 상태가 정상이 아닙니다. 변경 작업 전에 구성요소 상태를 확인하세요.
                  </p>
                )}
                <div className="card-grid">
                  <MetricCard status={value.overview.health.gateway.status} title="Discord Gateway" value={componentLabel(value.overview.health.gateway.status)} />
                  <MetricCard status={value.overview.health.storage.status} title="데이터베이스" value={componentLabel(value.overview.health.storage.status)} />
                  <MetricCard status={value.overview.lastBackup.status} title="마지막 백업" value={backupLabel(value.overview.lastBackup.status)} detail={formatDate(value.overview.lastBackup.completedAt)} />
                  <MetricCard status={riotRequests.requests.length ? "attention" : "connected"} title="Riot 연결 요청" value={`${riotRequests.requests.length}건`} detail="승인 대기" />
                </div>
              </section>
              <CommandTable
                entries={value.commandLog.entries.slice(0, 5)}
                empty="최근 실행된 명령이 없습니다."
                title="최근 명령 5개"
              />
              <button className="text-button" type="button" onClick={() => setTab("commands")}>전체 명령어 로그 보기</button>
            </>
          )}

          {tab === "riot" && (
            <section className="panel" aria-labelledby="riot-title">
              <p className="eyebrow">관리자 승인</p>
              <h2 id="riot-title">Riot 계정 연결 요청</h2>
              <p className="notice">KR 계정만 승인할 수 있으며, 승인은 계정 소유권 인증이 아닙니다.</p>
              {value.session.actor.tier !== "administrator" ? (
                <p className="empty">관리자만 연결 요청을 검토할 수 있습니다.</p>
              ) : riotRequests.requests.length === 0 ? (
                <p className="empty">승인 대기 중인 요청이 없습니다.</p>
              ) : (
                <ul className="riot-list" aria-label="Riot 계정 연결 승인 대기 목록">
                  {riotRequests.requests.map((request) => (
                    <li key={request.requestId}>
                      <div>
                        <strong>{request.gameName}#{request.tagLine}</strong>
                        <span>{request.platformId} · {formatDate(request.requestedAt)}</span>
                      </div>
                      <form onSubmit={(event) => void approveRiotRequest(event, request)}>
                        <button type="submit" disabled={request.platformId !== "KR"}>검증 후 승인</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "commands" && (
            <>
              <CommandTable entries={commandLog.entries} empty="표시할 명령 기록이 없습니다." title="명령어 로그 상세" />
              <div className="pagination" aria-label="명령어 로그 페이지 이동">
                <button className="secondary" type="button" disabled={commandHistory.length === 0 || loadingCommands} onClick={previousCommandPage}>이전</button>
                <span>{commandHistory.length + 1}페이지</span>
                <button type="button" disabled={!commandLog.nextCursor || loadingCommands} onClick={() => void nextCommandPage()}>다음</button>
              </div>
            </>
          )}

          {tab === "settings" && (
            <section className="panel" aria-labelledby="settings-title">
            <p className="eyebrow">낮은 위험 설정</p>
            <h2 id="settings-title">대화 요약 기능</h2>
            <p className="notice" aria-label="요약 외부 처리 안내">
              {SUMMARY_EXTERNAL_PROCESSING_NOTICE}
            </p>
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
            </form>
            </section>
          )}

          {tab === "operations" && (
            <section className="panel" aria-labelledby="audit-title">
            <p className="eyebrow">변경 추적</p>
            <h2 id="audit-title">관리 설정 변경 기록</h2>
            <p className="section-description">누가 관리 설정을 변경했는지 확인하는 보안 감사 기록입니다.</p>
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
          )}
        </main>
      </div>
    </div>
  );
}

function LoginPanel() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="discord-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M19.5 5.3A18 18 0 0 0 15 3.9l-.6 1.2a16 16 0 0 0-4.8 0L9 3.9a18 18 0 0 0-4.5 1.4C1.7 9.5.9 13.6 1.3 17.6A18 18 0 0 0 6.8 20l1.4-1.9c-.8-.3-1.5-.7-2.2-1.2l.5-.4a12.7 12.7 0 0 0 11 0l.5.4c-.7.5-1.4.9-2.2 1.2l1.4 1.9a18 18 0 0 0 5.5-2.4c.5-4.7-.8-8.8-3.2-12.3ZM8.7 15.1c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.6 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z" />
          </svg>
        </div>
        <p className="eyebrow">WAW DISCORD BOT</p>
        <h1>Discord 서버와 연결</h1>
        <p className="login-copy">
          승인된 운영자 Discord 계정으로 로그인해 서버 상태와 몰랭검거 운영을 관리하세요.
        </p>
        <a className="button discord-button" href={DASHBOARD_API_PATHS.login}>
          Discord로 계속하기
        </a>
        <p className="login-footnote">로그인 후에도 권한은 서버에서 다시 확인합니다.</p>
      </section>
    </main>
  );
}

function NavButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: string;
  label: string;
  onClick(): void;
}) {
  return (
    <button className={active ? "active" : undefined} type="button" aria-current={active ? "page" : undefined} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {count !== undefined && count > 0 && <b aria-label={`${count}건`}>{count}</b>}
    </button>
  );
}

function CommandTable({
  empty,
  entries,
  title,
}: {
  empty: string;
  entries: CommandLogPageDto["entries"];
  title: string;
}) {
  return (
    <section className="panel wide-panel" aria-labelledby="commands-title">
      <p className="eyebrow">/몰랭검거 · 명령 활동</p>
      <h2 id="commands-title">{title}</h2>
      {entries.length === 0 ? <p className="empty">{empty}</p> : (
        <div className="table-scroll"><table><thead><tr><th>실행 시각</th><th>명령</th><th>사용자</th><th>결과</th></tr></thead>
          <tbody>{entries.map((entry, index) => <tr key={`${entry.occurredAt}-${index}`}>
            <td data-label="실행 시각">{formatDate(entry.occurredAt)}</td>
            <td data-label="명령"><code>{entry.commandLabel}</code></td>
            <td data-label="사용자">{entry.actorLabel}</td>
            <td data-label="결과"><span className={`outcome ${entry.outcome}`}>{outcomeLabel(entry.outcome)} · {entry.reasonLabel}</span></td>
          </tr>)}</tbody></table></div>
      )}
    </section>
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

function MetricCard({
  detail,
  status,
  title,
  value,
}: {
  detail?: string;
  status: "connected" | "degraded" | "unavailable" | "published" | "failed" | "unknown" | "attention";
  title: string;
  value: string;
}) {
  return (
    <article className="metric-card">
      <h3>{title}</h3>
      <strong className={`metric-value ${status}`}><i aria-hidden="true" />{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function tabTitle(tab: "dashboard" | "riot" | "commands" | "settings" | "operations") {
  return {
    dashboard: "대시보드",
    riot: "Riot 계정 연결 요청",
    commands: "명령어 로그",
    settings: "설정",
    operations: "운영 기록",
  }[tab];
}

async function loadDashboard(api: DashboardApi): Promise<ViewState> {
  try {
    const session = await api.getSession();
    if (!session) return { kind: "login" };
    const [overview, settings, audit, riotRequests, commandLog] = await Promise.all([
      api.getOverview(),
      api.getSettings(),
      api.getAudit(),
      session.actor.tier === "administrator"
        ? api.getRiotRequests()
        : Promise.resolve({ requests: [] }),
      api.getCommandLog(),
    ]);
    return { kind: "ready", session, overview, settings, audit, riotRequests, commandLog };
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
