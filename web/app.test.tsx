import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";

import type {
  AuditEventDto,
  DashboardOverviewDto,
  LowRiskSettingsDto,
  PendingRiotLinkRequestsDto,
  KboCreditAdjustmentRequestDto,
  KboManagementDto,
  SessionDto,
  UpdateLowRiskSettingsRequestDto,
} from "../src/contracts/dashboard.ts";
import { App, type DashboardApi } from "./app.tsx";
import {
  emptyAuditFixture,
  healthyOverviewFixture,
  sessionFixture,
  settingsFixture,
} from "./fixtures.ts";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../src/contracts/summary-disclosure.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://waw.dubeom.com/",
});
Object.defineProperties(globalThis, {
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  window: { configurable: true, value: dom.window },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
});

const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");

beforeEach(() => {
  dom.window.document.body.replaceChildren();
});

afterEach(() => {
  cleanup();
});

test("shows a keyboard-accessible loading state and then healthy dashboard content", async () => {
  render(<App api={apiFixture()} />);

  assert.equal(screen.getByRole("status").textContent?.includes("불러오는 중"), true);
  assert.ok(screen.getByRole("progressbar", { name: "데이터 불러오는 중" }));
  assert.equal((await screen.findByRole("heading", { name: "대시보드" })).tagName, "H1");
  assert.match(screen.getByText("정상").textContent ?? "", /정상/);
  assert.equal(screen.getAllByText("연결됨").length, 2);
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  assert.equal(screen.getByRole("checkbox", { name: "서버 요약 기능 사용" }).getAttribute("type"), "checkbox");
  assert.equal(screen.getByRole("button", { name: "설정 저장" }).getAttribute("type"), "submit");
  assert.equal(
    screen.getByLabelText("요약 외부 처리 안내").textContent,
    SUMMARY_EXTERNAL_PROCESSING_NOTICE,
  );
});

test("renders the approved Direction A navigation shell", async () => {
  render(<App api={apiFixture()} />);

  assert.ok(await screen.findByRole("complementary", { name: "대시보드 탐색" }));
  assert.ok(screen.getByText("관리 대시보드"));
  assert.equal(screen.queryByText("/몰랭검거"), null);
  for (const name of ["대시보드", "Riot 계정", "명령어 로그", "설정", "운영 기록"]) {
    assert.ok(screen.getByRole("button", { name }));
  }
});

test("loads command logs without a numeric URL query", async () => {
  let request: Parameters<DashboardApi["getCommandLog"]>[0];
  render(<App api={apiFixture({
    commandLog: async (input) => {
      request = input;
      return { entries: [] };
    },
  })} />);

  await screen.findByRole("heading", { name: "대시보드" });
  assert.equal(request, undefined);
});

test("exposes named landmarks and controls without relying on color alone", async () => {
  render(<App api={apiFixture()} />);
  await screen.findByRole("main");

  assert.ok(screen.getByRole("status", { name: "전체 상태" }).textContent);
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  assert.ok(screen.getByRole("checkbox", { name: "서버 요약 기능 사용" }));
  assert.ok(screen.getByRole("button", { name: "설정 저장" }));
  assert.ok(screen.getByRole("button", { name: "로그아웃" }));
  fireEvent.click(screen.getByRole("button", { name: "운영 기록" }));
  assert.match(screen.getByText("표시할 설정 변경 기록이 없습니다.").textContent ?? "", /없습니다/);
});

test("distinguishes login, denied, unavailable, and degraded states", async (t) => {
  await t.test("login", async () => {
    render(<App api={apiFixture({ session: null })} />);
    const login = await screen.findByRole("link", { name: "Discord로 계속하기" });
    assert.equal(login.getAttribute("href"), "/auth/login");
    cleanup();
  });

  await t.test("denied", async () => {
    render(<App api={apiFixture({ sessionError: apiError("forbidden") })} />);
    assert.equal((await screen.findByRole("alert")).textContent?.includes("권한이 없습니다"), true);
    cleanup();
  });

  await t.test("unavailable", async () => {
    render(<App api={apiFixture({ overviewError: new Error("network") })} />);
    assert.equal((await screen.findByRole("alert")).textContent?.includes("서비스에 연결할 수 없습니다"), true);
    assert.ok(screen.getByRole("button", { name: "다시 시도" }));
    cleanup();
  });

  await t.test("degraded", async () => {
    render(
      <App
        api={apiFixture({
          overview: {
            ...healthyOverviewFixture,
            health: {
              status: "degraded",
              gateway: { status: "degraded" },
              storage: { status: "connected" },
            },
          },
        })}
      />,
    );
    assert.equal((await screen.findByRole("status", { name: "전체 상태" })).textContent, "일부 장애");
    cleanup();
  });
});

