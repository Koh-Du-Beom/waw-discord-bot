#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ARCHIVE_B64=__WAW_EMPTY_RANGE_ARCHIVE_B64__
MANAGER_B64=__WAW_RELEASE_MANAGER_B64__
RELEASE_ID=bb53cf2
EXPECTED_ARCHIVE_SHA256=bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed
EXPECTED_ARCHIVE_BYTES=207414
EXPECTED_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
TARGET="/opt/waw/releases/$RELEASE_ID"
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
SYSTEMCTL=/usr/bin/systemctl
CURL=/usr/bin/curl
PYTHON=/usr/bin/python3
NODE=/usr/local/bin/node
RUN_DIR=
CURRENT_BEFORE=
STAGED=0
CHANGED=0
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
  if [[ "$STAGED" -eq 1 && "$(readlink -f "$CURRENT")" != "$TARGET" &&
    "$(readlink -f "$PREVIOUS")" != "$TARGET" && -d "$TARGET" ]]; then
    find "$TARGET" -depth -delete || ok=0
  fi
  [[ "$ok" -eq 1 ]]
}

fail() {
  local stage="$1" rollback_status=NOT_REQUIRED
  if [[ "$CHANGED" -eq 1 || "$STAGED" -eq 1 ]]; then
    if rollback; then rollback_status=PASS; else rollback_status=FAIL; fi
  fi
  cleanup >/dev/null 2>&1 || true
  printf 'SUMMARY_EMPTY_RANGE rollback=%s\n' "$rollback_status"
  printf 'SUMMARY_EMPTY_RANGE result=FAIL stage=%s\n' "$stage"
  exit 1
}

trap 'if [[ "$ROLLING_BACK" -eq 0 ]]; then fail UNHANDLED; fi' ERR
[[ -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" && -x "$NODE" &&
  ! -e "$TARGET" && -L "$CURRENT" && -L "$PREVIOUS" ]] || fail PRECONDITION
CURRENT_BEFORE="$(readlink -f "$CURRENT")"
[[ "$CURRENT_BEFORE" == /opt/waw/releases/f08089f ]] || fail PRECONDITION
for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION
done

RUN_DIR="$(mktemp -d /tmp/waw-summary-empty-range.XXXXXX)" || fail MATERIAL
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
"$NODE" --input-type=module - "$TARGET" >/dev/null 2>&1 <<'JS' ||
import process from "node:process";
import { createRequire } from "node:module";
const root = process.argv[2];
const { createDiscordConversationHistoryReader } =
  await import(`${root}/dist/server/adapters/discord/conversation-history.js`);
const { DISCORDJS_MINIMUM_INTENTS } =
  await import(`${root}/dist/server/gateway/discordjs-adapter.js`);
const { readFile } = await import("node:fs/promises");
const require = createRequire(import.meta.url);
const { GatewayIntentBits } = require(`${root}/node_modules/discord.js`);
if (!DISCORDJS_MINIMUM_INTENTS.includes(GatewayIntentBits.MessageContent)) process.exit(1);
const reader = createDiscordConversationHistoryReader({
  async resolve() {
    const message = {
      id: "10000",
      content: "fixture",
      createdTimestamp: 1,
      author: { id: "20000" },
    };
    return { messages: { async fetch() { return new Map([[message.id, message]]); } } };
  },
});
const page = await reader.readPage({ channelId: "30000", limit: 100 });
if (page.messages.length !== 1 || page.messages[0]?.id !== "10000") process.exit(1);
const handlerSource =
  await readFile(`${root}/dist/server/commands/command-handler.js`, "utf8");
if (!handlerSource.includes("summary_range_empty") ||
  !handlerSource.includes("더 긴 범위를 선택해 주세요") ||
  !handlerSource.includes("summary_content_unavailable")) process.exit(1);
JS
  fail CONTENT_BOUNDARY
echo 'SUMMARY_EMPTY_RANGE stage=PASS map_fixture=PASS intent=PASS guidance=PASS'

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
trap - ERR
cleanup || fail CLEANUP
echo 'SUMMARY_EMPTY_RANGE activation=PASS restarts=2 health=PASS singleton=PASS'
echo 'SUMMARY_EMPTY_RANGE flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0'
echo 'SUMMARY_EMPTY_RANGE cleanup=PASS transient=0'
echo 'SUMMARY_EMPTY_RANGE result=PASS release=bb53cf2'
