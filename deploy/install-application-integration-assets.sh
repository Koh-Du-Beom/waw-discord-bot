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
  "$SCRIPT_DIR/systemd/waw-web.service|$(target /etc/systemd/system/waw-web.service)|644"
  "$SCRIPT_DIR/systemd/waw-bot.service|$(target /etc/systemd/system/waw-bot.service)|644"
  "$SCRIPT_DIR/caddy/Caddyfile.integration|$(target /etc/caddy/Caddyfile)|644"
)

if [[ "$ACTION" == install ]]; then
  install -d -m 755 "$(target /etc/systemd/system)" "$(target /etc/caddy)"
  install -d -m 700 "$(target /etc/waw-credentials)"
  for asset in "${assets[@]}"; do
    IFS='|' read -r source destination mode <<<"$asset"
    install_asset "$source" "$destination" "$mode"
  done
  echo application_integration_assets_installed
else
  for asset in "${assets[@]}"; do
    IFS='|' read -r source destination _ <<<"$asset"
    rollback_asset "$source" "$destination"
  done
  rmdir "$(target /etc/caddy)" "$(target /etc/waw-credentials)" 2>/dev/null || true
  echo application_integration_assets_rolled_back
fi
