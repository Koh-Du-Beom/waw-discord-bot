#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SERVER_FIELDS = new Set(["id", "application_id", "guild_id", "version"]);

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readGuildId(source) {
  const matches = [...source.matchAll(
    /^[ \t]*(?:export[ \t]+)?WAW_DISCORD_GUILD_ID[ \t]*=[ \t]*['"]?([1-9][0-9]{16,19})['"]?[ \t]*$/gmu,
  )];
  if (matches.length !== 1 || !SNOWFLAKE.test(matches[0]?.[1] ?? "")) {
    throw new Error("guild_configuration_invalid");
  }
  return matches[0][1];
}

function writable(value) {
  if (Array.isArray(value)) return value.map(writable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !SERVER_FIELDS.has(key) && entry !== undefined)
      .map(([key, entry]) => [key, writable(entry)]),
  );
}

export function schemasMatch(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length &&
      expected.every((entry, index) => schemasMatch(entry, actual[index]));
  }
  if (!expected || typeof expected !== "object") return Object.is(expected, actual);
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  for (const key of ["options", "choices"]) {
    if (!(key in expected) && Array.isArray(actual[key]) && actual[key].length > 0) return false;
  }
  return Object.entries(expected).every(([key, value]) =>
    (key === "required" && value === false && !(key in actual)) || schemasMatch(value, actual[key])
  );
}

function expectedNames(value) {
  const names = value.split(",");
  if (names.some((name) => !name || name.trim() !== name) || new Set(names).size !== names.length) {
    throw new Error("expected_current_names_invalid");
  }
  return names;
}

function namesMatch(commands, names) {
  return Array.isArray(commands) && commands.length === names.length &&
    names.every((name) => commands.some((command) => command?.name === name));
}

function commandSetsMatch(expected, actual) {
  return Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length &&
    expected.every((command) => {
      const matches = actual.filter(
        (candidate) => candidate?.type === command?.type && candidate?.name === command?.name,
      );
      return matches.length === 1 && schemasMatch(command, matches[0]);
    });
}

class DiscordHttpError extends Error {
  constructor(readonlyStatus) {
    super("discord_http_failed");
    this.status = readonlyStatus;
  }
}

async function request(path, token, method = "GET", body) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new DiscordHttpError(response.status);
  const text = await response.text();
  if (Buffer.byteLength(text) > 1_048_576) throw new Error("discord_response_invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("discord_response_invalid");
  }
}

async function configuration() {
  const [environment, rawToken] = await Promise.all([
    readFile("/etc/waw/bot.env", "utf8"),
    readFile("/etc/waw-credentials/bot-discord-token", "utf8"),
  ]);
  const token = rawToken.trim();
  if (token.length < 20 || /[\r\n\0]/u.test(token)) {
    throw new Error("discord_credential_invalid");
  }
  const guildId = readGuildId(environment);
  const user = await request("/users/@me", token);
  if (!SNOWFLAKE.test(user?.id ?? "")) throw new Error("discord_identity_invalid");
  return {
    token,
    route: `/applications/${user.id}/guilds/${guildId}/commands`,
  };
}

async function desiredCommands(expectedHash) {
  if (!SHA256.test(expectedHash ?? "")) throw new Error("expected_hash_invalid");
  const module = await import(new URL("../dist/server/commands/slash-commands.js", import.meta.url));
  const commands = writable(module.WAW_SLASH_COMMANDS);
  if (!Array.isArray(commands) || commands.length === 0 || sha256(commands) !== expectedHash) {
    throw new Error("desired_commands_mismatch");
  }
  return commands;
}

async function verify(expectedHash) {
  const desired = await desiredCommands(expectedHash);
  const { token, route } = await configuration();
  const current = await request(route, token);
  if (!commandSetsMatch(desired, current)) throw new Error("command_schema_mismatch");
  process.stdout.write(`discord_commands_verified roots=${desired.length} sha256=${expectedHash}\n`);
}

async function payload(expectedHash) {
  const desired = await desiredCommands(expectedHash);
  process.stdout.write(
    `discord_commands_payload roots=${desired.length} bytes=${Buffer.byteLength(JSON.stringify(desired))} sha256=${expectedHash}\n`,
  );
}

