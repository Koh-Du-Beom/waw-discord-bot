import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

const SESSION_COOKIE = "__Host-waw_session";
const ORIGIN = "https://waw.dubeom.com";
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function buildServer({ now = () => Date.now(), logs = [] } = {}) {
  const sessions = new Map();
  const app = Fastify({
    logger: false,
    genReqId: () => randomBytes(8).toString("hex"),
    ajv: { customOptions: { removeAdditional: false } }
  });
  await app.register(cookie);

  app.addHook("onResponse", async (request, reply) => {
    logs.push({ req_id: request.id, method: request.method, route: request.routeOptions.url, status: reply.statusCode });
  });

  const requireSession = async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    const session = raw && sessions.get(hash(raw));
    if (!session || session.revoked || now() >= session.expiresAt) {
      return reply.code(401).send({ outcome: "denied", reason: "session_invalid" });
    }
    request.session = session;
  };

  app.post("/synthetic/callback", {
    schema: { response: { 200: { type: "object", properties: { outcome: { type: "string" } }, required: ["outcome"], additionalProperties: false } } }
  }, async (_request, reply) => {
    const raw = randomBytes(32).toString("base64url");
    sessions.set(hash(raw), { role: "admin", roleCheckedAt: now(), expiresAt: now() + 60_000, revoked: false });
    reply.setCookie(SESSION_COOKIE, raw, { path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    return { outcome: "authenticated", internalSecret: "must-not-serialize" };
  });

  app.get("/api/overview", {
    preHandler: requireSession,
    schema: { response: { 200: { type: "object", properties: { status: { type: "string" }, observedAt: { type: "number" } }, required: ["status", "observedAt"], additionalProperties: false } } }
  }, async (request, reply) => {
    if (now() - request.session.roleCheckedAt > 300_000) return reply.code(503).send({ outcome: "unavailable", reason: "role_stale" });
    return { status: "healthy", observedAt: now(), credential: "must-not-serialize" };
  });

  app.post("/api/settings", {
    preHandler: requireSession,
    schema: {
      body: { type: "object", properties: { value: { type: "string", minLength: 1, maxLength: 32 } }, required: ["value"], additionalProperties: false },
      response: { 200: { type: "object", properties: { outcome: { type: "string" } }, required: ["outcome"], additionalProperties: false } }
    }
  }, async (request, reply) => {
    if (request.headers.origin !== ORIGIN) return reply.code(403).send({ outcome: "denied", reason: "origin_invalid" });
    if (request.headers["x-csrf-token"] !== "synthetic-csrf") return reply.code(403).send({ outcome: "denied", reason: "csrf_invalid" });
    if (request.session.role !== "admin") return reply.code(403).send({ outcome: "denied", reason: "role_invalid" });
    return { outcome: "updated", submitted: request.body.value };
  });

  app.post("/synthetic/revoke", { preHandler: requireSession }, async (request) => {
    request.session.revoked = true;
    return { outcome: "revoked" };
  });

  await app.ready();
  return app;
}
