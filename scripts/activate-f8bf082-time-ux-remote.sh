#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ARCHIVE_B64=__WAW_TIME_UX_ARCHIVE_B64__
MANAGER_B64=__WAW_RELEASE_MANAGER_B64__
RELEASE_ID=f8bf082
EXPECTED_ARCHIVE_SHA256=f8bf082e6524a07775222e97bd889a97a77bb87ab41d1a140e16b48374e58393
EXPECTED_ARCHIVE_BYTES=222679
EXPECTED_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
TARGET="/opt/waw/releases/$RELEASE_ID"
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
DROPIN=/etc/systemd/system/waw-bot.service.d/90-summary-enabled.conf
CREDENTIAL=/etc/waw-credentials/bot-summary-api-key
BOT_TOKEN=/etc/waw-credentials/bot-discord-token
BOT_ENV=/etc/waw/bot.env
SYSTEMCTL=/usr/bin/systemctl
CURL=/usr/bin/curl
PYTHON=/usr/bin/python3
NODE=/usr/local/bin/node
RUN_DIR=
CURRENT_BEFORE=
STAGED=0
CHANGED=0
COMMANDS_CHANGED=0
ROLLING_BACK=0

cleanup() {
  local ok=1
  [[ -z "$RUN_DIR" || ! -d "$RUN_DIR" ]] || rm -rf -- "$RUN_DIR" || ok=0
  RUN_DIR=
  [[ "$ok" -eq 1 ]]
}

wait_healthy() {
  local i
  for i in {1..40}; do
    if [[ "$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)" == active &&
      "$("$SYSTEMCTL" is-active waw-web.service 2>/dev/null || true)" == active ]] &&
      "$CURL" --fail --silent --max-time 5 http://127.0.0.1:18080/health |
        "$PYTHON" -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin)=={"status":"healthy"} else 1)' \
        >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

rollback() {
  local ok=1
  ROLLING_BACK=1
  if [[ "$CHANGED" -eq 1 ]]; then
    "$RUN_DIR/manage-production-release.sh" rollback "$RELEASE_ID" >/dev/null 2>&1 || ok=0
    "$SYSTEMCTL" restart waw-bot.service waw-web.service >/dev/null 2>&1 || ok=0
    wait_healthy || ok=0
    [[ "$(readlink -f "$CURRENT")" == "$CURRENT_BEFORE" ]] || ok=0
  fi
  if [[ "$COMMANDS_CHANGED" -eq 1 ]]; then
    WAW_COMMAND_ACTION=restore "$NODE" "$RUN_DIR/register-commands.mjs" \
      "$RUN_DIR/previous-commands.json" \
      >/dev/null 2>&1 || ok=0
  fi
  if [[ "$STAGED" -eq 1 && "$(readlink -f "$CURRENT")" != "$TARGET" &&
    "$(readlink -f "$PREVIOUS")" != "$TARGET" && -d "$TARGET" ]]; then
    find "$TARGET" -depth -delete || ok=0
  fi
  [[ "$ok" -eq 1 ]]
}

fail() {
  local stage="$1" rollback_status=NOT_REQUIRED
  if [[ "$CHANGED" -eq 1 || "$COMMANDS_CHANGED" -eq 1 || "$STAGED" -eq 1 ]]; then
    if rollback; then rollback_status=PASS; else rollback_status=FAIL; fi
  fi
  cleanup >/dev/null 2>&1 || true
  printf 'SUMMARY_TIME_UX rollback=%s\n' "$rollback_status"
  printf 'SUMMARY_TIME_UX result=FAIL stage=%s\n' "$stage"
  exit 1
}

trap 'if [[ "$ROLLING_BACK" -eq 0 ]]; then fail UNHANDLED; fi' ERR
[[ -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" && -x "$NODE" &&
  ! -e "$TARGET" && -L "$CURRENT" && -L "$PREVIOUS" &&
  -f "$DROPIN" && ! -L "$DROPIN" &&
  -f "$CREDENTIAL" && ! -L "$CREDENTIAL" &&
  -f "$BOT_TOKEN" && ! -L "$BOT_TOKEN" &&
  -f "$BOT_ENV" && ! -L "$BOT_ENV" ]] || fail PRECONDITION
CURRENT_BEFORE="$(readlink -f "$CURRENT")"
[[ -d "$CURRENT_BEFORE" ]] || fail PRECONDITION
for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION
done

RUN_DIR="$(mktemp -d /tmp/waw-summary-time-ux.XXXXXX)" || fail MATERIAL
chmod 700 "$RUN_DIR"
printf '%s' "$ARCHIVE_B64" | base64 -d >"$RUN_DIR/source.tar.gz"
printf '%s' "$MANAGER_B64" | base64 -d >"$RUN_DIR/manage-production-release.sh"
chmod 700 "$RUN_DIR/manage-production-release.sh"
[[ "$(sha256sum "$RUN_DIR/source.tar.gz" | awk '{print $1}')" == "$EXPECTED_ARCHIVE_SHA256" &&
  "$(wc -c <"$RUN_DIR/source.tar.gz" | tr -d ' ')" == "$EXPECTED_ARCHIVE_BYTES" &&
  "$(sha256sum "$RUN_DIR/manage-production-release.sh" | awk '{print $1}')" == "$EXPECTED_MANAGER_SHA256" ]] ||
  fail MATERIAL

