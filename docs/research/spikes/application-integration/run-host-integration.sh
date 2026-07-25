#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "$(id -u)" == 0 ]] || { echo root_required >&2; exit 1; }
[[ -f package-lock.json && -f deploy/systemd/waw-web.service ]] ||
  { echo repository_root_required >&2; exit 1; }

NODE_VERSION="24.18.0"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_SHA256="55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742"
RELEASE_ROOT="/opt/waw/releases"
RELEASE_ID="task5-$(date -u +%Y%m%d%H%M%S)"
RELEASE="$RELEASE_ROOT/$RELEASE_ID"
PREVIOUS_LINK=""
SENTINEL_ROOT="$(mktemp -d /tmp/waw-existing-assets.XXXXXX)"
NODE_TMP="$(mktemp -d /tmp/waw-node.XXXXXX)"
cleanup() {
  status=$?
  set +e
  systemctl disable --now waw-web.service waw-bot.service >/dev/null 2>&1
  rm -f /etc/systemd/system/waw-web.service /etc/systemd/system/waw-bot.service
  rm -f /etc/caddy/Caddyfile
  rm -f /etc/waw-credentials/web-database-url \
    /etc/waw-credentials/web-oauth-client-secret \
    /etc/waw-credentials/bot-discord-token
  rm -f /opt/waw/current
  if [[ -n "$PREVIOUS_LINK" ]]; then
    ln -s "$PREVIOUS_LINK" /opt/waw/current
  fi
  rm -rf -- "$RELEASE" "$NODE_TMP" "$SENTINEL_ROOT"
  systemctl daemon-reload >/dev/null 2>&1
  exit "$status"
}
trap cleanup EXIT

for protected in \
  /etc/systemd/system/waw-backup.service \
  /etc/systemd/system/waw-backup.timer \
  /etc/systemd/system/waw-monitor.service \
  /etc/systemd/system/waw-monitor.timer \
  /etc/systemd/journald.conf.d/60-waw-retention.conf; do
  if [[ -e "$protected" ]]; then
    install -D -m 600 "$protected" "$SENTINEL_ROOT$protected"
  fi
done

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl xz-utils postgresql-common caddy >/dev/null
install -d -m 755 /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
. /etc/os-release
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
  "$VERSION_CODENAME" >/etc/apt/sources.list.d/pgdg.list
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-17 >/dev/null

curl --fail --silent --show-error \
  "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" \
  -o "$NODE_TMP/$NODE_ARCHIVE"
printf '%s  %s\n' "$NODE_SHA256" "$NODE_TMP/$NODE_ARCHIVE" | sha256sum --check --status
tar -xJf "$NODE_TMP/$NODE_ARCHIVE" -C /usr/local --strip-components=1
[[ "$(node --version)" == "v$NODE_VERSION" ]]

groupadd --system waw-build 2>/dev/null || true
useradd --system --gid waw-build --home /var/lib/waw-build --create-home \
  --shell /usr/sbin/nologin waw-build 2>/dev/null || true
groupadd --system waw-web 2>/dev/null || true
groupadd --system waw-bot 2>/dev/null || true
useradd --system --gid waw-web --home /var/lib/waw-web --create-home \
  --shell /usr/sbin/nologin waw-web 2>/dev/null || true
useradd --system --gid waw-bot --home /var/lib/waw-bot --create-home \
  --shell /usr/sbin/nologin waw-bot 2>/dev/null || true

install -d -m 755 "$RELEASE_ROOT"
install -d -m 750 -o waw-build -g waw-build "$RELEASE"
tar --exclude=.git --exclude=node_modules --exclude=dist -cf - . |
  tar -xf - -C "$RELEASE"
chown -R waw-build:waw-build "$RELEASE"
sudo -u waw-build -H bash -lc "cd '$RELEASE' && npm ci --ignore-scripts && npm run typecheck && npm run build"
sudo -u waw-build -H bash -lc \
  "cd '$RELEASE' && WAW_SKIP_POSTGRES_INTEGRATION=1 npm test"
npm audit --prefix "$RELEASE" --audit-level=high >/dev/null
find "$RELEASE" -type d -exec chmod a-w {} +
find "$RELEASE" -type f -exec chmod a-w {} +
if [[ -L /opt/waw/current ]]; then
  PREVIOUS_LINK="$(readlink -f /opt/waw/current)"
fi
ln -sfn "$RELEASE" /opt/waw/current

systemctl enable --now postgresql >/dev/null
sudo -u postgres psql --set ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waw_fixture') THEN
    CREATE ROLE waw_fixture LOGIN;
  END IF;
END
$$;
SELECT 'CREATE DATABASE waw_fixture OWNER waw_fixture'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'waw_fixture')\gexec
SQL

install -d -m 700 /etc/waw-credentials
printf '%s\n' 'postgresql://waw_fixture@/waw_fixture?host=%2Fvar%2Frun%2Fpostgresql' \
  >/etc/waw-credentials/web-database-url
printf '%s\n' 'SYNTHETIC_OAUTH_TASK5' \
  >/etc/waw-credentials/web-oauth-client-secret
