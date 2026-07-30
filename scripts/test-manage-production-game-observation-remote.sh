#!/usr/bin/env bash
set -Eeuo pipefail

fixture_root="$(mktemp -d /tmp/waw-game-observation-fixture.XXXXXX)"
fixture_root="$(cd "$fixture_root" && pwd -P)"
cleanup() { rm -rf -- "$fixture_root"; }
trap cleanup EXIT
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
manager="$repo_root/scripts/manage-production-game-observation-remote.sh"
expected_commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
release_id="${expected_commit:0:12}"

mkdir -p \
  "$fixture_root/bin" \
  "$fixture_root/etc/waw" \
  "$fixture_root/etc/waw-credentials" \
  "$fixture_root/opt/waw/releases/$release_id/deploy" \
  "$fixture_root/opt/waw/releases/bbbbbbbbbbbb" \
  "$fixture_root/tmp"
ln -s "$fixture_root/opt/waw/releases/$release_id" "$fixture_root/opt/waw/current"
ln -s "$fixture_root/opt/waw/releases/bbbbbbbbbbbb" "$fixture_root/opt/waw/previous"
printf 'WAW_DISCORD_GUILD_ID=100000000000000000\nWAW_GAME_ALERT_CHANNEL_ID=200000000000000000\n' \
  >"$fixture_root/etc/waw/bot.env"
printf 'synthetic-token\n' >"$fixture_root/etc/waw-credentials/bot-discord-token"
printf 'synthetic-riot-key\n' >"$fixture_root/etc/waw-credentials/bot-riot-api-key"
printf '#!/usr/bin/env bash\nexit 0\n' \
  >"$fixture_root/opt/waw/releases/$release_id/deploy/wait-production-health.sh"
chmod +x "$fixture_root/opt/waw/releases/$release_id/deploy/wait-production-health.sh"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -eu' \
  'if [[ "$1" == show ]]; then' \
  '  if [[ -f "$WAW_GAME_OBSERVATION_TEST_ROOT/etc/systemd/system/waw-bot.service.d/90-game-observation-enabled.conf" ]]; then echo WAW_GAME_OBSERVATION_ENABLED=1; else echo WAW_GAME_OBSERVATION_ENABLED=0; fi' \
  'fi' \
  >"$fixture_root/bin/systemctl"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s\\n" "{\"status\":\"healthy\"}"' \
  >"$fixture_root/bin/curl"
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture_root/bin/systemd-analyze"
chmod +x "$fixture_root/bin/systemctl" "$fixture_root/bin/curl" "$fixture_root/bin/systemd-analyze"

run_manager() {
  WAW_GAME_OBSERVATION_TEST_ROOT="$fixture_root" \
    PATH="$fixture_root/bin:$PATH" \
    bash "$manager" "$@"
}

run_manager preflight "$expected_commit" |
  grep -qx "game_observation_preflight_pass release=$release_id enabled=0"
run_manager activate "$expected_commit" |
  grep -qx "game_observation_activation_pass release=$release_id enabled=1"
run_manager activate "$expected_commit" |
  grep -qx "game_observation_activation_already_enabled release=$release_id"
grep -qxF '[Service]' \
  "$fixture_root/etc/systemd/system/waw-bot.service.d/90-game-observation-enabled.conf"
grep -qxF 'Environment=WAW_GAME_OBSERVATION_ENABLED=1' \
  "$fixture_root/etc/systemd/system/waw-bot.service.d/90-game-observation-enabled.conf"

echo production_game_observation_manager_fixture_pass
