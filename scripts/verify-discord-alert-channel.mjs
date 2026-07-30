#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ADMINISTRATOR = 1n << 3n;
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;

function applyOverwrite(permissions, overwrite) {
  return (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
}

export function resolvesAlertPermissions({ guildId, userId, memberRoleIds, roles, overwrites }) {
  const everyone = roles.find((role) => role.id === guildId);
  if (!everyone) return false;
  let permissions = BigInt(everyone.permissions);
  for (const role of roles) {
    if (memberRoleIds.includes(role.id)) permissions |= BigInt(role.permissions);
  }
  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) return true;

  const everyoneOverwrite = overwrites.find(
    (overwrite) => overwrite.type === 0 && overwrite.id === guildId,
  );
  if (everyoneOverwrite) permissions = applyOverwrite(permissions, everyoneOverwrite);

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === 0 && memberRoleIds.includes(overwrite.id)) {
      roleAllow |= BigInt(overwrite.allow);
      roleDeny |= BigInt(overwrite.deny);
    }
  }
  permissions = (permissions & ~roleDeny) | roleAllow;

  const memberOverwrite = overwrites.find(
    (overwrite) => overwrite.type === 1 && overwrite.id === userId,
  );
  if (memberOverwrite) permissions = applyOverwrite(permissions, memberOverwrite);
  return (
    (permissions & VIEW_CHANNEL) === VIEW_CHANNEL &&
    (permissions & SEND_MESSAGES) === SEND_MESSAGES
  );
}

function readExactEnvironment(source, name) {
  const pattern = new RegExp(
    `^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*['\"]?([1-9][0-9]{16,19})['\"]?[ \\t]*$`,
    "gmu",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || !SNOWFLAKE.test(matches[0]?.[1] ?? "")) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return matches[0][1];
}

async function fetchJson(path, token) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("discord_api_unavailable");
  const text = await response.text();
  if (Buffer.byteLength(text) > 1_048_576) throw new Error("discord_response_invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("discord_response_invalid");
  }
}

async function verify(environmentFile, tokenFile) {
  const [environment, rawToken] = await Promise.all([
    readFile(environmentFile, "utf8"),
    readFile(tokenFile, "utf8"),
  ]);
  const guildId = readExactEnvironment(environment, "WAW_DISCORD_GUILD_ID");
  const channelId = readExactEnvironment(environment, "WAW_GAME_ALERT_CHANNEL_ID");
  const token = rawToken.trim();
  if (!token || /[\r\n\0]/u.test(token)) throw new Error("discord_credential_invalid");

  const user = await fetchJson("/users/@me", token);
  if (!SNOWFLAKE.test(user?.id ?? "")) throw new Error("discord_response_invalid");
  const [member, roles, channel] = await Promise.all([
    fetchJson(`/guilds/${guildId}/members/${user.id}`, token),
    fetchJson(`/guilds/${guildId}/roles`, token),
    fetchJson(`/channels/${channelId}`, token),
  ]);
  if (
    !Array.isArray(member?.roles) ||
    !Array.isArray(roles) ||
    channel?.guild_id !== guildId ||
    ![0, 5].includes(channel?.type) ||
    !Array.isArray(channel?.permission_overwrites)
  ) {
    throw new Error("discord_response_invalid");
  }
  if (
    !resolvesAlertPermissions({
      guildId,
      userId: user.id,
      memberRoleIds: member.roles,
      roles,
      overwrites: channel.permission_overwrites,
    })
  ) {
    throw new Error("discord_alert_channel_permission_denied");
  }
}

function selfTest() {
  const guildId = "100000000000000000";
  const userId = "200000000000000000";
  const roleId = "300000000000000000";
  const roles = [
    { id: guildId, permissions: String(VIEW_CHANNEL) },
    { id: roleId, permissions: String(SEND_MESSAGES) },
  ];
  assert.equal(
    resolvesAlertPermissions({
      guildId,
      userId,
      memberRoleIds: [roleId],
      roles,
      overwrites: [],
    }),
    true,
  );
  assert.equal(
    resolvesAlertPermissions({
      guildId,
      userId,
      memberRoleIds: [roleId],
      roles,
      overwrites: [
        { id: userId, type: 1, allow: "0", deny: String(SEND_MESSAGES) },
      ],
    }),
    false,
  );
  process.stdout.write("discord_alert_channel_self_test_pass\n");
}

if (
  process.argv[1] === "-" ||
  (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
) {
  if (process.argv[2] === "--self-test") {
    selfTest();
  } else {
    verify(
      process.argv[2] ?? "/etc/waw/bot.env",
      process.argv[3] ?? "/etc/waw-credentials/bot-discord-token",
    ).then(
      () => process.stdout.write("discord_alert_channel_preflight_pass\n"),
      (error) => {
        const reason =
          error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
            ? error.message
            : "discord_alert_channel_preflight_failed";
        process.stderr.write(`discord_alert_channel_preflight_failed reason=${reason}\n`);
        process.exitCode = 1;
      },
    );
  }
}
