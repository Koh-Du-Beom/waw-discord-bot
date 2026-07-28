#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
archive="${2:-}"
expected_sha="${3:-}"
manager="${4:-}"
[[ "$release_id" =~ ^[a-f0-9]{12}$ &&
   "$expected_sha" =~ ^[a-f0-9]{64}$ &&
   -f "$archive" && -f "$manager" ]] ||
  { echo invalid_remote_deployment_input >&2; exit 1; }

current_before="$(readlink -f /opt/waw/current)"
previous_before="$(readlink -f /opt/waw/previous)"
[[ "$current_before" == /opt/waw/releases/* &&
   "$previous_before" == /opt/waw/releases/* &&
   "$current_before" != "$previous_before" ]] ||
  { echo invalid_release_preflight >&2; exit 1; }
systemctl is-active --quiet waw-web.service
systemctl is-active --quiet waw-bot.service
systemctl is-active --quiet waw-backup.timer
systemctl is-active --quiet waw-monitor.timer
systemctl is-enabled --quiet waw-backup.timer
systemctl is-enabled --quiet waw-monitor.timer
curl --fail --silent --show-error http://127.0.0.1:18080/health |
  grep -q '"status":"healthy"'

bash "$manager" stage "$release_id" "$archive" "$expected_sha"
release="/opt/waw/releases/$release_id"
[[ -f "$release/deploy/systemd/waw-web.service" &&
   -f "$release/deploy/systemd/waw-bot.service" ]] ||
  { echo staged_unit_missing >&2; exit 1; }

unit_backup="$(mktemp -d)"
rollback_needed=0
cleanup() { rm -rf -- "$unit_backup"; }
rollback() {
  local outcome=$?
  if [[ "$rollback_needed" == 1 ]]; then
    bash "$manager" rollback "$release_id" || true
    install -m 644 "$unit_backup/waw-web.service" /etc/systemd/system/waw-web.service
    install -m 644 "$unit_backup/waw-bot.service" /etc/systemd/system/waw-bot.service
    systemctl daemon-reload || true
    systemctl restart waw-web.service || true
    systemctl restart waw-bot.service || true
  fi
  cleanup
  exit "$outcome"
}
trap rollback ERR
trap cleanup EXIT
cp /etc/systemd/system/waw-web.service "$unit_backup/waw-web.service"
cp /etc/systemd/system/waw-bot.service "$unit_backup/waw-bot.service"

install -m 644 "$release/deploy/systemd/waw-web.service" /etc/systemd/system/waw-web.service
install -m 644 "$release/deploy/systemd/waw-bot.service" /etc/systemd/system/waw-bot.service
systemctl daemon-reload
systemd-analyze verify waw-web.service waw-bot.service
bash "$manager" activate "$release_id"
rollback_needed=1
systemctl restart waw-web.service
systemctl restart waw-bot.service
systemctl is-active --quiet waw-web.service
systemctl is-active --quiet waw-bot.service
curl --fail --silent --show-error http://127.0.0.1:18080/health |
  grep -q '"status":"healthy"'
[[ "$(readlink -f /opt/waw/current)" == "$release" ]]
rollback_needed=0
echo "production_remote_activation_pass release=$release_id"
