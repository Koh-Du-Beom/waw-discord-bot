import React, { useEffect, useRef, useState } from "react";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../src/contracts/summary-disclosure.ts";

import {
  DASHBOARD_API_PATHS,
  type ApiErrorCode,
  type ActiveRiotLinksDto,
  type ActiveGameObservationsDto,
  type AuditEventsDto,
  type DashboardOverviewDto,
  type GameIncidentHistoryPageDto,
  type GameIncidentStatusDto,
  type GameStacksDto,
  type ListGameIncidentHistoryRequestDto,
  type CommandLogPageDto,
  type ListCommandLogRequestDto,
  type LowRiskSettingsDto,
  type PendingRiotLinkRequestsDto,
  type ApproveRiotLinkRequestDto,
  type DecideRiotLinkRequestDto,
  type RiotLinkDecisionResponseDto,
  type RemoveRiotLinkRequestDto,
  type MutateGameIncidentRequestDto,
  type GameIncidentMutationResponseDto,
  type SessionDto,
  type UpdateLowRiskSettingsRequestDto,
} from "../src/contracts/dashboard.ts";

export type DashboardApi = {
  getSession(): Promise<SessionDto | null>;
  logout(): Promise<void>;
  getOverview(): Promise<DashboardOverviewDto>;
  getRiotLinks(): Promise<ActiveRiotLinksDto>;
  getGameStacks(): Promise<GameStacksDto>;
  getActiveGames(): Promise<ActiveGameObservationsDto>;
  getGameIncidents(
    request?: ListGameIncidentHistoryRequestDto,
  ): Promise<GameIncidentHistoryPageDto>;
  getSettings(): Promise<LowRiskSettingsDto>;
  updateSettings(request: UpdateLowRiskSettingsRequestDto): Promise<LowRiskSettingsDto>;
  getAudit(): Promise<AuditEventsDto>;
  getCommandLog(request?: ListCommandLogRequestDto): Promise<CommandLogPageDto>;
  getRiotRequests(): Promise<PendingRiotLinkRequestsDto>;
  approveRiotRequest(request: ApproveRiotLinkRequestDto): Promise<RiotLinkDecisionResponseDto>;
  rejectRiotRequest(request: DecideRiotLinkRequestDto): Promise<RiotLinkDecisionResponseDto>;
  removeRiotLink(request: RemoveRiotLinkRequestDto): Promise<RiotLinkDecisionResponseDto>;
  correctGameIncident(request: MutateGameIncidentRequestDto): Promise<GameIncidentMutationResponseDto>;
  cancelGameIncident(request: MutateGameIncidentRequestDto): Promise<GameIncidentMutationResponseDto>;
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
      riotLinks: ActiveRiotLinksDto;
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
  const [riotLinks, setRiotLinks] = useState(value.riotLinks);
  const [confirmingRiotLink, setConfirmingRiotLink] = useState<string>();
  const [processingRiotLinks, setProcessingRiotLinks] = useState<Set<string>>(new Set());
  const riotLinksInFlight = useRef(new Set<string>());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string }>();
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("dashboard");
  const [commandLog, setCommandLog] = useState(value.commandLog);
  const [commandHistory, setCommandHistory] = useState<CommandLogPageDto[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [processingRiotRequests, setProcessingRiotRequests] = useState<Set<string>>(
    new Set(),
  );
  const riotRequestsInFlight = useRef(new Set<string>());
  const [gameView, setGameView] = useState<GameViewState>({ kind: "idle" });
  const [incidentStatus, setIncidentStatus] = useState<GameIncidentStatusDto | "">("");
  const [memberLabel, setMemberLabel] = useState("");
  const [incidentHistory, setIncidentHistory] = useState<GameIncidentHistoryPageDto[]>([]);
  const [incidentAction, setIncidentAction] = useState<IncidentActionState>();
  const incidentsInFlight = useRef(new Set<string>());

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (tab === "games" && gameView.kind === "idle") void loadGames();
  }, [tab, gameView.kind]);

  async function loadGames(request: ListGameIncidentHistoryRequestDto = {}) {
    setGameView({ kind: "loading" });
    try {
      const [stacks, active, incidents] = await Promise.all([
        api.getGameStacks(),
        api.getActiveGames(),
        api.getGameIncidents({ limit: 50, ...request }),
      ]);
      setGameView({ kind: "ready", stacks, active, incidents });
    } catch {
      setGameView({ kind: "error" });
    }
  }

  async function applyGameFilters(event: React.FormEvent) {
    event.preventDefault();
    setIncidentHistory([]);
    await loadGames({
      ...(incidentStatus === "" ? {} : { status: incidentStatus }),
      ...(memberLabel.trim() === "" ? {} : { memberLabel: memberLabel.trim() }),
    });
  }

  async function nextIncidentPage() {
    if (gameView.kind !== "ready" || !gameView.incidents.nextCursor) return;
    const previous = gameView;
    const cursor = gameView.incidents.nextCursor;
    setGameView({ kind: "loading" });
    try {
      const incidents = await api.getGameIncidents({
        limit: 50,
        cursor,
        ...(incidentStatus === "" ? {} : { status: incidentStatus }),
        ...(memberLabel.trim() === "" ? {} : { memberLabel: memberLabel.trim() }),
      });
      setIncidentHistory((pages) => [...pages, previous.incidents]);
      setGameView({ ...previous, incidents });
    } catch {
      setGameView({ kind: "error" });
    }
  }

  function previousIncidentPage() {
    if (gameView.kind !== "ready") return;
    const previous = incidentHistory.at(-1);
    if (!previous) return;
    setGameView({ ...gameView, incidents: previous });
    setIncidentHistory((pages) => pages.slice(0, -1));
  }

  async function mutateIncident(event: React.FormEvent) {
    event.preventDefault();
    if (!incidentAction || !incidentAction.confirmed) return;
    const key = incidentAction.entry.incidentId;
    if (incidentsInFlight.current.has(key)) return;
    incidentsInFlight.current.add(key);
    setResult(undefined);
    const request = {
      incidentId: key,
      expectedVersion: incidentAction.entry.expectedVersion,
      reason: incidentAction.reason,
      confirmation: true as const,
    };
    try {
      const response = incidentAction.action === "correct"
        ? await api.correctGameIncident(request)
        : await api.cancelGameIncident(request);
      setResult({ kind: "success", message: response.message });
      setIncidentAction(undefined);
      await loadGames({
        ...(incidentStatus === "" ? {} : { status: incidentStatus }),
        ...(memberLabel.trim() === "" ? {} : { memberLabel: memberLabel.trim() }),
      });
    } catch (error) {
      setResult({
        kind: "error",
        message: errorCode(error) === "conflict"
          ? "사건 상태가 이미 변경되었습니다. 최신 이력을 다시 불러왔습니다."
          : errorCode(error) === "forbidden"
            ? "보안을 위해 Discord 재인증이 필요합니다. 로그아웃 후 다시 로그인하세요."
            : errorCode(error) === "timeout"
              ? "처리 결과를 확인하지 못했습니다. 새 요청을 보내지 말고 잠시 후 다시 확인하세요."
              : "사건을 변경하지 못했습니다.",
      });
      await loadGames({
        ...(incidentStatus === "" ? {} : { status: incidentStatus }),
        ...(memberLabel.trim() === "" ? {} : { memberLabel: memberLabel.trim() }),
      });
    } finally {
      incidentsInFlight.current.delete(key);
    }
  }

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
    if (riotRequestsInFlight.current.has(request.requestId)) return;
    riotRequestsInFlight.current.add(request.requestId);
    setProcessingRiotRequests((current) => new Set(current).add(request.requestId));
    setResult(undefined);
    try {
      await api.approveRiotRequest({
        requestId: request.requestId,
        expectedVersion: request.version,
        confirmation: true,
      });
      setResult({ kind: "success", message: "Riot 계정 연결 요청을 승인했습니다." });
      const [nextRequests, nextLinks] = await Promise.all([
        api.getRiotRequests().catch(() => riotRequests),
        api.getRiotLinks().catch(() => riotLinks),
      ]);
      setRiotRequests(nextRequests);
      setRiotLinks(nextLinks);
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
    } finally {
      setProcessingRiotRequests((current) => {
        const next = new Set(current);
        next.delete(request.requestId);
        return next;
      });
      riotRequestsInFlight.current.delete(request.requestId);
    }
  }

  async function rejectRiotRequest(
    request: PendingRiotLinkRequestsDto["requests"][number],
  ) {
    if (riotRequestsInFlight.current.has(request.requestId)) return;
    riotRequestsInFlight.current.add(request.requestId);
    setProcessingRiotRequests((current) => new Set(current).add(request.requestId));
    setResult(undefined);
    try {
      await api.rejectRiotRequest({
        requestId: request.requestId,
        expectedVersion: request.version,
        confirmation: true,
      });
      setResult({ kind: "success", message: "Riot 계정 연결 요청을 거절했습니다." });
      setRiotRequests(await api.getRiotRequests().catch(() => ({ requests: [] })));
    } catch {
      setResult({ kind: "error", message: "Riot 계정 연결 요청을 거절하지 못했습니다." });
      setRiotRequests(await api.getRiotRequests().catch(() => riotRequests));
    } finally {
      setProcessingRiotRequests((current) => {
        const next = new Set(current);
        next.delete(request.requestId);
        return next;
      });
      riotRequestsInFlight.current.delete(request.requestId);
    }
  }

  async function removeRiotLink(link: ActiveRiotLinksDto["links"][number]) {
    if (riotLinksInFlight.current.has(link.linkId)) return;
    riotLinksInFlight.current.add(link.linkId);
    setProcessingRiotLinks((current) => new Set(current).add(link.linkId));
    try {
      const result = await api.removeRiotLink({
        linkId: link.linkId,
        expectedVersion: link.expectedVersion,
        confirmation: true,
      });
      setRiotLinks((current) => ({
        links: current.links.filter((item) => item.linkId !== link.linkId),
      }));
      setConfirmingRiotLink(undefined);
      setResult({ kind: "success", message: result.message });
    } catch (error) {
      setResult({
        kind: "error",
        message: errorCode(error) === "conflict"
          ? "계정 상태가 변경되었습니다. 목록을 새로 불러오세요."
          : "Riot 계정 연결을 해제하지 못했습니다.",
      });
    } finally {
      setProcessingRiotLinks((current) => {
        const next = new Set(current);
        next.delete(link.linkId);
        return next;
      });
      riotLinksInFlight.current.delete(link.linkId);
    }
  }

  async function decideAllRiotRequests(decision: "approve" | "reject") {
    const requests = riotRequests.requests.filter(
      (request) => decision === "reject" || request.platformId === "KR",
    );
    if (requests.length === 0 || riotRequestsInFlight.current.size > 0) return;
    riotRequestsInFlight.current = new Set(requests.map((request) => request.requestId));
    setProcessingRiotRequests(new Set(requests.map((request) => request.requestId)));
    setResult(undefined);
    let completed = 0;
    try {
      for (const request of requests) {
        const payload = {
          requestId: request.requestId,
          expectedVersion: request.version,
          confirmation: true as const,
        };
        if (decision === "approve") await api.approveRiotRequest(payload);
        else await api.rejectRiotRequest(payload);
        completed += 1;
      }
      setResult({
        kind: "success",
        message: `${completed}건을 일괄 ${decision === "approve" ? "승인" : "반려"}했습니다.`,
      });
    } catch {
      setResult({
        kind: "error",
        message: `${completed}건 처리 후 중단되었습니다. 목록을 확인해 다시 시도하세요.`,
      });
    } finally {
      const [nextRequests, nextLinks] = await Promise.all([
        api.getRiotRequests().catch(() => riotRequests),
        decision === "approve"
          ? api.getRiotLinks().catch(() => riotLinks)
          : Promise.resolve(riotLinks),
      ]);
      setRiotRequests(nextRequests);
      setRiotLinks(nextLinks);
      setProcessingRiotRequests(new Set());
      riotRequestsInFlight.current.clear();
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
          <NavButton active={tab === "riot"} count={riotRequests.requests.length} icon="R" label="Riot 계정" onClick={() => setTab("riot")} />
          <NavButton active={tab === "games"} icon="!" label="몰랭" onClick={() => setTab("games")} />
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
              <h2 id="riot-title">Riot 계정</h2>
              <h3>연결된 계정</h3>
              {riotLinks.links.length === 0 ? (
                <p className="empty">연결된 Riot 계정이 없습니다.</p>
              ) : (
                <div className="table-scroll"><table><thead><tr><th>사용자</th><th>Riot ID</th>{value.session.actor.tier === "administrator" ? <th>관리</th> : null}<th>서버</th><th>연결 ID</th></tr></thead>
                  <tbody>{riotLinks.links.map((link) => <tr key={link.linkId}>
                    <td data-label="사용자">{link.requesterLabel}</td>
                    <td data-label="Riot ID">{link.gameName}#{link.tagLine}{link.isPrimary ? " · 대표" : ""}</td>
                    {value.session.actor.tier === "administrator" ? <td data-label="관리">
                      {confirmingRiotLink === link.linkId ? <>
                        <button type="button" disabled={processingRiotLinks.has(link.linkId)} onClick={() => void removeRiotLink(link)}>해제 확인</button>
                        <button className="secondary" type="button" disabled={processingRiotLinks.has(link.linkId)} onClick={() => setConfirmingRiotLink(undefined)}>취소</button>
                      </> : <button className="secondary" type="button" onClick={() => setConfirmingRiotLink(link.linkId)}>연결 해제</button>}
                    </td> : null}
                    <td data-label="서버">{link.platformId}</td>
                    <td data-label="연결 ID"><code>{link.linkId}</code></td>
                  </tr>)}</tbody></table></div>
              )}
              <h3>연결 요청</h3>
              <p className="notice">KR 계정만 승인할 수 있습니다. 승인은 Riot ID의 존재를 확인하고 계정을 연결하는 절차입니다.</p>
              {value.session.actor.tier !== "administrator" ? (
                <p className="empty">관리자만 연결 요청을 검토할 수 있습니다.</p>
              ) : riotRequests.requests.length === 0 ? (
                <p className="empty">승인 대기 중인 요청이 없습니다.</p>
              ) : (
                <>
                <div className="bulk-actions">
                  <button
                    type="button"
                    disabled={processingRiotRequests.size > 0 || !riotRequests.requests.some((request) => request.platformId === "KR")}
                    onClick={() => void decideAllRiotRequests("approve")}
                  >
                    {processingRiotRequests.size > 0 && <span className="button-spinner" aria-hidden="true" />}
                    {processingRiotRequests.size > 0 ? "처리 중…" : "일괄 승인"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={processingRiotRequests.size > 0}
                    onClick={() => void decideAllRiotRequests("reject")}
                  >
                    일괄 반려
                  </button>
                </div>
                <ul className="riot-list" aria-label="Riot 계정 연결 승인 대기 목록">
                  {riotRequests.requests.map((request) => (
                    <li key={request.requestId}>
                      <div>
                        <strong>{request.gameName}#{request.tagLine}</strong>
                        <span>요청자 {request.requesterLabel} · {request.platformId} · {formatDate(request.requestedAt)}</span>
                      </div>
                      <form onSubmit={(event) => void approveRiotRequest(event, request)}>
                        <button className="secondary" type="button" disabled={processingRiotRequests.has(request.requestId)} onClick={() => void rejectRiotRequest(request)}>거절</button>
                        <button type="submit" disabled={request.platformId !== "KR" || processingRiotRequests.has(request.requestId)}>
                          {processingRiotRequests.has(request.requestId) && <span className="button-spinner" aria-hidden="true" />}
                          {processingRiotRequests.has(request.requestId) ? "처리 중…" : "검증 후 승인"}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </section>
          )}

          {tab === "games" && (
            <GameDashboard
              state={gameView}
              status={incidentStatus}
              memberLabel={memberLabel}
              page={incidentHistory.length + 1}
              onStatusChange={setIncidentStatus}
              onMemberLabelChange={setMemberLabel}
              onApplyFilters={(event) => void applyGameFilters(event)}
              onRetry={() => void loadGames()}
              administrator={value.session.actor.tier === "administrator"}
              incidentAction={incidentAction}
              onBeginIncidentAction={(entry, action) => setIncidentAction({
                entry,
                action,
                reason: "",
                confirmed: false,
              })}
              onCancelIncidentAction={() => setIncidentAction(undefined)}
              onIncidentActionChange={setIncidentAction}
              onMutateIncident={(event) => void mutateIncident(event)}
              incidentProcessing={incidentAction !== undefined && incidentsInFlight.current.has(incidentAction.entry.incidentId)}
              onNext={() => void nextIncidentPage()}
              onPrevious={previousIncidentPage}
              hasPrevious={incidentHistory.length > 0}
            />
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

function GameDashboard({
  administrator,
  hasPrevious,
  incidentAction,
  incidentProcessing,
  memberLabel,
  onApplyFilters,
  onBeginIncidentAction,
  onCancelIncidentAction,
  onIncidentActionChange,
  onMemberLabelChange,
  onNext,
  onPrevious,
  onRetry,
  onMutateIncident,
  onStatusChange,
  page,
  state,
  status,
}: {
  administrator: boolean;
  hasPrevious: boolean;
  incidentAction: IncidentActionState | undefined;
  incidentProcessing: boolean;
  memberLabel: string;
  onApplyFilters(event: React.FormEvent): void;
  onBeginIncidentAction(
    entry: GameIncidentHistoryPageDto["entries"][number],
    action: "correct" | "cancel",
  ): void;
  onCancelIncidentAction(): void;
  onIncidentActionChange(value: IncidentActionState): void;
  onMemberLabelChange(value: string): void;
  onNext(): void;
  onPrevious(): void;
  onRetry(): void;
  onMutateIncident(event: React.FormEvent): void;
  onStatusChange(value: GameIncidentStatusDto | ""): void;
  page: number;
  state: GameViewState;
  status: GameIncidentStatusDto | "";
}) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <section className="panel game-state" aria-labelledby="games-loading-title" aria-live="polite">
        <h2 id="games-loading-title">몰랭 현황을 불러오는 중</h2>
        <span className="loading-spinner" role="progressbar" aria-label="몰랭 데이터 불러오는 중" />
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="panel game-state" aria-labelledby="games-error-title" role="alert">
        <h2 id="games-error-title">몰랭 현황을 불러오지 못했습니다</h2>
        <p>네트워크 또는 서버 상태를 확인한 뒤 다시 시도하세요.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </section>
    );
  }
  return (
    <div className="game-dashboard">
      <section aria-labelledby="stacks-title">
        <div className="section-heading">
          <div><p className="eyebrow">확정 사건</p><h2 id="stacks-title">몰랭 스택</h2></div>
        </div>
        {state.stacks.entries.length === 0 ? <p className="empty">등록된 사용자가 없습니다.</p> : (
          <div className="card-grid game-stack-grid">
            {state.stacks.entries.map((entry, index) => (
              <MetricCard key={`${entry.memberLabel}-${index}`} status={entry.stack > 0 ? "attention" : "connected"} title={entry.memberLabel} value={`${entry.stack}스택`} />
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="active-games-title">
        <p className="eyebrow">현재 관측</p>
        <h2 id="active-games-title">진행 중 게임</h2>
        <p className="section-description">Riot과 Discord Go Live는 별도 증거이며, 오래된 관측은 현재 상태로 간주하지 않습니다.</p>
        {state.active.entries.length === 0 ? <p className="empty">진행 중인 게임 관측이 없습니다.</p> : (
          <div className="table-scroll"><table><thead><tr><th>사용자</th><th>Riot ID</th><th>Riot</th><th>Go Live</th><th>판정</th></tr></thead>
            <tbody>{state.active.entries.map((entry) => <tr key={entry.incidentId}>
              <td data-label="사용자">{entry.memberLabel}</td>
              <td data-label="Riot ID">{riotIdLabel(entry.riotId)}</td>
              <td data-label="Riot"><EvidenceLabel state={entry.riotState} observedAt={entry.riotObservedAt} /></td>
              <td data-label="Go Live"><EvidenceLabel state={entry.goLiveState} observedAt={entry.goLiveObservedAt} /></td>
              <td data-label="판정">{comparisonLabel(entry.comparisonState)}</td>
            </tr>)}</tbody></table></div>
        )}
      </section>

      <section className="panel wide-panel" aria-labelledby="incidents-title">
        <p className="eyebrow">변경 불가능한 원본 이력</p>
        <h2 id="incidents-title">검거 이력</h2>
        <form className="game-filters" aria-label="검거 이력 필터" onSubmit={onApplyFilters}>
          <label>상태
            <select value={status} onChange={(event) => onStatusChange(event.target.value as GameIncidentStatusDto | "")}>
              <option value="">전체</option><option value="open">열림</option><option value="confirmed">확정</option><option value="corrected">정정됨</option><option value="cancelled">취소됨</option>
            </select>
          </label>
          <label>사용자 표시명
            <input value={memberLabel} maxLength={80} onChange={(event) => onMemberLabelChange(event.target.value)} />
          </label>
          <button type="submit">필터 적용</button>
        </form>
        {state.incidents.entries.length === 0 ? <p className="empty">조건에 맞는 검거 이력이 없습니다.</p> : (
          <div className="table-scroll"><table><thead><tr><th>갱신 시각</th><th>사용자</th><th>상태</th><th>판정</th><th>Riot</th><th>Go Live</th>{administrator && <th>관리</th>}</tr></thead>
            <tbody>{state.incidents.entries.map((entry) => <tr key={entry.incidentId}>
              <td data-label="갱신 시각"><time dateTime={entry.incidentUpdatedAt}>{formatDate(entry.incidentUpdatedAt)}</time></td>
              <td data-label="사용자">{entry.memberLabel}</td>
              <td data-label="상태">{incidentStatusLabel(entry.incidentStatus)}</td>
              <td data-label="판정">{comparisonLabel(entry.comparisonState)}</td>
              <td data-label="Riot"><EvidenceLabel state={entry.riotState} observedAt={entry.riotObservedAt} /></td>
              <td data-label="Go Live"><EvidenceLabel state={entry.goLiveState} observedAt={entry.goLiveObservedAt} /></td>
              {administrator && <td data-label="관리">
                <div className="incident-actions">
                  <button className="secondary" type="button" disabled={entry.incidentStatus === "corrected" || entry.incidentStatus === "cancelled"} onClick={() => onBeginIncidentAction(entry, "correct")}>정정</button>
                  <button className="danger" type="button" disabled={entry.incidentStatus === "corrected" || entry.incidentStatus === "cancelled"} onClick={() => onBeginIncidentAction(entry, "cancel")}>취소</button>
                </div>
              </td>}
            </tr>)}</tbody></table></div>
        )}
        {administrator && incidentAction && (
          <form className="incident-confirmation" aria-label={`사건 ${incidentAction.action === "correct" ? "정정" : "취소"} 확인`} onSubmit={onMutateIncident}>
            <h3>사건을 {incidentAction.action === "correct" ? "정정" : "취소"}하시겠습니까?</h3>
            <p>현재 화면의 버전 {incidentAction.entry.expectedVersion}에만 적용됩니다.</p>
            <label>변경 사유
              <textarea required minLength={1} maxLength={500} value={incidentAction.reason} onChange={(event) => onIncidentActionChange({ ...incidentAction, reason: event.target.value })} />
            </label>
            <label className="confirmation-check">
              <input type="checkbox" checked={incidentAction.confirmed} onChange={(event) => onIncidentActionChange({ ...incidentAction, confirmed: event.target.checked })} />
              이 변경이 감사 기록에 남고 되돌릴 수 없음을 확인합니다.
            </label>
            <div className="incident-actions">
              <button className="secondary" type="button" disabled={incidentProcessing} onClick={onCancelIncidentAction}>돌아가기</button>
              <button className="danger" type="submit" disabled={incidentProcessing || !incidentAction.confirmed || incidentAction.reason.trim().length === 0 || incidentAction.reason !== incidentAction.reason.trim()}>{incidentProcessing ? "처리 중…" : "확인 후 실행"}</button>
            </div>
          </form>
        )}
        <div className="pagination" aria-label="검거 이력 페이지 이동">
          <button className="secondary" type="button" disabled={!hasPrevious} onClick={onPrevious}>이전</button>
          <span>{page}페이지</span>
          <button type="button" disabled={!state.incidents.nextCursor} onClick={onNext}>다음</button>
        </div>
      </section>
    </div>
  );
}

function EvidenceLabel({
  observedAt,
  state,
}: {
  observedAt: string | null;
  state: ActiveGameObservationsDto["entries"][number]["riotState"];
}) {
  const freshness = evidenceFreshness(observedAt);
  return <span className={`evidence ${state} ${freshness}`}>
    {evidenceLabel(state)} · {freshness === "stale" ? "오래됨" : freshness === "missing" ? "시각 없음" : "최신"}
    {observedAt && <time dateTime={observedAt}>{formatDate(observedAt)}</time>}
  </span>;
}

export function evidenceFreshness(
  observedAt: string | null,
  now = Date.now(),
): "fresh" | "stale" | "missing" {
  if (observedAt === null) return "missing";
  const observed = Date.parse(observedAt);
  const age = now - observed;
  return Number.isFinite(observed) && age >= 0 && age <= 3 * 60 * 1000
    ? "fresh"
    : "stale";
}

function riotIdLabel(value: ActiveGameObservationsDto["entries"][number]["riotId"]): string {
  return value === null ? "계정 식별 불가" : `${value.gameName}#${value.tagLine}`;
}

function evidenceLabel(value: string): string {
  return value === "active" ? "활성" : value === "inactive" ? "비활성" : "알 수 없음";
}

function comparisonLabel(value: string): string {
  return { compliant: "준수", grace: "시작 유예", interrupted: "중단 허용", violation: "위반", unknown: "알 수 없음" }[value] ?? value;
}

function incidentStatusLabel(value: string): string {
  return { open: "열림", confirmed: "확정", corrected: "정정됨", cancelled: "취소됨" }[value] ?? value;
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

type DashboardTab = "dashboard" | "riot" | "games" | "commands" | "settings" | "operations";

type IncidentActionState = {
  entry: GameIncidentHistoryPageDto["entries"][number];
  action: "correct" | "cancel";
  reason: string;
  confirmed: boolean;
};

type GameViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "ready";
      stacks: GameStacksDto;
      active: ActiveGameObservationsDto;
      incidents: GameIncidentHistoryPageDto;
    };

function tabTitle(tab: DashboardTab) {
  return {
    dashboard: "대시보드",
    riot: "Riot 계정",
    games: "몰랭",
    commands: "명령어 로그",
    settings: "설정",
    operations: "운영 기록",
  }[tab];
}

async function loadDashboard(api: DashboardApi): Promise<ViewState> {
  try {
    const session = await api.getSession();
    if (!session) return { kind: "login" };
    const [overview, riotLinks, settings, audit, riotRequests, commandLog] = await Promise.all([
      api.getOverview(),
      api.getRiotLinks(),
      api.getSettings(),
      api.getAudit(),
      session.actor.tier === "administrator"
        ? api.getRiotRequests()
        : Promise.resolve({ requests: [] }),
      api.getCommandLog(),
    ]);
    return { kind: "ready", session, overview, riotLinks, settings, audit, riotRequests, commandLog };
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