test("announces a successful setting mutation, refreshes audit, and moves focus", async () => {
  const audit: AuditEventDto = {
    id: "audit-synthetic-1",
    occurredAt: "2026-07-24T03:01:00.000Z",
    actorId: "actor-synthetic",
    action: "settings.summary.update",
    outcome: "success",
    reasonCode: "updated",
  };
  let received: UpdateLowRiskSettingsRequestDto | undefined;
  const api = apiFixture({
    update: async (request) => {
      received = request;
      return { summaryEnabled: request.summaryEnabled, version: 5 };
    },
    audit: { events: [audit] },
  });
  render(<App api={api} />);

  await screen.findByRole("heading", { name: "대시보드" });
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  const checkbox = await screen.findByRole("checkbox", { name: "서버 요약 기능 사용" });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  const result = await screen.findByRole("status", { name: "저장 결과" });
  assert.equal(result.textContent?.includes("저장했습니다"), true);
  assert.equal(dom.window.document.activeElement, result);
  assert.deepEqual(received, { summaryEnabled: false, expectedVersion: 4 });
  fireEvent.click(screen.getByRole("button", { name: "운영 기록" }));
  assert.match(screen.getByRole("list", { name: "최근 감사 결과" }).textContent ?? "", /성공/);
});

test("announces mutation failure without claiming success", async () => {
  render(
    <App
      api={apiFixture({
        update: async () => {
          throw apiError("conflict");
        },
      })}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "설정" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "서버 요약 기능 사용" }));
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  const alert = await screen.findByRole("alert", { name: "저장 결과" });
  assert.equal(alert.textContent?.includes("다시 불러온 뒤 시도"), true);
});

test("administrator can review a KR request and approve with a hidden PUUID", async () => {
  let approved = 0;
  let activeLinksRead = 0;
  let finishApproval!: () => void;
  const approval = new Promise<void>((resolve) => {
    finishApproval = resolve;
  });
  render(<App api={apiFixture({
    session: {
      ...sessionFixture,
      actor: { ...sessionFixture.actor, tier: "administrator" },
    },
    riotRequests: {
      requests: [{
        requestId: "request-synthetic",
        discordUserId: "discord-synthetic",
        requesterLabel: "요청자",
        platformId: "KR",
        gameName: "테스트계정",
        tagLine: "KR1",
        requestedAt: "2026-07-27T00:00:00.000Z",
        version: 1,
      }],
    },
    approveRiotRequest: async (request) => {
      if (request.confirmation) approved += 1;
      await approval;
      return { message: "승인했습니다." };
    },
    getRiotLinks: async () => ({
      links: activeLinksRead++ === 0
        ? []
        : [{
            linkId: "link:approved-synthetic",
            expectedVersion: 0,
            requesterLabel: "요청자",
            platformId: "KR",
            gameName: "테스트계정",
            tagLine: "KR1",
            isPrimary: true,
          }],
    }),
  })} />);

  fireEvent.click(await screen.findByRole("button", { name: /Riot 계정/ }));
  await screen.findByRole("heading", { name: "Riot 계정", level: 1 });
  assert.equal(screen.getByText(/요청자 요청자/).textContent?.includes("요청자"), true);
  assert.equal(screen.queryByLabelText("검증할 PUUID"), null);
  const approve = screen.getByRole("button", { name: "검증 후 승인" });
  fireEvent.click(approve);
  fireEvent.click(approve);
  assert.equal(screen.getAllByRole("button", { name: "처리 중…" }).length, 2);
  assert.equal(approved, 1);
  finishApproval();
  await screen.findByText("Riot 계정 연결 요청을 승인했습니다.");
  await screen.findByText("테스트계정#KR1 · 대표");
  assert.equal(approved, 1);
  assert.equal(activeLinksRead, 2);
});

