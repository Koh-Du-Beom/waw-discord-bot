#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-ssh-failure-test.XXXXXX)"
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
  'printf "%s\\n" "$FIXTURE_ACCESS_JSON"' >"$ROOT/bin/aws"
chmod 755 "$ROOT/bin/aws"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'case "$*" in' \
  '  "-y -f "*) echo "ssh-ed25519 QUJDRA== fixture" ;;' \
  '  "-Lf "*)' \
  '    printf "%s\\n" "Type: ssh-ed25519-cert-v01@openssh.com user certificate" "        Public key: ED25519-CERT SHA256:fixturematch"' \
  '    ;;' \
  '  "-lf "*"-E sha256") echo "256 SHA256:fixturematch fixture (ED25519)" ;;' \
  '  *) exit 1 ;;' \
  'esac' >"$ROOT/bin/ssh-keygen"
chmod 755 "$ROOT/bin/ssh-keygen"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "call\\n" >>"$FIXTURE_SSH_CALLS"' \
  'socket=' \
  'operation=' \
  'master=0' \
  'for ((index=1; index <= $#; index++)); do' \
  '  argument="${!index}"' \
  '  [[ "$argument" != -S ]] || { next=$((index + 1)); socket="${!next}"; }' \
  '  [[ "$argument" != -O ]] || { next=$((index + 1)); operation="${!next}"; }' \
  '  [[ "$argument" != -M ]] || master=1' \
  'done' \
  'case "$operation" in' \
  '  check) [[ -e "$socket" ]]; exit ;;' \
  '  exit) rm -f -- "$socket"; exit ;;' \
  'esac' \
  'if [[ "$master" -eq 1 ]]; then' \
  '  case "${FIXTURE_SSH_FAILURE:-}" in' \
  '    auth) echo "Permission denied (publickey)." >&2; exit 255 ;;' \
  '    transport) echo "Connection timed out" >&2; exit 255 ;;' \
  '  esac' \
  '  : >"$socket"' \
  '  exit 0' \
  'fi' \
  'exit 1' >"$ROOT/bin/ssh"
chmod 755 "$ROOT/bin/ssh"

export FIXTURE_AWS_CALLS="$ROOT/aws.calls"
export FIXTURE_AWS_ARGS="$ROOT/aws.args"
export FIXTURE_SSH_CALLS="$ROOT/ssh.calls"
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
  WAW_SSH_BIN="$ROOT/bin/ssh" \
  WAW_SSH_KEYGEN_BIN="$ROOT/bin/ssh-keygen" \
  WAW_TIMEOUT_BIN="$ROOT/bin/timeout" \
  WAW_LIGHTSAIL_INSTANCE_NAME=fixture-instance \
  "$SCRIPT_DIR/run-lightsail-ssh-failure-diagnostic.sh"
}

assert_common() {
  local output="$1"

  [[ "$output" != *fixture-private-key* ]]
  [[ "$output" != *192.0.2.10* ]]
  [[ "$output" != *fixture-user* ]]
  [[ "$(wc -l <"$FIXTURE_AWS_CALLS" | tr -d ' ')" -eq 1 ]]
  [[ "$(<"$FIXTURE_AWS_ARGS")" == \
    'lightsail get-instance-access-details --instance-name fixture-instance --protocol ssh --region ap-northeast-2 --output json' ]]
  [[ -z "$(find /tmp -maxdepth 1 -name 'waw-ssh-failure.*' -print -quit)" ]]
}

output="$(run_diagnostic)"
expected="$(
  printf '%s\n' \
    'SSH_DIAGNOSTIC controller_start=PASS' \
    'SSH_DIAGNOSTIC access=PASS' \
    'SSH_DIAGNOSTIC material=PASS' \
    'SSH_DIAGNOSTIC key_certificate_match=PASS' \
    'SSH_DIAGNOSTIC host_keys=PASS' \
    'SSH_DIAGNOSTIC connection=PASS' \
    'SSH_DIAGNOSTIC master_check=PASS' \
    'SSH_DIAGNOSTIC cleanup=PASS transient_remainders=0' \
    'SSH_DIAGNOSTIC result=PASS'
)"
[[ "$output" == "$expected" ]]
assert_common "$output"

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
: >"$FIXTURE_SSH_CALLS"
if output="$(FIXTURE_SSH_FAILURE=auth run_diagnostic 2>&1)"; then
  echo failed_authentication_was_accepted >&2
  exit 1
fi
[[ "$output" == *'SSH_DIAGNOSTIC connection=FAIL class=AUTHENTICATION'* ]]
[[ "$output" != *'Permission denied'* ]]
[[ "$output" == *'SSH_DIAGNOSTIC cleanup=PASS transient_remainders=0'* ]]
[[ "$output" == *'SSH_DIAGNOSTIC result=FAIL'* ]]
assert_common "$output"

: >"$FIXTURE_AWS_CALLS"
: >"$FIXTURE_AWS_ARGS"
: >"$FIXTURE_SSH_CALLS"
if output="$(FIXTURE_SSH_FAILURE=transport run_diagnostic 2>&1)"; then
  echo failed_transport_was_accepted >&2
  exit 1
fi
[[ "$output" == *'SSH_DIAGNOSTIC connection=FAIL class=TRANSPORT'* ]]
[[ "$output" != *'Connection timed out'* ]]
assert_common "$output"

echo lightsail_ssh_failure_diagnostic_fixture_passed
