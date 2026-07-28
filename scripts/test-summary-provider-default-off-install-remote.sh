#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-provider-remote-test.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
BIN="$ROOT/bin"
TARGET="$ROOT/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf"
LOG="$ROOT/systemctl.log"
mkdir -p "$BIN"

cat >"$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FIXTURE_SYSTEMCTL_LOG"
case "$*" in
  daemon-reload) ;;
  "is-active waw-bot.service") printf 'active\n' ;;
  "show -p MainPID --value waw-bot.service") printf '4242\n' ;;
  "show -p ExecMainStartTimestampMonotonic --value waw-bot.service")
    printf '9001\n'
    ;;
  "cat waw-bot.service")
    printf '%s\n' \
      '[Service]' \
      'Environment=WAW_SUMMARY_QUOTA_ENABLED=0' \
      'Environment=WAW_GAME_OBSERVATION_ENABLED=0' \
      'Environment=WAW_SUMMARY_DASHBOARD_QUOTA_ENABLED=0'
    [[ ! -f "$FIXTURE_TARGET" ]] || cat "$FIXTURE_TARGET"
    ;;
  "show -p Environment --value waw-bot.service")
    printf '%s' \
      'WAW_SUMMARY_QUOTA_ENABLED=0 WAW_GAME_OBSERVATION_ENABLED=0 WAW_SUMMARY_DASHBOARD_QUOTA_ENABLED=0'
    [[ ! -f "$FIXTURE_TARGET" ]] ||
      printf ' WAW_SUMMARY_PROVIDER_ENABLED=0'
    printf '\n'
    ;;
  "--failed --no-legend --plain") ;;
  *) exit 2 ;;
esac
EOF
chmod 755 "$BIN/systemctl"

cat >"$BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${FIXTURE_HEALTH_FAIL:-0}" -eq 0 ]] || exit 1
printf '{"status":"healthy"}\n'
EOF
chmod 755 "$BIN/curl"

manager_b64="$(base64 <"$SCRIPT_DIR/../deploy/manage-summary-provider-default-off.sh" |
  tr -d '\n')"
source_b64="$(base64 <"$SCRIPT_DIR/../deploy/systemd/waw-summary-provider-default-off.conf" |
  tr -d '\n')"
sed \
  -e "s|__WAW_MANAGER_B64__|$manager_b64|" \
  -e "s|__WAW_SOURCE_B64__|$source_b64|" \
  "$SCRIPT_DIR/summary-provider-default-off-install-remote.sh" \
  >"$ROOT/remote.sh"
chmod 700 "$ROOT/remote.sh"

export FIXTURE_SYSTEMCTL_LOG="$LOG"
export FIXTURE_TARGET="$TARGET"

output="$(
  WAW_INSTALL_ROOT="$ROOT" \
  WAW_SYSTEMCTL_BIN="$BIN/systemctl" \
  WAW_CURL_BIN="$BIN/curl" \
    "$ROOT/remote.sh"
)"
expected="$(
  printf '%s\n' \
    'PROVIDER_DEFAULT_OFF precondition=PASS' \
    'PROVIDER_DEFAULT_OFF material=PASS' \
    'PROVIDER_DEFAULT_OFF install=PASS daemon_reload=1 service_restart=0' \
    'PROVIDER_DEFAULT_OFF metadata=PASS' \
    'PROVIDER_DEFAULT_OFF declaration=PASS zero=1 one=0 other=0' \
    'PROVIDER_DEFAULT_OFF resolved=PASS zero=1 one=0 other=0' \
    'PROVIDER_DEFAULT_OFF bot_identity=PASS' \
    'PROVIDER_DEFAULT_OFF health=PASS' \
    'PROVIDER_DEFAULT_OFF failed_units=PASS count=0' \
    'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0' \
    'PROVIDER_DEFAULT_OFF result=PASS'
)"
[[ "$output" == "$expected" ]]
[[ -f "$TARGET" ]]
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 1 ]]
! grep -Eq '(^| )(start|stop|restart|reload|try-restart)( |$)' "$LOG"

WAW_INSTALL_ROOT="$ROOT" \
WAW_SYSTEMCTL_BIN="$BIN/systemctl" \
  "$SCRIPT_DIR/../deploy/manage-summary-provider-default-off.sh" \
    rollback >/dev/null 2>&1
: >"$LOG"
if output="$(
  FIXTURE_HEALTH_FAIL=1 \
  WAW_INSTALL_ROOT="$ROOT" \
  WAW_SYSTEMCTL_BIN="$BIN/systemctl" \
  WAW_CURL_BIN="$BIN/curl" \
    "$ROOT/remote.sh" 2>&1
)"; then
  echo failed_health_was_accepted >&2
  exit 1
fi
[[ "$output" == *'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0'* ]]
[[ "$output" == *'PROVIDER_DEFAULT_OFF rollback=PASS'* ]]
[[ "$output" == *'PROVIDER_DEFAULT_OFF result=FAIL stage=HEALTH'* ]]
[[ ! -e "$TARGET" ]]
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 2 ]]

echo summary_provider_default_off_remote_fixture_passed
