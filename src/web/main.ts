import path from "node:path";

import { Pool } from "pg";

import { createDiscordOAuthIdentityProvider } from "../adapters/discord/oauth-identity.ts";
import { createAuthService } from "../auth/auth-service.ts";
import { createMemberRoleIpcClient } from "../auth/member-role-ipc.ts";
import { parseAuthConfiguration } from "../auth/oauth-configuration.ts";
import { buildDashboardServer } from "../http/dashboard-server.ts";
import {
  parseWebListenConfiguration,
  startDashboardWebServer,
} from "../http/web-entrypoint.ts";
import {
  readDatabaseUrlCredential,
  readSystemdCredential,
} from "../persistence/database-credential.ts";
import { PostgresPersistence } from "../persistence/postgres-persistence.ts";
import { createProductionDashboardPorts } from "./production-dashboard-ports.ts";
import { createAdminCommandIpcClient } from "../ipc/admin-command-ipc.ts";
import { adminCommandFeatureEnabled } from "../ipc/admin-command-feature.ts";
import { dashboardQuotaEnabled } from "../summary/quota-feature.ts";

const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
const [databaseUrl, clientSecret, csrfKey] = await Promise.all([
  readDatabaseUrlCredential(credentialsDirectory),
  readSystemdCredential(
    credentialsDirectory,
    "oauth-client-secret",
    "oauth_client_secret",
  ),
  readSystemdCredential(credentialsDirectory, "csrf-key", "csrf_key"),
]);
const configuration = parseAuthConfiguration({
  clientSecret,
  ...optionalEnvironment("environment", "WAW_AUTH_ENVIRONMENT"),
  ...optionalEnvironment("clientId", "WAW_DISCORD_CLIENT_ID"),
  ...optionalEnvironment("redirectUri", "WAW_DISCORD_REDIRECT_URI"),
  ...optionalEnvironment("allowedOrigin", "WAW_ALLOWED_ORIGIN"),
  ...optionalEnvironment("allowedGuildId", "WAW_DISCORD_GUILD_ID"),
  ...optionalEnvironment("operatorRoleIds", "WAW_DISCORD_OPERATOR_ROLE_IDS"),
  ...optionalEnvironment(
    "administratorRoleIds",
    "WAW_DISCORD_ADMINISTRATOR_ROLE_IDS",
  ),
  ...optionalEnvironment(
    "providerTimeoutMilliseconds",
    "WAW_DISCORD_TIMEOUT_MS",
  ),
});
if (!configuration.enabled) {
  throw new Error("production authentication must be enabled");
}
const listenConfiguration = parseWebListenConfiguration(process.env);
const pool = new Pool({
  connectionString: databaseUrl,
  application_name: "waw-web",
  max: 4,
  connectionTimeoutMillis: 3_000,
  statement_timeout: 3_000,
  idleTimeoutMillis: 30_000,
});
const persistence = new PostgresPersistence(pool);
const auth = createAuthService({
  configuration,
  provider: createDiscordOAuthIdentityProvider(configuration),
  authorizationReader: createMemberRoleIpcClient({
    socketPath:
      process.env.WAW_MEMBER_ROLE_SOCKET ??
      "/run/waw-member-role/member-role.sock",
  }),
  persistence,
  csrfKey,
});
const app = buildDashboardServer({
  auth,
  ports: createProductionDashboardPorts({
    pool,
    backupMarkerPath:
      process.env.WAW_BACKUP_MARKER_PATH ??
      "/var/lib/waw-backup/last-published.json",
    botHealthPath:
      process.env.WAW_BOT_HEALTH_PATH ?? "/run/waw-bot/health.json",
    ...(adminCommandFeatureEnabled(process.env.WAW_ADMIN_COMMAND_IPC_ENABLED)
      ? {
          adminCommand: {
            transport: createAdminCommandIpcClient({
              socketPath:
                process.env.WAW_ADMIN_COMMAND_SOCKET ??
                "/run/waw-admin-command/admin-command.sock",
            }),
            guildId: configuration.allowedGuildId,
          },
        }
      : {}),
  }),
  serviceVersion: process.env.WAW_SERVICE_VERSION ?? "unknown",
  callbackOrigin: configuration.allowedOrigin,
  summaryQuotaDashboardEnabled: dashboardQuotaEnabled(
    process.env.WAW_DASHBOARD_QUOTA_ENABLED,
  ),
  spaRoot: path.resolve(import.meta.dirname, "../../web"),
  operationalLog(event) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
});
const running = await startDashboardWebServer(app, listenConfiguration);
process.stdout.write(
  `${JSON.stringify({
    event_type: "service.started",
    service: "web",
    address: running.address,
  })}\n`,
);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await running.close();
  await pool.end();
}
process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
process.once("SIGINT", () => void stop().then(() => process.exit(0)));

function optionalEnvironment<Key extends string>(
  key: Key,
  environmentName: string,
): Partial<Record<Key, string>> {
  const value = process.env[environmentName];
  return value === undefined ? {} : { [key]: value } as Record<Key, string>;
}
