import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const MAX_REQUEST_AGE_MS = 30_000;
const MAX_CACHE_AGE_MS = 300_000;

const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (method, path, body, headers) =>
  [method, path, headers.timestamp, headers.nonce, headers.environment, headers.audience, digest(body)].join("\n");
const sign = (key, method, path, body, headers) =>
  createHmac("sha256", key).update(canonical(method, path, body, headers)).digest("hex");

function verify({ method, path, body, headers, keys, usedNonces, now = Date.now() }) {
  if (headers.environment !== "fixed-preview" || headers.audience !== "role-check") return "wrong_scope";
  if (!Number.isFinite(Number(headers.timestamp)) || Math.abs(now - Number(headers.timestamp)) > MAX_REQUEST_AGE_MS) return "expired";
  if (!headers.nonce || usedNonces.has(headers.nonce)) return "replay";
  const expected = keys.get(headers.keyId);
  if (!expected || !headers.signature) return "bad_signature";
  const actual = sign(expected, method, path, body, headers);
  const valid = actual.length === headers.signature.length && timingSafeEqual(Buffer.from(actual), Buffer.from(headers.signature));
  if (!valid) return "bad_signature";
  usedNonces.add(headers.nonce);
  return "ok";
}

function authorize({ kind, cacheAgeMs, upstreamAvailable }) {
  if (upstreamAvailable) return "allow";
  if (kind === "read" && cacheAgeMs <= MAX_CACHE_AGE_MS) return "allow_read_cache";
  return kind === "read" ? "unavailable" : "deny";
}

function request(port, key, overrides = {}) {
  const body = JSON.stringify({ guild_id: "test-guild", actor_id: "test-operator", kind: "read" });
  const headers = {
    timestamp: String(Date.now()), nonce: randomBytes(12).toString("hex"), environment: "fixed-preview",
    audience: "role-check", keyId: "current", ...overrides,
  };
  headers.signature ??= sign(key, "POST", "/role-check", body, headers);
  return fetch(`http://127.0.0.1:${port}/role-check`, {
    method: "POST", body, signal: AbortSignal.timeout(5_000),
    headers: {
      "content-type": "application/json", "x-timestamp": headers.timestamp, "x-nonce": headers.nonce,
      "x-environment": headers.environment, "x-audience": headers.audience, "x-key-id": headers.keyId,
      "x-signature": headers.signature,
    },
  });
}

function startServer(keys, logs) {
  const usedNonces = new Set();
  const server = createServer(async (req, res) => {
    const body = await new Promise((resolve) => {
      let value = "";
      req.on("data", (chunk) => { value += chunk; });
      req.on("end", () => resolve(value));
    });
    const headers = {
      timestamp: req.headers["x-timestamp"], nonce: req.headers["x-nonce"],
      environment: req.headers["x-environment"], audience: req.headers["x-audience"],
      keyId: req.headers["x-key-id"], signature: req.headers["x-signature"],
    };
    const outcome = verify({ method: req.method, path: req.url, body, headers, keys, usedNonces });
    logs.push(JSON.stringify({ event_type: "role_check", outcome }));
    res.writeHead(outcome === "ok" ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(outcome === "ok" ? { guild_id: "test-guild", roles: ["operator"] } : { outcome }));
  });
  return server;
}

async function selfCheck() {
  const current = randomBytes(32).toString("hex");
  const next = randomBytes(32).toString("hex");
  const logs = [];
  const keys = new Map([["current", current], ["next", next]]);
  const server = startServer(keys, logs);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    for (let i = 0; i < 30; i += 1) assert.equal((await request(port, current)).status, 200);
    assert.equal((await request(port, "wrong")).status, 401);
    assert.equal((await request(port, current, { environment: "production" })).status, 401);
    assert.equal((await request(port, current, { audience: "other" })).status, 401);
    assert.equal((await request(port, current, { timestamp: String(Date.now() - 31_000) })).status, 401);
    const nonce = randomBytes(12).toString("hex");
    assert.equal((await request(port, current, { nonce })).status, 200);
    assert.equal((await request(port, current, { nonce })).status, 401);
    assert.equal((await request(port, next, { keyId: "next" })).status, 200);
    keys.delete("current");
    assert.equal((await request(port, current)).status, 401);
    assert.equal((await request(port, next, { keyId: "next" })).status, 200);
    assert.equal(authorize({ kind: "read", cacheAgeMs: 299_000, upstreamAvailable: false }), "allow_read_cache");
    assert.equal(authorize({ kind: "read", cacheAgeMs: 301_000, upstreamAvailable: false }), "unavailable");
    assert.equal(authorize({ kind: "mutation", cacheAgeMs: 0, upstreamAvailable: false }), "deny");
    assert.equal(authorize({ kind: "high-risk", cacheAgeMs: 0, upstreamAvailable: false }), "deny");
    assert.equal(logs.join("\n").includes(current), false);
    assert.equal(logs.join("\n").includes(next), false);
    console.log(JSON.stringify({ outcome: "pass", valid_requests: 30, checks: 13 }));
  } finally {
    server.close();
  }
}

if (process.argv[2] === "serve") {
  const key = process.env.SPIKE_CURRENT_KEY;
  if (!key) throw new Error("SPIKE_CURRENT_KEY is required");
  const server = startServer(new Map([["current", key]]), []);
  server.listen(Number(process.env.PORT || 43127), "127.0.0.1", () => console.log("spike server ready"));
} else {
  await selfCheck();
}
