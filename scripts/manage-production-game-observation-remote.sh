#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-}"
expected_commit="${2:-}"
test_root="${WAW_GAME_OBSERVATION_TEST_ROOT:-}"
if [[ -n "$test_root" ]]; then
  [[ -d "$test_root" && ! -L "$test_root" ]] ||
    { echo game_observation_test_root_invalid >&2; exit 1; }
  test_root="$(cd "$test_root" && pwd -P)"
  [[ "$test_root" == /tmp/* || "$test_root" == /private/tmp/* ]] ||
    { echo game_observation_test_root_invalid >&2; exit 1; }
else
  [[ "$(id -u)" == 0 ]] || { echo game_observation_root_required >&2; exit 1; }
fi
release_root="${test_root}/opt/waw"
dropin="${test_root}/etc/systemd/system/waw-bot.service.d/90-game-observation-enabled.conf"
bot_environment="${test_root}/etc/waw/bot.env"
discord_credential="${test_root}/etc/waw-credentials/bot-discord-token"
riot_credential="${test_root}/etc/waw-credentials/bot-riot-api-key"

[[ "$action" == preflight || "$action" == activate ]] ||
  { echo game_observation_action_invalid >&2; exit 1; }
[[ "$expected_commit" =~ ^[a-f0-9]{40}$ ]] ||
  { echo game_observation_release_invalid >&2; exit 1; }

release_id="${expected_commit:0:12}"
current="$(readlink -f "$release_root/current")"
previous="$(readlink -f "$release_root/previous")"
[[ "$current" == "$release_root/releases/$release_id" &&
   "$previous" == "$release_root"/releases/* &&
   "$previous" != "$current" ]] ||
  { echo game_observation_release_mismatch >&2; exit 1; }

systemctl is-active --quiet waw-web.service
systemctl is-active --quiet waw-bot.service
systemctl is-active --quiet waw-backup.timer
systemctl is-active --quiet waw-monitor.timer
systemctl is-enabled --quiet waw-backup.timer
systemctl is-enabled --quiet waw-monitor.timer
[[ -s "$bot_environment" &&
   -s "$discord_credential" &&
   -s "$riot_credential" ]] ||
  { echo game_observation_input_missing >&2; exit 1; }
curl --fail --silent --show-error http://127.0.0.1:18080/health |
  grep -q '"status":"healthy"'
curl --fail --silent --show-error https://waw.dubeom.com/health |
  grep -q '"status":"healthy"'

effective_flag() {
  systemctl show waw-bot.service --property=Environment --value |
    tr ' ' '\n' |
    awk -F= '$1 == "WAW_GAME_OBSERVATION_ENABLED" { value=$2; count+=1 }
      END { if (count == 1 && (value == "0" || value == "1")) print value; else exit 1 }'
}

before_flag="$(effective_flag)" ||
  { echo game_observation_flag_invalid >&2; exit 1; }
if [[ "$action" == preflight ]]; then
  echo "game_observation_preflight_pass release=$release_id enabled=$before_flag"
  exit 0
fi

if [[ "$before_flag" == 1 ]]; then
  [[ -f "$dropin" ]] || { echo game_observation_dropin_missing >&2; exit 1; }
  [[ "$(wc -l <"$dropin")" == 2 ]]
  grep -qxF '[Service]' "$dropin"
  grep -qxF 'Environment=WAW_GAME_OBSERVATION_ENABLED=1' "$dropin"
  echo "game_observation_activation_already_enabled release=$release_id"
  exit 0
fi

[[ ! -e "$dropin" ]] || { echo game_observation_dropin_conflict >&2; exit 1; }
run_root="$(mktemp -d "${test_root}/tmp/waw-game-observation-activation.XXXXXX")"
created=0
rollback() {
  local outcome=$?
  if [[ "$created" == 1 ]]; then
    rm -f -- "$dropin"
    systemctl daemon-reload || true
    systemctl restart waw-bot.service || true
    bash "$current/deploy/wait-production-health.sh" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$run_root"
  exit "$outcome"
}
trap rollback ERR
trap 'rm -rf -- "$run_root"' EXIT

printf '%s\n' \
  '[Service]' \
  'Environment=WAW_GAME_OBSERVATION_ENABLED=1' \
  >"$run_root/90-game-observation-enabled.conf"
if [[ -n "$test_root" ]]; then
  install -d -m 0755 "$(dirname "$dropin")"
  install -m 0644 "$run_root/90-game-observation-enabled.conf" "$dropin"
else
  install -d -o root -g root -m 0755 "$(dirname "$dropin")"
  install -o root -g root -m 0644 \
    "$run_root/90-game-observation-enabled.conf" "$dropin"
fi
created=1
systemctl daemon-reload
systemd-analyze verify waw-bot.service
systemctl restart waw-bot.service
bash "$current/deploy/wait-production-health.sh"
[[ "$(effective_flag)" == 1 ]]
[[ "$(readlink -f "$release_root/current")" == "$current" ]]
systemctl is-active --quiet waw-bot.service
curl --fail --silent --show-error https://waw.dubeom.com/health |
  grep -q '"status":"healthy"'
created=0
echo "game_observation_activation_pass release=$release_id enabled=1"
