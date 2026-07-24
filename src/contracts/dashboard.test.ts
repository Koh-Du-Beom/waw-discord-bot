import assert from "node:assert/strict";
import test from "node:test";

import { DASHBOARD_API_PATHS } from "./dashboard.ts";

test("dashboard API paths remain same-origin and canonical", () => {
  assert.deepEqual(DASHBOARD_API_PATHS, {
    login: "/auth/login",
    callback: "/auth/discord/callback",
    session: "/api/session",
    logout: "/api/logout",
    overview: "/api/overview",
    settings: "/api/settings/summary",
    audit: "/api/audit",
  });

  for (const path of Object.values(DASHBOARD_API_PATHS)) {
    assert.match(path, /^\//);
    assert.equal(path.includes("://"), false);
  }
});
