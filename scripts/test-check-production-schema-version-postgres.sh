#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-schema-postgres.XXXXXX)"
DATA="$ROOT/data"
CREDENTIAL="$ROOT/etc/waw-credentials/bot-database-url"
PORT="$((55000 + $$ % 1000))"
POSTGRES_USER="$(id -un)"

cleanup() {
  if [[ -d "$DATA" ]]; then
    pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$ROOT"
}
trap cleanup EXIT

mkdir -p "$(dirname -- "$CREDENTIAL")"
initdb -D "$DATA" -A trust -U "$POSTGRES_USER" >/dev/null
pg_ctl -D "$DATA" -o "-F -h 127.0.0.1 -p $PORT" -w start >/dev/null
psql \
  --host=127.0.0.1 \
  --port="$PORT" \
  --username="$POSTGRES_USER" \
  --dbname=postgres \
  --set ON_ERROR_STOP=1 \
  --command 'create table public.app_schema_version (version integer primary key);' \
  --command 'insert into public.app_schema_version(version) select generate_series(1, 8);' \
  >/dev/null

DATABASE_URL="postgresql://$POSTGRES_USER@127.0.0.1:$PORT/postgres"
printf '%s\n' "$DATABASE_URL" >"$CREDENTIAL"
chgrp "$(id -gn)" "$CREDENTIAL"
chmod 600 "$CREDENTIAL"

if ! WAW_INSTALL_ROOT="$ROOT" \
  WAW_PSQL_BIN="$(command -v psql)" \
    "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  sed 's/^/unexpected_postgres_runner_stdout: /' "$ROOT/out" >&2
  sed 's/^/unexpected_postgres_runner_stderr: /' "$ROOT/err" >&2
  exit 1
fi
cat >"$ROOT/expected" <<'EOF'
SCHEMA_PREFLIGHT client_major=17
SCHEMA_PREFLIGHT credential_metadata=PASS
SCHEMA_PREFLIGHT query=PASS version=8
EOF
cmp -s "$ROOT/expected" "$ROOT/out"
[[ ! -s "$ROOT/err" ]]
! grep -FRq -- "$DATABASE_URL" "$ROOT/out" "$ROOT/err"
echo production_schema_preflight_postgres_17_passed
