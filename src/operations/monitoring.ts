import type { HealthStatus } from "../runtime/health.ts";

const GIB = 1024 ** 3;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SAFE_TOKEN = /^[A-Za-z0-9._:@/+-]{1,128}$/;
const OUTCOMES = new Set<OperationalEventInput["outcome"]>([
  "success",
  "failure",
  "denied",
  "timeout",
]);

export type OperationalEventInput = {
  timestamp: string;
  correlationId: string;
  eventType: string;
  operation: string;
  outcome: "success" | "failure" | "denied" | "timeout";
  reasonCode: string;
  durationMs: number;
  serviceVersion: string;
};

export type OperationalEvent = {
  timestamp: string;
  correlation_id: string;
  event_type: string;
  operation: string;
  outcome: OperationalEventInput["outcome"];
  reason_code: string;
  duration_ms: number;
  service_version: string;
};

export function createOperationalEvent(input: OperationalEventInput): OperationalEvent {
  requireIso(input.timestamp);
  requireToken(input.correlationId);
  requireToken(input.eventType);
  requireToken(input.operation);
  requireToken(input.reasonCode);
  requireToken(input.serviceVersion);
  if (!OUTCOMES.has(input.outcome) || !Number.isSafeInteger(input.durationMs) || input.durationMs < 0) {
    throw new Error("invalid_operational_event");
  }

  return {
    timestamp: input.timestamp,
    correlation_id: input.correlationId,
    event_type: input.eventType,
    operation: input.operation,
    outcome: input.outcome,
    reason_code: input.reasonCode,
    duration_ms: input.durationMs,
    service_version: input.serviceVersion,
  };
}

export type MonitoringSnapshot = {
  now: string;
  observedAt: string;
  serviceVersion: string;
  expectedUnits: Record<string, boolean>;
  runtimeHealth: HealthStatus;
  lastBackupPublishedAt: string | null;
  certificateExpiresAt: string | null;
  journalUsedBytes: number;
  journalMaxBytes: number;
  filesystemFreeBytes: number;
  journalSuppressionConsecutive: number;
};

export type AlertSeverity = "ok" | "warning" | "critical";

export type AlertState = {
  severity: AlertSeverity;
  candidate: AlertSeverity;
  candidateCount: number;
  candidateFirstObservedAt: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string;
  lastNotifiedAt: string | null;
  reasonCode: string;
};

export type AlertStates = Record<string, AlertState>;

export type AlertNotification = {
  severity: AlertSeverity;
  alert_key: string;
  state: "firing" | "resolved";
  first_observed_at: string;
  last_observed_at: string;
  reason_code: string;
  service_version: string;
  allowed_mentions: { parse: [] };
};

export function evaluateMonitoring(
  snapshot: MonitoringSnapshot,
  previous: AlertStates = {},
): { states: AlertStates; notifications: AlertNotification[] } {
  const now = requireIso(snapshot.now);
  requireToken(snapshot.serviceVersion);
  const observedAt = parseIso(snapshot.observedAt);
  const observations: Observation[] = [];

  if (observedAt === null || Math.abs(now - observedAt) > 2 * MINUTE) {
    observations.push(observation("monitor.input", "critical", "monitor_input_stale"));
    return applyObservations({ ...snapshot, observedAt: snapshot.now }, previous, observations);
  }

  const unitNames = Object.keys(snapshot.expectedUnits);
  const validUnits = unitNames.length > 0 && unitNames.every((unit) => SAFE_TOKEN.test(unit));
  observations.push(
    observation(
      "monitor.input",
      validUnits ? "ok" : "critical",
      validUnits ? "monitor_input_valid" : "monitor_units_invalid",
    ),
  );
  if (validUnits) {
    for (const unit of unitNames.sort()) {
      observations.push(
        observation(
          `service.${unit}`,
          snapshot.expectedUnits[unit] ? "ok" : "critical",
          snapshot.expectedUnits[unit] ? "service_active" : "service_inactive",
        ),
      );
    }
  }

  observations.push(healthObservation(snapshot.runtimeHealth));
  observations.push(ageObservation("backup.age", snapshot.lastBackupPublishedAt, now, 20 * HOUR, 24 * HOUR));
  observations.push(certificateObservation(snapshot.certificateExpiresAt, now));
  observations.push(capacityObservation(snapshot));
  observations.push(suppressionObservation(snapshot.journalSuppressionConsecutive));

  return applyObservations(snapshot, previous, observations);
}

