import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { mkdir, readFile, rename, statfs, writeFile } from "node:fs/promises";
import { connect } from "node:tls";
import { pathToFileURL } from "node:url";

import {
  evaluateMonitoring,
  type AlertNotification,
  type AlertStates,
  type MonitoringSnapshot,
} from "./monitoring.ts";

const CONFIG_PATH = "/etc/waw-monitor/config.json";
const STATE_PATH = "/var/lib/waw-monitor/state.json";
const SAFE_TOKEN = /^[A-Za-z0-9._:@/+-]{1,128}$/;

type MonitorConfig = {
  serviceVersion: string;
  expectedUnits: string[];
  healthUrl: string | null;
  backupMarker: string;
  certificateHost: "waw.dubeom.com" | null;
  journalPath: "/var/log/journal";
};

export async function deliverNotification(
  endpoint: string,
  notification: AlertNotification,
  allowLoopback = false,
): Promise<void> {
  const url = new URL(endpoint);
  const discord =
    url.protocol === "https:" &&
    url.hostname === "discord.com" &&
    url.pathname.startsWith("/api/webhooks/");
  const loopback =
    allowLoopback && url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((!discord && !loopback) || url.username || url.password || url.search || url.hash) {
    throw new Error("delivery_endpoint_invalid");
  }

  const content = [
    `severity=${notification.severity}`,
    `alert_key=${notification.alert_key}`,
    `state=${notification.state}`,
    `first_observed_at=${notification.first_observed_at}`,
    `last_observed_at=${notification.last_observed_at}`,
    `reason_code=${notification.reason_code}`,
    `service_version=${notification.service_version}`,
  ].join(" ");
  const payload = JSON.stringify({ content, allowed_mentions: { parse: [] } });
  if (content.includes("@") || Buffer.byteLength(payload) > 1_800) {
    throw new Error("delivery_payload_invalid");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new Error("delivery_failed");
    }
    if (response.ok) return;
    if (response.status !== 429 || attempt === 1) throw new Error("delivery_failed");
    const retryAfter = Number(response.headers.get("retry-after"));
    if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 5) {
      throw new Error("delivery_failed");
    }
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
  }
}

async function main(): Promise<void> {
  const fixturePath = process.env.WAW_MONITOR_FIXTURE;
  if (fixturePath && process.env.WAW_MONITOR_ALLOW_FIXTURE !== "1") {
    throw new Error("fixture_not_allowed");
  }
  const statePath = process.env.WAW_MONITOR_STATE ?? STATE_PATH;
  const snapshot = fixturePath
    ? (JSON.parse(await readFile(fixturePath, "utf8")) as MonitoringSnapshot)
    : await observeHost(process.env.WAW_MONITOR_CONFIG ?? CONFIG_PATH);
  const previous = await readStates(statePath);
  const result = evaluateMonitoring(snapshot, previous);

  if (result.notifications.length > 0) {
    const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
    if (!credentialsDirectory) throw new Error("credential_unavailable");
    const endpoint = (await readFile(`${credentialsDirectory}/discord-webhook`, "utf8")).trim();
    for (const notification of result.notifications) {
      await deliverNotification(
        endpoint,
        notification,
        process.env.WAW_MONITOR_ALLOW_LOOPBACK === "1",
      );
    }
  }

  await writeStates(statePath, result.states);
  console.log(`monitor_complete notifications=${result.notifications.length}`);
}

async function observeHost(configPath: string): Promise<MonitoringSnapshot> {
  const config = await readConfig(configPath);
  const now = new Date().toISOString();
  const expectedUnits = Object.fromEntries(
    config.expectedUnits.map((unit) => [unit, unitActive(unit)]),
  );
  const journalUsedBytes = journalBytes(config.journalPath);
  let filesystemFreeBytes = -1;
  try {
    const filesystem = await statfs(config.journalPath);
    filesystemFreeBytes = filesystem.bavail * filesystem.bsize;
  } catch {
    // Invalid metrics fail closed in evaluateMonitoring.
  }

  return {
    now,
    observedAt: now,
    serviceVersion: config.serviceVersion,
    expectedUnits,
    runtimeHealth: config.healthUrl === null ? null : await runtimeHealth(config.healthUrl),
    lastBackupPublishedAt: await backupPublishedAt(config.backupMarker),
    certificateExpiresAt: await certificateExpiry(config.certificateHost),
    journalUsedBytes,
    journalMaxBytes: 1024 ** 3,
    filesystemFreeBytes,
    journalSuppressionConsecutive: journalSuppressionCount(),
  };
}

