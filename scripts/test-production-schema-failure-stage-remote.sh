#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-schema-stage-remote.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/etc/waw-credentials" "$ROOT/bin"

credential="$ROOT/etc/waw-credentials/bot-database-url"
printf '%s\n' \
  'postgresql://fixture-user:fixture-secret@db.invalid/fixture?sslmode=require&uselibpqcompat=true' \
  >"$credential"
chmod 600 "$credential"
chgrp "$(id -gn)" "$credential"

printf '%s\n' '#!/bin/bash' \
  'set -Eeuo pipefail' \
  'if [[ "${1:-}" == --version ]]; then' \
  '  printf "psql (PostgreSQL) %s\\n" "${FIXTURE_PSQL_VERSION:-17.10}"' \
  '  exit 0' \
  'fi' \
  '[[ "$*" == *"-X --no-password --command \\quit"* ]] || exit 90' \
  '[[ -n "${PGHOST:-}" && -n "${PGUSER:-}" && -n "${PGDATABASE:-}" ]] || exit 91' \
  '[[ "${PGCONNECT_TIMEOUT:-}" == 10 ]] || exit 92' \
  '[[ "${PGAPPNAME:-}" == waw-schema-diagnostic ]] || exit 93' \
  '/usr/bin/env | /usr/bin/grep -q "^PG.*postgresql://" && exit 94' \
  '[[ ! -f "$0.exit" ]] || exit 1' \
  'exit 0' >"$ROOT/bin/psql"
chmod 755 "$ROOT/bin/psql"

run_remote() {
  WAW_INSTALL_ROOT="$ROOT" \
  WAW_PSQL_BIN="$ROOT/bin/psql" \
  "$SCRIPT_DIR/production-schema-failure-stage-remote.sh"
}

expected="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=PASS' \
    'SCHEMA_DIAGNOSTIC connection=PASS'
)"
output="$(run_remote)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-secret* ]]
[[ "$output" != *db.invalid* ]]

if output="$(FIXTURE_PSQL_VERSION=16.9 run_remote 2>&1)"; then
  echo wrong_client_major_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=FAIL'
)" ]]

touch "$ROOT/bin/psql.exit"
if output="$(run_remote 2>&1)"; then
  echo failed_connection_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=PASS' \
    'SCHEMA_DIAGNOSTIC connection=FAIL'
)" ]]
rm "$ROOT/bin/psql.exit"

printf '%s\n' \
  'postgresql://fixture-user:fixture-secret@db.invalid/fixture?sslmode=require&uselibpqcompat=false' \
  >"$credential"
chgrp "$(id -gn)" "$credential"
chmod 600 "$credential"
if output="$(run_remote 2>&1)"; then
  echo invalid_libpq_compat_value_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=FAIL class=QUERY'
)" ]]

printf 'not-a-postgresql-uri\n' >"$credential"
chgrp "$(id -gn)" "$credential"
chmod 600 "$credential"
if output="$(run_remote 2>&1)"; then
  echo malformed_uri_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=FAIL class=SCHEME'
)" ]]

rm -f "$credential"
printf 'postgresql://fixture-user:fixture-secret@db.invalid/fixture\n' \
  >"$ROOT/credential-target"
chgrp "$(id -gn)" "$ROOT/credential-target"
chmod 600 "$ROOT/credential-target"
ln -s "$ROOT/credential-target" "$credential"
if output="$(run_remote 2>&1)"; then
  echo symlink_credential_was_accepted >&2
  exit 1
fi
[[ "$output" == "$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=FAIL class=METADATA'
)" ]]
[[ "$output" != *fixture-secret* ]]
[[ "$output" != *db.invalid* ]]

echo production_schema_failure_stage_remote_fixture_passed
