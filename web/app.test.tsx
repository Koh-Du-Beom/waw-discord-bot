import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";

import type {
  AuditEventDto,
  DashboardOverviewDto,
  LowRiskSettingsDto,
  PendingRiotLinkRequestsDto,
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
  assert.equal((await screen.findByRole("heading", { name: "운영 현황" })).tagName, "H1");
  assert.match(screen.getByText("정상").textContent ?? "", /정상/);
  assert.equal(screen.getAllByText("연결됨").length, 2);
  assert.equal(screen.getByRole("checkbox", { name: "서버 요약 기능 사용" }).getAttribute("type"), "checkbox");
  assert.equal(screen.getByRole("button", { name: "설정 저장" }).getAttribute("type"), "submit");
});

test("exposes named landmarks and controls without relying on color alone", async () => {
  render(<App api={apiFixture()} />);
  await screen.findByRole("main");

  assert.ok(screen.getByRole("status", { name: "전체 상태" }).textContent);
  assert.ok(screen.getByRole("checkbox", { name: "서버 요약 기능 사용" }));
  assert.ok(screen.getByRole("button", { name: "설정 저장" }));
  assert.match(screen.getByText("게시 완료").textContent ?? "", /게시 완료/);
  assert.match(screen.getByText("표시할 설정 변경 기록이 없습니다.").textContent ?? "", /없습니다/);
});

test("distinguishes login, denied, unavailable, and degraded states", async (t) => {
  await t.test("login", async () => {
    render(<App api={apiFixture({ session: null })} />);
    const login = await screen.findByRole("link", { name: "Discord로 로그인" });
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

  const checkbox = await screen.findByRole("checkbox", { name: "서버 요약 기능 사용" });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

  const result = await screen.findByRole("status", { name: "저장 결과" });
  assert.equal(result.textContent?.includes("저장했습니다"), true);
  assert.equal(dom.window.document.activeElement, result);
  assert.deepEqual(received, { summaryEnabled: false, expectedVersion: 4 });
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
  fireEvent.click(await screen.findByRole("checkbox", { name: "서버 요약 기능 사용" }));
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  const alert = await screen.findByRole("alert", { name: "저장 결과" });
  assert.equal(alert.textContent?.includes("다시 불러온 뒤 시도"), true);
});

test("administrator can review a KR request and approve with a hidden PUUID", async () => {
  let approved = false;
  render(<App api={apiFixture({
    session: {
      ...sessionFixture,
      actor: { ...sessionFixture.actor, tier: "administrator" },
    },
    riotRequests: {
      requests: [{
        requestId: "request-synthetic",
        discordUserId: "discord-synthetic",
        platformId: "KR",
        gameName: "테스트계정",
        tagLine: "KR1",
        requestedAt: "2026-07-27T00:00:00.000Z",
        version: 1,
      }],
    },
    approveRiotRequest: async (request) => {
      approved = request.confirmation;
      return { message: "승인했습니다." };
    },
  })} />);

  await screen.findByRole("heading", { name: "Riot 계정 연결 요청" });
  assert.equal(screen.queryByLabelText("검증할 PUUID"), null);
  fireEvent.click(screen.getByRole("button", { name: "검증 후 승인" }));
  await screen.findByText("Riot 계정 연결 요청을 승인했습니다.");
  assert.equal(approved, true);
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
    settings?: LowRiskSettingsDto;
    update?: DashboardApi["updateSettings"];
    audit?: { events: AuditEventDto[] };
    riotRequests?: PendingRiotLinkRequestsDto;
    approveRiotRequest?: DashboardApi["approveRiotRequest"];
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
    async getRiotRequests() {
      return overrides.riotRequests ?? { requests: [] };
    },
    approveRiotRequest:
      overrides.approveRiotRequest ??
      (async () => ({ message: "승인했습니다." })),
  };
}
