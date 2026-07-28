#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-provider-default-off.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
BIN="$ROOT/bin"
LOG="$ROOT/systemctl.log"
TARGET="$ROOT/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf"
mkdir -p "$BIN"

cat >"$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$WAW_SYSTEMCTL_LOG"
case "$*" in
  daemon-reload) ;;
  "is-active waw-bot.service") printf 'active\n' ;;
  "show -p MainPID --value waw-bot.service")
    if [[ "${TEST_CHANGE_AFTER_RELOAD:-0}" == 1 ]] &&
      grep -qx daemon-reload "$WAW_SYSTEMCTL_LOG"; then
      printf '5252\n'
    else
      printf '4242\n'
    fi
    ;;
  "show -p ExecMainStartTimestampMonotonic --value waw-bot.service")
    printf '%s\n' "${TEST_START_TIMESTAMP:-9001}"
    ;;
  *) exit 2 ;;
esac
EOF
chmod 755 "$BIN/systemctl"
export WAW_INSTALL_ROOT="$ROOT"
export WAW_SYSTEMCTL_BIN="$BIN/systemctl"
export WAW_SYSTEMCTL_LOG="$LOG"

asset_metadata() {
  stat -c '%U:%G:%a' "$1" 2>/dev/null ||
    stat -f '%Su:%Sg:%Lp' "$1" 2>/dev/null
}

"$SCRIPT_DIR/manage-summary-provider-default-off.sh" install |
  grep -qx provider_default_off_installed
[[ "$(sha256sum "$TARGET" | awk '{print $1}')" == b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a ]]
[[ "$(asset_metadata "$TARGET")" == "$(id -un):$(id -gn):644" ]]
grep -Fqx '[Service]' "$TARGET"
grep -Fqx 'Environment=WAW_SUMMARY_PROVIDER_ENABLED=0' "$TARGET"

"$SCRIPT_DIR/manage-summary-provider-default-off.sh" install |
  grep -qx provider_default_off_installed
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 2 ]]
! grep -Eq '(^| )(start|stop|restart|reload|try-restart)( |$)' "$LOG"

chmod 600 "$TARGET"
if "$SCRIPT_DIR/manage-summary-provider-default-off.sh" install >/dev/null 2>&1; then
  echo provider_default_off_metadata_conflict_was_accepted >&2
  exit 1
fi
chmod 644 "$TARGET"
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 2 ]]

printf '[Service]\nEnvironment=WAW_SUMMARY_PROVIDER_ENABLED=1\n' >"$TARGET"
if "$SCRIPT_DIR/manage-summary-provider-default-off.sh" install >/dev/null 2>&1; then
  echo provider_default_off_conflict_was_overwritten >&2
  exit 1
fi
grep -Fqx 'Environment=WAW_SUMMARY_PROVIDER_ENABLED=1' "$TARGET"
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 2 ]]

install -o "$(id -un)" -g "$(id -gn)" -m 0644 \
  "$SCRIPT_DIR/systemd/waw-summary-provider-default-off.conf" "$TARGET"
printf '\n# changed\n' >>"$TARGET"
if "$SCRIPT_DIR/manage-summary-provider-default-off.sh" rollback >/dev/null 2>&1; then
  echo provider_default_off_changed_rollback_was_removed >&2
  exit 1
fi
[[ -e "$TARGET" ]]
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 2 ]]

install -o "$(id -un)" -g "$(id -gn)" -m 0644 \
  "$SCRIPT_DIR/systemd/waw-summary-provider-default-off.conf" "$TARGET"
"$SCRIPT_DIR/manage-summary-provider-default-off.sh" rollback |
  grep -qx provider_default_off_rolled_back
[[ ! -e "$TARGET" ]]
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 3 ]]
! grep -Eq '(^| )(start|stop|restart|reload|try-restart)( |$)' "$LOG"

install -o "$(id -un)" -g "$(id -gn)" -m 0644 \
  "$SCRIPT_DIR/systemd/waw-summary-provider-default-off.conf" "$TARGET"
printf '' >"$LOG"
if TEST_CHANGE_AFTER_RELOAD=1 "$SCRIPT_DIR/manage-summary-provider-default-off.sh" rollback \
  >/dev/null 2>&1; then
  echo provider_default_off_identity_change_was_accepted >&2
  exit 1
fi
[[ ! -e "$TARGET" ]]

"$SCRIPT_DIR/manage-summary-provider-default-off.sh" rollback |
  grep -qx provider_default_off_already_absent
[[ "$(grep -c '^daemon-reload$' "$LOG")" -eq 1 ]]
echo summary_provider_default_off_fixture_passed
