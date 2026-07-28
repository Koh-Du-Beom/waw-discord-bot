#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-}"
ROOT="${WAW_INSTALL_ROOT:-/}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/systemd/waw-summary-provider-default-off.conf"
EXPECTED_SHA256=b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a

[[ "$ACTION" == install || "$ACTION" == rollback ]] ||
  { echo invalid_provider_default_off_action >&2; exit 1; }
[[ "$ROOT" == /* ]] || { echo install_root_must_be_absolute >&2; exit 1; }
[[ "$(sha256sum "$SOURCE" | awk '{print $1}')" == "$EXPECTED_SHA256" ]] ||
  { echo provider_default_off_source_hash_mismatch >&2; exit 1; }

asset_metadata() {
  stat -c '%U:%G:%a' "$1" 2>/dev/null ||
    stat -f '%Su:%Sg:%Lp' "$1" 2>/dev/null
}

capture_bot_identity() {
  local state pid started
  state="$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)"
  pid="$("$SYSTEMCTL" show -p MainPID --value waw-bot.service 2>/dev/null || true)"
  started="$("$SYSTEMCTL" show -p ExecMainStartTimestampMonotonic --value \
    waw-bot.service 2>/dev/null || true)"
  [[ "$state" == active && "$pid" =~ ^[1-9][0-9]*$ &&
    "$started" =~ ^[1-9][0-9]*$ ]] ||
    { echo provider_default_off_bot_identity_invalid >&2; exit 1; }
  printf '%s:%s' "$pid" "$started"
}

if [[ "$ROOT" == / ]]; then
  TARGET=/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf
  SYSTEMCTL=/usr/bin/systemctl
  EXPECTED_OWNER=root
  EXPECTED_GROUP=root
else
  TARGET="${ROOT%/}/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf"
  SYSTEMCTL="${WAW_SYSTEMCTL_BIN:?fixture_systemctl_required}"
  EXPECTED_OWNER="$(id -un)"
  EXPECTED_GROUP="$(id -gn)"
fi

if [[ "$ACTION" == install ]]; then
  before_identity="$(capture_bot_identity)"
  install -d -o "$EXPECTED_OWNER" -g "$EXPECTED_GROUP" -m 0755 "$(dirname -- "$TARGET")"
  if [[ -e "$TARGET" ]]; then
    cmp -s -- "$SOURCE" "$TARGET" ||
      { echo provider_default_off_install_conflict >&2; exit 1; }
    [[ "$(asset_metadata "$TARGET")" == "$EXPECTED_OWNER:$EXPECTED_GROUP:644" ]] ||
      { echo provider_default_off_install_metadata_conflict >&2; exit 1; }
  else
    install -o "$EXPECTED_OWNER" -g "$EXPECTED_GROUP" -m 0644 "$SOURCE" "$TARGET"
  fi
  "$SYSTEMCTL" daemon-reload
  [[ "$(capture_bot_identity)" == "$before_identity" ]] ||
    { echo provider_default_off_bot_identity_changed >&2; exit 1; }
  echo provider_default_off_installed
  exit 0
fi

if [[ ! -e "$TARGET" ]]; then
  echo provider_default_off_already_absent
  exit 0
fi
cmp -s -- "$SOURCE" "$TARGET" ||
  { echo provider_default_off_rollback_target_changed >&2; exit 1; }
[[ "$(asset_metadata "$TARGET")" == "$EXPECTED_OWNER:$EXPECTED_GROUP:644" ]] ||
  { echo provider_default_off_rollback_metadata_changed >&2; exit 1; }
before_identity="$(capture_bot_identity)"
rm -f -- "$TARGET"
"$SYSTEMCTL" daemon-reload
[[ "$(capture_bot_identity)" == "$before_identity" ]] ||
  { echo provider_default_off_bot_identity_changed >&2; exit 1; }
echo provider_default_off_rolled_back
