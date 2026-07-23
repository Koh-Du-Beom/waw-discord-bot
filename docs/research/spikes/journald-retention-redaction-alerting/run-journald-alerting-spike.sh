#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
trap 'printf "spike_error_line=%s\n" "$LINENO" >&2' ERR

REGION="ap-northeast-2"
ZONE="ap-northeast-2a"
PREFIX="waw-journald-alert-spike"
RUN_ID="$(date -u +%Y%m%d%H%M%S)"
INSTANCE="$PREFIX-$RUN_ID-vm"
KEY_PAIR="$PREFIX-$RUN_ID-key"
TMP="$(mktemp -d /tmp/waw-journald-alert-spike.XXXXXX)"
INSTANCE_CREATED=0
KEY_CREATED=0

count_resources() {
  instances="$(aws lightsail get-instances --region "$REGION" --query "length(instances[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
  keys="$(aws lightsail get-key-pairs --region "$REGION" --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
  static_ips="$(aws lightsail get-static-ips --region "$REGION" --query "length(staticIps[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
  disks="$(aws lightsail get-disks --region "$REGION" --query "length(disks[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
  instance_snapshots="$(aws lightsail get-instance-snapshots --region "$REGION" --query "length(instanceSnapshots[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
  disk_snapshots="$(aws lightsail get-disk-snapshots --region "$REGION" --query "length(diskSnapshots[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
}

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
  instances=unknown keys=unknown static_ips=unknown disks=unknown instance_snapshots=unknown disk_snapshots=unknown
  for _ in $(seq 1 36); do
    count_resources
    [[ "$instances" == 0 && "$keys" == 0 && "$static_ips" == 0 && "$disks" == 0 && "$instance_snapshots" == 0 && "$disk_snapshots" == 0 ]] && break
    sleep 5
  done
  printf 'cleanup_instance_count=%s\ncleanup_key_count=%s\ncleanup_static_ip_count=%s\ncleanup_disk_count=%s\ncleanup_instance_snapshot_count=%s\ncleanup_disk_snapshot_count=%s\n' \
    "$instances" "$keys" "$static_ips" "$disks" "$instance_snapshots" "$disk_snapshots"
  if [[ "$instances" != 0 || "$keys" != 0 || "$static_ips" != 0 || "$disks" != 0 || "$instance_snapshots" != 0 || "$disk_snapshots" != 0 ]]; then
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

for command in aws curl ssh ssh-keygen; do
  command -v "$command" >/dev/null || { echo "missing_command=$command" >&2; exit 1; }
done

count_resources
[[ "$instances" == 0 && "$keys" == 0 && "$static_ips" == 0 && "$disks" == 0 && "$instance_snapshots" == 0 && "$disk_snapshots" == 0 ]]
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
  --tags key=purpose,value=waw-journald-alert-spike key=expires,value=2026-07-24 >/dev/null
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
SSH=(ssh -i "$TMP/id_ed25519" -o ConnectTimeout=5 -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ubuntu@"$HOST")

for _ in $(seq 1 36); do
  "${SSH[@]}" true >/dev/null 2>&1 && break
  sleep 5
done
"${SSH[@]}" true

"${SSH[@]}" 'bash -s' <<'REMOTE_BOOT'
set -Eeuo pipefail
systemd --version | head -1 | grep -Eq '^systemd 255 '
sudo install -d -m 755 /var/log/journal
sudo install -d -m 755 /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/60-waw-spike.conf >/dev/null <<'CONF'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=16M
SystemKeepFree=1G
SystemMaxFileSize=2M
MaxFileSec=10s
MaxRetentionSec=10min
ForwardToSyslog=no
ForwardToKMsg=no
ForwardToConsole=no
ForwardToWall=no
CONF
sudo systemctl restart systemd-journald.service
sudo journalctl --flush
effective="$(systemd-analyze cat-config systemd/journald.conf)"
grep -Fq 'SystemMaxUse=16M' <<<"$effective"
grep -Fq 'SystemKeepFree=1G' <<<"$effective"
grep -Fq 'MaxFileSec=10s' <<<"$effective"
grep -Fq 'MaxRetentionSec=10min' <<<"$effective"
logger -t waw-journal-spike persistence_before_reboot
sudo journalctl --sync
echo systemd_255_and_config_readback_passed
REMOTE_BOOT

boot_id_before="$("${SSH[@]}" 'cat /proc/sys/kernel/random/boot_id')"
"${SSH[@]}" 'sudo reboot' >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  sleep 5
  boot_id_after="$("${SSH[@]}" 'cat /proc/sys/kernel/random/boot_id' 2>/dev/null)" || continue
  [[ "$boot_id_after" != "$boot_id_before" ]] && break
done
[[ "${boot_id_after:-}" != "$boot_id_before" ]]

"${SSH[@]}" 'bash -s' <<'REMOTE_TEST'
set -Eeuo pipefail
umask 077

cleanup_remote() {
  status=$?
  trap - ERR
  set +e
  sudo systemctl disable --now \
    waw-web-journal-spike.service waw-bot-journal-spike.service \
    waw-caddy-journal-spike.service waw-backup-journal-spike.service \
    waw-monitor-journal-spike.service waw-fake-webhook-spike.service >/dev/null 2>&1
  sudo rm -f /etc/systemd/system/waw-{web,bot,caddy,backup}-journal-spike.service
  sudo rm -f /etc/systemd/system/waw-monitor-journal-spike.service /etc/systemd/system/waw-fake-webhook-spike.service
  sudo rm -rf /opt/waw-journal-spike /etc/waw-journal-spike /var/lib/waw-journal-spike /run/waw-fake-webhook
  sudo rm -f /etc/systemd/journald.conf.d/60-waw-spike.conf
  sudo systemctl daemon-reload
  sudo systemctl reset-failed >/dev/null 2>&1
  for user in wawjweb wawjbot wawjcaddy wawjbackup wawjmonitor; do
    sudo userdel "$user" >/dev/null 2>&1
    sudo groupdel "$user" >/dev/null 2>&1
  done
  sudo systemctl restart systemd-journald.service
  sleep 2
  sudo journalctl --rotate >/dev/null 2>&1
  sudo journalctl --vacuum-time=1s >/dev/null 2>&1
  remote_unit_count=0
  for unit in waw-web-journal-spike.service waw-bot-journal-spike.service waw-caddy-journal-spike.service waw-backup-journal-spike.service waw-monitor-journal-spike.service waw-fake-webhook-spike.service; do
    [[ "$(systemctl show "$unit" -p LoadState --value 2>/dev/null)" == not-found ]] || remote_unit_count=$((remote_unit_count + 1))
  done
  remote_user_count=0
  for user in wawjweb wawjbot wawjcaddy wawjbackup wawjmonitor; do
    getent passwd "$user" >/dev/null && remote_user_count=$((remote_user_count + 1))
  done
  remote_file_count="$(sudo find /opt /etc /var/lib /run -maxdepth 3 -name '*waw-journal-spike*' -print 2>/dev/null | wc -l)"
  remote_listener_count="$(ss -lntH 'sport = :18081' | wc -l)"
  remote_process_count="$(pgrep -f '[w]aw-journal-spike' | wc -l)"
  remote_config_count="$(systemd-analyze cat-config systemd/journald.conf | grep -c '60-waw-spike.conf')"
  printf 'remote_cleanup_unit_count=%s\nremote_cleanup_user_count=%s\nremote_cleanup_file_count=%s\nremote_cleanup_listener_count=%s\nremote_cleanup_process_count=%s\nremote_cleanup_config_count=%s\n' \
    "$remote_unit_count" "$remote_user_count" "$remote_file_count" "$remote_listener_count" "$remote_process_count" "$remote_config_count"
  if [[ "$remote_unit_count" != 0 || "$remote_user_count" != 0 || "$remote_file_count" != 0 || "$remote_listener_count" != 0 || "$remote_process_count" != 0 || "$remote_config_count" != 0 ]]; then
    status=1
  fi
  exit "$status"
}
trap cleanup_remote EXIT
trap 'printf "remote_spike_error_line=%s\n" "$LINENO" >&2' ERR

sudo journalctl -t waw-journal-spike -g persistence_before_reboot --no-pager | grep -Fq persistence_before_reboot
echo reboot_persistence_passed

sudo sed -i 's/MaxRetentionSec=10min/MaxRetentionSec=30s/' /etc/systemd/journald.conf.d/60-waw-spike.conf
sudo cp /etc/systemd/journald.conf.d/60-waw-spike.conf /etc/systemd/journald.conf.d/60-waw-spike.conf.previous
sudo sed -i 's/SystemMaxUse=16M/SystemMaxUse=invalid/' /etc/systemd/journald.conf.d/60-waw-spike.conf
if systemd-analyze cat-config systemd/journald.conf | grep -Fq 'SystemMaxUse=16M'; then
  echo invalid_config_unexpectedly_valid >&2
  exit 1
fi
sudo mv /etc/systemd/journald.conf.d/60-waw-spike.conf.previous /etc/systemd/journald.conf.d/60-waw-spike.conf
sudo systemctl restart systemd-journald.service
effective="$(systemd-analyze cat-config systemd/journald.conf)"
grep -Fq 'SystemMaxUse=16M' <<<"$effective"
grep -Fq 'MaxRetentionSec=30s' <<<"$effective"
echo failed_config_readback_rollback_passed

logger -t waw-journal-spike retention_old_marker
sudo journalctl --sync
sudo journalctl --rotate
sleep 35
logger -t waw-journal-spike retention_new_marker
sudo journalctl --sync
sudo journalctl --rotate --vacuum-time=30s >/dev/null
! sudo journalctl -t waw-journal-spike -g retention_old_marker --no-pager | grep -Fq retention_old_marker
sudo journalctl -t waw-journal-spike -g retention_new_marker --no-pager | grep -Fq retention_new_marker
echo scaled_retention_passed

for _ in $(seq 1 7000); do
  head -c 4096 /dev/urandom | base64 -w0
  echo
done | systemd-cat -t waw-journal-capacity
sudo journalctl --sync
sudo journalctl --rotate --vacuum-size=16M >/dev/null
journal_bytes="$(sudo du -sb /var/log/journal | cut -f1)"
[[ "$journal_bytes" -le 20971520 ]]
echo scaled_capacity_passed

sudo install -d -m 755 /opt/waw-journal-spike
sudo install -d -m 700 /etc/waw-journal-spike
sudo install -d -m 700 /var/lib/waw-journal-spike
scan_since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
for user in wawjweb wawjbot wawjcaddy wawjbackup wawjmonitor; do
  sudo groupadd --system "$user"
  sudo useradd --system --gid "$user" --home /nonexistent --shell /usr/sbin/nologin "$user"
done

web_secret="synthetic-web-$(tr -d '-' </proc/sys/kernel/random/uuid)"
bot_secret="synthetic-bot-$(tr -d '-' </proc/sys/kernel/random/uuid)"
caddy_secret="synthetic-caddy-$(tr -d '-' </proc/sys/kernel/random/uuid)"
backup_secret="synthetic-backup-$(tr -d '-' </proc/sys/kernel/random/uuid)"
printf '%s' "$web_secret" | sudo tee /etc/waw-journal-spike/web >/dev/null
printf '%s' "$bot_secret" | sudo tee /etc/waw-journal-spike/bot >/dev/null
printf '%s' "$caddy_secret" | sudo tee /etc/waw-journal-spike/caddy >/dev/null
printf '%s' "$backup_secret" | sudo tee /etc/waw-journal-spike/backup >/dev/null
sudo chmod 600 /etc/waw-journal-spike/{web,bot,caddy,backup}

sudo tee /opt/waw-journal-spike/emitter.sh >/dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
name="$1"
other="$2"
test -s "$CREDENTIALS_DIRECTORY/token"
test ! -r "$other"
printf '{"correlation_id":"spike-%s","event_type":"service.started","operation":"%s","outcome":"success","reason_code":"fixture_ready","duration_ms":0,"service_version":"spike"}\n' "$name" "$name"
trap 'exit 0' TERM INT
while true; do sleep 10; done
SCRIPT
sudo chmod 755 /opt/waw-journal-spike/emitter.sh

create_emitter_unit() {
  name="$1" user="$2" other="$3"
  sudo tee "/etc/systemd/system/waw-$name-journal-spike.service" >/dev/null <<UNIT
[Unit]
Description=WAW synthetic $name journal Spike
[Service]
Type=simple
User=$user
Group=$user
LoadCredential=token:/etc/waw-journal-spike/$name
ExecStart=/opt/waw-journal-spike/emitter.sh $name $other
Restart=no
NoNewPrivileges=true
PrivateMounts=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw-journal-spike
UNIT
}
create_emitter_unit web wawjweb /run/credentials/waw-bot-journal-spike.service/token
create_emitter_unit bot wawjbot /run/credentials/waw-web-journal-spike.service/token
create_emitter_unit caddy wawjcaddy /run/credentials/waw-backup-journal-spike.service/token
create_emitter_unit backup wawjbackup /run/credentials/waw-caddy-journal-spike.service/token
sudo systemctl daemon-reload
sudo systemctl start waw-{web,bot,caddy,backup}-journal-spike.service
for unit in web bot caddy backup; do
  systemctl is-active --quiet "waw-$unit-journal-spike.service"
  sudo journalctl -u "waw-$unit-journal-spike.service" -g '"reason_code":"fixture_ready"' --no-pager | grep -Fq '"reason_code":"fixture_ready"'
done
for user in wawjweb wawjbot wawjcaddy wawjbackup; do
  [[ "$(id -nG "$user")" == "$user" ]]
  ! sudo -u "$user" test -r "/etc/waw-journal-spike/${user#wawj}"
done
! sudo -u wawjweb test -r /run/credentials/waw-bot-journal-spike.service/token
! sudo -u wawjbot test -r /run/credentials/waw-web-journal-spike.service/token
! sudo -u wawjcaddy test -r /run/credentials/waw-backup-journal-spike.service/token
! sudo -u wawjbackup test -r /run/credentials/waw-caddy-journal-spike.service/token
logger -t waw-journal-spike system_read_probe
! sudo -u wawjweb journalctl -u waw-bot-journal-spike.service --no-pager 2>&1 | grep -Fq '"operation":"bot"'
! sudo -u wawjbot journalctl -u waw-web-journal-spike.service --no-pager 2>&1 | grep -Fq '"operation":"web"'
! sudo -u wawjweb journalctl -t waw-journal-spike --no-pager 2>&1 | grep -Fq system_read_probe
for secret in "$web_secret" "$bot_secret" "$caddy_secret" "$backup_secret"; do
  ! sudo journalctl --since "$scan_since" --no-pager | grep -Fq -- "$secret"
done
echo emitter_allowlist_and_cross_read_deny_passed

sudo tee /opt/waw-journal-spike/fake-webhook.py >/dev/null <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import time

log = Path('/run/waw-fake-webhook/requests.log')
counts = {}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('content-length', '0')))
        counts[self.path] = counts.get(self.path, 0) + 1
        with log.open('ab') as stream:
            stream.write(self.path.encode() + b' ' + body + b'\n')
        if self.path == '/slow':
            time.sleep(3)
        if self.path == '/rate' and counts[self.path] == 1:
            self.send_response(429)
            self.send_header('Retry-After', '1')
            self.end_headers()
            return
        status = 500 if self.path == '/fail' else 204
        self.send_response(status)
        self.end_headers()
    def log_message(self, *_):
        pass

ThreadingHTTPServer(('127.0.0.1', 18081), Handler).serve_forever()
PY

sudo tee /opt/waw-journal-spike/alert-send.sh >/dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
endpoint="$1"
severity="$2"
payload="$(printf '{"severity":"%s","alert_key":"runtime.health","state":"%s","first_observed_at":"2026-07-23T00:00:00.000Z","last_observed_at":"2026-07-23T00:00:00.000Z","reason_code":"synthetic_fixture","service_version":"spike","allowed_mentions":{"parse":[]}}' "$severity" "$([[ "$severity" == ok ]] && echo resolved || echo firing)")"
for attempt in 1 2; do
  headers="$(mktemp)"
  set +e
  code="$(curl --silent --show-error --max-time 1 --dump-header "$headers" --output /dev/null --write-out '%{http_code}' -H 'content-type: application/json' --data "$payload" "$endpoint")"
  status=$?
  set -e
  if [[ $status -eq 0 && "$code" =~ ^2 ]]; then
    rm -f "$headers"
    exit 0
  fi
  if [[ $status -eq 0 && "$code" == 429 && $attempt -eq 1 ]]; then
    retry_after="$(awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {gsub("\\r", "", $2); print $2}' "$headers")"
    [[ "$retry_after" == 1 ]]
    rm -f "$headers"
    sleep "$retry_after"
    continue
  fi
  rm -f "$headers"
  [[ $attempt -eq 1 ]] && continue
done
exit 75
SCRIPT

sudo tee /opt/waw-journal-spike/alert-state.sh >/dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
endpoint="$1" severity="$2" now="$3"
state=/var/lib/waw-journal-spike/alert.state
previous=ok last=-21600
[[ -f "$state" ]] && IFS=' ' read -r previous last <"$state"
if [[ "$severity" != "$previous" || "$severity" == critical && $((now - last)) -ge 21600 ]]; then
  /opt/waw-journal-spike/alert-send.sh "$endpoint" "$severity"
  printf '%s %s\n' "$severity" "$now" >"$state"
fi
SCRIPT
sudo chmod 755 /opt/waw-journal-spike/{alert-send.sh,alert-state.sh}
sudo chown wawjmonitor:wawjmonitor /var/lib/waw-journal-spike

sudo tee /etc/systemd/system/waw-fake-webhook-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW local fake webhook Spike
[Service]
Type=simple
User=wawjmonitor
Group=wawjmonitor
RuntimeDirectory=waw-fake-webhook
RuntimeDirectoryMode=0700
ExecStart=/usr/bin/python3 /opt/waw-journal-spike/fake-webhook.py
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/run/waw-fake-webhook
UNIT
sudo tee /etc/waw-journal-spike/monitor.env >/dev/null <<'ENV'
ENDPOINT=http://127.0.0.1:18081/unit
ENV
sudo tee /etc/systemd/system/waw-monitor-journal-spike.service >/dev/null <<'UNIT'
[Unit]
Description=WAW synthetic monitor delivery Spike
After=waw-fake-webhook-spike.service
[Service]
Type=oneshot
User=wawjmonitor
Group=wawjmonitor
EnvironmentFile=/etc/waw-journal-spike/monitor.env
ExecStart=/opt/waw-journal-spike/alert-send.sh ${ENDPOINT} critical
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/waw-journal-spike /etc/waw-journal-spike/monitor.env
UNIT
sudo systemctl daemon-reload
sudo systemctl start waw-fake-webhook-spike.service
for _ in $(seq 1 20); do
  ss -lntH 'sport = :18081' | grep -q . && break
  sleep 0.2
done
ss -lntH 'sport = :18081' | grep -q .

sudo -u wawjmonitor /opt/waw-journal-spike/alert-state.sh http://127.0.0.1:18081/state critical 0
sudo -u wawjmonitor /opt/waw-journal-spike/alert-state.sh http://127.0.0.1:18081/state critical 60
sudo -u wawjmonitor /opt/waw-journal-spike/alert-state.sh http://127.0.0.1:18081/state critical 21600
sudo -u wawjmonitor /opt/waw-journal-spike/alert-state.sh http://127.0.0.1:18081/state ok 21660
[[ "$(sudo grep -c '^/state ' /run/waw-fake-webhook/requests.log)" == 3 ]]
sudo -u wawjmonitor /opt/waw-journal-spike/alert-send.sh http://127.0.0.1:18081/rate warning
[[ "$(sudo grep -c '^/rate ' /run/waw-fake-webhook/requests.log)" == 2 ]]
set +e
sudo -u wawjmonitor /opt/waw-journal-spike/alert-send.sh http://127.0.0.1:18081/slow critical
slow_status=$?
set -e
[[ "$slow_status" == 75 ]]
for _ in $(seq 1 20); do
  [[ "$(sudo grep -c '^/slow ' /run/waw-fake-webhook/requests.log)" == 2 ]] && break
  sleep 0.2
done
[[ "$(sudo grep -c '^/slow ' /run/waw-fake-webhook/requests.log)" == 2 ]]
echo fake_webhook_dedupe_recovery_rate_timeout_passed

sudo systemctl start waw-monitor-journal-spike.service
sudo cp /etc/waw-journal-spike/monitor.env /etc/waw-journal-spike/monitor.env.previous
printf 'ENDPOINT=http://127.0.0.1:18081/fail\n' | sudo tee /etc/waw-journal-spike/monitor.env >/dev/null
set +e
sudo systemctl start waw-monitor-journal-spike.service
monitor_failure_status=$?
set -e
[[ "$monitor_failure_status" -ne 0 ]]
[[ "$(systemctl show waw-monitor-journal-spike.service -p Result --value)" == exit-code ]]
sudo mv /etc/waw-journal-spike/monitor.env.previous /etc/waw-journal-spike/monitor.env
sudo systemctl reset-failed waw-monitor-journal-spike.service
sudo systemctl start waw-monitor-journal-spike.service
[[ "$(systemctl show waw-monitor-journal-spike.service -p Result --value)" == success ]]
echo forced_monitor_failure_rollback_passed

for secret in "$web_secret" "$bot_secret" "$caddy_secret" "$backup_secret"; do
  ! sudo journalctl --since "$scan_since" --no-pager | grep -Fq -- "$secret"
  ! sudo grep -Fq -- "$secret" /run/waw-fake-webhook/requests.log
done
! sudo grep -Eq 'authorization|cookie|query|body|user_agent|remote_ip|synthetic-secret' /run/waw-fake-webhook/requests.log
echo final_redaction_scan_passed
echo journald_alerting_spike_passed
REMOTE_TEST

port_count="$(aws lightsail get-instance-port-states --region "$REGION" --instance-name "$INSTANCE" \
  --query 'length(portStates[?state==`open` && fromPort==`22` && toPort==`22`])' --output text)"
[[ "$port_count" == 1 ]]
echo runner_exit=0
