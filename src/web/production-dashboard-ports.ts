import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

import type {
  DashboardOverviewDto,
} from "../contracts/dashboard.ts";
import type { DashboardHttpPorts } from "../http/dashboard-server.ts";
import { PostgresDashboardStore } from "../persistence/dashboard-store.ts";
import { evaluateRuntimeHealth } from "../runtime/health.ts";

export function createProductionDashboardPorts(input: {
  pool: Pool;
  backupMarkerPath: string;
  botHealthPath: string;
}): DashboardHttpPorts {
  const store = new PostgresDashboardStore(input.pool);
  return {
    async readDisplayName() {
      return "Discord 운영자";
    },
    async readOverview() {
      return readOverview(input);
    },
    async readSettings() {
      return store.readSettings();
    },
    async updateSettings(update) {
      return store.updateSettings(update);
    },
    async readAudit() {
      return store.readAudit();
    },
  };
}

async function readOverview(input: {
  pool: Pool;
  backupMarkerPath: string;
  botHealthPath: string;
}): Promise<DashboardOverviewDto> {
  const [storageAvailable, bot, backup] = await Promise.all([
    input.pool.query("select 1").then(
      () => true,
      () => false,
    ),
    readBotHealth(input.botHealthPath),
    readBackupMarker(input.backupMarkerPath),
  ]);
  const health = evaluateRuntimeHealth({
    webProcessRunning: true,
    storageAvailable,
    botProcessRunning: bot.running,
    gatewayState: bot.gatewayState,
  });
  return {
    health: {
      status: health.status,
      gateway: {
        status:
          health.bot === "connected"
            ? "connected"
            : health.bot === "degraded"
              ? "degraded"
              : "unavailable",
      },
      storage: {
        status: storageAvailable ? "connected" : "unavailable",
      },
    },
    lastBackup: backup,
  };
}

async function readBotHealth(
  path: string,
): Promise<{
  running: boolean;
  gatewayState: "connected" | "disconnected" | "unknown";
}> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Object.keys(parsed).sort().join(",") !==
        "gatewayState,observedAt,running" ||
      (parsed as { running?: unknown }).running !== true ||
      !["connected", "disconnected", "unknown"].includes(
        String((parsed as { gatewayState?: unknown }).gatewayState),
      ) ||
      !isRecentIsoDate((parsed as { observedAt?: unknown }).observedAt, 60_000)
    ) {
      return { running: false, gatewayState: "unknown" };
    }
    return {
      running: true,
      gatewayState: (parsed as {
        gatewayState: "connected" | "disconnected" | "unknown";
      }).gatewayState,
    };
  } catch {
    return { running: false, gatewayState: "unknown" };
  }
}

async function readBackupMarker(
  path: string,
): Promise<DashboardOverviewDto["lastBackup"]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return { status: "unknown", completedAt: null };
    }
    const value = parsed as {
      status?: unknown;
      completedAt?: unknown;
    };
    if (
      (value.status !== "published" && value.status !== "failed") ||
      typeof value.completedAt !== "string" ||
      !Number.isFinite(Date.parse(value.completedAt))
    ) {
      return { status: "unknown", completedAt: null };
    }
    return { status: value.status, completedAt: value.completedAt };
  } catch {
    return { status: "unknown", completedAt: null };
  }
}

function isRecentIsoDate(value: unknown, maximumAgeMilliseconds: number): boolean {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maximumAgeMilliseconds;
}
