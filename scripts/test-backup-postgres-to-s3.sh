#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-backup-test.XXXXXX)"
cleanup() {
  rm -rf -- "$ROOT"
}
trap cleanup EXIT

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BIN="$ROOT/bin"
STATE="$ROOT/state"
mkdir -p "$BIN" "$STATE"

cat >"$ROOT/backup.env" <<'EOF'
PGHOST=test
PGPORT=5432
PGDATABASE=test
PGUSER=test
PGPASSWORD=test
AGE_RECIPIENT=age1test
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=ap-northeast-2
S3_BUCKET=test
EOF

cat >"$BIN/psql" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"select max(version)"*) printf '%s\n' "${TEST_SCHEMA_VERSION:-2}" ;;
  *"select (select count"*) printf '0\n' ;;
  *) exit 2 ;;
esac
EOF

cat >"$BIN/pg_dump" <<'EOF'
#!/usr/bin/env bash
for argument in "$@"; do
  case "$argument" in
    --file=*) printf 'fixture dump\n' >"${argument#--file=}" ;;
  esac
done
EOF

cat >"$BIN/age" <<'EOF'
#!/usr/bin/env bash
while (($#)); do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -r) shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
cp "$input" "$output"
EOF

cat >"$BIN/aws" <<'EOF'
#!/usr/bin/env bash
body=
while (($#)); do
  case "$1" in
    --body) body="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [[ "$body" == *.manifest.json ]]; then
  :
else
  openssl dgst -sha256 -binary "$body" | openssl base64 -A
  printf '\n'
fi
EOF

chmod +x "$BIN/"*
export PATH="$BIN:$PATH"
export WAW_BACKUP_ENV_FILE="$ROOT/backup.env"
export WAW_BACKUP_STATE_DIR="$STATE"

"$SCRIPT_DIR/backup-postgres-to-s3.sh" | grep -qx backup_published
python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    manifest = json.load(source)
if (manifest["schemaVersion"], manifest["expectedRowCount"], manifest["status"]) != (2, 0, "published"):
    raise SystemExit(1)
' "$STATE/last-published.json"
python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' \
  "$STATE/last-published.json"

if TEST_SCHEMA_VERSION=$'1\n2' "$SCRIPT_DIR/backup-postgres-to-s3.sh" >"$ROOT/out" 2>"$ROOT/err"; then
  echo multiline_schema_version_was_accepted >&2
  exit 1
fi
grep -qx invalid_schema_version "$ROOT/err"

echo backup_postgres_to_s3_test_passed
