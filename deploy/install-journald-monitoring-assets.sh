#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-install}"
ROOT="${WAW_INSTALL_ROOT:-/}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$ROOT" == /* ]] || { echo install_root_must_be_absolute >&2; exit 1; }
[[ "$ACTION" == install || "$ACTION" == rollback ]] || { echo invalid_install_action >&2; exit 1; }

target() {
  if [[ "$ROOT" == / ]]; then
    printf '%s' "$1"
  else
    printf '%s%s' "${ROOT%/}" "$1"
  fi
}

install_asset() {
  local source="$1" destination="$2" mode="$3"
  if [[ -e "$destination" ]]; then
    cmp -s -- "$source" "$destination" || { echo install_target_conflict >&2; exit 1; }
    return
  fi
  install -m "$mode" "$source" "$destination"
}

rollback_asset() {
  local source="$1" destination="$2"
  [[ -e "$destination" ]] || return
  cmp -s -- "$source" "$destination" || { echo rollback_target_changed >&2; exit 1; }
  rm -f -- "$destination"
}

assets=(
  "$SCRIPT_DIR/journald/60-waw-retention.conf|$(target /etc/systemd/journald.conf.d/60-waw-retention.conf)|644"
  "$SCRIPT_DIR/monitoring/config.json|$(target /etc/waw-monitor/config.json)|644"
  "$SCRIPT_DIR/systemd/waw-monitor.service|$(target /etc/systemd/system/waw-monitor.service)|644"
  "$SCRIPT_DIR/systemd/waw-monitor.timer|$(target /etc/systemd/system/waw-monitor.timer)|644"
)

if [[ "$ACTION" == install ]]; then
  install -d -m 755 "$(target /etc/systemd/journald.conf.d)" "$(target /etc/waw-monitor)" "$(target /etc/systemd/system)"
  install -d -m 700 "$(target /etc/waw-credentials)"
  for asset in "${assets[@]}"; do
    IFS='|' read -r source destination mode <<<"$asset"
    install_asset "$source" "$destination" "$mode"
  done
  echo monitoring_assets_installed
else
  for asset in "${assets[@]}"; do
    IFS='|' read -r source destination _ <<<"$asset"
    rollback_asset "$source" "$destination"
  done
  rmdir "$(target /etc/waw-monitor)" "$(target /etc/systemd/journald.conf.d)" "$(target /etc/waw-credentials)" 2>/dev/null || true
  echo monitoring_assets_rolled_back
fi
