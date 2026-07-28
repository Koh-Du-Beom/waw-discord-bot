#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-schema-stage-controller.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/bin" "$ROOT/remote/etc/waw-credentials" \
  "$ROOT/remote/etc/waw-backup"

printf '%s\n' \
  'postgresql://fixture-user:fixture-secret@db.invalid/fixture?sslmode=require&uselibpqcompat=true' \
  >"$ROOT/remote/etc/waw-credentials/bot-database-url"
chgrp "$(id -gn)" "$ROOT/remote/etc/waw-credentials/bot-database-url"
chmod 600 "$ROOT/remote/etc/waw-credentials/bot-database-url"

cat >"$ROOT/remote/etc/waw-backup/backup.env" <<'EOF'
PGHOST=db.invalid
PGPORT=5432
PGDATABASE=fixture
PGUSER=fixture-backup
PGPASSWORD=fixture-backup-secret
AWS_ACCESS_KEY_ID=fixture-access
AWS_SECRET_ACCESS_KEY=fixture-secret
AWS_REGION=ap-northeast-2
S3_BUCKET=fixture-bucket
AGE_RECIPIENT=age1fixture
EOF
chgrp "$(id -gn)" "$ROOT/remote/etc/waw-backup/backup.env"
chmod 600 "$ROOT/remote/etc/waw-backup/backup.env"

printf '%s\n' '#!/bin/bash' \
  'set -Eeuo pipefail' \
  'if [[ "${1:-}" == --version ]]; then' \
  '  echo "psql (PostgreSQL) 17.10"' \
  '  exit 0' \
  'fi' \
  'if [[ "$*" == *"from public.app_schema_version"* ]]; then' \
  '  echo 8' \
  '  exit 0' \
  'fi' \
  'exit 0' >"$ROOT/bin/psql"
chmod 755 "$ROOT/bin/psql"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'case "$*" in' \
  '  daemon-reload) ;;' \
  '  "is-active waw-bot.service") echo active ;;' \
  '  "show -p MainPID --value waw-bot.service") echo 4242 ;;' \
  '  "show -p ExecMainStartTimestampMonotonic --value waw-bot.service") echo 9001 ;;' \
  '  "cat waw-bot.service")' \
  '    printf "%s\\n" "[Service]" "Environment=WAW_SUMMARY_QUOTA_ENABLED=0" "Environment=WAW_GAME_OBSERVATION_ENABLED=0" "Environment=WAW_SUMMARY_DASHBOARD_QUOTA_ENABLED=0"' \
  '    [[ ! -f "$FIXTURE_PROVIDER_TARGET" ]] || cat "$FIXTURE_PROVIDER_TARGET"' \
  '    ;;' \
  '  "show -p Environment --value waw-bot.service")' \
  '    printf "%s" "WAW_SUMMARY_QUOTA_ENABLED=0 WAW_GAME_OBSERVATION_ENABLED=0 WAW_SUMMARY_DASHBOARD_QUOTA_ENABLED=0"' \
  '    [[ ! -f "$FIXTURE_PROVIDER_TARGET" ]] || printf "%s" " WAW_SUMMARY_PROVIDER_ENABLED=0"' \
  '    printf "\\n"' \
  '    ;;' \
  '  "--failed --no-legend --plain") ;;' \
  '  *) exit 2 ;;' \
  'esac' >"$ROOT/bin/systemctl"
chmod 755 "$ROOT/bin/systemctl"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "%s\\n" "{\"status\":\"healthy\"}"' >"$ROOT/bin/curl"
chmod 755 "$ROOT/bin/curl"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'while [[ "${1:-}" == --* ]]; do shift; done' \
  'shift' \
  'exec "$@"' >"$ROOT/bin/timeout"
chmod 755 "$ROOT/bin/timeout"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "call\\n" >>"$FIXTURE_AWS_CALLS"' \
  'printf "%s\\n" "$*" >>"$FIXTURE_AWS_ARGS"' \
  'printf "%s\\n" "$FIXTURE_ACCESS_JSON"' >"$ROOT/bin/aws"
