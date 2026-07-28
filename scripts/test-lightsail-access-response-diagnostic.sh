#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-access-response-test.XXXXXX)"
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
  'printf "call\\n" >>"$FIXTURE_AWS_CALLS"' \
  'printf "%s\\n" "$*" >>"$FIXTURE_AWS_ARGS"' \
  'if [[ "${FIXTURE_AWS_FAIL:-0}" -ne 0 ]]; then' \
  '  echo "fixture-provider-error" >&2' \
  '  exit 1' \
  'fi' \
  'printf "%s\\n" "$FIXTURE_ACCESS_JSON"' >"$ROOT/bin/aws"
chmod 755 "$ROOT/bin/aws"

export FIXTURE_AWS_CALLS="$ROOT/aws.calls"
export FIXTURE_AWS_ARGS="$ROOT/aws.args"
export FIXTURE_ACCESS_JSON
FIXTURE_ACCESS_JSON="$(
  printf '%s' \
    '{"accessDetails":{"privateKey":"fixture-private-key",' \
    '"certKey":"fixture-certificate","username":"fixture-user",' \
    '"ipAddress":"192.0.2.10","hostKeys":[' \
    '{"algorithm":"ssh-ed25519","publicKey":"QUJDRA=="}]}}'
)"

run_diagnostic() {
  WAW_AWS_BIN="$ROOT/bin/aws" \
  WAW_TIMEOUT_BIN="$ROOT/bin/timeout" \
  WAW_LIGHTSAIL_INSTANCE_NAME=fixture-instance \
  "$SCRIPT_DIR/run-lightsail-access-response-diagnostic.sh"
}

assert_no_transient() {
  [[ -z "$(find /tmp -maxdepth 1 -name 'waw-access-response.*' -print -quit)" ]]
}

output="$(run_diagnostic)"
expected="$(
  printf '%s\n' \
    'ACCESS_DIAGNOSTIC controller_start=PASS' \
    'ACCESS_DIAGNOSTIC access_api=PASS' \
    'ACCESS_DIAGNOSTIC access_response=PASS' \
    'ACCESS_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'ACCESS_DIAGNOSTIC result=PASS'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-private-key* ]]
[[ "$output" != *192.0.2.10* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
[[ "$(<"$FIXTURE_AWS_ARGS")" == \
  'lightsail get-instance-access-details --instance-name fixture-instance --protocol ssh --region ap-northeast-2 --output json' ]]
assert_no_transient

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
if output="$(FIXTURE_AWS_FAIL=1 run_diagnostic 2>&1)"; then
  echo failed_access_api_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'ACCESS_DIAGNOSTIC controller_start=PASS' \
    'ACCESS_DIAGNOSTIC access_api=FAIL' \
    'ACCESS_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'ACCESS_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$output" != *fixture-provider-error* ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
assert_no_transient

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
if output="$(FIXTURE_ACCESS_JSON='{"accessDetails":{}}' run_diagnostic 2>&1)"; then
  echo invalid_access_response_was_accepted >&2
  exit 1
fi
expected="$(
  printf '%s\n' \
    'ACCESS_DIAGNOSTIC controller_start=PASS' \
    'ACCESS_DIAGNOSTIC access_api=PASS' \
    'ACCESS_DIAGNOSTIC access_response=FAIL' \
    'ACCESS_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'ACCESS_DIAGNOSTIC result=FAIL'
)"
[[ "$output" == "$expected" ]]
[[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
assert_no_transient

echo lightsail_access_response_diagnostic_fixture_passed
