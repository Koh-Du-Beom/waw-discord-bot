#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
trap 'printf "spike_error_line=%s\n" "$LINENO" >&2' ERR

REGION="ap-northeast-2"
ZONE="ap-northeast-2a"
PREFIX="waw-systemd-credential-spike"
RUN_ID="$(date -u +%Y%m%d%H%M%S)"
INSTANCE="$PREFIX-$RUN_ID-vm"
KEY_PAIR="$PREFIX-$RUN_ID-key"
TMP="$(mktemp -d /tmp/waw-systemd-credential-spike.XXXXXX)"
INSTANCE_CREATED=0
KEY_CREATED=0

cleanup() {
  status=$?
  trap - ERR
  set +e
  if [[ $INSTANCE_CREATED -eq 1 ]]; then
    aws lightsail delete-instance --region "$REGION" --instance-name "$INSTANCE" >/dev/null 2>&1
  fi
  if [[ $KEY_CREATED -eq 1 ]]; then
    aws lightsail delete-key-pair --region "$REGION" --key-pair-name "$KEY_PAIR" >/dev/null 2>&1
  fi
  rm -rf -- "$TMP"
  instances=unknown
  keys=unknown
  for _ in $(seq 1 24); do
    instances="$(aws lightsail get-instances --region "$REGION" --query "length(instances[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    keys="$(aws lightsail get-key-pairs --region "$REGION" --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    [[ "$instances" == 0 && "$keys" == 0 ]] && break
    sleep 5
  done
  printf 'cleanup_instance_count=%s\ncleanup_key_count=%s\n' "$instances" "$keys"
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
  --tags key=purpose,value=waw-systemd-credential-spike key=expires,value=2026-07-23 >/dev/null
INSTANCE_CREATED=1

state=unknown
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
SSH=(ssh -i "$TMP/id_ed25519" -o ConnectTimeout=5 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$TMP/known_hosts" ubuntu@"$HOST")

for _ in $(seq 1 36); do
  "${SSH[@]}" true >/dev/null 2>&1 && break
  sleep 5
done
"${SSH[@]}" true

"${SSH[@]}" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
sudo groupadd --system waw-web 2>/dev/null || true
sudo groupadd --system waw-bot 2>/dev/null || true
sudo useradd --system --gid waw-web --home /var/lib/waw-web --create-home --shell /usr/sbin/nologin waw-web 2>/dev/null || true
sudo useradd --system --gid waw-bot --home /var/lib/waw-bot --create-home --shell /usr/sbin/nologin waw-bot 2>/dev/null || true
sudo install -d -m 700 -o root -g root /etc/waw-credentials
sudo install -d -m 755 -o root -g root /opt/waw-credential-fixture
sudo install -d -m 700 -o waw-web -g waw-web /var/lib/waw-web
sudo install -d -m 700 -o waw-bot -g waw-bot /var/lib/waw-bot

web_old="synthetic-web-$(tr -d '-' </proc/sys/kernel/random/uuid)"
web_new="synthetic-web-$(tr -d '-' </proc/sys/kernel/random/uuid)"
bot_good="synthetic-bot-$(tr -d '-' </proc/sys/kernel/random/uuid)"
bot_bad="synthetic-bot-$(tr -d '-' </proc/sys/kernel/random/uuid)"
printf '%s' "$web_old" | sudo tee /etc/waw-credentials/web >/dev/null
printf '%s' "$bot_good" | sudo tee /etc/waw-credentials/bot >/dev/null
printf '%s' "$web_old" | sudo tee /opt/waw-credential-fixture/web-allowed >/dev/null
printf '%s' "$bot_good" | sudo tee /opt/waw-credential-fixture/bot-allowed >/dev/null
sudo chown root:root /etc/waw-credentials/web /etc/waw-credentials/bot /opt/waw-credential-fixture/*
sudo chmod 600 /etc/waw-credentials/web /etc/waw-credentials/bot
sudo chmod 644 /opt/waw-credential-fixture/web-allowed /opt/waw-credential-fixture/bot-allowed

sudo tee /opt/waw-credential-fixture/service.sh >/dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
service_name="$1"
credential_name="$2"
if [[ "$service_name" == duplicate ]]; then
  exec 9>/run/waw-bot/singleton
  flock -n 9 || exit 73
  exit 0
fi
allowed_file="/opt/waw-credential-fixture/${service_name}-allowed"
credential_file="${CREDENTIALS_DIRECTORY}/${credential_name}"
forbidden_file="$3"
cmp --silent "$credential_file" "$allowed_file" || exit 42
test ! -r "$forbidden_file" || exit 43
if [[ "$service_name" == bot ]]; then
  exec 9>/run/waw-bot/singleton
  flock -n 9 || exit 73
fi
trap 'exit 0' TERM INT
while true; do sleep 10; done
SCRIPT
sudo chmod 755 /opt/waw-credential-fixture/service.sh

sudo tee /etc/systemd/system/waw-web-credential-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW synthetic web credential Spike
[Service]
Type=simple
User=waw-web
Group=waw-web
LoadCredential=web-token:/etc/waw-credentials/web
ExecStart=/opt/waw-credential-fixture/service.sh web web-token /run/credentials/waw-bot-credential-spike.service/bot-token
Restart=no
NoNewPrivileges=true
PrivateMounts=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw-credential-fixture
ReadWritePaths=/var/lib/waw-web
UNIT
sudo tee /etc/systemd/system/waw-bot-credential-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW synthetic bot credential Spike
[Service]
Type=simple
User=waw-bot
Group=waw-bot
LoadCredential=bot-token:/etc/waw-credentials/bot
RuntimeDirectory=waw-bot
RuntimeDirectoryMode=0700
ExecStart=/opt/waw-credential-fixture/service.sh bot bot-token /run/credentials/waw-web-credential-spike.service/web-token
Restart=no
NoNewPrivileges=true
PrivateMounts=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw-credential-fixture
ReadWritePaths=/var/lib/waw-bot /run/waw-bot
UNIT
sudo systemctl daemon-reload
sudo systemctl start waw-web-credential-spike.service waw-bot-credential-spike.service
systemctl is-active --quiet waw-web-credential-spike.service
systemctl is-active --quiet waw-bot-credential-spike.service

! sudo -u waw-web test -r /etc/waw-credentials/web
! sudo -u waw-web test -r /etc/waw-credentials/bot
! sudo -u waw-bot test -r /etc/waw-credentials/web
! sudo -u waw-bot test -r /etc/waw-credentials/bot
! sudo -u waw-web test -r /run/credentials/waw-bot-credential-spike.service/bot-token
! sudo -u waw-bot test -r /run/credentials/waw-web-credential-spike.service/web-token
echo source_and_runtime_isolation_passed

web_pid="$(systemctl show waw-web-credential-spike.service -p MainPID --value)"
bot_pid="$(systemctl show waw-bot-credential-spike.service -p MainPID --value)"
for value in "$web_old" "$web_new" "$bot_good" "$bot_bad"; do
  ! sudo cat /proc/"$web_pid"/environ | tr '\0' '\n' | grep -Fq -- "$value"
  ! sudo cat /proc/"$bot_pid"/environ | tr '\0' '\n' | grep -Fq -- "$value"
  ! sudo cat /proc/"$web_pid"/cmdline | tr '\0' ' ' | grep -Fq -- "$value"
  ! sudo cat /proc/"$bot_pid"/cmdline | tr '\0' ' ' | grep -Fq -- "$value"
  ! sudo journalctl -u waw-web-credential-spike.service -u waw-bot-credential-spike.service --no-pager | grep -Fq -- "$value"
done
echo process_and_journal_absence_passed

sudo systemctl stop waw-web-credential-spike.service
! test -e /run/credentials/waw-web-credential-spike.service
sudo systemctl start waw-web-credential-spike.service
systemctl is-active --quiet waw-web-credential-spike.service
echo stop_runtime_absence_passed

web_pid_before="$(systemctl show waw-web-credential-spike.service -p MainPID --value)"
bot_pid_before="$(systemctl show waw-bot-credential-spike.service -p MainPID --value)"
printf '%s' "$web_new" | sudo tee /etc/waw-credentials/web.next >/dev/null
sudo chown root:root /etc/waw-credentials/web.next
sudo chmod 600 /etc/waw-credentials/web.next
sudo cp --preserve=mode,ownership /etc/waw-credentials/web /etc/waw-credentials/web.previous
printf '%s' "$web_new" | sudo tee /opt/waw-credential-fixture/web-allowed.next >/dev/null
sudo chown root:root /opt/waw-credential-fixture/web-allowed.next
sudo chmod 644 /opt/waw-credential-fixture/web-allowed.next
sudo mv /opt/waw-credential-fixture/web-allowed.next /opt/waw-credential-fixture/web-allowed
sudo mv /etc/waw-credentials/web.next /etc/waw-credentials/web
sudo systemctl restart waw-web-credential-spike.service
systemctl is-active --quiet waw-web-credential-spike.service
sudo cmp --silent /etc/waw-credentials/web /opt/waw-credential-fixture/web-allowed
! sudo cmp --silent /etc/waw-credentials/web.previous /opt/waw-credential-fixture/web-allowed
web_pid_after="$(systemctl show waw-web-credential-spike.service -p MainPID --value)"
[[ "$web_pid_after" != "$web_pid_before" ]]
[[ "$(systemctl show waw-bot-credential-spike.service -p MainPID --value)" == "$bot_pid_before" ]]
sudo rm -f /etc/waw-credentials/web.previous
echo atomic_rotation_passed

printf '%s' "$bot_bad" | sudo tee /etc/waw-credentials/bot.next >/dev/null
sudo chown root:root /etc/waw-credentials/bot.next
sudo chmod 600 /etc/waw-credentials/bot.next
sudo cp --preserve=mode,ownership /etc/waw-credentials/bot /etc/waw-credentials/bot.previous
sudo mv /etc/waw-credentials/bot.next /etc/waw-credentials/bot
sudo systemctl restart waw-bot-credential-spike.service || true
for _ in $(seq 1 10); do
  systemctl is-active --quiet waw-bot-credential-spike.service || break
  sleep 1
done
! systemctl is-active --quiet waw-bot-credential-spike.service
[[ "$(systemctl show waw-bot-credential-spike.service -p Result --value)" == exit-code ]]
sudo mv /etc/waw-credentials/bot.previous /etc/waw-credentials/bot
sudo systemctl reset-failed waw-bot-credential-spike.service
sudo systemctl start waw-bot-credential-spike.service
systemctl is-active --quiet waw-bot-credential-spike.service
echo failed_rotation_rollback_passed

bot_pid_after_rollback="$(systemctl show waw-bot-credential-spike.service -p MainPID --value)"
lock_held=0
for _ in $(seq 1 50); do
  if ! sudo -u waw-bot flock -n /run/waw-bot/singleton true; then
    lock_held=1
    break
  fi
  sleep 0.1
done
[[ "$lock_held" == 1 ]]
set +e
sudo -u waw-bot env CREDENTIALS_DIRECTORY=/run/credentials/waw-bot-credential-spike.service \
  /opt/waw-credential-fixture/service.sh duplicate unused unused
duplicate_status=$?
set -e
[[ "$duplicate_status" == 73 ]]
systemctl is-active --quiet waw-bot-credential-spike.service
[[ "$(systemctl show waw-bot-credential-spike.service -p MainPID --value)" == "$bot_pid_after_rollback" ]]
echo singleton_after_rollback_passed

for value in "$web_old" "$web_new" "$bot_good" "$bot_bad"; do
  ! sudo journalctl -u waw-web-credential-spike.service -u waw-bot-credential-spike.service --no-pager | grep -Fq -- "$value"
done
REMOTE

port_count="$(aws lightsail get-instance-port-states --region "$REGION" --instance-name "$INSTANCE" \
  --query 'length(portStates[?state==`open` && fromPort==`22` && toPort==`22`])' --output text)"
[[ "$port_count" == 1 ]]
echo systemd_credential_spike_passed
