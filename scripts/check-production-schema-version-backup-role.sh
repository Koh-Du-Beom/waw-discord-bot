#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ROOT="${WAW_INSTALL_ROOT:-/}"
EXPECTED_VERSION="${WAW_EXPECTED_SCHEMA_VERSION:-8}"
RUN_DIR=

[[ "$ROOT" == /* ]] ||
  { echo 'SCHEMA_PREFLIGHT root=FAIL version=UNKNOWN'; exit 1; }
[[ "$EXPECTED_VERSION" =~ ^[1-9][0-9]*$ ]] ||
  { echo 'SCHEMA_PREFLIGHT expected_version=FAIL version=UNKNOWN'; exit 1; }

if [[ "$ROOT" == / ]]; then
  CREDENTIAL=/etc/waw-backup/backup.env
  PSQL=/usr/bin/psql
  TIMEOUT=/usr/bin/timeout
  EXPECTED_OWNER=root
  EXPECTED_GROUP=waw-backup
  EXPECTED_MODE=640
else
  CREDENTIAL="${ROOT%/}/etc/waw-backup/backup.env"
  PSQL="${WAW_PSQL_BIN:?fixture_psql_required}"
  TIMEOUT="${WAW_TIMEOUT_BIN:?fixture_timeout_required}"
  EXPECTED_OWNER="$(id -un)"
  EXPECTED_GROUP="$(id -gn)"
  EXPECTED_MODE=600
fi

cleanup() {
  unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE
  unset PGTARGETSESSIONATTRS PGCONNECT_TIMEOUT PGAPPNAME
  unset AGE_RECIPIENT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  unset AWS_SESSION_TOKEN AWS_REGION S3_BUCKET
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR"
    RUN_DIR=
  fi
}
trap cleanup EXIT

fail() {
  local stage="$1"
  cleanup
  printf 'SCHEMA_PREFLIGHT %s=FAIL version=UNKNOWN\n' "$stage"
  exit 1
}

file_owner() {
  stat -c '%U' "$1" 2>/dev/null || stat -f '%Su' "$1" 2>/dev/null
}

file_group() {
  stat -c '%G' "$1" 2>/dev/null || stat -f '%Sg' "$1" 2>/dev/null
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null
}

[[ -x "$PSQL" && -x "$TIMEOUT" ]] || fail client
client_version="$("$PSQL" --version 2>/dev/null || true)"
[[ "$client_version" =~ PostgreSQL\)\ 17([.\ ]) ]] || fail client
echo 'SCHEMA_PREFLIGHT client_major=17'

[[ -f "$CREDENTIAL" && ! -L "$CREDENTIAL" && -r "$CREDENTIAL" ]] ||
  fail credential_metadata
[[ "$(file_owner "$CREDENTIAL" || true)" == "$EXPECTED_OWNER" ]] ||
  fail credential_metadata
[[ "$(file_group "$CREDENTIAL" || true)" == "$EXPECTED_GROUP" ]] ||
  fail credential_metadata
[[ "$(file_mode "$CREDENTIAL" || true)" == "$EXPECTED_MODE" ]] ||
  fail credential_metadata
echo 'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE'

# The production backup job already sources this root-owned file. Reuse that
# established contract, then immediately discard every non-PostgreSQL value.
set -a
# shellcheck disable=SC1090
source "$CREDENTIAL" 2>/dev/null || fail credential_parse
set +a
unset AGE_RECIPIENT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN AWS_REGION S3_BUCKET

for name in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; do
  value="${!name:-}"
  [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* ]] ||
    fail credential_parse
done
[[ "$PGPORT" =~ ^[1-9][0-9]{0,4}$ && "$PGPORT" -le 65535 ]] ||
  fail credential_parse

export LC_ALL=C
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
export PGCONNECT_TIMEOUT=10
export PGAPPNAME=waw-schema-preflight

RUN_DIR="$(mktemp -d /tmp/waw-schema-preflight-run.XXXXXX)" ||
  fail query_execution
chmod 700 "$RUN_DIR" || fail query_execution
query_rc=0
"$TIMEOUT" --signal=TERM --kill-after=2s 15s \
  "$PSQL" \
  -X \
  --no-password \
  --no-align \
  --tuples-only \
  --set ON_ERROR_STOP=1 \
  --command \
  'select coalesce(max(version), 0)::int from public.app_schema_version;' \
  >"$RUN_DIR/result" 2>/dev/null || query_rc=$?
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
unset PGSSLMODE PGTARGETSESSIONATTRS PGCONNECT_TIMEOUT PGAPPNAME
[[ "$query_rc" -eq 0 ]] || fail query_execution

schema_version="$(<"$RUN_DIR/result")"
cleanup
[[ "$schema_version" =~ ^[1-9][0-9]*$ ]] || fail query_result
[[ "$schema_version" == "$EXPECTED_VERSION" ]] || fail query_version
printf 'SCHEMA_PREFLIGHT query=PASS version=%s\n' "$schema_version"
