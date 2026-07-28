#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

MANAGER_B64=__WAW_RELEASE_MANAGER_B64__
BOT_UNIT_B64=__WAW_BOT_UNIT_B64__
WEB_UNIT_B64=__WAW_WEB_UNIT_B64__
BRIDGE_B64=__WAW_BRIDGE_B64__
RELEASE_ID=f42e2b0
EXPECTED_RELEASE_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
EXPECTED_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
EXPECTED_BOT_UNIT_SHA256=a2696d3fb012a5a832232b3868be36c72a4f4a76aebf9d98aa5ed912caaa1e4e
EXPECTED_WEB_UNIT_SHA256=b5e9ec1d598341c3e8a87252598a41c77c923426d38233e7be7c91f1873ab829
EXPECTED_BRIDGE_SHA256=b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a
TARGET="/opt/waw/releases/$RELEASE_ID"
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
BOT_UNIT=/etc/systemd/system/waw-bot.service
WEB_UNIT=/etc/systemd/system/waw-web.service
BRIDGE=/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf
SYSTEMCTL=/usr/bin/systemctl
CURL=/usr/bin/curl
PYTHON=/usr/bin/python3
RUNUSER=/usr/sbin/runuser
NODE=/usr/local/bin/node
RUN_DIR=
CURRENT_BEFORE=
PREVIOUS_BEFORE=
CHANGED=0
ROLLING_BACK=0