test("administrator can reject a stale Riot request", async () => {
  let rejected = false;
  render(<App api={apiFixture({
    session: {
      ...sessionFixture,
      actor: { ...sessionFixture.actor, tier: "administrator" },
    },
    riotRequests: {
      requests: [{
        requestId: "request-stale",
        discordUserId: "discord-synthetic",
        requesterLabel: "요청자",
        platformId: "KR",
        gameName: "이미연결됨",
        tagLine: "KR1",
        requestedAt: "2026-07-29T00:00:00.000Z",
        version: 1,
      }],
    },
    rejectRiotRequest: async () => {
      rejected = true;
      return { message: "거절했습니다." };
    },
  })} />);

  fireEvent.click(await screen.findByRole("button", { name: /Riot 계정/ }));
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  await screen.findByText("Riot 계정 연결 요청을 거절했습니다.");
  assert.equal(rejected, true);
});

test("administrator can approve every eligible Riot request in one action", async () => {
  const approved: string[] = [];
  let activeLinksRead = 0;
  const first = {
    requestId: "request-bulk-1",
    discordUserId: "discord-one",
    requesterLabel: "첫 요청자",
    platformId: "KR",
    gameName: "첫계정",
    tagLine: "KR1",
    requestedAt: "2026-07-29T00:00:00.000Z",
    version: 1,
  };
  render(<App api={apiFixture({
    session: {
      ...sessionFixture,
      actor: { ...sessionFixture.actor, tier: "administrator" },
    },
    riotRequests: {
      requests: [
        first,
        { ...first, requestId: "request-bulk-2", requesterLabel: "둘째 요청자" },
      ],
    },
    approveRiotRequest: async (request) => {
      approved.push(request.requestId);
      return { message: "승인했습니다." };
    },
    getRiotLinks: async () => ({
      links: activeLinksRead++ === 0
        ? []
        : [{
            linkId: "link:bulk-approved",
            expectedVersion: 0,
            requesterLabel: "첫 요청자",
            platformId: "KR",
            gameName: "첫계정",
            tagLine: "KR1",
            isPrimary: true,
          }],
    }),
  })} />);

  fireEvent.click(await screen.findByRole("button", { name: /Riot 계정/ }));
  fireEvent.click(screen.getByRole("button", { name: "일괄 승인" }));
  await screen.findByText("2건을 일괄 승인했습니다.");
  await screen.findByText("첫계정#KR1 · 대표");
  assert.deepEqual(approved, ["request-bulk-1", "request-bulk-2"]);
  assert.equal(activeLinksRead, 2);
});

