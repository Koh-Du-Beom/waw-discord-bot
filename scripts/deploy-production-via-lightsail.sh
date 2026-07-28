#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${GITHUB_REF:-}" == "refs/heads/production" ]] ||
  { echo deployment_ref_denied >&2; exit 1; }
[[ "${WAW_RELEASE_COMMIT:-}" =~ ^[a-f0-9]{40}$ ]] ||
  { echo invalid_release_commit >&2; exit 1; }
[[ "${LIGHTSAIL_HOST:-}" =~ ^([A-Za-z0-9][A-Za-z0-9.-]{0,252}|[0-9a-fA-F:]+)$ ]] ||
  { echo invalid_lightsail_host >&2; exit 1; }
[[ "${LIGHTSAIL_USER:-}" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] ||
  { echo invalid_lightsail_user >&2; exit 1; }
[[ -f "${WAW_DEPLOY_SSH_KEY_FILE:-}" &&
   ! -L "${WAW_DEPLOY_SSH_KEY_FILE:-}" &&
   -s "${WAW_DEPLOY_SSH_KEY_FILE:-}" ]] ||
  { echo invalid_deploy_key_file >&2; exit 1; }
[[ -f "${WAW_DEPLOY_KNOWN_HOSTS_FILE:-}" &&
   ! -L "${WAW_DEPLOY_KNOWN_HOSTS_FILE:-}" &&
   -s "${WAW_DEPLOY_KNOWN_HOSTS_FILE:-}" ]] ||
  { echo invalid_known_hosts_file >&2; exit 1; }
command -v git >/dev/null && command -v sha256sum >/dev/null &&
  command -v ssh >/dev/null && command -v scp >/dev/null &&
  command -v ssh-keygen >/dev/null ||
  { echo deployment_tool_missing >&2; exit 1; }

run_root="$(mktemp -d)"
private_key="$run_root/id"
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
cp "$WAW_DEPLOY_SSH_KEY_FILE" "$private_key"
cp "$WAW_DEPLOY_KNOWN_HOSTS_FILE" "$known_hosts"
chmod 600 "$private_key" "$known_hosts"
ssh-keygen -y -f "$private_key" >/dev/null ||
  { echo invalid_deploy_key >&2; exit 1; }
ssh-keygen -F "$LIGHTSAIL_HOST" -f "$known_hosts" >/dev/null ||
  { echo lightsail_host_key_missing >&2; exit 1; }
host="$LIGHTSAIL_HOST"
user="$LIGHTSAIL_USER"

ssh_options=(
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$known_hosts"
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
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
