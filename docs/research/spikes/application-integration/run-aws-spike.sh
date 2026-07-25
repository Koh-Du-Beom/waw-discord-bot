#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
trap 'printf "spike_error_line=%s\n" "$LINENO" >&2' ERR

REGION="ap-northeast-2"
ZONE="ap-northeast-2a"
PREFIX="waw-application-integration"
RUN_ID="$(date -u +%Y%m%d%H%M%S)"
INSTANCE="$PREFIX-$RUN_ID-vm"
KEY_PAIR="$PREFIX-$RUN_ID-key"
SOURCE_ARCHIVE="${1:-waw-application-source.tgz}"
TMP="$(mktemp -d /tmp/waw-application-aws.XXXXXX)"
INSTANCE_CREATED=0
KEY_CREATED=0

cleanup() {
  status=$?
  set +e
  if [[ $INSTANCE_CREATED -eq 1 ]]; then
    aws lightsail delete-instance --region "$REGION" --instance-name "$INSTANCE" \
      >/dev/null 2>&1
  fi
  if [[ $KEY_CREATED -eq 1 ]]; then
    aws lightsail delete-key-pair --region "$REGION" --key-pair-name "$KEY_PAIR" \
      >/dev/null 2>&1
  fi
  rm -rf -- "$TMP"
  for _ in $(seq 1 36); do
    instances="$(aws lightsail get-instances --region "$REGION" \
      --query "length(instances[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    keys="$(aws lightsail get-key-pairs --region "$REGION" \
      --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    static_ips="$(aws lightsail get-static-ips --region "$REGION" \
      --query "length(staticIps[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    disks="$(aws lightsail get-disks --region "$REGION" \
      --query "length(disks[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    snapshots="$(aws lightsail get-instance-snapshots --region "$REGION" \
      --query "length(instanceSnapshots[?starts_with(name, '$PREFIX')])" --output text 2>/dev/null)"
    [[ "$instances" == 0 && "$keys" == 0 && "$static_ips" == 0 &&
      "$disks" == 0 && "$snapshots" == 0 ]] && break
    sleep 5
  done
  printf 'cleanup_instance_count=%s\n' "${instances:-unknown}"
  printf 'cleanup_key_count=%s\n' "${keys:-unknown}"
  printf 'cleanup_static_ip_count=%s\n' "${static_ips:-unknown}"
  printf 'cleanup_disk_count=%s\n' "${disks:-unknown}"
  printf 'cleanup_snapshot_count=%s\n' "${snapshots:-unknown}"
  exit "$status"
}
trap cleanup EXIT

[[ -f "$SOURCE_ARCHIVE" ]] || { echo source_archive_missing >&2; exit 1; }
for command in aws curl ssh scp ssh-keygen tar; do
  command -v "$command" >/dev/null ||
    { printf 'missing_command=%s\n' "$command" >&2; exit 1; }
done

[[ "$(aws lightsail get-instances --region "$REGION" \
  --query "length(instances[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-key-pairs --region "$REGION" \
  --query "length(keyPairs[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-static-ips --region "$REGION" \
  --query "length(staticIps[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-disks --region "$REGION" \
  --query "length(disks[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-instance-snapshots --region "$REGION" \
  --query "length(instanceSnapshots[?starts_with(name, '$PREFIX')])" --output text)" == 0 ]]
[[ "$(aws lightsail get-blueprints --region "$REGION" --include-inactive \
  --query "length(blueprints[?blueprintId=='ubuntu_24_04' && isActive])" \
  --output text)" == 1 ]]
[[ "$(aws lightsail get-bundles --region "$REGION" --include-inactive \
  --query "length(bundles[?bundleId=='micro_3_0' && isActive && ramSizeInGb==\`1\`])" \
  --output text)" == 1 ]]

CLIENT_IP="$(curl --fail --silent --show-error https://checkip.amazonaws.com |
  tr -d '[:space:]')"
[[ "$CLIENT_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
ssh-keygen -q -t ed25519 -N '' -C "$KEY_PAIR" -f "$TMP/id_ed25519"
aws lightsail import-key-pair --region "$REGION" --key-pair-name "$KEY_PAIR" \
  --public-key-base64 file://"$TMP/id_ed25519.pub" >/dev/null
KEY_CREATED=1
aws lightsail create-instances --region "$REGION" --instance-names "$INSTANCE" \
  --availability-zone "$ZONE" --blueprint-id ubuntu_24_04 --bundle-id micro_3_0 \
  --key-pair-name "$KEY_PAIR" \
  --tags key=purpose,value=waw-application-integration \
    key=expires,value=2026-07-26 >/dev/null
INSTANCE_CREATED=1

for _ in $(seq 1 36); do
  state="$(aws lightsail get-instance --region "$REGION" \
    --instance-name "$INSTANCE" --query instance.state.name --output text)"
  [[ "$state" == running ]] && break
  sleep 5
done
[[ "$state" == running ]]

for port in 22 80 443; do
  aws lightsail close-instance-public-ports --region "$REGION" \
    --instance-name "$INSTANCE" \
    --port-info "fromPort=$port,toPort=$port,protocol=tcp" >/dev/null 2>&1 || true
done
aws lightsail open-instance-public-ports --region "$REGION" \
  --instance-name "$INSTANCE" \
  --port-info "fromPort=22,toPort=22,protocol=tcp,cidrs=${CLIENT_IP}/32" >/dev/null

HOST="$(aws lightsail get-instance --region "$REGION" \
  --instance-name "$INSTANCE" --query instance.publicIpAddress --output text)"
SSH=(ssh -i "$TMP/id_ed25519" -o ConnectTimeout=5 -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$TMP/known_hosts" \
  ubuntu@"$HOST")
SCP=(scp -i "$TMP/id_ed25519" -o ConnectTimeout=5 -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$TMP/known_hosts")

for _ in $(seq 1 36); do
  "${SSH[@]}" true >/dev/null 2>&1 && break
  sleep 5
done
"${SSH[@]}" true
"${SCP[@]}" "$SOURCE_ARCHIVE" ubuntu@"$HOST":/tmp/waw-application-source.tgz
"${SSH[@]}" \
  'set -Eeuo pipefail; mkdir -p /tmp/waw-application-source; tar -xzf /tmp/waw-application-source.tgz -C /tmp/waw-application-source; cd /tmp/waw-application-source; sudo WAW_KEEP_INTEGRATION=1 ./docs/research/spikes/application-integration/run-host-integration.sh'

boot_id_before="$("${SSH[@]}" 'cat /proc/sys/kernel/random/boot_id')"
"${SSH[@]}" 'sudo reboot' >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  sleep 5
  boot_id_after="$("${SSH[@]}" 'cat /proc/sys/kernel/random/boot_id' 2>/dev/null)" ||
    continue
  [[ "$boot_id_after" != "$boot_id_before" ]] && break
done
[[ "${boot_id_after:-}" != "$boot_id_before" ]]
for _ in $(seq 1 30); do
  "${SSH[@]}" \
    'systemctl is-active --quiet waw-web.service && systemctl is-active --quiet waw-bot.service && curl --fail --silent http://127.0.0.1:18080/health >/dev/null' \
    >/dev/null 2>&1 && break
  sleep 2
done
"${SSH[@]}" \
  'set -Eeuo pipefail; systemctl is-enabled --quiet waw-web.service; systemctl is-active --quiet waw-web.service; systemctl is-enabled --quiet waw-bot.service; systemctl is-active --quiet waw-bot.service; curl --fail --silent http://127.0.0.1:18080/health | grep -q "\"storage\":{\"status\":\"connected\"}"; echo reboot_recovery_passed'

[[ "$(aws lightsail get-instance-port-states --region "$REGION" \
  --instance-name "$INSTANCE" \
  --query 'length(portStates[?state==`open` && fromPort==`22` && toPort==`22`])' \
  --output text)" == 1 ]]
[[ "$(aws lightsail get-instance-port-states --region "$REGION" \
  --instance-name "$INSTANCE" \
  --query 'length(portStates[?state==`open` && (fromPort==`80` || fromPort==`443`)])' \
  --output text)" == 0 ]]
echo application_aws_integration_passed