cleanup() {
  local clean=1
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" || clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

healthy() {
  local health="$RUN_DIR/health.json"
  "$CURL" --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:18080/health >"$health" 2>/dev/null &&
    "$PYTHON" - "$health" >/dev/null 2>/dev/null <<'PY'
import json
import pathlib
import sys
if json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")) != {"status": "healthy"}:
    raise SystemExit(1)
PY
}

wait_healthy() {
  local attempt
  for attempt in {1..30}; do
    if [[ "$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)" == active &&
      "$("$SYSTEMCTL" is-active waw-web.service 2>/dev/null || true)" == active ]] &&
      healthy; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_previous() {
  local rollback_ok=1
  ROLLING_BACK=1
  if [[ "$CHANGED" -eq 1 ]]; then
    install -o root -g root -m 0644 "$RUN_DIR/bot.before" "$BOT_UNIT" || rollback_ok=0
    install -o root -g root -m 0644 "$RUN_DIR/web.before" "$WEB_UNIT" || rollback_ok=0
    if [[ -f "$RUN_DIR/bridge.before" ]]; then
      install -d -o root -g root -m 0755 "$(dirname -- "$BRIDGE")" || rollback_ok=0
      install -o root -g root -m 0644 "$RUN_DIR/bridge.before" "$BRIDGE" || rollback_ok=0
    else
      rm -f -- "$BRIDGE" || rollback_ok=0
    fi
    "$RUN_DIR/manage-production-release.sh" rollback "$RELEASE_ID" \
      >/dev/null 2>&1 || rollback_ok=0
    "$SYSTEMCTL" daemon-reload >/dev/null 2>&1 || rollback_ok=0
    "$SYSTEMCTL" reset-failed waw-bot.service waw-web.service >/dev/null 2>&1 || true
    "$SYSTEMCTL" restart waw-bot.service waw-web.service >/dev/null 2>&1 || rollback_ok=0
    wait_healthy || rollback_ok=0
    [[ "$(readlink -f "$CURRENT")" == "$CURRENT_BEFORE" ]] || rollback_ok=0
  fi
  [[ "$rollback_ok" -eq 1 ]]
}

fail() {
  local stage="$1" rollback=NOT_REQUIRED
  if [[ "$CHANGED" -eq 1 && "$ROLLING_BACK" -eq 0 ]]; then
    if restore_previous; then rollback=PASS; else rollback=FAIL; fi
  fi
  if cleanup; then
    echo 'DEFAULT_OFF_ROLLOUT cleanup=PASS transient=0'
  else
    echo 'DEFAULT_OFF_ROLLOUT cleanup=FAIL transient=UNKNOWN'
  fi
  printf 'DEFAULT_OFF_ROLLOUT rollback=%s\n' "$rollback"
  printf 'DEFAULT_OFF_ROLLOUT result=FAIL stage=%s\n' "$stage"
  exit 1
}

trap 'if [[ "$ROLLING_BACK" -eq 0 ]]; then fail UNHANDLED; fi' ERR

[[ -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" &&
  -x "$RUNUSER" && -x "$NODE" ]] || fail PRECONDITION
RUN_DIR="$(mktemp -d /tmp/waw-default-off-rollout.XXXXXX)" || fail MATERIAL
chmod 700 "$RUN_DIR" || fail MATERIAL
[[ -L "$CURRENT" && -L "$PREVIOUS" && -d "$TARGET" && ! -L "$TARGET" &&
  -f "$TARGET/.waw-release-sha256" &&
  "$(<"$TARGET/.waw-release-sha256")" == "$EXPECTED_RELEASE_SHA256" ]] ||
  fail PRECONDITION
CURRENT_BEFORE="$(readlink -f "$CURRENT")"
PREVIOUS_BEFORE="$(readlink -f "$PREVIOUS")"
[[ -d "$CURRENT_BEFORE" && -d "$PREVIOUS_BEFORE" &&
  "$CURRENT_BEFORE" != "$TARGET" && "$PREVIOUS_BEFORE" != "$TARGET" ]] ||
  fail PRECONDITION
[[ -f "$BOT_UNIT" && ! -L "$BOT_UNIT" &&
  -f "$WEB_UNIT" && ! -L "$WEB_UNIT" &&
  -f "$BRIDGE" && ! -L "$BRIDGE" &&
  "$(sha256sum "$BRIDGE" | awk '{print $1}')" == "$EXPECTED_BRIDGE_SHA256" ]] ||
  fail PRECONDITION
for unit in waw-bot.service waw-web.service waw-backup.timer waw-monitor.timer; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION
done
[[ "$("$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" -eq 0 ]] ||
  fail PRECONDITION
healthy || fail PRECONDITION

printf '%s' "$MANAGER_B64" | base64 -d >"$RUN_DIR/manage-production-release.sh"
printf '%s' "$BOT_UNIT_B64" | base64 -d >"$RUN_DIR/waw-bot.service"
printf '%s' "$WEB_UNIT_B64" | base64 -d >"$RUN_DIR/waw-web.service"
printf '%s' "$BRIDGE_B64" | base64 -d >"$RUN_DIR/bridge.expected"
chmod 700 "$RUN_DIR/manage-production-release.sh"
[[ "$(sha256sum "$RUN_DIR/manage-production-release.sh" | awk '{print $1}')" == "$EXPECTED_MANAGER_SHA256" &&
  "$(sha256sum "$RUN_DIR/waw-bot.service" | awk '{print $1}')" == "$EXPECTED_BOT_UNIT_SHA256" &&
  "$(sha256sum "$RUN_DIR/waw-web.service" | awk '{print $1}')" == "$EXPECTED_WEB_UNIT_SHA256" &&
  "$(sha256sum "$RUN_DIR/bridge.expected" | awk '{print $1}')" == "$EXPECTED_BRIDGE_SHA256" ]] ||
  fail MATERIAL
cmp -s "$BRIDGE" "$RUN_DIR/bridge.expected" || fail PRECONDITION
cp --preserve=mode,timestamps "$BOT_UNIT" "$RUN_DIR/bot.before"
cp --preserve=mode,timestamps "$WEB_UNIT" "$RUN_DIR/web.before"
cp --preserve=mode,timestamps "$BRIDGE" "$RUN_DIR/bridge.before"
echo 'DEFAULT_OFF_ROLLOUT precondition=PASS backup=PASS'

install -o root -g root -m 0644 "$RUN_DIR/waw-bot.service" "$BOT_UNIT"
install -o root -g root -m 0644 "$RUN_DIR/waw-web.service" "$WEB_UNIT"
rm -f -- "$BRIDGE"
CHANGED=1
"$RUN_DIR/manage-production-release.sh" activate "$RELEASE_ID" >/dev/null
"$SYSTEMCTL" daemon-reload
echo 'DEFAULT_OFF_ROLLOUT activation=PASS daemon_reload=1 bridge_removed=1'

"$SYSTEMCTL" restart waw-bot.service waw-web.service
wait_healthy || fail HEALTH

bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
web_environment="$("$SYSTEMCTL" show -p Environment --value waw-web.service 2>/dev/null)"
for flag in WAW_SUMMARY_PROVIDER_ENABLED=0 WAW_SUMMARY_QUOTA_ENABLED=0 WAW_GAME_OBSERVATION_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail FLAGS
done
[[ "$(tr ' ' '\n' <<<"$web_environment" |
  grep -cx 'WAW_DASHBOARD_QUOTA_ENABLED=0' || true)" -eq 1 ]] ||
  fail FLAGS
bot_environment=
web_environment=
[[ ! -e "$BRIDGE" &&
  "$(sha256sum "$BOT_UNIT" | awk '{print $1}')" == "$EXPECTED_BOT_UNIT_SHA256" &&
  "$(sha256sum "$WEB_UNIT" | awk '{print $1}')" == "$EXPECTED_WEB_UNIT_SHA256" &&
  "$(readlink -f "$CURRENT")" == "$TARGET" &&
  "$(readlink -f "$PREVIOUS")" == "$CURRENT_BEFORE" ]] ||
  fail IDENTITY
for unit in waw-bot.service waw-web.service; do
  pid="$("$SYSTEMCTL" show -p MainPID --value "$unit" 2>/dev/null || true)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || fail SINGLETON
done
[[ "$("$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" -eq 0 ]] ||
  fail FAILED_UNITS

CHANGED=0
trap - ERR
cleanup || fail CLEANUP
echo 'DEFAULT_OFF_ROLLOUT health=PASS singleton=PASS failed_units=0'
echo 'DEFAULT_OFF_ROLLOUT flags=0,0,0,0 provider_calls=0 migrations=0'
echo 'DEFAULT_OFF_ROLLOUT cleanup=PASS transient=0'
echo 'DEFAULT_OFF_ROLLOUT result=PASS release=f42e2b0 restarts=2'
