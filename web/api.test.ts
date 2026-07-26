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
        features: { summaryQuotaDashboard: false },
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
