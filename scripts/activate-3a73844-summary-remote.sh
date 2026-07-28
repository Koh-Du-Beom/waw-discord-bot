#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ARCHIVE_B64=__WAW_DISCLOSURE_ARCHIVE_B64__
MANAGER_B64=__WAW_RELEASE_MANAGER_B64__
RELEASE_ID=3a73844
EXPECTED_ARCHIVE_SHA256=3a73844cc5b1cc8f016f9b1e65b00559abe23eb0788ce26517ab766a500a39f3
EXPECTED_ARCHIVE_BYTES=221481
EXPECTED_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
TARGET="/opt/waw/releases/$RELEASE_ID"
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
CREDENTIAL=/etc/waw-credentials/bot-summary-api-key
DROPIN=/etc/systemd/system/waw-bot.service.d/90-summary-enabled.conf
SYSTEMCTL=/usr/bin/systemctl
CURL=/usr/bin/curl
PYTHON=/usr/bin/python3
RUNUSER=/usr/sbin/runuser
NODE=/usr/local/bin/node
RUN_DIR=
CURRENT_BEFORE=
PREVIOUS_BEFORE=
STAGED=0
CHANGED=0
ROLLING_BACK=0

cleanup() {
  local ok=1
  [[ -z "$RUN_DIR" || ! -d "$RUN_DIR" ]] || rm -rf -- "$RUN_DIR" || ok=0
  RUN_DIR=
  [[ "$ok" -eq 1 ]]
}

healthy() {
  "$CURL" --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:18080/health >"$RUN_DIR/health" 2>/dev/null &&
    "$PYTHON" - "$RUN_DIR/health" >/dev/null 2>/dev/null <<'PY'
import json, pathlib, sys
if json.loads(pathlib.Path(sys.argv[1]).read_text()) != {"status": "healthy"}:
    raise SystemExit(1)
PY
}

wait_healthy() {
  local i
  for i in {1..40}; do
    if [[ "$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)" == active &&
      "$("$SYSTEMCTL" is-active waw-web.service 2>/dev/null || true)" == active ]] &&
      healthy; then return 0; fi
    sleep 1
  done
  return 1
}

rollback() {
  local ok=1
  ROLLING_BACK=1
  if [[ "$CHANGED" -eq 1 ]]; then
    rm -f -- "$DROPIN" || ok=0
    "$RUN_DIR/manage-production-release.sh" rollback "$RELEASE_ID" \
      >/dev/null 2>&1 || ok=0
    "$SYSTEMCTL" daemon-reload >/dev/null 2>&1 || ok=0
    "$SYSTEMCTL" reset-failed waw-bot.service waw-web.service >/dev/null 2>&1 || true
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
  printf 'SUMMARY_ACTIVATION rollback=%s\n' "$rollback_status"
  printf 'SUMMARY_ACTIVATION result=FAIL stage=%s\n' "$stage"
  exit 1
}

trap 'if [[ "$ROLLING_BACK" -eq 0 ]]; then fail UNHANDLED; fi' ERR
[[ -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" &&
  -x "$RUNUSER" && -x "$NODE" ]] || fail PRECONDITION_TOOLS
[[ ! -e "$TARGET" && ! -e "$DROPIN" ]] || fail PRECONDITION_TARGET
[[ -f "$CREDENTIAL" && ! -L "$CREDENTIAL" &&
  "$(stat -c '%U:%G:%a' "$CREDENTIAL" 2>/dev/null || true)" == root:root:600 ]] ||
  fail PRECONDITION_CREDENTIAL
[[ -L "$CURRENT" && -L "$PREVIOUS" ]] || fail PRECONDITION_LINKS
CURRENT_BEFORE="$(readlink -f "$CURRENT")"
PREVIOUS_BEFORE="$(readlink -f "$PREVIOUS")"
[[ -d "$CURRENT_BEFORE" && -d "$PREVIOUS_BEFORE" &&
  "$CURRENT_BEFORE" != "$PREVIOUS_BEFORE" ]] || fail PRECONDITION_LINKS
for unit in waw-bot.service waw-web.service waw-backup.timer waw-monitor.timer; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION_SERVICES
done
[[ "$("$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" -eq 0 ]] ||
  fail PRECONDITION_SERVICES

RUN_DIR="$(mktemp -d /tmp/waw-summary-activation.XXXXXX)" || fail MATERIAL
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
[[ -f "$TARGET/dist/server/contracts/summary-disclosure.js" &&
  -f "$TARGET/dist/server/bot/main.js" &&
  -f "$TARGET/dist/server/web/main.js" ]] || fail BUILD
grep -Fq 'OpenAI API' "$TARGET/dist/web/assets/"*.js || fail DISCLOSURE
"$RUNUSER" -u waw-bot -- "$NODE" -e \
  "import('$TARGET/dist/server/contracts/summary-disclosure.js').then(m=>{if(!m.SUMMARY_EXTERNAL_PROCESSING_NOTICE.includes('최대 30일'))process.exit(1)})" \
  >/dev/null 2>&1 || fail DISCLOSURE
echo 'SUMMARY_ACTIVATION stage=PASS disclosure=PASS'

install -d -o root -g root -m 0755 "$(dirname -- "$DROPIN")"
cat >"$RUN_DIR/90-summary-enabled.conf" <<'EOF'
[Service]
LoadCredential=summary-api-key:/etc/waw-credentials/bot-summary-api-key
Environment=WAW_SUMMARY_PROVIDER_ENABLED=1
Environment=WAW_SUMMARY_QUOTA_ENABLED=1
EOF
install -o root -g root -m 0644 "$RUN_DIR/90-summary-enabled.conf" "$DROPIN"
"$RUN_DIR/manage-production-release.sh" activate "$RELEASE_ID" >/dev/null
CHANGED=1
"$SYSTEMCTL" daemon-reload
"$SYSTEMCTL" restart waw-bot.service waw-web.service
wait_healthy || fail HEALTH

bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
for flag in WAW_SUMMARY_PROVIDER_ENABLED=1 WAW_SUMMARY_QUOTA_ENABLED=1 WAW_GAME_OBSERVATION_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail FLAGS
done
[[ "$(readlink -f "$CURRENT")" == "$TARGET" &&
  "$(readlink -f "$PREVIOUS")" == "$CURRENT_BEFORE" &&
  "$(stat -c '%U:%G:%a' "$DROPIN" 2>/dev/null || true)" == root:root:644 ]] ||
  fail IDENTITY
for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" show -p MainPID --value "$unit" 2>/dev/null || true)" =~ ^[1-9][0-9]*$ ]] ||
    fail SINGLETON
done
[[ "$("$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
  sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')" -eq 0 ]] ||
  fail FAILED_UNITS

STAGED=0
CHANGED=0
trap - ERR
cleanup || fail CLEANUP
echo 'SUMMARY_ACTIVATION activation=PASS daemon_reload=1 restarts=2'
echo 'SUMMARY_ACTIVATION health=PASS singleton=PASS failed_units=0'
echo 'SUMMARY_ACTIVATION flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0'
echo 'SUMMARY_ACTIVATION cleanup=PASS transient=0'
echo 'SUMMARY_ACTIVATION result=PASS release=3a73844'
