#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${GITHUB_REF:-}" == "refs/heads/production" ]] ||
  { echo deployment_ref_denied >&2; exit 1; }
[[ "${WAW_RELEASE_COMMIT:-}" =~ ^[a-f0-9]{40}$ ]] ||
  { echo invalid_release_commit >&2; exit 1; }
[[ "${LIGHTSAIL_INSTANCE_NAME:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,253}$ ]] ||
  { echo invalid_lightsail_instance_name >&2; exit 1; }
[[ "${AWS_REGION:-ap-northeast-2}" == "ap-northeast-2" ]] ||
  { echo invalid_aws_region >&2; exit 1; }
command -v aws >/dev/null && command -v jq >/dev/null &&
  command -v ssh >/dev/null && command -v scp >/dev/null ||
  { echo deployment_tool_missing >&2; exit 1; }

run_root="$(mktemp -d)"
access_json="$run_root/access.json"
private_key="$run_root/id"
certificate="$run_root/id-cert.pub"
known_hosts="$run_root/known_hosts"
archive="$run_root/release.tar.gz"
remote_script="$run_root/remote.sh"
remote_manager="$run_root/manage-production-release.sh"
remote_root="/tmp/waw-actions-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
remote_created=0
cleanup() {
  if [[ "$remote_created" == 1 ]] && declare -p ssh_options >/dev/null 2>&1; then
    ssh "${ssh_options[@]}" "$user@$host" "rm -rf -- '$remote_root'" \
      >/dev/null 2>&1 || true
  fi
  chmod -R u+rwX "$run_root" 2>/dev/null || true
  rm -rf -- "$run_root"
}
trap cleanup EXIT
umask 077

git archive --format=tar.gz --output="$archive" "$WAW_RELEASE_COMMIT"
archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
release_id="${WAW_RELEASE_COMMIT:0:12}"
cp scripts/deploy-production-release-remote.sh "$remote_script"
cp deploy/manage-production-release.sh "$remote_manager"

aws lightsail get-instance-access-details \
  --region ap-northeast-2 \
  --instance-name "$LIGHTSAIL_INSTANCE_NAME" \
  --protocol-name SSH \
  --output json >"$access_json"

host="$(jq -er '.accessDetails.ipAddress' "$access_json")"
user="$(jq -er '.accessDetails.username' "$access_json")"
jq -er '.accessDetails.privateKey' "$access_json" >"$private_key"
jq -er '.accessDetails.certKey' "$access_json" >"$certificate"
jq -er --arg host "$host" \
  '.accessDetails.hostKeys[] | "\($host) \(.algorithm) \(.publicKey)"' \
  "$access_json" >"$known_hosts"
[[ -s "$private_key" && -s "$certificate" && -s "$known_hosts" ]] ||
  { echo incomplete_temporary_access >&2; exit 1; }
chmod 600 "$private_key" "$certificate" "$known_hosts"

ssh_options=(
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$known_hosts"
  -o "CertificateFile=$certificate"
  -o ConnectTimeout=15
  -i "$private_key"
)

ssh "${ssh_options[@]}" "$user@$host" \
  "umask 077 && install -d -m 700 '$remote_root'"
remote_created=1
scp "${ssh_options[@]}" \
  "$archive" "$remote_script" "$remote_manager" \
  "$user@$host:$remote_root/"
ssh "${ssh_options[@]}" "$user@$host" \
  "sudo bash '$remote_root/remote.sh' '$release_id' '$remote_root/release.tar.gz' '$archive_sha' '$remote_root/manage-production-release.sh'"
ssh "${ssh_options[@]}" "$user@$host" "rm -rf -- '$remote_root'"
remote_created=0

echo "production_deployment_complete release=$release_id sha256=$archive_sha"