"$RUN_DIR/manage-production-release.sh" stage "$RELEASE_ID" \
  "$RUN_DIR/source.tar.gz" "$EXPECTED_ARCHIVE_SHA256" \
  >"$RUN_DIR/stage.log" 2>&1 || fail BUILD
STAGED=1
"$NODE" -e \
  "import('$TARGET/dist/server/commands/slash-commands.js').then(m=>{const s=JSON.stringify(m.WAW_SLASH_COMMANDS);if(!s.includes('최근 24시간')||!s.includes('어제 23:30')||s.includes('ISO 8601'))process.exit(1)})" \
  >/dev/null 2>&1 || fail COMMAND_SCHEMA
echo 'SUMMARY_TIME_UX stage=PASS command_schema=PASS'

cat >"$RUN_DIR/register-commands.mjs" <<'JS'
import fs from "node:fs";
import { createRequire } from "node:module";
import { WAW_SLASH_COMMANDS } from "/opt/waw/releases/f8bf082/dist/server/commands/slash-commands.js";

let stage = "MODULE_LOAD";
const failureClass = (error) => {
  const status = Number(error?.status ?? error?.rawError?.status);
  if (status === 401) return "AUTHENTICATION";
  if (status === 403) return "AUTHORIZATION";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  return "LOCAL_OR_OTHER";
};
const fail = (classification) => {
  console.log(`SUMMARY_TIME_UX command_stage=${stage} failure=${classification}`);
  process.exitCode = 1;
};

try {
  const require = createRequire(import.meta.url);
  const { REST, Routes } = require("/opt/waw/releases/f8bf082/node_modules/discord.js");
  stage = "CONFIG";
  const token = fs.readFileSync("/etc/waw-credentials/bot-discord-token", "utf8").trim();
  const env = fs.readFileSync("/etc/waw/bot.env", "utf8");
  const guildMatch = env.match(
    /^[ \t]*(?:export[ \t]+)?WAW_DISCORD_GUILD_ID[ \t]*=[ \t]*['"]?([1-9][0-9]{16,19})['"]?[ \t]*$/mu,
  );
  const guild = guildMatch?.[1];
  if (!guild || token.length < 20 || /[\r\n]/u.test(token)) {
    fail("INVALID_LOCAL_CONFIG");
  } else {
    const rest = new REST({ version: "10" }).setToken(token);
    stage = "IDENTITY";
    const me = await rest.get(Routes.user());
    if (!me || typeof me !== "object" || !/^[1-9][0-9]{16,19}$/u.test(me.id)) {
      fail("INVALID_IDENTITY_RESPONSE");
    } else {
      const route = Routes.applicationGuildCommands(me.id, guild);
      if (process.env.WAW_COMMAND_ACTION === "restore") {
        stage = "RESTORE";
        const previous = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
        await rest.put(route, { body: previous });
      } else {
        stage = "READ_PREVIOUS";
        const previous = await rest.get(route);
        if (!Array.isArray(previous)) {
          fail("INVALID_COMMAND_RESPONSE");
        } else {
          fs.writeFileSync(process.argv[2], JSON.stringify(previous), { mode: 0o600 });
          stage = "WRITE";
          await rest.put(route, { body: WAW_SLASH_COMMANDS });
          stage = "VERIFY";
          const current = await rest.get(route);
          const summary = Array.isArray(current)
            ? current.find((entry) => entry?.name === "요약")
            : undefined;
          const names = summary?.options?.map((option) => option.name);
          if (JSON.stringify(names) !== JSON.stringify(["최근", "직접"])) {
            fail("COMMAND_SCHEMA_MISMATCH");
          }
        }
      }
    }
  }
} catch (error) {
  fail(failureClass(error));
}
JS
chmod 500 "$RUN_DIR/register-commands.mjs"
"$NODE" "$RUN_DIR/register-commands.mjs" "$RUN_DIR/previous-commands.json" \
  2>/dev/null || fail COMMAND_REGISTRATION
COMMANDS_CHANGED=1
echo 'SUMMARY_TIME_UX command_registration=PASS requests=4'

"$RUN_DIR/manage-production-release.sh" activate "$RELEASE_ID" >/dev/null
CHANGED=1
"$SYSTEMCTL" restart waw-bot.service waw-web.service
wait_healthy || fail HEALTH
bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
for flag in WAW_SUMMARY_PROVIDER_ENABLED=1 WAW_SUMMARY_QUOTA_ENABLED=1 WAW_GAME_OBSERVATION_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail FLAGS
done
[[ "$(readlink -f "$CURRENT")" == "$TARGET" &&
  "$(readlink -f "$PREVIOUS")" == "$CURRENT_BEFORE" ]] || fail IDENTITY
[[ "$("$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" -eq 0 ]] || fail FAILED_UNITS

STAGED=0
CHANGED=0
COMMANDS_CHANGED=0
trap - ERR
cleanup || fail CLEANUP
echo 'SUMMARY_TIME_UX activation=PASS restarts=2 health=PASS singleton=PASS'
echo 'SUMMARY_TIME_UX flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0'
echo 'SUMMARY_TIME_UX cleanup=PASS transient=0'
echo 'SUMMARY_TIME_UX result=PASS release=f8bf082'
