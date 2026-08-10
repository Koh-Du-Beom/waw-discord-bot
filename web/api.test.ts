import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserApi } from "./api.ts";

test("browser mutation sends the session CSRF token and consumes the audited response", async () => {
  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input) === "/api/session") {
      return Response.json({
        authenticated: true,
        actor: { displayName: "합성 운영자", tier: "operator" },
        csrfToken: "csrf-synthetic-browser",
      });
    }
    return Response.json({
      settings: { summaryEnabled: false, version: 5 },
      auditEvent: {
        id: "audit-synthetic",
        occurredAt: "2026-07-24T00:00:00.000Z",
        actorId: "actor-synthetic",
        action: "settings.summary.update",
        outcome: "success",
        reasonCode: "updated",
      },
    });
  };
  const api = createBrowserApi(fetcher);

  await api.getSession();
  const settings = await api.updateSettings({
    summaryEnabled: false,
    expectedVersion: 4,
  });

  assert.deepEqual(settings, { summaryEnabled: false, version: 5 });
  assert.equal(requests[1]?.input, "/api/settings/summary");
  assert.equal(new Headers(requests[1]?.init?.headers).get("X-CSRF-Token"), "csrf-synthetic-browser");
  assert.equal(requests[1]?.init?.credentials, "same-origin");
});

test("browser mutation default-denies before a session supplies CSRF", async () => {
  const api = createBrowserApi(async () => {
    throw new Error("fetch must not be called");
  });
  await assert.rejects(
    api.updateSettings({ summaryEnabled: false, expectedVersion: 4 }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "unauthenticated",
  );
});

test("command log pagination sends only the opaque cursor", async () => {
  let requested = "";
  const api = createBrowserApi(async (input) => {
    requested = String(input);
    return Response.json({ entries: [] });
  });

  await api.getCommandLog({ cursor: "opaque_cursor_0123456789" });

  assert.equal(requested, "/api/command-log?cursor=opaque_cursor_0123456789");
});

test("KBO credit adjustment uses the exact CSRF-protected route", async () => {
  const requests: Array<{ input: string; init: RequestInit | undefined }> = [];
  const api = createBrowserApi(async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input) === "/api/session") {
      return Response.json({
        authenticated: true,
        actor: { displayName: "관리자", tier: "administrator" },
        csrfToken: "csrf-kbo-synthetic",
      });
    }
    return Response.json({ message: "크레딧을 조정했습니다.", availableBalance: "1250", version: 8 });
  });
  await api.getSession();
  await api.adjustKboCredit({
    accountId: "account:active0001",
    expectedVersion: 7,
    delta: -250,
    reasonCode: "support_correction",
    confirmation: true,
  });
  assert.equal(requests[1]?.input, "/api/kbo/credits/adjust");
  assert.equal(new Headers(requests[1]?.init?.headers).get("X-CSRF-Token"), "csrf-kbo-synthetic");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    accountId: "account:active0001",
    expectedVersion: 7,
    delta: -250,
    reasonCode: "support_correction",
    confirmation: true,
  });
});

test("game history encodes only bounded filters and opaque cursor", async () => {
  let requested = "";
  const api = createBrowserApi(async (input) => {
    requested = String(input);
    return Response.json({ entries: [] });
  });

  await api.getGameIncidents({
    limit: 50,
    cursor: "opaque_cursor_0123456789",
    status: "confirmed",
    memberLabel: "등록 사용자",
  });

  assert.equal(
    requested,
    "/api/game/incidents?limit=50&cursor=opaque_cursor_0123456789&status=confirmed&memberLabel=%EB%93%B1%EB%A1%9D+%EC%82%AC%EC%9A%A9%EC%9E%90",
  );
  assert.equal(requested.includes("discordUserId"), false);
  assert.equal(requested.includes("puuid"), false);
});

test("incident mutation sends CSRF and keeps reason out of the URL", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const api = createBrowserApi(async (input, init) => {
    requests.push({ input: String(input), ...(init === undefined ? {} : { init }) });
    if (String(input) === "/api/session") {
      return Response.json({
        authenticated: true,
        actor: { displayName: "관리자", tier: "administrator" },
        csrfToken: "csrf-incident-synthetic",
      });
    }
    return Response.json({ message: "사건을 정정했습니다." });
  });
  await api.getSession();
  await api.correctGameIncident({
    incidentId: "incident:000001",
    expectedVersion: 3,
    reason: "URL 비노출 사유",
    confirmation: true,
  });
  assert.equal(requests[1]?.input, "/api/game/incidents/correct");
  assert.equal(requests[1]?.input.includes("URL"), false);
  assert.equal(new Headers(requests[1]?.init?.headers).get("X-CSRF-Token"), "csrf-incident-synthetic");
});
