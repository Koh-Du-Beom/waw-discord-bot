#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="${WAW_INSTALL_ROOT:-/}"
[[ "$ROOT" == /* ]] ||
  { echo 'SCHEMA_DIAGNOSTIC client_execution=FAIL'; exit 1; }

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

file_owner() {
  stat -c '%U' "$1" 2>/dev/null || stat -f '%Su' "$1" 2>/dev/null
}

file_group() {
  stat -c '%G' "$1" 2>/dev/null || stat -f '%Sg' "$1" 2>/dev/null
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null
}

echo 'SCHEMA_DIAGNOSTIC remote_entry=PASS'

[[ -x "$PSQL" && -x "$PYTHON" ]] ||
  { echo 'SCHEMA_DIAGNOSTIC client_execution=FAIL'; exit 1; }
client_version="$("$PSQL" --version 2>/dev/null || true)"
[[ "$client_version" =~ PostgreSQL\)\ 17([.\ ]) ]] ||
  { echo 'SCHEMA_DIAGNOSTIC client_execution=FAIL'; exit 1; }
echo 'SCHEMA_DIAGNOSTIC client_execution=PASS'

[[ -f "$CREDENTIAL" && ! -L "$CREDENTIAL" && -s "$CREDENTIAL" &&
  -r "$CREDENTIAL" ]] ||
  { echo 'SCHEMA_DIAGNOSTIC uri_parse=FAIL class=METADATA'; exit 1; }
[[ "$(file_owner "$CREDENTIAL" || true)" == "$EXPECTED_OWNER" &&
  "$(file_group "$CREDENTIAL" || true)" == "$EXPECTED_GROUP" &&
  "$(file_mode "$CREDENTIAL" || true)" == 600 ]] ||
  { echo 'SCHEMA_DIAGNOSTIC uri_parse=FAIL class=METADATA'; exit 1; }

"$PYTHON" - "$CREDENTIAL" "$PSQL" <<'PY'
import os
import pathlib
import subprocess
import sys
import urllib.parse

credential_path, psql = sys.argv[1:]

def fail(failure_class):
    print(
        f"SCHEMA_DIAGNOSTIC uri_parse=FAIL class={failure_class}",
        flush=True,
    )
    raise SystemExit(20)

try:
    lines = pathlib.Path(credential_path).read_text(encoding="utf-8").splitlines()
except Exception:
    fail("ENCODING")
if len(lines) != 1 or not lines[0]:
    fail("SHAPE")
try:
    parsed = urllib.parse.urlsplit(lines[0])
except Exception:
    fail("SYNTAX")
if parsed.scheme not in {"postgres", "postgresql"}:
    fail("SCHEME")
try:
    hostname = parsed.hostname
    username = parsed.username
    port = parsed.port
except Exception:
    fail("AUTHORITY")
if parsed.fragment or not hostname or not username:
    fail("AUTHORITY")
database = urllib.parse.unquote(parsed.path.removeprefix("/"))
if not database:
    fail("DATABASE")
try:
    query = (
        urllib.parse.parse_qs(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
        )
        if parsed.query
        else {}
    )
except Exception:
    fail("QUERY")
allowed_query = {"sslmode", "target_session_attrs", "uselibpqcompat"}
if not set(query).issubset(allowed_query):
    fail("QUERY")
if any(len(values) != 1 for values in query.values()):
    fail("QUERY")
if query.get("uselibpqcompat") not in (None, ["true"]):
    fail("QUERY")

print("SCHEMA_DIAGNOSTIC uri_parse=PASS", flush=True)
environment = {
    "LC_ALL": "C",
    "PGHOST": hostname,
    "PGDATABASE": database,
    "PGUSER": urllib.parse.unquote(username),
    "PGCONNECT_TIMEOUT": "10",
    "PGAPPNAME": "waw-schema-diagnostic",
}
if port is not None:
    environment["PGPORT"] = str(port)
if parsed.password is not None:
    environment["PGPASSWORD"] = urllib.parse.unquote(parsed.password)
libpq_query_environment = {
    "sslmode": "PGSSLMODE",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
}
for key, environment_key in libpq_query_environment.items():
    if key in query:
        environment[environment_key] = query[key][0]

try:
    completed = subprocess.run(
        [psql, "-X", "--no-password", "--command", r"\quit"],
        check=False,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=15,
    )
except Exception:
    print("SCHEMA_DIAGNOSTIC connection=FAIL", flush=True)
    raise SystemExit(21)
if completed.returncode != 0:
    print("SCHEMA_DIAGNOSTIC connection=FAIL", flush=True)
    raise SystemExit(22)
print("SCHEMA_DIAGNOSTIC connection=PASS", flush=True)
PY