type Observation = {
  key: string;
  severity: AlertSeverity;
  reasonCode: string;
  activateAfter: number;
  recoverAfter: number;
};

function observation(
  key: string,
  severity: AlertSeverity,
  reasonCode: string,
  activateAfter = 1,
  recoverAfter = 1,
): Observation {
  return { key, severity, reasonCode, activateAfter, recoverAfter };
}

function healthObservation(status: HealthStatus): Observation {
  if (status === "unavailable") {
    return observation("runtime.health", "critical", "runtime_unavailable", 1, 2);
  }
  if (status === "degraded") {
    return observation("runtime.health", "warning", "runtime_degraded", 5, 2);
  }
  return observation("runtime.health", "ok", "runtime_healthy", 1, 2);
}

function ageObservation(
  key: string,
  timestamp: string | null,
  now: number,
  warningAge: number,
  criticalAge: number,
): Observation {
  const value = timestamp === null ? null : parseIso(timestamp);
  if (value === null || value > now) {
    return observation(key, "critical", "backup_marker_invalid");
  }
  const age = now - value;
  if (age >= criticalAge) {
    return observation(key, "critical", "backup_age_critical");
  }
  if (age >= warningAge) {
    return observation(key, "warning", "backup_age_warning");
  }
  return observation(key, "ok", "backup_age_ok");
}

function certificateObservation(expiresAt: string | null, now: number): Observation {
  if (expiresAt === null) {
    return observation("certificate.expiry", "ok", "certificate_monitoring_disabled");
  }
  const value = parseIso(expiresAt);
  if (value === null) {
    return observation("certificate.expiry", "critical", "certificate_expiry_invalid");
  }
  const remaining = value - now;
  if (remaining < 14 * DAY) {
    return observation("certificate.expiry", "critical", "certificate_expiry_critical");
  }
  if (remaining < 21 * DAY) {
    return observation("certificate.expiry", "warning", "certificate_expiry_warning");
  }
  return observation("certificate.expiry", "ok", "certificate_expiry_ok");
}

function capacityObservation(snapshot: MonitoringSnapshot): Observation {
  const values = [snapshot.journalUsedBytes, snapshot.journalMaxBytes, snapshot.filesystemFreeBytes];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0) || snapshot.journalMaxBytes === 0) {
    return observation("journal.capacity", "critical", "journal_capacity_invalid");
  }
  if (snapshot.filesystemFreeBytes <= 4 * GIB) {
    return observation("journal.capacity", "critical", "filesystem_free_critical");
  }
  if (
    snapshot.journalUsedBytes / snapshot.journalMaxBytes >= 0.8 ||
    snapshot.filesystemFreeBytes <= 5 * GIB
  ) {
    return observation("journal.capacity", "warning", "journal_capacity_warning");
  }
  return observation("journal.capacity", "ok", "journal_capacity_ok");
}

function suppressionObservation(consecutive: number): Observation {
  if (!Number.isSafeInteger(consecutive) || consecutive < 0) {
    return observation("journal.dropped", "critical", "journal_suppression_invalid", 1, 10);
  }
  if (consecutive >= 2) {
    return observation("journal.dropped", "critical", "journal_suppression_repeated", 1, 10);
  }
  if (consecutive === 1) {
    return observation("journal.dropped", "warning", "journal_suppression_detected", 1, 10);
  }
  return observation("journal.dropped", "ok", "journal_suppression_clear", 1, 10);
}

