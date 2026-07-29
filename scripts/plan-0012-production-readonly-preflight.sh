#!/usr/bin/env bash
set -Eeuo pipefail
set +x

fail() {
  printf 'PLAN0012_PREFLIGHT result=STOPPED reason=%s\n' "$1"
  exit 1
}

current="$(sudo readlink -f /opt/waw/current)"
previous="$(sudo readlink -f /opt/waw/previous)"
case "$current" in /opt/waw/releases/*) ;; *) fail current_release ;; esac
case "$previous" in /opt/waw/releases/*) ;; *) fail rollback_release ;; esac
[[ "$current" != "$previous" ]] || fail rollback_not_distinct
[[ -d "$current" && -d "$previous" ]] || fail release_missing

for unit in waw-web.service waw-bot.service caddy.service waw-backup.timer waw-monitor.timer systemd-journald.service; do
  [[ "$(sudo systemctl is-active "$unit")" == active ]] || fail service_inactive
done
for unit in waw-web.service waw-bot.service caddy.service waw-backup.timer waw-monitor.timer; do
  [[ "$(sudo systemctl is-enabled "$unit")" == enabled ]] || fail service_disabled
done
[[ -z "$(sudo systemctl --failed --no-legend)" ]] || fail failed_unit
for unit in waw-backup.service waw-monitor.service; do
  [[ "$(sudo systemctl show "$unit" -p Result --value)" == success ]] ||
    fail job_result
  [[ "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" == 0 ]] ||
    fail job_status
done

marker=/var/lib/waw-backup/last-published.json
sudo jq -e '
  .status == "published" and
  (.schemaVersion | type == "number" and . > 0 and floor == .) and
  (.expectedRowCount | type == "number" and . >= 0 and floor == .) and
  .expectedInvariant == "constraints_valid" and
  (.completedAt | type == "string" and length > 0)
' "$marker" >/dev/null || fail backup_marker
completed="$(sudo jq -r '.completedAt' "$marker")"
completed_epoch="$(date -d "$completed" +%s)" || fail backup_timestamp
now_epoch="$(date +%s)"
backup_age=$((now_epoch - completed_epoch))
[[ "$backup_age" -ge 0 && "$backup_age" -le 86400 ]] || fail backup_stale

schema_output="$(sudo WAW_EXPECTED_SCHEMA_VERSION=8 \
  bash "$current/scripts/check-production-schema-version.sh")" ||
  fail schema_preflight
grep -Fq 'SCHEMA_PREFLIGHT query=PASS version=8' <<<"$schema_output" ||
  fail schema_version

loopback="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18080/health)" ||
  fail loopback_health
canonical="$(curl --fail --silent --show-error --max-time 15 https://waw.dubeom.com/health)" ||
  fail canonical_health
[[ "$loopback" == '{"status":"healthy"}' ]] || fail loopback_unhealthy
[[ "$canonical" == '{"status":"healthy"}' ]] || fail canonical_unhealthy

disk_available="$(df --output=avail -B1 /opt/waw | tail -n 1 | tr -d ' ')"
memory_available="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
[[ "$disk_available" =~ ^[0-9]+$ && "$disk_available" -ge 1073741824 ]] ||
  fail disk_capacity
[[ "$memory_available" =~ ^[0-9]+$ && "$memory_available" -ge 262144 ]] ||
  fail memory_capacity

web_pid="$(sudo systemctl show waw-web.service -p MainPID --value)"
bot_pid="$(sudo systemctl show waw-bot.service -p MainPID --value)"
[[ "$web_pid" =~ ^[1-9][0-9]*$ && "$bot_pid" =~ ^[1-9][0-9]*$ ]] ||
  fail process_identity

printf 'PLAN0012_PREFLIGHT result=PASS current=%s previous=%s schema=8 backup_completed=%s backup_age_seconds=%s disk_available_bytes=%s memory_available_kib=%s\n' \
  "$(basename "$current")" \
  "$(basename "$previous")" \
  "$completed" \
  "$backup_age" \
  "$disk_available" \
  "$memory_available"
