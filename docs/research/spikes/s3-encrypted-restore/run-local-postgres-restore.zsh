#!/usr/bin/env zsh
set -euo pipefail

# Local-only companion to the S3 transport Spike. It never contacts AWS,
# Supabase, Discord, or a production database.
task_dir=$(mktemp -d /tmp/waw-pg-restore-spike.XXXXXX)
source_name="waw-pg-restore-source-$$"
target_name="waw-pg-restore-target-$$"
password='synthetic-spike-only'

cleanup() {
  docker rm -f "$source_name" "$target_name" >/dev/null 2>&1 || true
  rm -rf "$task_dir"
}
trap cleanup EXIT

wait_for_postgres() {
  local container="$1"
  local attempt
  for attempt in {1..30}; do
    if docker exec "$container" pg_isready -U postgres -d synthetic >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo 'FAIL: synthetic PostgreSQL did not become ready' >&2
  return 1
}

docker run -d --rm --name "$source_name" \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=synthetic \
  postgres:16-alpine >/dev/null
docker run -d --rm --name "$target_name" \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=synthetic \
  postgres:16-alpine >/dev/null

wait_for_postgres "$source_name"
wait_for_postgres "$target_name"

printf '%s\n' \
  'CREATE TABLE synthetic_spike (id integer PRIMARY KEY, label text NOT NULL);' \
  "INSERT INTO synthetic_spike VALUES (1, 'synthetic-only'), (2, 'restore-check');" \
  | docker exec -i "$source_name" psql -v ON_ERROR_STOP=1 -U postgres -d synthetic >/dev/null

docker exec "$source_name" pg_dump -U postgres -d synthetic -Fc > "$task_dir/source.dump"
age-keygen -o "$task_dir/identity.txt" >/dev/null 2>&1
recipient=$(awk '/^# public key:/{print $4}' "$task_dir/identity.txt")
age -r "$recipient" -o "$task_dir/source.dump.age" "$task_dir/source.dump"
age -d -i "$task_dir/identity.txt" -o "$task_dir/restored.dump" "$task_dir/source.dump.age"
cmp -s "$task_dir/source.dump" "$task_dir/restored.dump"

docker exec -i "$target_name" pg_restore -U postgres -d synthetic --exit-on-error < "$task_dir/restored.dump"
row_count=$(docker exec "$target_name" psql -At -U postgres -d synthetic -c 'SELECT count(*) FROM synthetic_spike;')
invariant=$(docker exec "$target_name" psql -At -U postgres -d synthetic -c "SELECT label FROM synthetic_spike WHERE id = 2;")

[[ "$row_count" == '2' ]]
[[ "$invariant" == 'restore-check' ]]
if LC_ALL=C grep -a -q 'AGE-SECRET-KEY' "$task_dir/source.dump.age"; then
  echo 'FAIL: encrypted archive unexpectedly contains an identity marker' >&2
  exit 1
fi

archive_bytes=$(wc -c < "$task_dir/source.dump.age" | tr -d ' ')
archive_sha256=$(shasum -a 256 "$task_dir/source.dump.age" | awk '{print $1}')
printf 'PASS: local synthetic encrypted PostgreSQL restore\n'
printf 'archive_bytes=%s\narchive_sha256=%s\n' "$archive_bytes" "$archive_sha256"
