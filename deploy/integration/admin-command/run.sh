#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
suffix="waw-plan0006-task6-$$"
network="$suffix-net"
postgres="$suffix-pg"
app="$suffix-app"
image="$suffix-image"
socket="/run/waw-admin-command/admin-command.sock"
database_url="postgresql://postgres:task6@${postgres}:5432/waw_task6"

cleanup() {
  docker rm -f "$app" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -q -t "$image" -f "$ROOT/deploy/integration/admin-command/Dockerfile" "$ROOT" >/dev/null
docker network create "$network" >/dev/null
docker run -d --name "$postgres" --network "$network" \
  -e POSTGRES_PASSWORD=task6 -e POSTGRES_DB=waw_task6 postgres:17-alpine >/dev/null
docker run -d --name "$app" --network "$network" "$image" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$postgres" pg_isready -U postgres -d waw_task6 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$postgres" pg_isready -U postgres -d waw_task6 >/dev/null

for migration in "$ROOT"/migrations/00*.sql; do
  docker exec -i "$postgres" psql -v ON_ERROR_STOP=1 -U postgres -d waw_task6 \
    <"$migration" >/dev/null
done

docker exec "$app" install -d -o waw-bot -g waw-admin-command -m 0750 /run/waw-admin-command

start_server() {
  local delay="${1:-0}"
  docker exec -d \
    -e WAW_ADMIN_COMMAND_SOCKET="$socket" \
    -e WAW_POSTGRES_TEST_URL="$database_url" \
    -e WAW_ADMIN_RESPONSE_DELAY_MS="$delay" \
    "$app" setpriv --reuid=waw-bot --regid=waw-member-role --init-groups \
    node --import tsx src/integration/admin-command-server-fixture.ts
  for _ in $(seq 1 50); do
    if docker exec "$app" test -S "$socket"; then return; fi
    sleep 0.1
  done
  echo admin_socket_not_ready >&2
  exit 1
}

client() {
  local user="$1" mode="$2" operation="$3"
  shift 3
  docker exec --user "$user" \
    -e WAW_ADMIN_COMMAND_SOCKET="$socket" \
    -e WAW_ADMIN_COMMAND_MODE="$mode" \
    -e WAW_ADMIN_COMMAND_OPERATION_ID="$operation" \
    "$@" "$app" node --import tsx src/integration/admin-command-client-fixture.ts
}

seed_request() {
  local request="$1" operation="$2" name="$3"
  docker exec "$postgres" psql -v ON_ERROR_STOP=1 -U postgres -d waw_task6 \
    -c "insert into operation_ledger values ('$operation','123456789012345678',clock_timestamp(),'accepted','accepted');
        insert into riot_account_link_request
          (request_id,operation_id,discord_user_id,platform_id,game_name,tag_line,status,requested_at)
        values ('$request','$operation','323456789012345678','KR','$name','KR1','pending_admin_approval',clock_timestamp());" \
    >/dev/null
}

start_server
[[ "$(docker exec "$app" stat -c '%U:%G %a' "$socket")" == "waw-bot:waw-admin-command 660" ]]
client waw-web list permission-list-op | grep -q '"outcome":"success"'
client unrelated list permission-denied-op | grep -q '"outcome":"unavailable"'

docker exec "$app" pkill -9 -f admin-command-server-fixture.ts
docker exec "$app" test -S "$socket"
start_server
client waw-web list restart-list-op | grep -q '"outcome":"success"'

docker exec --user waw-web -e WAW_ADMIN_COMMAND_SOCKET="$socket" "$app" \
  node --import tsx src/integration/admin-command-flood-fixture.ts |
  grep -qx malformed_flood_complete
client waw-web list post-flood-list-op | grep -q '"outcome":"success"'

docker exec -d --user waw-web -e WAW_ADMIN_COMMAND_SOCKET="$socket" \
  -e WAW_HOLD_CONNECTIONS=8 -e WAW_HOLD_MS=1500 "$app" \
  node --import tsx src/integration/admin-command-hold-fixture.ts
sleep 0.3
client waw-web list bound-list-operation | grep -q '"outcome":"unavailable"'
sleep 1.5
client waw-web list after-bound-list-op | grep -q '"outcome":"success"'

seed_request concurrent-request-01 seed-concurrent-01 Concurrent
docker exec -d --user waw-web \
  -e WAW_ADMIN_COMMAND_SOCKET="$socket" -e WAW_ADMIN_COMMAND_MODE=approve \
  -e WAW_ADMIN_COMMAND_OPERATION_ID=concurrent-approve-01 \
  -e WAW_RIOT_REQUEST_ID=concurrent-request-01 -e WAW_RIOT_LINK_ID=concurrent-link-01 \
  "$app" sh -c 'node --import tsx src/integration/admin-command-client-fixture.ts > /tmp/concurrent-1.json'
docker exec -d --user waw-web \
  -e WAW_ADMIN_COMMAND_SOCKET="$socket" -e WAW_ADMIN_COMMAND_MODE=approve \
  -e WAW_ADMIN_COMMAND_OPERATION_ID=concurrent-approve-02 \
  -e WAW_RIOT_REQUEST_ID=concurrent-request-01 -e WAW_RIOT_LINK_ID=concurrent-link-02 \
  "$app" sh -c 'node --import tsx src/integration/admin-command-client-fixture.ts > /tmp/concurrent-2.json'
for _ in $(seq 1 50); do
  if docker exec "$app" test -s /tmp/concurrent-1.json &&
     docker exec "$app" test -s /tmp/concurrent-2.json; then break; fi
  sleep 0.1
done
[[ "$(docker exec "$app" sh -c "grep -h '\"outcome\":\"success\"' /tmp/concurrent-*.json | wc -l")" == "1" ]]
[[ "$(docker exec "$postgres" psql -At -U postgres -d waw_task6 -c \
  "select count(*) from riot_account_link where link_id in ('concurrent-link-01','concurrent-link-02')")" == "1" ]]

docker exec "$app" pkill -9 -f admin-command-server-fixture.ts
start_server 250
seed_request timeout-request-01 seed-timeout-01 Timeout
client waw-web approve timeout-approve-01 \
  -e WAW_RIOT_REQUEST_ID=timeout-request-01 \
  -e WAW_RIOT_LINK_ID=timeout-link-01 \
  -e WAW_PUUID_CHARACTER=B \
  -e WAW_ADMIN_DEADLINE_MS=50 |
  grep -q '"outcome":"outcome_unknown"'
sleep 0.4
client waw-web status timeout-status-01 \
  -e WAW_TARGET_OPERATION_ID=timeout-approve-01 |
  grep -q '"status":"success"'

docker exec -i "$postgres" psql -v ON_ERROR_STOP=1 -U postgres -d waw_task6 <<'SQL' >/dev/null
create function fail_task6_audit() returns trigger language plpgsql as $$
begin
  if new.event_id = 'rollback-reject-01' then
    raise exception 'forced audit failure';
  end if;
  return new;
end $$;
create trigger fail_task6_audit before insert on audit_event
for each row execute function fail_task6_audit();
SQL
seed_request rollback-request-01 seed-rollback-01 Rollback
client waw-web reject rollback-reject-01 \
  -e WAW_RIOT_REQUEST_ID=rollback-request-01 |
  grep -q '"outcome":"unavailable"'
[[ "$(docker exec "$postgres" psql -At -U postgres -d waw_task6 -c \
  "select status from riot_account_link_request where request_id='rollback-request-01'")" == "pending_admin_approval" ]]
[[ "$(docker exec "$postgres" psql -At -U postgres -d waw_task6 -c \
  "select count(*) from operation_ledger where operation_id='rollback-reject-01'")" == "0" ]]
[[ "$(docker exec "$postgres" psql -At -U postgres -d waw_task6 -c \
  "select count(*) from admin_command_result where operation_id='rollback-reject-01'")" == "0" ]]

echo admin_command_process_boundary_test_passed
