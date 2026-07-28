#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="${WAW_INSTALL_ROOT:-/}"
EXPECTED_VERSION="${WAW_EXPECTED_SCHEMA_VERSION:-8}"
RUN_DIR=
[[ "$ROOT" == /* ]] ||
  { echo 'SCHEMA_PREFLIGHT root=FAIL version=UNKNOWN'; exit 1; }
[[ "$EXPECTED_VERSION" =~ ^[1-9][0-9]*$ ]] ||
  { echo 'SCHEMA_PREFLIGHT expected_version=FAIL version=UNKNOWN'; exit 1; }

if [[ "$ROOT" == / ]]; then
  CREDENTIAL=/etc/waw-credentials/bot-database-url
  PSQL=/usr/bin/psql
  PYTHON=/usr/bin/python3
  EXPECTED_OWNER=root
  EXPECTED_GROUP=root
else
  CREDENTIAL="${ROOT%/}/etc/waw-credentials/bot-database-url"
  PSQL="${WAW_PSQL_BIN:?fixture_psql_required}"
  PYTHON="${WAW_PYTHON_BIN:-/usr/bin/python3}"
  EXPECTED_OWNER="$(id -un)"
  EXPECTED_GROUP="$(id -gn)"
fi

cleanup() {
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR"
    RUN_DIR=
  fi
}
trap cleanup EXIT

fail() {
  cleanup
  printf 'SCHEMA_PREFLIGHT %s=FAIL version=UNKNOWN\n' "$1"
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

[[ -x "$PSQL" ]] || fail client
client_version="$("$PSQL" --version 2>/dev/null || true)"
[[ "$client_version" =~ PostgreSQL\)\ 17([.\ ]) ]] || fail client
[[ -x "$PYTHON" ]] || fail parser
echo 'SCHEMA_PREFLIGHT client_major=17'

[[ -f "$CREDENTIAL" && ! -L "$CREDENTIAL" ]] || fail credential_metadata
[[ "$(file_owner "$CREDENTIAL" || true)" == "$EXPECTED_OWNER" ]] ||
  fail credential_metadata
[[ "$(file_group "$CREDENTIAL" || true)" == "$EXPECTED_GROUP" ]] ||
  fail credential_metadata
[[ "$(file_mode "$CREDENTIAL" || true)" == 600 ]] ||
  fail credential_metadata
[[ -r "$CREDENTIAL" ]] || fail credential_metadata
awk 'NR != 1 || length($0) == 0 { exit 1 } END { if (NR != 1) exit 1 }' \
  "$CREDENTIAL" 2>/dev/null ||
  fail credential_metadata
echo 'SCHEMA_PREFLIGHT credential_metadata=PASS'

RUN_DIR="$(mktemp -d /tmp/waw-schema-preflight-run.XXXXXX)" || fail service_pipe
chmod 700 "$RUN_DIR" || fail service_pipe
if ! "$PYTHON" - "$CREDENTIAL" "$PSQL" >"$RUN_DIR/result" 2>/dev/null <<'PY'
import os
import subprocess
import sys
import urllib.parse

credential_path, psql = sys.argv[1:]
raw = open(credential_path, encoding="utf-8").read().rstrip("\n")
parsed = urllib.parse.urlsplit(raw)
if parsed.scheme not in {"postgres", "postgresql"}:
    raise SystemExit(20)
if parsed.fragment or not parsed.hostname or not parsed.username:
    raise SystemExit(21)
database = urllib.parse.unquote(parsed.path.removeprefix("/"))
if not database:
    raise SystemExit(22)
query = (
    urllib.parse.parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    if parsed.query
    else {}
)
allowed_query = {"sslmode", "target_session_attrs", "uselibpqcompat"}
if not set(query).issubset(allowed_query) or any(len(values) != 1 for values in query.values()):
    raise SystemExit(23)
if query.get("uselibpqcompat") not in (None, ["true"]):
    raise SystemExit(23)

environment = os.environ.copy()
environment.update({
    "PGHOST": parsed.hostname,
    "PGDATABASE": database,
    "PGUSER": urllib.parse.unquote(parsed.username),
    "PGCONNECT_TIMEOUT": "10",
    "PGAPPNAME": "waw-schema-preflight",
})
if parsed.port is not None:
    environment["PGPORT"] = str(parsed.port)
if parsed.password is not None:
    environment["PGPASSWORD"] = urllib.parse.unquote(parsed.password)
libpq_query_environment = {
    "sslmode": "PGSSLMODE",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
}
for key, environment_key in libpq_query_environment.items():
    if key in query:
        environment[environment_key] = query[key][0]

completed = subprocess.run(
    [
        psql,
        "-X",
        "--no-password",
        "--no-align",
        "--tuples-only",
        "--set",
        "ON_ERROR_STOP=1",
        "--command",
        "select coalesce(max(version), 0)::int from public.app_schema_version;",
    ],
    check=False,
    env=environment,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
    timeout=15,
)
if completed.returncode != 0:
    raise SystemExit(24)
sys.stdout.write(completed.stdout)
PY
then
  fail query
fi
schema_version="$(cat "$RUN_DIR/result")"
cleanup
[[ "$schema_version" == "$EXPECTED_VERSION" ]] || fail query
printf 'SCHEMA_PREFLIGHT query=PASS version=%s\n' "$schema_version"
