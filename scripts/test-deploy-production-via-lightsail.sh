#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
controller="$repo_root/scripts/deploy-production-via-lightsail.sh"
release_commit="$(git -C "$repo_root" rev-parse HEAD)"
fixture_root="$(mktemp -d)"
cleanup() { rm -rf -- "$fixture_root"; }
trap cleanup EXIT

run_case() {
  local expected="$1"
  shift
  local output
  local status=0
  output="$("$@" 2>&1)" || status=$?
  [[ "$status" -ne 0 && "$output" == *"$expected"* ]] || {
    echo "fixture_case_failed expected=$expected status=$status" >&2
    exit 1
  }
}

common_env=(
  env
  GITHUB_REF=refs/heads/production
  WAW_RELEASE_COMMIT="$release_commit"
  LIGHTSAIL_HOST=192.0.2.10
  LIGHTSAIL_USER=deploy
)

run_case invalid_deploy_key_file \
  "${common_env[@]}" \
  WAW_DEPLOY_KNOWN_HOSTS_FILE="$fixture_root/known_hosts" \
  bash "$controller"

touch "$fixture_root/empty-key" "$fixture_root/known_hosts"
run_case invalid_deploy_key_file \
  "${common_env[@]}" \
  WAW_DEPLOY_SSH_KEY_FILE="$fixture_root/empty-key" \
  WAW_DEPLOY_KNOWN_HOSTS_FILE="$fixture_root/known_hosts" \
  bash "$controller"

printf 'not-a-key\n' >"$fixture_root/key-target"
ln -s "$fixture_root/key-target" "$fixture_root/key-link"
printf '192.0.2.10 ssh-ed25519 invalid\n' >"$fixture_root/known_hosts"
if [[ -L "$fixture_root/key-link" ]]; then
  run_case invalid_deploy_key_file \
    "${common_env[@]}" \
    WAW_DEPLOY_SSH_KEY_FILE="$fixture_root/key-link" \
    WAW_DEPLOY_KNOWN_HOSTS_FILE="$fixture_root/known_hosts" \
    bash "$controller"
fi

run_case invalid_deploy_key \
  "${common_env[@]}" \
  WAW_DEPLOY_SSH_KEY_FILE="$fixture_root/key-target" \
  WAW_DEPLOY_KNOWN_HOSTS_FILE="$fixture_root/known_hosts" \
  bash "$controller"

printf 'deployment_controller_fixture_pass\n'
