import { join } from "node:path";
import { pathToFileURL } from "node:url";

import staticPlugin from "@fastify/static";
import Fastify from "fastify";

import {
  emptyAuditFixture,
  healthyOverviewFixture,
  sessionFixture,
  settingsFixture,
} from "./fixtures.ts";

export function buildBrowserFixtureServer() {
  const app = Fastify({ logger: false });
  let settings = settingsFixture;
  let audit = emptyAuditFixture;

  app.get("/api/session", async () => sessionFixture);
  app.get("/api/overview", async () => healthyOverviewFixture);
  app.get("/api/settings/summary", async () => settings);
  app.get("/api/audit", async () => audit);
  app.get("/api/command-log", async () => ({
    entries: [{
      occurredAt: "2026-07-27T00:00:00.000Z",
      commandLabel: "/요약",
      actorLabel: "서버 멤버",
      outcome: "success",
      reasonLabel: "완료",
    }],
  }));
  app.put<{ Body: { summaryEnabled: boolean; expectedVersion: number } }>(
    "/api/settings/summary",
    async (request, reply) => {
      if (request.headers["x-csrf-token"] !== sessionFixture.csrfToken) {
        return reply.code(403).send({
          error: {
            code: "forbidden",
            message: "합성 CSRF 검증에 실패했습니다.",
            correlationId: request.id,
          },
        });
      }
      settings = {
        summaryEnabled: request.body.summaryEnabled,
        version: request.body.expectedVersion + 1,
      };
      const auditEvent = {
        id: "audit-browser-synthetic",
        occurredAt: "2026-07-24T03:01:00.000Z",
        actorId: "actor-browser-synthetic",
        action: "settings.summary.update" as const,
        outcome: "success" as const,
        reasonCode: "updated",
      };
      audit = { events: [auditEvent] };
      return { settings, auditEvent };
    },
  );

  void app.register(staticPlugin, {
    root: join(process.cwd(), "dist", "web"),
  });
  return app;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await buildBrowserFixtureServer().listen({
    host: "127.0.0.1",
    port: Number(process.env.BROWSER_FIXTURE_PORT ?? "4173"),
  });
}
