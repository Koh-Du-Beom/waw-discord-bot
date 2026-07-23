import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationalEvent,
  evaluateMonitoring,
  type AlertStates,
  type MonitoringSnapshot,
  type OperationalEventInput,
} from "./monitoring.ts";

const GIB = 1024 ** 3;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

test("serializes only the operational allowlist", () => {
  const input = {
    timestamp: "2026-07-23T00:00:00.000Z",
    correlationId: "operation-1",
    eventType: "command.completed",
    operation: "GET:/settings",
    outcome: "success",
    reasonCode: "completed",
    durationMs: 12,
    serviceVersion: "0.1.0",
    authorization: "Bearer synthetic-secret",
    cookie: "session=synthetic-secret",
    query: "code=synthetic-secret",
    body: "raw Discord message synthetic-secret",
    ip: "192.0.2.1",
    userAgent: "synthetic-agent",
  } satisfies OperationalEventInput & Record<string, unknown>;

  assert.deepEqual(createOperationalEvent(input), {
    timestamp: "2026-07-23T00:00:00.000Z",
    correlation_id: "operation-1",
    event_type: "command.completed",
    operation: "GET:/settings",
    outcome: "success",
    reason_code: "completed",
    duration_ms: 12,
    service_version: "0.1.0",
  });
  assert.equal(JSON.stringify(createOperationalEvent(input)).includes("synthetic-secret"), false);
});

test("rejects a raw URL or malformed operational field without echoing it", () => {
  assert.throws(
    () =>
      createOperationalEvent({
        timestamp: "2026-07-23T00:00:00.000Z",
        correlationId: "operation-1",
        eventType: "request.completed",
        operation: "GET:/oauth/callback?code=synthetic-secret",
        outcome: "failure",
        reasonCode: "oauth_failed",
        durationMs: 1,
        serviceVersion: "0.1.0",
      }),
    { message: "invalid_operational_event" },
  );
  assert.throws(
    () =>
      createOperationalEvent({
        timestamp: "2026-07-23T00:00:00.000Z",
        correlationId: "operation-1",
        eventType: "request.completed",
        operation: "GET:/settings",
        outcome: "synthetic-invalid" as OperationalEventInput["outcome"],
        reasonCode: "completed",
        durationMs: 1,
        serviceVersion: "0.1.0",
      }),
    { message: "invalid_operational_event" },
  );
});

test("applies service, backup, certificate, and journal thresholds", () => {
  const result = evaluateMonitoring(
    snapshot({
      expectedUnits: { "waw-web.service": false },
      runtimeHealth: "unavailable",
      lastBackupPublishedAt: iso(-24 * HOUR),
      certificateExpiresAt: iso(13 * DAY),
      journalUsedBytes: Math.ceil(0.8 * GIB),
    }),
  );
  const alerts = new Map(result.notifications.map((item) => [item.alert_key, item]));

  assert.equal(alerts.get("service.waw-web.service")?.severity, "critical");
  assert.equal(alerts.get("runtime.health")?.severity, "critical");
  assert.equal(alerts.get("backup.age")?.severity, "critical");
  assert.equal(alerts.get("certificate.expiry")?.severity, "critical");
  assert.equal(alerts.get("journal.capacity")?.severity, "warning");
  assert.deepEqual(alerts.get("backup.age")?.allowed_mentions, { parse: [] });

  const warnings = new Map(
    evaluateMonitoring(
      snapshot({
        lastBackupPublishedAt: iso(-20 * HOUR),
        certificateExpiresAt: iso(20 * DAY),
      }),
    ).notifications.map((item) => [item.alert_key, item]),
  );
  assert.equal(warnings.get("backup.age")?.severity, "warning");
  assert.equal(warnings.get("certificate.expiry")?.severity, "warning");

  const lowDisk = evaluateMonitoring(snapshot({ filesystemFreeBytes: 4 * GIB }));
  assert.equal(lowDisk.notifications.find((item) => item.alert_key === "journal.capacity")?.severity, "critical");
});

