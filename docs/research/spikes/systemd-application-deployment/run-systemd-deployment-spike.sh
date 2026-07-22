#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REGION="ap-northeast-2"
ZONE="ap-northeast-2a"
PREFIX="waw-systemd-deployment-spike"
RUN_ID="$(date -u +%Y%m%d%H%M%S)"
INSTANCE="$PREFIX-$RUN_ID-vm"
KEY_PAIR="$PREFIX-$RUN_ID-key"
TMP="$(mktemp -d /tmp/waw-systemd-spike.XXXXXX)"
INSTANCE_CREATED=0
KEY_CREATED=0

cleanup() {
  status=$?
  set +e
  if [[ $INSTANCE_CREATED -eq 1 ]]; then
    aws lightsail delete-instance --region "$REGION" --instance-name "$INSTANCE" >/dev/null 2>&1
  fi
  if [[ $KEY_CREATED -eq 1 ]]; then
    aws lightsail delete-key-pair --region "$REGION" --key-pair-name "$KEY_PAIR" >/dev/null 2>&1
  fi
  rm -rf -- "$TMP"
  for _ in $(seq 1 24); do
    instances="$(aws lightsail get-instances --region "$REGION" --query "length(instances[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    keys="$(aws lightsail get-key-pairs --region "$REGION" --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    [[ "$instances" == 0 && "$keys" == 0 ]] && break
    sleep 5
  done
  printf 'cleanup_instance_count=%s\ncleanup_key_count=%s\n' "${instances:-unknown}" "${keys:-unknown}"
  exit "$status"
}
trap cleanup EXIT

for command in aws curl ssh ssh-keygen; do
  command -v "$command" >/dev/null || { echo "missing_command=$command" >&2; exit 1; }
done

[[ "$(aws lightsail get-instances --region "$REGION" --query "length(instances[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-key-pairs --region "$REGION" --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-blueprints --region "$REGION" --include-inactive --query "length(blueprints[?blueprintId=='ubuntu_24_04' && isActive])" --output text)" == 1 ]]
[[ "$(aws lightsail get-bundles --region "$REGION" --include-inactive --query "length(bundles[?bundleId=='micro_3_0' && isActive && ramSizeInGb==\`1\`])" --output text)" == 1 ]]

CLIENT_IP="$(curl --fail --silent --show-error https://checkip.amazonaws.com | tr -d '[:space:]')"
[[ "$CLIENT_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
ssh-keygen -q -t ed25519 -N '' -C "$KEY_PAIR" -f "$TMP/id_ed25519"
aws lightsail import-key-pair --region "$REGION" --key-pair-name "$KEY_PAIR" \
  --public-key-base64 file://"$TMP/id_ed25519.pub" >/dev/null
KEY_CREATED=1
aws lightsail create-instances --region "$REGION" --instance-names "$INSTANCE" \
  --availability-zone "$ZONE" --blueprint-id ubuntu_24_04 --bundle-id micro_3_0 \
  --key-pair-name "$KEY_PAIR" \
  --tags key=purpose,value=waw-systemd-deployment-spike key=expires,value=2026-07-23 >/dev/null
INSTANCE_CREATED=1

for _ in $(seq 1 36); do
  state="$(aws lightsail get-instance --region "$REGION" --instance-name "$INSTANCE" --query instance.state.name --output text)"
  [[ "$state" == running ]] && break
  sleep 5
done
[[ "$state" == running ]]

aws lightsail close-instance-public-ports --region "$REGION" --instance-name "$INSTANCE" \
  --port-info fromPort=22,toPort=22,protocol=tcp >/dev/null
aws lightsail open-instance-public-ports --region "$REGION" --instance-name "$INSTANCE" \
  --port-info "fromPort=22,toPort=22,protocol=tcp,cidrs=${CLIENT_IP}/32" >/dev/null
HOST="$(aws lightsail get-instance --region "$REGION" --instance-name "$INSTANCE" --query instance.publicIpAddress --output text)"
SSH=(ssh -i "$TMP/id_ed25519" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$TMP/known_hosts" ubuntu@"$HOST")

for _ in $(seq 1 36); do
  "${SSH[@]}" true >/dev/null 2>&1 && break
  sleep 5
done
"${SSH[@]}" true

"${SSH[@]}" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs curl >/dev/null
sudo groupadd --system waw-web 2>/dev/null || true
sudo groupadd --system waw-bot 2>/dev/null || true
sudo useradd --system --gid waw-web --home /var/lib/waw-web --create-home --shell /usr/sbin/nologin waw-web 2>/dev/null || true
sudo useradd --system --gid waw-bot --home /var/lib/waw-bot --create-home --shell /usr/sbin/nologin waw-bot 2>/dev/null || true
sudo install -d -m 755 /opt/waw/releases/v1 /opt/waw/releases/bad
sudo install -d -m 700 -o waw-web -g waw-web /var/lib/waw-web
sudo install -d -m 700 -o waw-bot -g waw-bot /var/lib/waw-bot
sudo install -d -m 750 -o root -g waw-web /etc/waw/web
sudo install -d -m 750 -o root -g waw-bot /etc/waw/bot
printf 'WEB_SYNTHETIC_SECRET=web-only\n' | sudo tee /etc/waw/web/runtime.env >/dev/null
printf 'BOT_SYNTHETIC_SECRET=bot-only\n' | sudo tee /etc/waw/bot/runtime.env >/dev/null
sudo chown root:waw-web /etc/waw/web/runtime.env
sudo chown root:waw-bot /etc/waw/bot/runtime.env
sudo chmod 640 /etc/waw/web/runtime.env /etc/waw/bot/runtime.env

sudo tee /opt/waw/releases/v1/web.mjs >/dev/null <<'JS'
import http from 'node:http';
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, {'content-type':'application/json'});
    response.end('{"status":"healthy","version":"v1"}');
  } else { response.writeHead(404); response.end(); }
});
server.listen(18080, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
JS
sudo tee /opt/waw/releases/v1/bot.mjs >/dev/null <<'JS'
import fs from 'node:fs';
const lock = '/run/waw-bot/singleton';
try { fs.writeFileSync(lock, String(process.pid), {flag:'wx', mode:0o600}); }
catch { process.exit(73); }
const cleanup = () => { try { fs.unlinkSync(lock); } catch {} process.exit(0); };
process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup);
setInterval(() => {}, 1000);
JS
sudo tee /opt/waw/releases/bad/web.mjs >/dev/null <<'JS'
process.exit(42);
JS
sudo cp /opt/waw/releases/v1/bot.mjs /opt/waw/releases/bad/bot.mjs
sudo chmod -R a-w /opt/waw/releases
sudo ln -sfn /opt/waw/releases/v1 /opt/waw/current

sudo tee /etc/systemd/system/waw-web-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW synthetic web systemd Spike
After=network-online.target
StartLimitIntervalSec=20s
StartLimitBurst=4
[Service]
Type=simple
User=waw-web
Group=waw-web
EnvironmentFile=/etc/waw/web/runtime.env
ExecStart=/usr/bin/node /opt/waw/current/web.mjs
Restart=on-failure
RestartSec=1s
TimeoutStopSec=10s
MemoryHigh=96M
MemoryMax=128M
TasksMax=64
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw
ReadWritePaths=/var/lib/waw-web
[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/waw-bot-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW synthetic bot systemd Spike
After=network-online.target
StartLimitIntervalSec=20s
StartLimitBurst=4
[Service]
Type=simple
User=waw-bot
Group=waw-bot
EnvironmentFile=/etc/waw/bot/runtime.env
RuntimeDirectory=waw-bot
RuntimeDirectoryMode=0700
ExecStart=/usr/bin/node /opt/waw/current/bot.mjs
Restart=on-failure
RestartSec=1s
TimeoutStopSec=10s
MemoryHigh=96M
MemoryMax=128M
TasksMax=64
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw
ReadWritePaths=/var/lib/waw-bot /run/waw-bot
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now waw-web-spike.service waw-bot-spike.service >/dev/null
curl --fail --silent http://127.0.0.1:18080/health | grep -q '"version":"v1"'
sudo -u waw-web test -r /etc/waw/web/runtime.env
! sudo -u waw-web test -r /etc/waw/bot/runtime.env
sudo -u waw-bot test -r /etc/waw/bot/runtime.env
! sudo -u waw-bot test -r /etc/waw/web/runtime.env
echo cross_secret_deny_passed

web_pid_before="$(systemctl show waw-web-spike.service -p MainPID --value)"
sudo kill -KILL "$web_pid_before"
for _ in $(seq 1 15); do
  sleep 1
  web_pid_after="$(systemctl show waw-web-spike.service -p MainPID --value)"
  [[ "$web_pid_after" != 0 && "$web_pid_after" != "$web_pid_before" ]] && break
done
[[ "$web_pid_after" != 0 && "$web_pid_after" != "$web_pid_before" ]]
curl --fail --silent http://127.0.0.1:18080/health >/dev/null
echo crash_restart_passed

set +e
sudo -u waw-bot /usr/bin/node /opt/waw/current/bot.mjs
duplicate_status=$?
set -e
[[ "$duplicate_status" == 73 ]]
echo singleton_duplicate_denied

sudo ln -sfn /opt/waw/releases/bad /opt/waw/current
if sudo systemctl restart waw-web-spike.service; then
  sleep 2
fi
if curl --fail --silent http://127.0.0.1:18080/health >/dev/null 2>&1; then
  echo bad_release_unexpectedly_healthy >&2
  exit 1
fi
sudo ln -sfn /opt/waw/releases/v1 /opt/waw/current
sudo systemctl reset-failed waw-web-spike.service
sudo systemctl restart waw-web-spike.service
curl --retry 10 --retry-delay 1 --retry-connrefused --fail --silent http://127.0.0.1:18080/health | grep -q '"version":"v1"'
echo failed_release_rollback_passed

[[ "$(systemctl show waw-web-spike.service -p MemoryMax --value)" == 134217728 ]]
[[ "$(systemctl show waw-bot-spike.service -p MemoryMax --value)" == 134217728 ]]
ss -lntp | grep -q '127.0.0.1:18080'
! ss -lntp | grep -q '0.0.0.0:18080'
echo cgroup_and_local_port_passed
REMOTE

"${SSH[@]}" 'sudo reboot' >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  sleep 5
  "${SSH[@]}" true >/dev/null 2>&1 && break
done
"${SSH[@]}" 'set -Eeuo pipefail; systemctl is-enabled --quiet waw-web-spike.service; systemctl is-active --quiet waw-web-spike.service; systemctl is-enabled --quiet waw-bot-spike.service; systemctl is-active --quiet waw-bot-spike.service; curl --fail --silent http://127.0.0.1:18080/health | grep -q '\"version\":\"v1\"'; test "$(systemctl show waw-web-spike.service -p NRestarts --value)" -ge 0; echo reboot_recovery_passed'

port_count="$(aws lightsail get-instance-port-states --region "$REGION" --instance-name "$INSTANCE" \
  --query 'length(portStates[?state==`open` && fromPort==`22` && toPort==`22`])' --output text)"
[[ "$port_count" == 1 ]]
echo systemd_deployment_spike_passed
