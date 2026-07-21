#!/usr/bin/env bash
set -euo pipefail

# Disposable Linux/new-host verifier. It uses synthetic data only and never
# contacts AWS, Supabase, Discord, or a production database.
for required_command in age age-keygen docker; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'FAIL: missing required command: %s\n' "$required_command" >&2
    exit 1
  fi
done

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo 'FAIL: missing SHA-256 command' >&2
    return 1
  fi
}

task_dir=$(mktemp -d /tmp/waw-new-host-restore.XXXXXX)
source_name="waw-new-host-source-$$"
target_name="waw-new-host-target-$$"
password='synthetic-spike-only'

cleanup() {
  docker rm -f "$source_name" "$target_name" >/dev/null 2>&1 || true
  if [[ -n "$task_dir" && -d "$task_dir" ]]; then
    rm -rf -- "$task_dir"
  fi
}
trap cleanup EXIT

wait_for_postgres() {
  local container="$1"
  local attempt
  for attempt in $(seq 1 30); do
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

docker exec -i "$source_name" psql -v ON_ERROR_STOP=1 -U postgres -d synthetic >/dev/null <<'SQL'
CREATE TABLE schema_version (version integer PRIMARY KEY);
INSERT INTO schema_version VALUES (1);
CREATE TABLE synthetic_parent (id integer PRIMARY KEY, label text NOT NULL);
CREATE TABLE synthetic_child (
  id integer PRIMARY KEY,
  parent_id integer NOT NULL REFERENCES synthetic_parent(id),
  marker text NOT NULL
);
INSERT INTO synthetic_parent VALUES (1, 'synthetic-only'), (2, 'restore-check');
INSERT INTO synthetic_child VALUES (1, 2, 'fk-check');
SQL

docker exec "$source_name" pg_dump -U postgres -d synthetic -Fc > "$task_dir/source.dump"
age-keygen -o "$task_dir/identity.txt" >/dev/null 2>&1
age-keygen -o "$task_dir/wrong-identity.txt" >/dev/null 2>&1
recipient=$(awk '/^# public key:/{print $4}' "$task_dir/identity.txt")
age -r "$recipient" -o "$task_dir/source.dump.age" "$task_dir/source.dump"

if age -d -i "$task_dir/wrong-identity.txt" \
  -o "$task_dir/wrong.dump" "$task_dir/source.dump.age" >/dev/null 2>&1; then
  echo 'FAIL: wrong identity unexpectedly decrypted the archive' >&2
  exit 1
fi
rm -f -- "$task_dir/wrong.dump"

age -d -i "$task_dir/identity.txt" \
  -o "$task_dir/restored.dump" "$task_dir/source.dump.age"
cmp -s "$task_dir/source.dump" "$task_dir/restored.dump"

docker exec -i "$target_name" pg_restore -U postgres -d synthetic \
  --exit-on-error < "$task_dir/restored.dump"
schema_version=$(docker exec "$target_name" psql -At -U postgres -d synthetic \
  -c 'SELECT version FROM schema_version;')
row_count=$(docker exec "$target_name" psql -At -U postgres -d synthetic \
  -c 'SELECT count(*) FROM synthetic_parent;')
invariant=$(docker exec "$target_name" psql -At -U postgres -d synthetic \
  -c "SELECT label FROM synthetic_parent WHERE id = 2;")
foreign_key_orphans=$(docker exec "$target_name" psql -At -U postgres -d synthetic \
  -c 'SELECT count(*) FROM synthetic_child c LEFT JOIN synthetic_parent p ON p.id = c.parent_id WHERE p.id IS NULL;')

[[ "$schema_version" == '1' ]]
[[ "$row_count" == '2' ]]
[[ "$invariant" == 'restore-check' ]]
[[ "$foreign_key_orphans" == '0' ]]
if LC_ALL=C grep -a -q 'AGE-SECRET-KEY' "$task_dir/source.dump.age"; then
  echo 'FAIL: encrypted archive unexpectedly contains an identity marker' >&2
  exit 1
fi

archive_bytes=$(wc -c < "$task_dir/source.dump.age" | tr -d ' ')
archive_sha256=$(sha256_file "$task_dir/source.dump.age")
printf 'PASS: new-host synthetic encrypted PostgreSQL restore\n'
printf 'schema_version=%s\nrow_count=%s\nforeign_key_orphans=%s\n' \
  "$schema_version" "$row_count" "$foreign_key_orphans"
printf 'archive_bytes=%s\narchive_sha256=%s\n' "$archive_bytes" "$archive_sha256"