async function register(expectedHash, backupPath, currentNames) {
  if (!backupPath?.startsWith("/")) throw new Error("backup_path_invalid");
  const desired = await desiredCommands(expectedHash);
  const expectedCurrent = expectedNames(currentNames ?? "");
  const { token, route } = await configuration();
  const previous = writable(await request(route, token));
  if (!namesMatch(previous, expectedCurrent)) throw new Error("current_commands_mismatch");
  await writeFile(backupPath, JSON.stringify(previous), { encoding: "utf8", flag: "wx", mode: 0o600 });

  let changed = false;
  try {
    changed = true;
    await request(route, token, "PUT", desired);
    const current = await request(route, token);
    if (!commandSetsMatch(desired, current)) throw new Error("command_schema_mismatch");
  } catch (error) {
    if (changed) {
      try {
        await request(route, token, "PUT", previous);
        const restored = await request(route, token);
        if (!commandSetsMatch(previous, restored)) throw new Error("rollback_mismatch");
        process.stderr.write("discord_commands_register_failed rollback=PASS\n");
      } catch {
        process.stderr.write("discord_commands_register_failed rollback=FAIL\n");
      }
    }
    throw error;
  }
  process.stdout.write(`discord_commands_registered roots=${desired.length} sha256=${expectedHash}\n`);
}

async function restore(backupPath) {
  if (!backupPath?.startsWith("/")) throw new Error("backup_path_invalid");
  const previous = writable(JSON.parse(await readFile(backupPath, "utf8")));
  if (!Array.isArray(previous)) throw new Error("backup_invalid");
  const { token, route } = await configuration();
  await request(route, token, "PUT", previous);
  const current = await request(route, token);
  if (!commandSetsMatch(previous, current)) throw new Error("rollback_mismatch");
  process.stdout.write(`discord_commands_restored roots=${previous.length}\n`);
}

function selfTest() {
  const desired = [{ type: 1, name: "크보", description: "KBO", options: [
    { type: 2, name: "베팅", description: "bet", options: [
      { type: 1, name: "가입", description: "join" },
    ] },
  ] }];
  const actual = [{
    id: "100000000000000000",
    application_id: "200000000000000000",
    version: "300000000000000000",
    ...desired[0],
  }];
  assert.equal(schemasMatch(desired, actual), true);
  assert.equal(schemasMatch({ type: 3, name: "optional", required: false }, {
    type: 3,
    name: "optional",
  }), true);
  assert.equal(schemasMatch({ type: 3, name: "required", required: true }, {
    type: 3,
    name: "required",
  }), false);
  assert.equal(schemasMatch(desired, [{ ...actual[0], options: [] }]), false);
  assert.equal(schemasMatch(desired, [{ ...actual[0], options: [
    ...actual[0].options,
    { type: 1, name: "추가", description: "extra" },
  ] }]), false);
  assert.equal(sha256(writable(actual)), sha256(desired));
  assert.equal(commandSetsMatch([...desired, { type: 1, name: "도움말", description: "help" }], [
    { type: 1, name: "도움말", description: "help" },
    ...actual,
  ]), true);
  process.stdout.write("discord_commands_manager_self_test_pass\n");
}

function failureReason(error) {
  if (error instanceof DiscordHttpError) {
    if (error.status === 401) return "authentication";
    if (error.status === 403) return "authorization";
    if (error.status === 429) return "rate_limit";
    return "discord_api";
  }
  return error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
    ? error.message
    : "local_or_other";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, first, second, third] = process.argv.slice(2);
  const operation = action === "--self-test"
    ? Promise.resolve(selfTest())
    : action === "payload"
    ? payload(first)
    : action === "verify"
    ? verify(first)
    : action === "register"
    ? register(first, second, third)
    : action === "restore"
    ? restore(first)
    : Promise.reject(new Error("action_invalid"));
  operation.catch((error) => {
    process.stderr.write(`discord_commands_failed reason=${failureReason(error)}\n`);
    process.exitCode = 1;
  });
}
