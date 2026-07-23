#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-monitor-root.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT

install -d -m 755 "$ROOT/usr/lib/systemd/system" "$ROOT/usr/bin" "$ROOT/opt/waw/current/src/operations" \
  "$ROOT/var/lib/waw-backup" "$ROOT/var/log/journal" "$ROOT/etc/waw-credentials" \
  "$ROOT/etc/systemd/journald.conf.d"
install -m 755 /bin/true "$ROOT/usr/bin/node"
install -m 644 /dev/null "$ROOT/opt/waw/current/src/operations/run-monitor.ts"
install -m 600 /dev/null "$ROOT/etc/waw-credentials/monitor-discord-webhook"
install -m 600 /dev/null "$ROOT/var/lib/waw-backup/last-published.json"
if [[ -f /usr/lib/systemd/journald.conf ]]; then
  install -m 644 /usr/lib/systemd/journald.conf "$ROOT/usr/lib/systemd/journald.conf"
fi
printf '[Unit]\nDescription=Test system initialization target\n' > "$ROOT/usr/lib/systemd/system/sysinit.target"
printf '[Journal]\nRateLimitBurst=5000\n' > "$ROOT/etc/systemd/journald.conf.d/20-existing.conf"

WAW_INSTALL_ROOT="$ROOT" "$SCRIPT_DIR/install-journald-monitoring-assets.sh" install >/dev/null
WAW_INSTALL_ROOT="$ROOT" "$SCRIPT_DIR/install-journald-monitoring-assets.sh" install >/dev/null

effective="$(systemd-analyze --root="$ROOT" cat-config systemd/journald.conf)"
for setting in Storage=persistent Compress=yes SystemMaxUse=1G SystemKeepFree=4G \
  MaxFileSec=1day MaxRetentionSec=30day ForwardToSyslog=no ForwardToKMsg=no \
  ForwardToConsole=no ForwardToWall=no; do
  grep -Fqx "$setting" <<<"$effective"
done
grep -Fqx RateLimitBurst=5000 <<<"$effective"
systemd-analyze --root="$ROOT" verify waw-monitor.service waw-monitor.timer
grep -Fqx 'LoadCredential=discord-webhook:/etc/waw-credentials/monitor-discord-webhook' \
  "$ROOT/etc/systemd/system/waw-monitor.service"
! grep -Eq 'Environment=.*(webhook|token|secret)' "$ROOT/etc/systemd/system/waw-monitor.service"

WAW_INSTALL_ROOT="$ROOT" "$SCRIPT_DIR/install-journald-monitoring-assets.sh" rollback >/dev/null
for path in \
  /etc/systemd/journald.conf.d/60-waw-retention.conf \
  /etc/waw-monitor/config.json \
  /etc/systemd/system/waw-monitor.service \
  /etc/systemd/system/waw-monitor.timer; do
  [[ ! -e "$ROOT$path" ]]
done
grep -Fqx RateLimitBurst=5000 "$ROOT/etc/systemd/journald.conf.d/20-existing.conf"

printf 'existing-owner-config\n' > "$ROOT/etc/systemd/journald.conf.d/60-waw-retention.conf"
if WAW_INSTALL_ROOT="$ROOT" "$SCRIPT_DIR/install-journald-monitoring-assets.sh" install >/dev/null 2>&1; then
  echo conflicting_target_overwritten >&2
  exit 1
fi
grep -Fqx existing-owner-config "$ROOT/etc/systemd/journald.conf.d/60-waw-retention.conf"
echo monitoring_assets_dry_run_passed
