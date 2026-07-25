#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ENV_FILE="${WAW_BACKUP_ENV_FILE:-/etc/waw-backup/backup.env}"
STATE_DIR="${WAW_BACKUP_STATE_DIR:-/var/lib/waw-backup}"
[[ -r "$ENV_FILE" ]] || { echo "backup_env_unreadable" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

required=(PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD AGE_RECIPIENT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION S3_BUCKET)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "missing_required_config" >&2; exit 1; }
done
[[ "$AGE_RECIPIENT" == age1* ]] || { echo "invalid_age_recipient" >&2; exit 1; }
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION

for command in pg_dump psql age aws sha256sum openssl; do
  command -v "$command" >/dev/null || { echo "missing_required_command" >&2; exit 1; }
done

mkdir -p "$STATE_DIR"
RUN_DIR="$(mktemp -d /tmp/waw-production-backup.XXXXXX)"
cleanup() { rm -rf -- "$RUN_DIR"; }
trap cleanup EXIT

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ARCHIVE_ID="$(openssl rand -hex 16)"
OBJECT_KEY="backups/${STARTED_AT//:/-}-$ARCHIVE_ID.dump.age"

ROW_COUNT_BEFORE="$(psql -At -v ON_ERROR_STOP=1 -c 'select (select count(*) from public.app_session) + (select count(*) from public.operation_ledger) + (select count(*) from public.audit_event);')"
pg_dump --host="$PGHOST" --port="$PGPORT" --dbname="$PGDATABASE" --username="$PGUSER" \
  --format=custom --schema=public --no-owner --no-acl --file="$RUN_DIR/database.dump"
SCHEMA_VERSION="$(psql -At -v ON_ERROR_STOP=1 -c 'select max(version) from public.app_schema_version;')"
ROW_COUNT="$(psql -At -v ON_ERROR_STOP=1 -c 'select (select count(*) from public.app_session) + (select count(*) from public.operation_ledger) + (select count(*) from public.audit_event);')"
[[ "$SCHEMA_VERSION" =~ ^[1-9][0-9]*$ ]] || { echo "invalid_schema_version" >&2; exit 1; }
[[ "$ROW_COUNT_BEFORE" =~ ^[0-9]+$ && "$ROW_COUNT" =~ ^[0-9]+$ ]] || { echo "invalid_row_count" >&2; exit 1; }
[[ "$ROW_COUNT_BEFORE" == "$ROW_COUNT" ]] || { echo "source_changed_during_dump" >&2; exit 1; }
age -r "$AGE_RECIPIENT" -o "$RUN_DIR/database.dump.age" "$RUN_DIR/database.dump"
rm -f -- "$RUN_DIR/database.dump"

ARCHIVE_SHA256="$(sha256sum "$RUN_DIR/database.dump.age" | awk '{print $1}')"
ARCHIVE_BYTES="$(wc -c < "$RUN_DIR/database.dump.age" | tr -d ' ')"
LOCAL_CHECKSUM_B64="$(openssl dgst -sha256 -binary "$RUN_DIR/database.dump.age" | openssl base64 -A)"
REMOTE_CHECKSUM_B64="$(aws s3api put-object --bucket "$S3_BUCKET" --key "$OBJECT_KEY" \
  --body "$RUN_DIR/database.dump.age" --checksum-algorithm SHA256 --query ChecksumSHA256 --output text)"
[[ "$LOCAL_CHECKSUM_B64" == "$REMOTE_CHECKSUM_B64" ]] || { echo "uploaded_hash_mismatch" >&2; exit 1; }

COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$RUN_DIR/manifest.json" <<EOF
{"archiveId":"$ARCHIVE_ID","objectKey":"$OBJECT_KEY","createdAt":"$STARTED_AT","completedAt":"$COMPLETED_AT","schemaVersion":$SCHEMA_VERSION,"encryptedBytes":$ARCHIVE_BYTES,"archiveSha256":"$ARCHIVE_SHA256","expectedRowCount":$ROW_COUNT,"expectedInvariant":"constraints_valid","status":"published"}
EOF
aws s3api put-object --bucket "$S3_BUCKET" --key "$OBJECT_KEY.manifest.json" \
  --body "$RUN_DIR/manifest.json" --content-type application/json >/dev/null
install -m 600 "$RUN_DIR/manifest.json" "$STATE_DIR/last-published.json"
rm -f -- "$RUN_DIR/database.dump.age" "$RUN_DIR/manifest.json"
echo "backup_published"
