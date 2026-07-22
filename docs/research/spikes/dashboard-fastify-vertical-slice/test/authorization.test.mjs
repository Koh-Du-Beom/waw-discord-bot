import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../server.mjs";

function sessionCookie(response) {
  return response.cookies.find(({ name }) => name === "__Host-waw_session").value;
}

test("defaults protected reads and writes to deny", async () => {
  const app = await buildServer();
  assert.equal((await app.inject({ method: "GET", url: "/api/overview" })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/settings", payload: { value: "x" } })).statusCode, 401);
  await app.close();
});

test("allows authenticated read but requires origin and CSRF for mutation", async () => {
  const app = await buildServer();
  const login = await app.inject({ method: "POST", url: "/synthetic/callback" });
  const cookie = `__Host-waw_session=${sessionCookie(login)}`;
  const overview = await app.inject({ method: "GET", url: "/api/overview", headers: { cookie } });
  assert.equal(overview.statusCode, 200);
  assert.deepEqual(Object.keys(overview.json()).sort(), ["observedAt", "status"]);
  assert.equal((await app.inject({ method: "POST", url: "/api/settings", headers: { cookie }, payload: { value: "x" } })).statusCode, 403);
  const updated = await app.inject({ method: "POST", url: "/api/settings", headers: { cookie, origin: "https://waw.dubeom.com", "x-csrf-token": "synthetic-csrf" }, payload: { value: "x" } });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json(), { outcome: "updated" });
  await app.close();
});

test("rejects malformed input and revoked sessions without logging cookie values", async () => {
  const logs = [];
  const app = await buildServer({ logs });
  const login = await app.inject({ method: "POST", url: "/synthetic/callback" });
  const raw = sessionCookie(login);
  const cookie = `__Host-waw_session=${raw}`;
  const malformed = await app.inject({ method: "POST", url: "/api/settings", headers: { cookie, origin: "https://waw.dubeom.com", "x-csrf-token": "synthetic-csrf" }, payload: { value: "x", extra: true } });
  assert.equal(malformed.statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/synthetic/revoke", headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/overview", headers: { cookie } })).statusCode, 401);
  assert.equal(JSON.stringify(logs).includes(raw), false);
  await app.close();
});

test("rejects expired sessions", async () => {
  let current = 1_000;
  const app = await buildServer({ now: () => current });
  const login = await app.inject({ method: "POST", url: "/synthetic/callback" });
  const cookie = `__Host-waw_session=${sessionCookie(login)}`;
  current += 60_001;
  assert.equal((await app.inject({ method: "GET", url: "/api/overview", headers: { cookie } })).statusCode, 401);
  await app.close();
});
