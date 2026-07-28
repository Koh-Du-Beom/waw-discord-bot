#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-schema-preflight.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
BIN="$ROOT/bin"
CREDENTIAL="$ROOT/etc/waw-credentials/bot-database-url"
CALLS="$ROOT/psql.calls"
SECRET='postgresql://synthetic-user:synthetic-password@invalid.example/synthetic?sslmode=require&uselibpqcompat=true'
mkdir -p "$BIN" "$(dirname -- "$CREDENTIAL")"

cat >"$BIN/psql" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == --version ]]; then
  printf 'psql (PostgreSQL) %s\n' "${TEST_PSQL_VERSION:-17.13}"
  exit 0
fi
printf 'query\n' >>"$TEST_PSQL_CALLS"
for argument in "$@"; do
  [[ "$argument" != *synthetic-password* ]] || exit 90
done
[[ "${PGHOST:-}" == invalid.example ]] || exit 91
[[ "${PGCONNECT_TIMEOUT:-}" == 10 ]] || exit 92
[[ "${PGAPPNAME:-}" == waw-schema-preflight ]] || exit 93
[[ "$*" == *"from public.app_schema_version"* ]] || exit 94
[[ "$*" != *schema_migrations* ]] || exit 95
[[ "${PGDATABASE:-}" == synthetic ]] || exit 96
[[ "${PGUSER:-}" == synthetic-user ]] || exit 97
[[ "${PGPASSWORD:-}" == synthetic-password ]] || exit 98
case "${TEST_PSQL_RESULT_KIND:-pass}" in
  pass) printf '%s\n' "${TEST_SCHEMA_VERSION:-8}" ;;
  fail) exit 2 ;;
  multiline) printf '8\n9\n' ;;
  *) exit 3 ;;
esac
EOF
chmod 755 "$BIN/psql"

export WAW_INSTALL_ROOT="$ROOT"
export WAW_PSQL_BIN="$BIN/psql"
export TEST_PSQL_CALLS="$CALLS"
export TEST_EXPECTED_DATABASE="$SECRET"

write_credential() {
  printf '%s\n' "$1" >"$CREDENTIAL"
  chgrp "$(id -gn)" "$CREDENTIAL"
  chmod 600 "$CREDENTIAL"
}

write_credential "$SECRET"
if ! "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  sed 's/^/unexpected_runner_stdout: /' "$ROOT/out" >&2
  sed 's/^/unexpected_runner_stderr: /' "$ROOT/err" >&2
  exit 1
fi
cat >"$ROOT/expected" <<'EOF'
SCHEMA_PREFLIGHT client_major=17
SCHEMA_PREFLIGHT credential_metadata=PASS
SCHEMA_PREFLIGHT query=PASS version=8
EOF
cmp -s "$ROOT/expected" "$ROOT/out"
[[ ! -s "$ROOT/err" ]]
! grep -FRq -- "$SECRET" "$ROOT/out" "$ROOT/err" "$CALLS"
[[ "$(wc -l <"$CALLS" | tr -d ' ')" -eq 1 ]]

write_credential \
  'postgresql://synthetic-user:synthetic-password@invalid.example/synthetic?sslmode=require&uselibpqcompat=false'
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo invalid_libpq_compat_value_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT query=FAIL version=UNKNOWN' "$ROOT/out"
[[ "$(wc -l <"$CALLS" | tr -d ' ')" -eq 1 ]]

rm -f "$CREDENTIAL"
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo missing_schema_credential_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN' "$ROOT/out"

write_credential ''
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo empty_schema_credential_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN' "$ROOT/out"

write_credential "$SECRET"
mv "$CREDENTIAL" "$CREDENTIAL.source"
ln -s "$CREDENTIAL.source" "$CREDENTIAL"
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo symlink_schema_credential_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN' "$ROOT/out"
rm -f "$CREDENTIAL"
mv "$CREDENTIAL.source" "$CREDENTIAL"

printf '%s\n%s\n' "$SECRET" second-line >"$CREDENTIAL"
chmod 600 "$CREDENTIAL"
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo multiline_schema_credential_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN' "$ROOT/out"
[[ "$(wc -l <"$CALLS" | tr -d ' ')" -eq 1 ]]

write_credential "$SECRET"
chmod 644 "$CREDENTIAL"
if "$SCRIPT_DIR/check-production-schema-version.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo wrong_mode_schema_credential_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN' "$ROOT/out"

write_credential "$SECRET"
if TEST_PSQL_VERSION=16.9 "$SCRIPT_DIR/check-production-schema-version.sh" \
  >"$ROOT/out" 2>"$ROOT/err"; then
  echo wrong_psql_major_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT client=FAIL version=UNKNOWN' "$ROOT/out"

for kind in fail multiline; do
  if TEST_PSQL_RESULT_KIND="$kind" "$SCRIPT_DIR/check-production-schema-version.sh" \
    >"$ROOT/out" 2>"$ROOT/err"; then
    echo "invalid_psql_result_was_accepted kind=$kind" >&2
    exit 1
  fi
  grep -qx 'SCHEMA_PREFLIGHT query=FAIL version=UNKNOWN' "$ROOT/out"
  ! grep -FRq -- "$SECRET" "$ROOT/out" "$ROOT/err" "$CALLS"
done

if TEST_SCHEMA_VERSION=7 "$SCRIPT_DIR/check-production-schema-version.sh" \
  >"$ROOT/out" 2>"$ROOT/err"; then
  echo wrong_schema_version_was_accepted >&2
  exit 1
fi
grep -qx 'SCHEMA_PREFLIGHT query=FAIL version=UNKNOWN' "$ROOT/out"
! grep -FRq -- "$SECRET" "$ROOT/out" "$ROOT/err" "$CALLS"
echo production_schema_preflight_fixture_passed