function applyObservations(
  snapshot: MonitoringSnapshot,
  previous: AlertStates,
  observations: Observation[],
): { states: AlertStates; notifications: AlertNotification[] } {
  const now = requireIso(snapshot.now);
  const states = { ...previous };
  const notifications: AlertNotification[] = [];

  for (const item of observations) {
    const prior = previous[item.key] ?? initialState(snapshot.now);
    const sameCandidate = prior.candidate === item.severity;
    const candidateCount = prior.severity === item.severity ? 0 : sameCandidate ? prior.candidateCount + 1 : 1;
    const candidateFirstObservedAt =
      prior.severity === item.severity
        ? null
        : sameCandidate
          ? prior.candidateFirstObservedAt
          : snapshot.observedAt;
    const threshold = item.severity === "ok" ? item.recoverAfter : item.activateAfter;

    if (prior.severity !== item.severity && candidateCount >= threshold) {
      const firstObservedAt =
        item.severity === "ok"
          ? null
          : prior.firstObservedAt ?? candidateFirstObservedAt ?? snapshot.observedAt;
      const notificationFirstObservedAt =
        item.severity === "ok"
          ? prior.firstObservedAt ?? snapshot.observedAt
          : firstObservedAt ?? snapshot.observedAt;
      const next: AlertState = {
        severity: item.severity,
        candidate: item.severity,
        candidateCount: 0,
        candidateFirstObservedAt: null,
        firstObservedAt,
        lastObservedAt: snapshot.observedAt,
        lastNotifiedAt: snapshot.now,
        reasonCode: item.reasonCode,
      };
      states[item.key] = next;
      notifications.push(notification(snapshot, item, notificationFirstObservedAt));
      continue;
    }

    const next: AlertState = {
      severity: prior.severity,
      candidate: item.severity,
      candidateCount,
      candidateFirstObservedAt,
      firstObservedAt: prior.firstObservedAt,
      lastObservedAt: snapshot.observedAt,
      lastNotifiedAt: prior.lastNotifiedAt,
      reasonCode: prior.severity === item.severity ? item.reasonCode : prior.reasonCode,
    };
    if (
      prior.severity === "critical" &&
      item.severity === "critical" &&
      (prior.lastNotifiedAt === null || now - requireIso(prior.lastNotifiedAt) >= 6 * HOUR)
    ) {
      next.lastNotifiedAt = snapshot.now;
      notifications.push(
        notification(snapshot, item, prior.firstObservedAt ?? snapshot.observedAt),
      );
    }
    states[item.key] = next;
  }

  return { states, notifications };
}

function notification(
  snapshot: MonitoringSnapshot,
  item: Observation,
  firstObservedAt: string,
): AlertNotification {
  return {
    severity: item.severity,
    alert_key: item.key,
    state: item.severity === "ok" ? "resolved" : "firing",
    first_observed_at: firstObservedAt,
    last_observed_at: snapshot.observedAt,
    reason_code: item.reasonCode,
    service_version: snapshot.serviceVersion,
    allowed_mentions: { parse: [] },
  };
}

function initialState(now: string): AlertState {
  return {
    severity: "ok",
    candidate: "ok",
    candidateCount: 0,
    candidateFirstObservedAt: null,
    firstObservedAt: null,
    lastObservedAt: now,
    lastNotifiedAt: null,
    reasonCode: "not_observed",
  };
}

function parseIso(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireIso(value: string): number {
  const parsed = parseIso(value);
  if (parsed === null || new Date(parsed).toISOString() !== value) {
    throw new Error("invalid_timestamp");
  }
  return parsed;
}

function requireToken(value: string): void {
  if (!SAFE_TOKEN.test(value)) {
    throw new Error("invalid_operational_event");
  }
}
