#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
container="waw-data-reset-fixture-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$container" \
  -e POSTGRES_PASSWORD=fixture-password \
  postgres:17-bookworm >/dev/null

for _ in {1..30}; do
  docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null

for migration in "$ROOT"/migrations/00*.sql; do
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres \
    <"$migration" >/dev/null
done
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres \
  <"$ROOT/deploy/integration/postgres/data-reset-fixture.sql" >/dev/null

before_security="$(docker exec "$container" psql -At -U postgres -c \
  "select count(*) from pg_policies where schemaname='public';
   select count(*) from pg_class where relnamespace='public'::regnamespace and relrowsecurity;
   select count(*) from information_schema.role_table_grants
    where grantee in ('waw_web','waw_bot');")"

if docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres \
    <"$ROOT/scripts/production-data-reset.sql" >/dev/null 2>&1; then
  echo data_reset_guard_failed >&2
  exit 1
fi
test "$(docker exec "$container" psql -At -U postgres \
  -c "select count(*) from riot_account_link")" = "1"

docker exec -e PGOPTIONS="-c waw.data_reset_approval=waw-production-data-reset-v1" \
  -i "$container" psql -v ON_ERROR_STOP=1 -U postgres \
  <"$ROOT/scripts/production-data-reset.sql" >/dev/null

test "$(docker exec "$container" psql -At -U postgres -c \
  "select array_agg(version order by version) from app_schema_version")" \
  = "{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17}"
test "$(docker exec "$container" psql -At -U postgres -c \
  "select summary_enabled::text || ':' || version from dashboard_setting")" \
  = "false:0"
test "$before_security" = "$(docker exec "$container" psql -At -U postgres -c \
  "select count(*) from pg_policies where schemaname='public';
   select count(*) from pg_class where relnamespace='public'::regnamespace and relrowsecurity;
   select count(*) from information_schema.role_table_grants
    where grantee in ('waw_web','waw_bot');")"

echo production_data_reset_fixture_pass
