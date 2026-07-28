#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-schema-backup-role.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
BIN="$ROOT/bin"
CREDENTIAL="$ROOT/etc/waw-backup/backup.env"
CALLS="$ROOT/psql.calls"
SECRET=synthetic-backup-password
mkdir -p "$BIN" "$(dirname -- "$CREDENTIAL")"

cat >"$BIN/psql" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == --version ]]; then
  printf 'psql (PostgreSQL) %s\n' "${TEST_PSQL_VERSION:-17.13}"
  exit 0
fi
printf 'query\n' >>"$TEST_PSQL_CALLS"
[[ "$*" == *"from public.app_schema_version"* ]] || exit 90
[[ "${PGHOST:-}" == db.invalid ]] || exit 91
[[ "${PGPORT:-}" == 5432 ]] || exit 92
[[ "${PGDATABASE:-}" == synthetic ]] || exit 93
[[ "${PGUSER:-}" == backup-role ]] || exit 94
[[ "${PGPASSWORD:-}" == synthetic-backup-password ]] || exit 95
[[ "${PGCONNECT_TIMEOUT:-}" == 10 ]] || exit 96
[[ "${PGAPPNAME:-}" == waw-schema-preflight ]] || exit 97
[[ -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_SECRET_ACCESS_KEY:-}" ]] || exit 98
case "${TEST_PSQL_RESULT_KIND:-pass}" in
  pass) printf '%s\n' "${TEST_SCHEMA_VERSION:-8}" ;;
  fail) exit 2 ;;
  malformed) printf '8\n9\n' ;;
  *) exit 3 ;;
esac
EOF
chmod 755 "$BIN/psql"

cat >"$BIN/timeout" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
while [[ "${1:-}" == --* ]]; do shift; done
shift
exec "$@"
EOF
chmod 755 "$BIN/timeout"

write_credential() {
  cat >"$CREDENTIAL" <<EOF
PGHOST=db.invalid
PGPORT=5432
PGDATABASE=synthetic
PGUSER=backup-role
PGPASSWORD=$SECRET
AWS_ACCESS_KEY_ID=synthetic-access-key
AWS_SECRET_ACCESS_KEY=synthetic-secret-key
AWS_REGION=ap-northeast-2
S3_BUCKET=synthetic-bucket
AGE_RECIPIENT=age1synthetic
EOF
  chgrp "$(id -gn)" "$CREDENTIAL"
  chmod 600 "$CREDENTIAL"
}

run_preflight() {
  WAW_INSTALL_ROOT="$ROOT" \
  WAW_PSQL_BIN="$BIN/psql" \
  WAW_TIMEOUT_BIN="$BIN/timeout" \
  TEST_PSQL_CALLS="$CALLS" \
    "$SCRIPT_DIR/check-production-schema-version-backup-role.sh"
}

write_credential
output="$(run_preflight)"
expected="$(
  printf '%s\n' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
    'SCHEMA_PREFLIGHT query=PASS version=8'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *"$SECRET"* ]]
[[ "$output" != *synthetic-secret-key* ]]
[[ "$output" != *db.invalid* ]]
[[ "$(wc -l <"$CALLS" | tr -d ' ')" -eq 1 ]]

if output="$(TEST_PSQL_RESULT_KIND=fail run_preflight 2>&1)"; then
  echo failed_query_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
    'SCHEMA_PREFLIGHT query_execution=FAIL version=UNKNOWN'
)" ]]

if output="$(TEST_PSQL_RESULT_KIND=malformed run_preflight 2>&1)"; then
  echo malformed_query_result_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
    'SCHEMA_PREFLIGHT query_result=FAIL version=UNKNOWN'
)" ]]

if output="$(TEST_SCHEMA_VERSION=7 run_preflight 2>&1)"; then
  echo wrong_schema_version_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
    'SCHEMA_PREFLIGHT query_version=FAIL version=UNKNOWN'
)" ]]

chmod 640 "$CREDENTIAL"
if output="$(run_preflight 2>&1)"; then
  echo wrong_fixture_mode_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_PREFLIGHT client_major=17' \
    'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN'
)" ]]

[[ "$output" != *"$SECRET"* ]]
[[ "$output" != *synthetic-secret-key* ]]
[[ "$output" != *db.invalid* ]]
echo production_schema_backup_role_preflight_fixture_passed
