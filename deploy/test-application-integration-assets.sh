#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-application-assets.XXXXXX)"
cleanup() {
  rm -rf -- "$ROOT"
}
trap cleanup EXIT

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export WAW_INSTALL_ROOT="$ROOT"

"$SCRIPT_DIR/install-application-integration-assets.sh" install |
  grep -qx application_integration_assets_installed

web="$ROOT/etc/systemd/system/waw-web.service"
bot="$ROOT/etc/systemd/system/waw-bot.service"
caddy="$ROOT/etc/caddy/Caddyfile"

grep -q '^User=waw-web$' "$web"
grep -q '^User=waw-bot$' "$bot"
grep -q '^Environment=WAW_WEB_HOST=127\.0\.0\.1$' "$web"
grep -q '^LoadCredential=database-url:' "$web"
grep -q '^LoadCredential=oauth-client-secret:' "$web"
grep -q '^LoadCredential=discord-bot-token:' "$bot"
grep -q '^MemoryMax=256M$' "$web"
grep -q '^MemoryMax=256M$' "$bot"
grep -q '^NoNewPrivileges=true$' "$web"
grep -q '^NoNewPrivileges=true$' "$bot"
grep -q 'reverse_proxy 127\.0\.0\.1:18080' "$caddy"
grep -q 'output discard' "$caddy"

if command -v systemd-analyze >/dev/null; then
  install -d -m 755 "$ROOT/usr/local/bin" "$ROOT/usr/lib/systemd/system"
  printf '#!/bin/sh\nexit 0\n' >"$ROOT/usr/local/bin/node"
  chmod 755 "$ROOT/usr/local/bin/node"
  for target in sysinit.target basic.target network.target network-online.target multi-user.target; do
    printf '[Unit]\nDescription=Fixture %s\n' "$target" >"$ROOT/usr/lib/systemd/system/$target"
  done
  chmod 644 "$web" "$bot"
  systemd-analyze verify --root="$ROOT" "$web" "$bot"
fi

for protected in \
  etc/systemd/system/waw-backup.service \
  etc/systemd/system/waw-backup.timer \
  etc/systemd/system/waw-monitor.service \
  etc/systemd/system/waw-monitor.timer \
  etc/systemd/journald.conf.d/60-waw-retention.conf; do
  [[ ! -e "$ROOT/$protected" ]]
done

cp "$web" "$web.changed"
printf '\n# owner change\n' >>"$web"
if "$SCRIPT_DIR/install-application-integration-assets.sh" install >/dev/null 2>&1; then
  echo changed_target_was_overwritten >&2
  exit 1
fi
mv "$web.changed" "$web"

"$SCRIPT_DIR/install-application-integration-assets.sh" rollback |
  grep -qx application_integration_assets_rolled_back
[[ ! -e "$web" && ! -e "$bot" && ! -e "$caddy" ]]

echo application_integration_assets_test_passed
