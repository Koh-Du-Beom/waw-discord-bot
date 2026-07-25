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
const DISCORD_COLORS = {
  ok: 0x57f287,
  warning: 0xfee75c,
  critical: 0xed4245,
} as const;

const ALERT_NAMES: Readonly<Record<string, string>> = {
  "monitor.input": "모니터 입력",
  "runtime.health": "애플리케이션",
  "backup.age": "백업",
  "certificate.expiry": "인증서",
  "journal.capacity": "로그 저장 공간",
  "journal.dropped": "시스템 로그",
  "service.waw-web.service": "웹 서비스",
  "service.waw-bot.service": "Discord 봇",
  "service.waw-backup.timer": "백업 스케줄",
  "service.waw-monitor.timer": "모니터링 스케줄",
  "service.caddy.service": "웹 보안 연결",
};

const REASON_MESSAGES: Readonly<Record<string, string>> = {
  monitor_input_stale: "모니터링 정보가 제때 갱신되지 않았습니다.",
  monitor_units_invalid: "확인할 서비스 목록이 올바르지 않습니다.",
  service_inactive: "서비스가 실행 중이 아닙니다.",
  runtime_unavailable: "애플리케이션에 연결할 수 없습니다.",
  runtime_degraded: "애플리케이션 일부 기능이 원활하지 않습니다.",
  backup_marker_invalid: "최근 백업 완료 기록을 확인할 수 없습니다.",
  backup_age_critical: "마지막 백업 후 24시간 이상 지났습니다.",
  backup_age_warning: "마지막 백업 후 20시간 이상 지났습니다.",
  certificate_expiry_invalid: "인증서 만료일을 확인할 수 없습니다.",
  certificate_expiry_critical: "인증서 만료까지 14일 미만 남았습니다.",
  certificate_expiry_warning: "인증서 만료까지 21일 미만 남았습니다.",
  journal_capacity_invalid: "로그 저장 공간 정보를 확인할 수 없습니다.",
  filesystem_free_critical: "서버의 남은 저장 공간이 4GiB 이하입니다.",
  journal_capacity_warning: "로그 사용량이 높거나 서버의 남은 공간이 부족합니다.",
  journal_suppression_invalid: "누락된 시스템 로그 수를 확인할 수 없습니다.",
  journal_suppression_repeated: "시스템 로그 누락이 반복해서 감지됐습니다.",
  journal_suppression_detected: "시스템 로그 일부가 누락됐습니다.",
};

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

  const payload = JSON.stringify(formatDiscordNotification(notification));
  if (payload.includes("@") || Buffer.byteLength(payload) > 1_800) {
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

export function formatDiscordNotification(notification: AlertNotification): {
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    footer: { text: string };
  }>;
  allowed_mentions: { parse: [] };
} {
  const alertName = alertDisplayName(notification.alert_key);
  const resolved = notification.state === "resolved";
  const severityLabel =
    notification.severity === "critical"
      ? "긴급"
      : notification.severity === "warning"
        ? "주의"
        : "정상";
  const icon = resolved ? "🟢" : notification.severity === "critical" ? "🔴" : "🟡";
  const stateLabel = resolved ? "정상 복구" : "문제 발생";
  const description = resolved
    ? `${alertName} 문제가 해소되어 정상 상태로 돌아왔습니다.`
    : notification.reason_code === "service_inactive"
      ? `${alertName} 실행이 중단됐습니다.`
      : (REASON_MESSAGES[notification.reason_code] ??
        `알 수 없는 원인이 감지됐습니다. (${notification.reason_code})`);

  return {
    embeds: [
      {
        title: `${icon} ${alertName} ${resolved ? "정상 복구" : alertTitleSuffix(notification.alert_key)}`,
        description,
        color: DISCORD_COLORS[notification.severity],
        fields: [
          { name: "상태", value: stateLabel, inline: true },
          { name: "심각도", value: severityLabel, inline: true },
          {
            name: "최초 감지",
            value: discordTimestamp(notification.first_observed_at, "F"),
            inline: false,
          },
          {
            name: "최근 확인",
            value: discordTimestamp(notification.last_observed_at, "R"),
            inline: false,
          },
        ],
        footer: {
          text: `${technicalAlertName(notification.alert_key)} · ${notification.service_version}`,
        },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

function alertDisplayName(alertKey: string): string {
  if (ALERT_NAMES[alertKey]) return ALERT_NAMES[alertKey];
  if (alertKey.startsWith("service.")) {
    return `${alertKey.slice("service.".length).replace(/\.service$|\.timer$/, "")} 서비스`;
  }
  return "운영 모니터링";
}

function alertTitleSuffix(alertKey: string): string {
  if (alertKey.startsWith("service.")) return "중단";
  if (alertKey === "backup.age") return "지연";
  if (alertKey === "certificate.expiry") return "만료 임박";
  if (alertKey === "journal.capacity") return "용량 부족";
  if (alertKey === "journal.dropped") return "누락";
  return "이상 감지";
}

function technicalAlertName(alertKey: string): string {
  return alertKey.startsWith("service.") ? alertKey.slice("service.".length) : alertKey;
}

function discordTimestamp(value: string, style: "F" | "R"): string {
  return `<t:${Math.floor(Date.parse(value) / 1_000)}:${style}>`;
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