chmod 755 "$ROOT/bin/aws"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "call\\n" >>"$FIXTURE_SSH_CALLS"' \
  'socket=' \
  'operation=' \
  'master=0' \
  'remote=0' \
  'for ((index=1; index <= $#; index++)); do' \
  '  argument="${!index}"' \
  '  [[ "$argument" != -S ]] || { next=$((index + 1)); socket="${!next}"; }' \
  '  [[ "$argument" != -O ]] || { next=$((index + 1)); operation="${!next}"; }' \
  '  [[ "$argument" != -M ]] || master=1' \
  '  [[ "$argument" != /usr/bin/sudo ]] || remote=1' \
  'done' \
  'if [[ "${FIXTURE_SSH_START_FAIL:-0}" -eq 1 ]]; then' \
  '  echo "Permission denied (publickey)." >&2' \
  '  exit 1' \
  'fi' \
  'if [[ "$master" -eq 1 ]]; then' \
  '  : >"$socket"' \
  '  exit 0' \
  'fi' \
  'case "$operation" in' \
  '  check) [[ -e "$socket" ]]; exit ;;' \
  '  exit) rm -f -- "$socket"; exit ;;' \
  'esac' \
  'if [[ "$*" == *"/usr/bin/printf WAW_REMOTE_CHANNEL_READY"* ]]; then' \
  '  printf "WAW_REMOTE_CHANNEL_READY\\n"' \
  '  exit 0' \
  'fi' \
  'if [[ "$remote" -eq 1 ]]; then' \
  '  WAW_INSTALL_ROOT="$FIXTURE_REMOTE_ROOT" \' \
  '  WAW_PSQL_BIN="$FIXTURE_PSQL_BIN" \' \
  '  WAW_SYSTEMCTL_BIN="$FIXTURE_SYSTEMCTL_BIN" \' \
  '  WAW_CURL_BIN="$FIXTURE_CURL_BIN" \' \
  '  /bin/bash' \
  '  exit' \
  'fi' \
  'exit 1' >"$ROOT/bin/ssh"
chmod 755 "$ROOT/bin/ssh"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'case "$*" in' \
  '  "-y -f "*) echo "ssh-ed25519 QUJDRA== fixture" ;;' \
  '  "-Lf "*)' \
  '    printf "%s\\n" "Type: ssh-ed25519-cert-v01@openssh.com user certificate" "        Public key: ED25519-CERT SHA256:fixturematch"' \
  '    ;;' \
  '  "-lf "*"-E sha256") echo "256 SHA256:fixturematch fixture (ED25519)" ;;' \
  '  *) exit 1 ;;' \
  'esac' >"$ROOT/bin/ssh-keygen"
chmod 755 "$ROOT/bin/ssh-keygen"

export FIXTURE_AWS_CALLS="$ROOT/aws.calls"
export FIXTURE_AWS_ARGS="$ROOT/aws.args"
export FIXTURE_SSH_CALLS="$ROOT/ssh.calls"
export FIXTURE_REMOTE_ROOT="$ROOT/remote"
export FIXTURE_PSQL_BIN="$ROOT/bin/psql"
export FIXTURE_SYSTEMCTL_BIN="$ROOT/bin/systemctl"
export FIXTURE_CURL_BIN="$ROOT/bin/curl"
export FIXTURE_PROVIDER_TARGET="$ROOT/remote/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf"
export FIXTURE_ACCESS_JSON
FIXTURE_ACCESS_JSON="$(
  printf '%s' \
    '{"accessDetails":{"privateKey":"fixture-private-key",' \
    '"certKey":"fixture-certificate","username":"fixture-user",' \
    '"ipAddress":"192.0.2.10","hostKeys":[' \
    '{"algorithm":"ssh-ed25519","publicKey":"QUJDRA=="}]}}'
)"

run_controller() {
  WAW_AWS_BIN="$ROOT/bin/aws" \
  WAW_SSH_BIN="$ROOT/bin/ssh" \
  WAW_SSH_KEYGEN_BIN="$ROOT/bin/ssh-keygen" \
  WAW_TIMEOUT_BIN="$ROOT/bin/timeout" \
  WAW_PYTHON_BIN="$(command -v python3)" \
  WAW_LIGHTSAIL_INSTANCE_NAME=fixture-instance \
  "$SCRIPT_DIR/run-production-schema-failure-stage-diagnostic.sh"
}

output="$(run_controller)"
expected="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC controller_start=PASS' \
    'SCHEMA_DIAGNOSTIC access_acquisition=PASS' \
    'SCHEMA_DIAGNOSTIC material_validation=PASS' \
    'SCHEMA_DIAGNOSTIC ssh_connection=PASS' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=PASS' \
    'SCHEMA_DIAGNOSTIC connection=PASS' \
    'SCHEMA_DIAGNOSTIC sql_dispatch=PASS mode=STATIC_ONLY' \
    'SCHEMA_DIAGNOSTIC query_total=0' \
    'SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'SCHEMA_DIAGNOSTIC result=PASS'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-secret* ]]
[[ "$output" != *db.invalid* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$(<"$FIXTURE_AWS_ARGS")" == \
  'lightsail get-instance-access-details --instance-name fixture-instance --protocol ssh --region ap-northeast-2 --output json' ]]
[[ "$(wc -l <"$FIXTURE_SSH_CALLS" | tr -d ' ')" -eq 1 ]]

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
: >"$FIXTURE_SSH_CALLS"
output="$(WAW_SCHEMA_EXECUTION_MODE=SCHEMA_VERSION_QUERY run_controller)"
expected="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC controller_start=PASS' \
    'SCHEMA_DIAGNOSTIC access_acquisition=PASS' \
    'SCHEMA_DIAGNOSTIC material_validation=PASS' \
    'SCHEMA_DIAGNOSTIC ssh_connection=PASS' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
    'SCHEMA_PREFLIGHT query=PASS version=8' \
    'SCHEMA_DIAGNOSTIC sql_dispatch=PASS mode=SCHEMA_VERSION_QUERY' \
    'SCHEMA_DIAGNOSTIC query_total=1' \
    'SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'SCHEMA_DIAGNOSTIC result=PASS'
)"
[[ "$output" == "$expected" ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$(wc -l <"$FIXTURE_SSH_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$output" != *fixture-secret* ]]
[[ "$output" != *fixture-backup-secret* ]]
[[ "$output" != *db.invalid* ]]

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
: >"$FIXTURE_SSH_CALLS"
output="$(WAW_SCHEMA_EXECUTION_MODE=PROVIDER_DEFAULT_OFF_INSTALL run_controller)"
expected="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC controller_start=PASS' \
    'SCHEMA_DIAGNOSTIC access_acquisition=PASS' \
    'SCHEMA_DIAGNOSTIC material_validation=PASS' \
    'SCHEMA_DIAGNOSTIC ssh_connection=PASS' \
    'PROVIDER_DEFAULT_OFF precondition=PASS' \
    'PROVIDER_DEFAULT_OFF material=PASS' \
    'PROVIDER_DEFAULT_OFF install=PASS daemon_reload=1 service_restart=0' \
    'PROVIDER_DEFAULT_OFF metadata=PASS' \
    'PROVIDER_DEFAULT_OFF declaration=PASS zero=1 one=0 other=0' \
    'PROVIDER_DEFAULT_OFF resolved=PASS zero=1 one=0 other=0' \
    'PROVIDER_DEFAULT_OFF bot_identity=PASS' \
    'PROVIDER_DEFAULT_OFF health=PASS' \
    'PROVIDER_DEFAULT_OFF failed_units=PASS count=0' \
    'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0' \
    'PROVIDER_DEFAULT_OFF result=PASS' \
    'SCHEMA_DIAGNOSTIC query_total=0' \
    'SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'SCHEMA_DIAGNOSTIC result=PASS'
)"
[[ "$output" == "$expected" ]]
[[ -f "$FIXTURE_PROVIDER_TARGET" ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$(wc -l <"$FIXTURE_SSH_CALLS" | tr -d ' ')" -eq 1 ]]
rm -f -- "$FIXTURE_PROVIDER_TARGET"

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
: >"$FIXTURE_SSH_CALLS"
if output="$(FIXTURE_SSH_START_FAIL=1 run_controller 2>&1)"; then
  echo failed_ssh_start_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC controller_start=PASS' \
    'SCHEMA_DIAGNOSTIC access_acquisition=PASS' \
    'SCHEMA_DIAGNOSTIC material_validation=PASS' \
    'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=AUTHENTICATION' \
    'SCHEMA_DIAGNOSTIC query_total=0' \
    'SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'SCHEMA_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$(wc -l <"$FIXTURE_SSH_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$output" != *fixture-secret* ]]
[[ "$output" != *db.invalid* ]]

echo production_schema_failure_stage_controller_fixture_passed
