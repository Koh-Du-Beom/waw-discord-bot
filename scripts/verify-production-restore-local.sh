#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <restore-directory> <encrypted-owner-identity>" >&2
  exit 2
fi

RESTORE_DIR="$1"
IDENTITY="$2"
ARCHIVE="$RESTORE_DIR/archive.dump.age"
MANIFEST="$RESTORE_DIR/manifest.json"
CONTAINER="waw-production-restore-$(openssl rand -hex 8)"
TMP="$(mktemp -d /tmp/waw-production-restore-verify.XXXXXX)"
START_SECONDS="$SECONDS"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf -- "$TMP"
}
trap cleanup EXIT

for command in age age-keygen docker jq openssl shasum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
[[ -r "$ARCHIVE" && -r "$MANIFEST" && -r "$IDENTITY" ]]

EXPECTED_HASH="$(jq -er .archiveSha256 "$MANIFEST")"
EXPECTED_BYTES="$(jq -er .encryptedBytes "$MANIFEST")"
EXPECTED_ROWS="$(jq -er .expectedRowCount "$MANIFEST")"
EXPECTED_SCHEMA="$(jq -er .schemaVersion "$MANIFEST")"
[[ "$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')" == "$EXPECTED_HASH" ]]
[[ "$(wc -c < "$ARCHIVE" | tr -d ' ')" == "$EXPECTED_BYTES" ]]

age-keygen -o "$TMP/wrong-identity.txt" >/dev/null 2>&1
if age -d -i "$TMP/wrong-identity.txt" -o /dev/null "$ARCHIVE" >/dev/null 2>&1; then
  echo "wrong_identity_unexpected_success" >&2
  exit 1
fi
echo "wrong_identity_denied"

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=restore-test postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c 'drop schema public cascade;' >/dev/null

echo "Enter the owner recovery identity passphrase when age prompts."
age -d -i "$IDENTITY" "$ARCHIVE" \
  | docker exec -i "$CONTAINER" pg_restore --exit-on-error --no-owner --no-acl -U postgres -d postgres

SCHEMA_VERSION="$(docker exec "$CONTAINER" psql -U postgres -Atqc 'select version from public.app_schema_version;')"
ROW_COUNT="$(docker exec "$CONTAINER" psql -U postgres -Atqc 'select (select count(*) from public.app_session) + (select count(*) from public.operation_ledger) + (select count(*) from public.audit_event);')"
INVALID_CONSTRAINTS="$(docker exec "$CONTAINER" psql -U postgres -Atqc "select count(*) from pg_constraint where connamespace = 'public'::regnamespace and not convalidated;")"
[[ "$SCHEMA_VERSION" == "$EXPECTED_SCHEMA" ]]
[[ "$ROW_COUNT" == "$EXPECTED_ROWS" ]]
[[ "$INVALID_CONSTRAINTS" == 0 ]]
[[ "$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')" == "$EXPECTED_HASH" ]]

printf 'production_restore_verified\nschema_version=%s\nrow_count=%s\ninvalid_constraints=%s\nelapsed_seconds=%s\n' \
  "$SCHEMA_VERSION" "$ROW_COUNT" "$INVALID_CONSTRAINTS" "$((SECONDS - START_SECONDS))"