printf '%s\n' 'SYNTHETIC_DISCORD_TASK5' \
  >/etc/waw-credentials/bot-discord-token
chmod 600 /etc/waw-credentials/*

"$RELEASE/deploy/install-application-integration-assets.sh" install
systemd-analyze verify /etc/systemd/system/waw-web.service /etc/systemd/system/waw-bot.service
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl daemon-reload
systemctl enable --now waw-web.service waw-bot.service caddy.service >/dev/null

for _ in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:18080/health |
    grep -q '"storage":{"status":"connected"}' && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:18080/health |
  grep -q '"storage":{"status":"connected"}'
ss -lnt | grep -q '127.0.0.1:18080'
! ss -lnt | grep -q '0.0.0.0:18080'
echo loopback_web_and_storage_passed

web_runtime="$(systemctl show waw-web.service -p Credentials --value)"
bot_runtime="$(systemctl show waw-bot.service -p Credentials --value)"
[[ "$web_runtime" == *database-url* && "$web_runtime" == *oauth-client-secret* ]]
[[ "$web_runtime" != *discord-bot-token* ]]
[[ "$bot_runtime" == *discord-bot-token* ]]
[[ "$bot_runtime" != *database-url* && "$bot_runtime" != *oauth-client-secret* ]]
web_pid="$(systemctl show waw-web.service -p MainPID --value)"
bot_pid="$(systemctl show waw-bot.service -p MainPID --value)"
! tr '\0' '\n' </proc/"$web_pid"/environ | grep -q SYNTHETIC_
! tr '\0' '\n' </proc/"$bot_pid"/environ | grep -q SYNTHETIC_
! tr '\0' ' ' </proc/"$web_pid"/cmdline | grep -q SYNTHETIC_
! tr '\0' ' ' </proc/"$bot_pid"/cmdline | grep -q SYNTHETIC_
! journalctl -u waw-web.service -u waw-bot.service --output=cat --no-pager |
  grep -q SYNTHETIC_
echo credential_and_process_isolation_passed

set +e
systemd-run --quiet --wait --collect --unit=waw-bot-duplicate \
  --property=User=waw-bot --property=Group=waw-bot \
  --property=RuntimeDirectory=waw-bot \
  --property=LoadCredential=discord-bot-token:/etc/waw-credentials/bot-discord-token \
  /usr/bin/node /opt/waw/current/dist/server/integration/bot-fixture.js
duplicate_status=$?
set -e
[[ "$duplicate_status" == 73 ]]
echo singleton_duplicate_denied

web_pid_before="$web_pid"
kill -KILL "$web_pid_before"
for _ in $(seq 1 20); do
  sleep 1
  web_pid_after="$(systemctl show waw-web.service -p MainPID --value)"
  [[ "$web_pid_after" != 0 && "$web_pid_after" != "$web_pid_before" ]] && break
done
[[ "$web_pid_after" != 0 && "$web_pid_after" != "$web_pid_before" ]]
curl --fail --silent http://127.0.0.1:18080/health >/dev/null
echo crash_restart_passed

systemctl stop postgresql
for _ in $(seq 1 10); do
  status="$(curl --silent --output /tmp/waw-health.json --write-out '%{http_code}' \
    http://127.0.0.1:18080/health || true)"
  [[ "$status" == 503 ]] && break
  sleep 1
done
[[ "$status" == 503 ]]
grep -q '"status":"unavailable"' /tmp/waw-health.json
rm -f /tmp/waw-health.json
systemctl start postgresql
echo storage_unavailable_passed

bad_release="$RELEASE_ROOT/${RELEASE_ID}-bad"
cp -a "$RELEASE" "$bad_release"
chmod u+w "$bad_release/dist/server/integration/web-fixture.js"
printf 'process.exit(42);\n' >"$bad_release/dist/server/integration/web-fixture.js"
chmod a-w "$bad_release/dist/server/integration/web-fixture.js"
ln -sfn "$bad_release" /opt/waw/current
systemctl restart waw-web.service || true
sleep 2
! curl --fail --silent http://127.0.0.1:18080/health >/dev/null 2>&1
ln -sfn "$RELEASE" /opt/waw/current
systemctl reset-failed waw-web.service
systemctl restart waw-web.service
curl --retry 20 --retry-delay 1 --retry-connrefused --fail --silent \
  http://127.0.0.1:18080/health >/dev/null
rm -rf -- "$bad_release"
echo failed_release_rollback_passed

[[ "$(systemctl show waw-web.service -p MemoryMax --value)" == 268435456 ]]
[[ "$(systemctl show waw-bot.service -p MemoryMax --value)" == 268435456 ]]
for protected in \
  /etc/systemd/system/waw-backup.service \
  /etc/systemd/system/waw-backup.timer \
  /etc/systemd/system/waw-monitor.service \
  /etc/systemd/system/waw-monitor.timer \
  /etc/systemd/journald.conf.d/60-waw-retention.conf; do
  if [[ -e "$SENTINEL_ROOT$protected" ]]; then
    cmp -s "$SENTINEL_ROOT$protected" "$protected"
  fi
done
echo existing_operations_assets_preserved
echo application_host_integration_passed