test("administrator confirms and removes one active Riot link once", async () => {
  let calls = 0;
  render(<App api={apiFixture({
    session: {
      ...sessionFixture,
      actor: { ...sessionFixture.actor, tier: "administrator" },
    },
    riotLinks: {
      links: [{
        linkId: "link:active0001",
        expectedVersion: 2,
        requesterLabel: "사용자",
        platformId: "KR",
        gameName: "계정",
        tagLine: "KR1",
        isPrimary: true,
      }],
    },
    removeRiotLink: async (request) => {
      calls += 1;
      assert.deepEqual(request, {
        linkId: "link:active0001",
        expectedVersion: 2,
        confirmation: true,
      });
      return { message: "연결을 해제했습니다." };
    },
  })} />);
  fireEvent.click(await screen.findByRole("button", { name: /Riot 계정/ }));
  fireEvent.click(screen.getByRole("button", { name: "연결 해제" }));
  const confirm = screen.getByRole("button", { name: "해제 확인" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await screen.findByText("연결을 해제했습니다.");
  assert.equal(calls, 1);
  assert.equal(screen.queryByText("계정#KR1 · 대표"), null);
});

test("administrator confirms one optimistic KBO credit adjustment", async () => {
  let received: KboCreditAdjustmentRequestDto | undefined;
  const management: KboManagementDto = {
    accounts: [{
      accountId: "account:active0001",
      displayLabel: "야구팬",
      enrollmentStatus: "active",
      availableBalance: "1500",
      correctionDebt: "0",
      version: 7,
      dailyClaims: 2,
      bets: 3,
      pendingBets: 1,
      settledBets: 2,
      voidBets: 0,
      corrections: 0,
      outcomeHits: 1,
      scoreHits: 0,
      adminAdjusted: false,
      lastLedgerAt: null,
    }],
    provider: { games: 5, latestStatus: "scheduled", sourceUpdatedAt: null, collectedAt: null },
  };
  render(<App api={apiFixture({
    session: { ...sessionFixture, actor: { ...sessionFixture.actor, tier: "administrator" } },
    kboManagement: management,
    adjustKboCredit: async (request) => {
      received = request;
      return { message: "크레딧을 조정했습니다.", availableBalance: "1250", version: 8 };
    },
  })} />);

  fireEvent.click(await screen.findByRole("button", { name: "KBO 베팅" }));
  assert.ok(screen.getByRole("heading", { name: "KBO 베팅 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "크레딧 조정" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "크레딧 증감액" }), { target: { value: "-250" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /선택한 계정의 잔액/ }));
  fireEvent.click(screen.getByRole("button", { name: "조정 실행" }));

  await screen.findByText("크레딧을 조정했습니다.");
  assert.deepEqual(received, {
    accountId: "account:active0001",
    expectedVersion: 7,
    delta: -250,
    reasonCode: "support_correction",
    confirmation: true,
  });
});

function apiError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function apiFixture(
  overrides: {
    session?: SessionDto | null;
    sessionError?: Error;
    overview?: DashboardOverviewDto;
    overviewError?: Error;
    riotLinks?: import("../src/contracts/dashboard.ts").ActiveRiotLinksDto;
    kboManagement?: KboManagementDto;
    getRiotLinks?: DashboardApi["getRiotLinks"];
    settings?: LowRiskSettingsDto;
    update?: DashboardApi["updateSettings"];
    audit?: { events: AuditEventDto[] };
    riotRequests?: PendingRiotLinkRequestsDto;
    approveRiotRequest?: DashboardApi["approveRiotRequest"];
    rejectRiotRequest?: DashboardApi["rejectRiotRequest"];
    removeRiotLink?: DashboardApi["removeRiotLink"];
    adjustKboCredit?: DashboardApi["adjustKboCredit"];
    commandLog?: DashboardApi["getCommandLog"];
  } = {},
): DashboardApi {
  return {
    async getSession() {
      if (overrides.sessionError) throw overrides.sessionError;
      return overrides.session === undefined ? sessionFixture : overrides.session;
    },
    async getOverview() {
      if (overrides.overviewError) throw overrides.overviewError;
      return overrides.overview ?? healthyOverviewFixture;
    },
    async getRiotLinks() {
      return overrides.getRiotLinks?.() ?? overrides.riotLinks ?? { links: [] };
    },
    async getKboManagement() {
      return overrides.kboManagement ?? {
        accounts: [],
        provider: { games: 0, latestStatus: null, sourceUpdatedAt: null, collectedAt: null },
      };
    },
    async getSettings() {
      return overrides.settings ?? settingsFixture;
    },
    updateSettings:
      overrides.update ??
      (async (request) => ({
        summaryEnabled: request.summaryEnabled,
        version: request.expectedVersion + 1,
      })),
    async getAudit() {
      return overrides.audit ?? emptyAuditFixture;
    },
    async getCommandLog(request) {
      return overrides.commandLog?.(request) ?? { entries: [] };
    },
    async logout() {},
    async getRiotRequests() {
      return overrides.riotRequests ?? { requests: [] };
    },
    approveRiotRequest:
      overrides.approveRiotRequest ??
      (async () => ({ message: "승인했습니다." })),
    rejectRiotRequest:
      overrides.rejectRiotRequest ??
      (async () => ({ message: "거절했습니다." })),
    removeRiotLink:
      overrides.removeRiotLink ??
      (async () => ({ message: "연결을 해제했습니다." })),
    adjustKboCredit:
      overrides.adjustKboCredit ??
      (async () => ({ message: "크레딧을 조정했습니다.", availableBalance: "0", version: 1 })),
  };
}
