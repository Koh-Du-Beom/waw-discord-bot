#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-}"
expected_commit="${2:-}"
expected_payload_sha="${3:-}"
release_id="${expected_commit:0:12}"
state_dir=/var/lib/waw-command-registration
backup="$state_dir/previous-commands.json"
baseline="$state_dir/kbo-row-counts.json"

[[ "$(id -u)" == 0 ]] || { echo kbo_commands_root_required >&2; exit 1; }
[[ "$action" == register || "$action" == verify_smoke || "$action" == restore ]] ||
  { echo kbo_commands_action_invalid >&2; exit 1; }
[[ "$expected_commit" =~ ^[a-f0-9]{40}$ && "$expected_payload_sha" =~ ^[a-f0-9]{64}$ ]] ||
  { echo kbo_commands_input_invalid >&2; exit 1; }

current="$(readlink -f /opt/waw/current)"
previous="$(readlink -f /opt/waw/previous)"
[[ "$current" == "/opt/waw/releases/$release_id" &&
   "$previous" == /opt/waw/releases/* && "$previous" != "$current" ]] ||
  { echo kbo_commands_release_mismatch >&2; exit 1; }
for unit in waw-web.service waw-bot.service waw-backup.timer waw-monitor.timer; do
  systemctl is-active --quiet "$unit"
done
[[ -z "$(systemctl --failed --no-legend)" ]] ||
  { echo kbo_commands_failed_units >&2; exit 1; }
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18080/health |
  grep -q '"status":"healthy"'
curl --fail --silent --show-error --max-time 15 https://waw.dubeom.com/health |
  grep -q '"status":"healthy"'

bot_pid="$(systemctl show waw-bot.service -p MainPID --value)"
[[ "$bot_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$bot_pid/environ" ]] ||
  { echo kbo_commands_process_invalid >&2; exit 1; }
flags=()
for name in \
  WAW_KBO_COMMANDS_ENABLED \
  WAW_KBO_DATA_RIGHTS_AUTHORIZED \
  WAW_KBO_RANKINGS_ENABLED \
  WAW_KBO_BETTING_ENABLED; do
  value="$(tr '\0' '\n' < "/proc/$bot_pid/environ" |
    awk -F= -v name="$name" '$1 == name { value=$2; count+=1 }
      END { if (count == 1 && value == "0") print value; else exit 1 }')" ||
    { echo kbo_commands_effective_flags_invalid >&2; exit 1; }
  flags+=("$value")
done

manager="$current/scripts/manage-discord-guild-commands.mjs"
[[ -r "$manager" ]] || { echo kbo_commands_manager_missing >&2; exit 1; }

kbo_counts() {
  local credential=/etc/waw-backup/backup.env
  [[ -f "$credential" && ! -L "$credential" ]] || return 1
  set -a
  # shellcheck disable=SC1090
  source "$credential" 2>/dev/null
  set +a
  unset AGE_RECIPIENT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION S3_BUCKET
  PGCONNECT_TIMEOUT=10 PGAPPNAME=waw-kbo-command-smoke \
    psql -XAt --no-password --set ON_ERROR_STOP=1 <<'SQL'
select json_build_object(
  'credit_account', (select count(*) from public.credit_account),
  'betting_enrollment', (select count(*) from public.betting_enrollment),
  'credit_ledger_entry', (select count(*) from public.credit_ledger_entry),
  'daily_credit_claim', (select count(*) from public.daily_credit_claim),
  'kbo_bet', (select count(*) from public.kbo_bet),
  'kbo_game', (select count(*) from public.kbo_game),
  'kbo_game_revision', (select count(*) from public.kbo_game_revision),
  'bet_settlement', (select count(*) from public.bet_settlement),
  'kbo_retention_hold', (select count(*) from public.kbo_retention_hold)
)::text;
SQL
}

if [[ "$action" == register ]]; then
  [[ ! -e "$state_dir" ]] || { echo kbo_commands_state_conflict >&2; exit 1; }
  install -d -o root -g root -m 0700 "$state_dir"
  umask 077
  kbo_counts >"$baseline"
  changed=0
  rollback() {
    local outcome=$?
    if [[ "$changed" == 1 && -f "$backup" ]]; then
      /usr/local/bin/node "$manager" restore "$backup" >/dev/null 2>&1 || true
    fi
    rm -rf -- "$state_dir"
    exit "$outcome"
  }
  trap rollback ERR
  /usr/local/bin/node "$manager" register "$expected_payload_sha" "$backup" \
    '도움말,요약,라이엇계정,몰랭검거'
  changed=1
  /usr/local/bin/node "$manager" verify "$expected_payload_sha"
  trap - ERR
  echo "kbo_commands_registration_pass release=$release_id flags=${flags[*]} rows_saved=1"
  exit 0
fi

[[ -d "$state_dir" && ! -L "$state_dir" && -f "$backup" && -f "$baseline" ]] ||
  { echo kbo_commands_state_missing >&2; exit 1; }
[[ "$(stat -c '%U:%G:%a' "$state_dir")" == root:root:700 &&
   "$(stat -c '%U:%G:%a' "$backup")" == root:root:600 &&
   "$(stat -c '%U:%G:%a' "$baseline")" == root:root:600 ]] ||
  { echo kbo_commands_state_metadata_invalid >&2; exit 1; }

if [[ "$action" == restore ]]; then
  /usr/local/bin/node "$manager" restore "$backup"
  rm -rf -- "$state_dir"
  echo "kbo_commands_restore_pass release=$release_id flags=${flags[*]}"
  exit 0
fi

/usr/local/bin/node "$manager" verify "$expected_payload_sha"
current_counts="$(kbo_counts)"
[[ "$current_counts" == "$(<"$baseline")" ]] ||
  { echo kbo_commands_smoke_row_delta >&2; exit 1; }
rm -rf -- "$state_dir"
echo "kbo_commands_smoke_pass release=$release_id flags=${flags[*]} row_delta=0"