test("debounces degraded health and sends one recovery", () => {
  let states: AlertStates = {};
  for (let minute = 0; minute < 4; minute += 1) {
    const result = evaluateMonitoring(
      snapshot({ now: iso(minute * 60_000), observedAt: iso(minute * 60_000), runtimeHealth: "degraded" }),
      states,
    );
    states = result.states;
    assert.equal(result.notifications.some((item) => item.alert_key === "runtime.health"), false);
  }
  const firing = evaluateMonitoring(
    snapshot({ now: iso(4 * 60_000), observedAt: iso(4 * 60_000), runtimeHealth: "degraded" }),
    states,
  );
  assert.equal(firing.notifications.find((item) => item.alert_key === "runtime.health")?.severity, "warning");

  const firstHealthy = evaluateMonitoring(
    snapshot({ now: iso(5 * 60_000), observedAt: iso(5 * 60_000) }),
    firing.states,
  );
  assert.equal(firstHealthy.notifications.some((item) => item.alert_key === "runtime.health"), false);
  const recovered = evaluateMonitoring(
    snapshot({ now: iso(6 * 60_000), observedAt: iso(6 * 60_000) }),
    firstHealthy.states,
  );
  assert.equal(recovered.notifications.find((item) => item.alert_key === "runtime.health")?.state, "resolved");
});

test("deduplicates critical alerts, reminds after six hours, and recovers", () => {
  const first = evaluateMonitoring(snapshot({ expectedUnits: { "waw-web.service": false } }));
  assert.equal(first.notifications.filter((item) => item.alert_key === "service.waw-web.service").length, 1);

  const duplicate = evaluateMonitoring(
    snapshot({ now: iso(HOUR), observedAt: iso(HOUR), expectedUnits: { "waw-web.service": false } }),
    first.states,
  );
  assert.equal(duplicate.notifications.some((item) => item.alert_key === "service.waw-web.service"), false);

  const reminder = evaluateMonitoring(
    snapshot({ now: iso(6 * HOUR), observedAt: iso(6 * HOUR), expectedUnits: { "waw-web.service": false } }),
    duplicate.states,
  );
  assert.equal(reminder.notifications.find((item) => item.alert_key === "service.waw-web.service")?.state, "firing");

  const recovery = evaluateMonitoring(
    snapshot({ now: iso(6 * HOUR + 60_000), observedAt: iso(6 * HOUR + 60_000) }),
    reminder.states,
  );
  assert.equal(recovery.notifications.find((item) => item.alert_key === "service.waw-web.service")?.state, "resolved");
});

test("requires ten clear observations after journal suppression", () => {
  const warning = evaluateMonitoring(snapshot({ journalSuppressionConsecutive: 1 }));
  const critical = evaluateMonitoring(
    snapshot({ now: iso(60_000), observedAt: iso(60_000), journalSuppressionConsecutive: 2 }),
    warning.states,
  );
  assert.equal(critical.notifications.find((item) => item.alert_key === "journal.dropped")?.severity, "critical");

  let states = critical.states;
  for (let minute = 2; minute < 11; minute += 1) {
    const result = evaluateMonitoring(
      snapshot({ now: iso(minute * 60_000), observedAt: iso(minute * 60_000) }),
      states,
    );
    states = result.states;
    assert.equal(result.notifications.some((item) => item.alert_key === "journal.dropped"), false);
  }
  const recovered = evaluateMonitoring(
    snapshot({ now: iso(11 * 60_000), observedAt: iso(11 * 60_000) }),
    states,
  );
  assert.equal(recovered.notifications.find((item) => item.alert_key === "journal.dropped")?.state, "resolved");
});

test("reports stale input without resolving existing alerts", () => {
  const previous = evaluateMonitoring(snapshot({ expectedUnits: { "waw-web.service": false } }));
  const stale = evaluateMonitoring(
    snapshot({ now: iso(10 * 60_000), observedAt: "invalid synthetic-secret" }),
    previous.states,
  );

  assert.equal(stale.notifications.find((item) => item.alert_key === "monitor.input")?.severity, "critical");
  assert.equal(stale.states["service.waw-web.service"]?.severity, "critical");
  assert.equal(JSON.stringify(stale).includes("synthetic-secret"), false);
});

function snapshot(overrides: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    now: iso(0),
    observedAt: iso(0),
    serviceVersion: "0.1.0",
    expectedUnits: { "waw-web.service": true },
    runtimeHealth: "healthy",
    lastBackupPublishedAt: iso(-HOUR),
    certificateExpiresAt: null,
    journalUsedBytes: 100,
    journalMaxBytes: GIB,
    filesystemFreeBytes: 6 * GIB,
    journalSuppressionConsecutive: 0,
    ...overrides,
  };
}

function iso(offsetMs: number): string {
  return new Date(Date.parse("2026-07-23T00:00:00.000Z") + offsetMs).toISOString();
}
