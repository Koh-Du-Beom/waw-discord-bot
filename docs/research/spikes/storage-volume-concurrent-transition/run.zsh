#!/bin/zsh
set -euo pipefail

spike_tmp=$(mktemp -d /tmp/waw-storage-spike.XXXXXX)
pg_data="$spike_tmp/pgdata"
pg_socket="$spike_tmp/socket"
pg_port=$((55000 + $$ % 1000))
sqlite_db="$spike_tmp/storage.sqlite"
sqlite_dump="$spike_tmp/sqlite.sql"
pg_dump_file="$spike_tmp/postgres.sql"
pg_started=0

cleanup() {
  if (( pg_started )); then
    pg_ctl -D "$pg_data" -m immediate stop >/dev/null
  fi
  rm -rf "$spike_tmp"
}
trap cleanup EXIT INT TERM

mkdir "$pg_socket"
initdb -D "$pg_data" --auth=trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$pg_data" -o "-F -k $pg_socket -p $pg_port" -w start >/dev/null
pg_started=1
createdb -h "$pg_socket" -p "$pg_port" spike

sqlite3 "$sqlite_db" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE operations (
  operation_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('applied')),
  created_at TEXT NOT NULL
);
CREATE TABLE audit (
  audit_id INTEGER PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operations(operation_id),
  actor_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  service_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_created_at_idx ON audit(created_at);
CREATE INDEX audit_actor_idx ON audit(actor_id);
CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
BEGIN;
WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i + 1 FROM n WHERE i < 120000)
INSERT INTO operations
SELECT printf('op-%06d', i), 'applied', '2026-01-01T00:00:00Z' FROM n;
INSERT INTO audit(operation_id, actor_id, command_name, outcome, reason_code, duration_ms, service_version, created_at)
SELECT operation_id, printf('actor-%02d', rowid % 20), 'summary', 'success', 'ok', rowid % 1000, 'spike', created_at
FROM operations;
WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i + 1 FROM n WHERE i < 1000)
INSERT INTO sessions
SELECT printf('session-hash-%04d', i), printf('actor-%02d', i % 20), '2026-07-21T00:00:00Z', '2026-07-27T00:00:00Z' FROM n;
COMMIT;
PRAGMA wal_checkpoint(TRUNCATE);
SQL

psql -X -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -d spike <<'SQL' >/dev/null
CREATE TABLE operations (
  operation_id text PRIMARY KEY,
  status text NOT NULL CHECK (status = 'applied'),
  created_at timestamptz NOT NULL
);
CREATE TABLE audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id text NOT NULL UNIQUE REFERENCES operations(operation_id),
  actor_id text NOT NULL,
  command_name text NOT NULL,
  outcome text NOT NULL,
  reason_code text NOT NULL,
  duration_ms integer NOT NULL,
  service_version text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX audit_created_at_idx ON audit(created_at);
