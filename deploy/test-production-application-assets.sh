#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-production-assets.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export WAW_INSTALL_ROOT="$ROOT"

"$SCRIPT_DIR/install-production-application-assets.sh" install |
  grep -qx production_application_assets_installed

web="$ROOT/etc/systemd/system/waw-web.service"
bot="$ROOT/etc/systemd/system/waw-bot.service"
caddy="$ROOT/etc/caddy/Caddyfile"
production_caddy="$SCRIPT_DIR/caddy/Caddyfile.production"
grep -q 'dist/server/web/main.js$' "$web"
grep -q 'dist/server/bot/main.js$' "$bot"
grep -q '^LoadCredential=csrf-key:' "$web"
grep -q '^SupplementaryGroups=waw-member-role$' "$web"
grep -q '^Group=waw-member-role$' "$bot"
grep -q '^RuntimeDirectory=waw-bot waw-member-role$' "$bot"
grep -q 'http://127.0.0.1:18081' "$caddy"
grep -q 'reverse_proxy 127.0.0.1:18080' "$caddy"
grep -qx 'waw.dubeom.com {' "$production_caddy"
grep -q 'reverse_proxy 127.0.0.1:18080' "$production_caddy"
grep -q 'output discard' "$production_caddy"
! grep -q 'auto_https off' "$production_caddy"

for protected in \
  etc/systemd/system/waw-backup.service \
  etc/systemd/system/waw-backup.timer \
  etc/systemd/system/waw-monitor.service \
  etc/systemd/system/waw-monitor.timer \
  etc/systemd/journald.conf.d/60-waw-retention.conf; do
  [[ ! -e "$ROOT/$protected" ]]
done

printf '\n# conflict\n' >>"$web"
if "$SCRIPT_DIR/install-production-application-assets.sh" install >/dev/null 2>&1; then
  echo changed_target_was_overwritten >&2
  exit 1
fi
cp "$SCRIPT_DIR/systemd/waw-web.service" "$web"

"$SCRIPT_DIR/install-production-application-assets.sh" rollback |
  grep -qx production_application_assets_rolled_back
[[ ! -e "$web" && ! -e "$bot" && ! -e "$caddy" ]]
echo production_application_assets_test_passed
