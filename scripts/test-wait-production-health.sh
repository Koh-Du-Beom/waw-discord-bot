#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_root="$(mktemp -d)"
cleanup() { rm -rf -- "$fixture_root"; }
trap cleanup EXIT

cat >"$fixture_root/curl" <<'SH'
#!/usr/bin/env bash
count_file="${WAW_FIXTURE_COUNT_FILE:?}"
count="$(cat "$count_file" 2>/dev/null || echo 0)"
count=$((count + 1))
printf '%s\n' "$count" >"$count_file"
if (( count >= ${WAW_FIXTURE_HEALTHY_AFTER:?} )); then
  printf '{"status":"healthy"}\n'
  exit 0
fi
exit 7
SH
cat >"$fixture_root/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$fixture_root/curl" "$fixture_root/sleep"

count_file="$fixture_root/count"
PATH="$fixture_root:$PATH" WAW_FIXTURE_COUNT_FILE="$count_file" \
  WAW_FIXTURE_HEALTHY_AFTER=3 \
  bash "$repo_root/deploy/wait-production-health.sh"
[[ "$(cat "$count_file")" == 3 ]]

: >"$count_file"
status=0
output="$(
  PATH="$fixture_root:$PATH" WAW_FIXTURE_COUNT_FILE="$count_file" \
    WAW_FIXTURE_HEALTHY_AFTER=13 \
    bash "$repo_root/deploy/wait-production-health.sh" 2>&1
)" || status=$?
[[ "$status" -ne 0 && "$output" == *production_health_timeout* ]]
[[ "$(cat "$count_file")" == 12 ]]

printf 'production_health_retry_fixture_pass\n'