async function readConfig(path: string): Promise<MonitorConfig> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<MonitorConfig>;
  const health =
    typeof value.healthUrl === "string"
      ? new URL(value.healthUrl)
      : value.healthUrl === null
        ? null
        : undefined;
  if (
    typeof value.serviceVersion !== "string" ||
    !SAFE_TOKEN.test(value.serviceVersion) ||
    !Array.isArray(value.expectedUnits) ||
    value.expectedUnits.length === 0 ||
    !value.expectedUnits.every((unit) => typeof unit === "string" && SAFE_TOKEN.test(unit)) ||
    health === undefined ||
    (health !== null &&
      (health.protocol !== "http:" ||
        health.hostname !== "127.0.0.1" ||
        health.pathname !== "/health" ||
        health.search !== "" ||
        health.hash !== "")) ||
    typeof value.backupMarker !== "string" ||
    !value.backupMarker.startsWith("/var/lib/waw-backup/") ||
    (value.certificateHost !== null && value.certificateHost !== "waw.dubeom.com") ||
    value.journalPath !== "/var/log/journal"
  ) {
    throw new Error("monitor_config_invalid");
  }
  return value as MonitorConfig;
}

function unitActive(unit: string): boolean {
  try {
    execFileSync("systemctl", ["is-active", "--quiet", unit], {
      stdio: "ignore",
      timeout: 3_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function runtimeHealth(url: string): Promise<MonitoringSnapshot["runtimeHealth"]> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return "unavailable";
    const value = (await response.json()) as { status?: unknown };
    return value.status === "healthy" || value.status === "degraded" || value.status === "unavailable"
      ? value.status
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function backupPublishedAt(path: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { completedAt?: unknown };
    return typeof value.completedAt === "string" ? value.completedAt : null;
  } catch {
    return null;
  }
}

async function certificateExpiry(host: MonitorConfig["certificateHost"]): Promise<string | null> {
  if (host === null) return null;
  return new Promise((resolve) => {
    const socket = connect(
      { host: "127.0.0.1", port: 443, servername: host, rejectUnauthorized: true },
      () => {
        const validTo = socket.getPeerCertificate().valid_to;
        socket.destroy();
        const parsed = Date.parse(validTo);
        resolve(Number.isFinite(parsed) ? new Date(parsed).toISOString() : "invalid");
      },
    );
    socket.setTimeout(3_000, () => socket.destroy(new Error("timeout")));
    socket.once("error", () => resolve("invalid"));
  });
}

function journalBytes(path: string): number {
  try {
    const output = execFileSync("du", ["-sb", "--", path], {
      encoding: "utf8",
      timeout: 3_000,
    });
    return Number(output.split(/\s+/, 1)[0]);
  } catch {
    return -1;
  }
}

type JournalctlRunner = () => string;

export function journalSuppressionCount(
  run: JournalctlRunner = () =>
    execFileSync(
      "journalctl",
      ["--quiet", "--since=-2min", "--grep=Suppressed [0-9]+ messages", "--output=cat", "--no-pager"],
      { encoding: "utf8", timeout: 3_000 },
    ),
): number {
  try {
    const output = run();
    return Math.min(2, output.split("\n").filter(Boolean).length);
  } catch (error) {
    const failure = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
    if (failure.status === 1 && failure.stdout === "" && failure.stderr === "") return 0;
    return -1;
  }
}

async function readStates(path: string): Promise<AlertStates> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as AlertStates;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("monitor_state_invalid");
  }
}

async function writeStates(path: string, states: AlertStates): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(states)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("monitor_failed");
    process.exitCode = 1;
  });
}
