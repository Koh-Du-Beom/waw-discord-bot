#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <db-host> <admin-user> <migration-file> <output-directory>" >&2
  exit 2
fi

DB_HOST="$1"
ADMIN_USER="$2"
MIGRATION_FILE="$3"
OUTPUT_DIR="$4"

for command in psql age age-keygen openssl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
[[ -f "$MIGRATION_FILE" ]] || { echo "migration file not found" >&2; exit 1; }
[[ ! -e "$OUTPUT_DIR" ]] || { echo "output directory already exists" >&2; exit 1; }

mkdir -m 700 "$OUTPUT_DIR"
trap 'unset PGPASSWORD ADMIN_PASSWORD BACKUP_PASSWORD' EXIT

read -r -s -p "Supabase postgres password: " ADMIN_PASSWORD
echo
PGPASSWORD="$ADMIN_PASSWORD" psql "host=$DB_HOST port=5432 dbname=postgres user=$ADMIN_USER sslmode=require" \
  -v ON_ERROR_STOP=1 -Atqc \
  "select case when count(*) = 0 then 'ready' else 'not_empty' end from pg_tables where schemaname='public';" \
  | grep -qx ready

BACKUP_PASSWORD="$(openssl rand -hex 32)"
export PGPASSWORD="$ADMIN_PASSWORD"
{
  printf '\\set backup_password %s\n' "$BACKUP_PASSWORD"
  printf '\\i %s\n' "$MIGRATION_FILE"
  cat <<'SQL'
create role waw_backup login bypassrls password :'backup_password';
grant connect on database postgres to waw_backup;
grant usage on schema public to waw_backup;
grant select on all tables in schema public to waw_backup;
grant select on all sequences in schema public to waw_backup;
alter default privileges for role postgres in schema public grant select on tables to waw_backup;
alter default privileges for role postgres in schema public grant select on sequences to waw_backup;
SQL
} | psql "host=$DB_HOST port=5432 dbname=postgres user=$ADMIN_USER sslmode=require" \
  -v ON_ERROR_STOP=1 -1 >/dev/null
unset PGPASSWORD ADMIN_PASSWORD

age-keygen -o "$OUTPUT_DIR/identity.txt" >/dev/null
age -p -o "$OUTPUT_DIR/identity.age" "$OUTPUT_DIR/identity.txt"
AGE_RECIPIENT="$(age-keygen -y "$OUTPUT_DIR/identity.txt")"
rm -f -- "$OUTPUT_DIR/identity.txt"

POOLER_USER="waw_backup"
if [[ "$ADMIN_USER" == postgres.* ]]; then
  POOLER_USER="waw_backup.${ADMIN_USER#postgres.}"
fi

cat > "$OUTPUT_DIR/host-db.env" <<EOF
PGHOST=$DB_HOST
PGPORT=5432
PGDATABASE=postgres
PGUSER=$POOLER_USER
PGPASSWORD=$BACKUP_PASSWORD
AGE_RECIPIENT=$AGE_RECIPIENT
EOF
chmod 600 "$OUTPUT_DIR/identity.age" "$OUTPUT_DIR/host-db.env"
unset BACKUP_PASSWORD

echo "bootstrap_complete"
echo "Store identity.age in offline owner custody; host-db.env is temporary deployment input."