CREATE INDEX audit_actor_idx ON audit(actor_id);
CREATE TABLE sessions (
  session_hash text PRIMARY KEY,
  actor_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
INSERT INTO operations
SELECT 'op-' || lpad(i::text, 6, '0'), 'applied', '2026-01-01T00:00:00Z'::timestamptz
FROM generate_series(1, 120000) AS i;
INSERT INTO audit(operation_id, actor_id, command_name, outcome, reason_code, duration_ms, service_version, created_at)
SELECT operation_id, 'actor-' || lpad((audit_id % 20)::text, 2, '0'), 'summary', 'success', 'ok', (audit_id % 1000)::integer, 'spike', created_at
FROM (SELECT row_number() OVER () AS audit_id, operation_id, created_at FROM operations) AS source;
INSERT INTO sessions
SELECT 'session-hash-' || lpad(i::text, 4, '0'), 'actor-' || lpad((i % 20)::text, 2, '0'), '2026-07-21T00:00:00Z'::timestamptz, '2026-07-27T00:00:00Z'::timestamptz
FROM generate_series(1, 1000) AS i;
SQL

for _ in {1..32}; do
  sqlite3 -cmd '.timeout 10000' -cmd '.bail on' "$sqlite_db" "PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; INSERT OR IGNORE INTO operations VALUES('race-op','applied','2026-07-20T00:00:00Z'); INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) SELECT 'race-op','actor-01','change','success','ok',1,'spike','2026-07-20T00:00:00Z' WHERE changes()=1; COMMIT;" &
done
wait

for _ in {1..32}; do
  psql -X -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -d spike -c "WITH inserted AS (INSERT INTO operations VALUES('race-op','applied',now()) ON CONFLICT DO NOTHING RETURNING operation_id) INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) SELECT operation_id,'actor-01','change','success','ok',1,'spike',now() FROM inserted;" >/dev/null &
done
wait

if sqlite3 -cmd '.bail on' "$sqlite_db" "PRAGMA foreign_keys=ON; BEGIN; INSERT INTO operations VALUES('crash-op','applied','2026-07-20T00:00:00Z'); INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) VALUES('crash-op','actor-01','change','success','ok',1,'spike','2026-07-20T00:00:00Z'); SELECT * FROM missing_table; COMMIT;" >/dev/null 2>&1; then
  print -u2 'SQLite interruption fixture unexpectedly succeeded'
  exit 1
fi
if psql -X -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -d spike -c "BEGIN; INSERT INTO operations VALUES('crash-op','applied',now()); INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) VALUES('crash-op','actor-01','change','success','ok',1,'spike',now()); SELECT * FROM missing_table; COMMIT;" >/dev/null 2>&1; then
  print -u2 'PostgreSQL interruption fixture unexpectedly succeeded'
  exit 1
fi

sqlite_rollback=$(sqlite3 "$sqlite_db" "SELECT (SELECT count(*) FROM operations WHERE operation_id='crash-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='crash-op');")
pg_rollback=$(psql -X -At -h "$pg_socket" -p "$pg_port" -d spike -c "SELECT (SELECT count(*) FROM operations WHERE operation_id='crash-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='crash-op');")

sqlite3 "$sqlite_db" "PRAGMA foreign_keys=ON; BEGIN; INSERT INTO operations VALUES('crash-op','applied','2026-07-20T00:00:00Z'); INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) VALUES('crash-op','actor-01','change','success','ok',1,'spike','2026-07-20T00:00:00Z'); COMMIT;"
psql -X -v ON_ERROR_STOP=1 -h "$pg_socket" -p "$pg_port" -d spike -c "BEGIN; INSERT INTO operations VALUES('crash-op','applied',now()); INSERT INTO audit(operation_id,actor_id,command_name,outcome,reason_code,duration_ms,service_version,created_at) VALUES('crash-op','actor-01','change','success','ok',1,'spike',now()); COMMIT;" >/dev/null

sqlite3 "$sqlite_db" .dump > "$sqlite_dump"
pg_dump -h "$pg_socket" -p "$pg_port" -d spike > "$pg_dump_file"

sqlite_db_bytes=$(stat -f %z "$sqlite_db")
sqlite_export_bytes=$(stat -f %z "$sqlite_dump")
pg_db_bytes=$(psql -X -At -h "$pg_socket" -p "$pg_port" -d spike -c 'SELECT pg_database_size(current_database());')
pg_export_bytes=$(stat -f %z "$pg_dump_file")
sqlite_race=$(sqlite3 "$sqlite_db" "SELECT (SELECT count(*) FROM operations WHERE operation_id='race-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='race-op');")
pg_race=$(psql -X -At -h "$pg_socket" -p "$pg_port" -d spike -c "SELECT (SELECT count(*) FROM operations WHERE operation_id='race-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='race-op');")
sqlite_retry=$(sqlite3 "$sqlite_db" "SELECT (SELECT count(*) FROM operations WHERE operation_id='crash-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='crash-op');")
pg_retry=$(psql -X -At -h "$pg_socket" -p "$pg_port" -d spike -c "SELECT (SELECT count(*) FROM operations WHERE operation_id='crash-op') || ',' || (SELECT count(*) FROM audit WHERE operation_id='crash-op');")
sqlite_fk=$(sqlite3 "$sqlite_db" 'PRAGMA foreign_key_check;' | wc -l | tr -d ' ')
pg_fk=$(psql -X -At -h "$pg_socket" -p "$pg_port" -d spike -c "SELECT count(*) FROM audit a LEFT JOIN operations o USING(operation_id) WHERE o.operation_id IS NULL;")

limit=536870912
[[ $sqlite_db_bytes -lt $limit && $sqlite_export_bytes -lt $limit && $sqlite_race == '1,1' && $sqlite_rollback == '0,0' && $sqlite_retry == '1,1' && $sqlite_fk == '0' ]]
[[ $pg_db_bytes -lt $limit && $pg_export_bytes -lt $limit && $pg_race == '1,1' && $pg_rollback == '0,0' && $pg_retry == '1,1' && $pg_fk == '0' ]]

print -- "{\"outcome\":\"pass\",\"sqlite\":{\"database_bytes\":$sqlite_db_bytes,\"export_bytes\":$sqlite_export_bytes,\"race\":\"$sqlite_race\",\"rollback\":\"$sqlite_rollback\",\"retry\":\"$sqlite_retry\",\"foreign_key_violations\":$sqlite_fk},\"postgresql\":{\"database_bytes\":$pg_db_bytes,\"export_bytes\":$pg_export_bytes,\"race\":\"$pg_race\",\"rollback\":\"$pg_rollback\",\"retry\":\"$pg_retry\",\"foreign_key_violations\":$pg_fk}}"
