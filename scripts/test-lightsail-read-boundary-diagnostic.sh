#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-lightsail-read-test.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/bin"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'while [[ "${1:-}" == --* ]]; do shift; done' \
  'shift' \
  'exec "$@"' >"$ROOT/bin/timeout"
chmod 755 "$ROOT/bin/timeout"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "%s\\n" "$*" >>"$FIXTURE_AWS_CALLS"' \
  'case "$*" in' \
  '  "lightsail get-instances "*)' \
  '    if [[ "${FIXTURE_SERVICE_FAIL:-0}" -ne 0 ]]; then' \
  '      echo "fixture-service-provider-error" >&2' \
  '      exit 1' \
  '    fi' \
  '    printf "%s\\n" "${FIXTURE_SERVICE_RESULT:-1}"' \
  '    ;;' \
  '  "lightsail get-instance "*)' \
  '    if [[ "${FIXTURE_TARGET_FAIL:-0}" -ne 0 ]]; then' \
  '      echo "fixture-target-provider-error" >&2' \
  '      exit 1' \
  '    fi' \
  '    printf "%s\\n" "${FIXTURE_TARGET_RESULT:-fixture-instance}"' \
  '    ;;' \
  '  *) exit 2 ;;' \
  'esac' >"$ROOT/bin/aws"
chmod 755 "$ROOT/bin/aws"

export FIXTURE_AWS_CALLS="$ROOT/aws.calls"

run_diagnostic() {
  WAW_AWS_BIN="$ROOT/bin/aws" \
  WAW_TIMEOUT_BIN="$ROOT/bin/timeout" \
  WAW_LIGHTSAIL_INSTANCE_NAME=fixture-instance \
  "$SCRIPT_DIR/run-lightsail-read-boundary-diagnostic.sh"
}

expected_success="$(
  printf '%s\n' \
    'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_response=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC target_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC target_response=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'LIGHTSAIL_READ_DIAGNOSTIC result=PASS'
)"

output="$(run_diagnostic)"
[[ "$output" == "$expected_success" ]]
[[ "$output" != *fixture-instance* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 2 ]]
[[ "$(sed -n '1p' "$FIXTURE_AWS_CALLS")" == \
  'lightsail get-instances --region ap-northeast-2 --query length(instances) --output text' ]]
[[ "$(sed -n '2p' "$FIXTURE_AWS_CALLS")" == \
  'lightsail get-instance --instance-name fixture-instance --region ap-northeast-2 --query instance.name --output text' ]]

: >"$FIXTURE_AWS_CALLS"
if output="$(FIXTURE_SERVICE_FAIL=1 run_diagnostic 2>&1)"; then
  echo failed_service_api_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_api=FAIL' \
    'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'LIGHTSAIL_READ_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-service-provider-error* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]

: >"$FIXTURE_AWS_CALLS"
if output="$(FIXTURE_SERVICE_RESULT=invalid run_diagnostic 2>&1)"; then
  echo invalid_service_response_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_response=FAIL' \
    'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'LIGHTSAIL_READ_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]

: >"$FIXTURE_AWS_CALLS"
if output="$(FIXTURE_TARGET_FAIL=1 run_diagnostic 2>&1)"; then
  echo failed_target_api_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_response=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC target_api=FAIL' \
    'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'LIGHTSAIL_READ_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-target-provider-error* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 2 ]]

: >"$FIXTURE_AWS_CALLS"
if output="$(FIXTURE_TARGET_RESULT=other-instance run_diagnostic 2>&1)"; then
  echo mismatched_target_response_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC service_response=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC target_api=PASS' \
    'LIGHTSAIL_READ_DIAGNOSTIC target_response=FAIL' \
    'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'LIGHTSAIL_READ_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *other-instance* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 2 ]]

echo lightsail_read_boundary_diagnostic_fixture_passed
