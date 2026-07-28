#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-bounded-ssh-test.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/bounded-lightsail-ssh.sh
source "$SCRIPT_DIR/lib/bounded-lightsail-ssh.sh"

mkdir -p "$ROOT/bin" "$ROOT/material"
touch "$ROOT/material/identity" "$ROOT/material/certificate" \
  "$ROOT/material/known-hosts"
chmod 600 "$ROOT/material/"*

FAKE_SSH_LOG="$ROOT/ssh.log"
FAKE_CONTROL_SOCKET="$ROOT/control.sock"
export FAKE_SSH_LOG FAKE_CONTROL_SOCKET

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'for argument in "$@"; do printf "%s\\0" "$argument" >>"$FAKE_SSH_LOG"; done' \
  'printf "\\n" >>"$FAKE_SSH_LOG"' \
  'if [[ "${FAKE_SSH_EXIT_AFTER_REMOVE_FAIL:-0}" -eq 1 && "$*" == *"-O exit"* ]]; then' \
  '  rm -f -- "$FAKE_CONTROL_SOCKET"' \
  '  exit 1' \
  'fi' \
  'if [[ "${FAKE_SSH_STALE_SOCKET:-0}" -eq 1 && "$*" == *"-O exit"* ]]; then exit 1; fi' \
  'if [[ "${FAKE_SSH_STALE_SOCKET:-0}" -eq 1 && "$*" == *"-O check"* ]]; then exit 1; fi' \
  'if [[ "$*" == *"/usr/bin/printf WAW_REMOTE_CHANNEL_READY"* ]]; then' \
  '  printf "WAW_REMOTE_CHANNEL_READY\\n"' \
  'fi' \
  'exit 0' >"$ROOT/bin/ssh"
chmod 755 "$ROOT/bin/ssh"

printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'while [[ "${1:-}" == --* ]]; do shift; done' \
  'shift' \
  'exec "$@"' >"$ROOT/bin/timeout"
chmod 755 "$ROOT/bin/timeout"

destination='fixture-user@192.0.2.10'
output="$(
  waw_start_bounded_lightsail_ssh_master \
    "$ROOT/bin/timeout" \
    "$ROOT/bin/ssh" \
    "$ROOT/material/identity" \
    "$ROOT/material/certificate" \
    "$ROOT/material/known-hosts" \
    "$ROOT/control.sock" \
    fixture-user \
    192.0.2.10 \
    "$destination"
)"
[[ -z "$output" ]]

python3 - "$FAKE_SSH_LOG" "$ROOT" "$destination" <<'PY'
import pathlib
import sys

log_path, root, destination = sys.argv[1:]
calls = [
    line.split(b"\0")[:-1]
    for line in pathlib.Path(log_path).read_bytes().splitlines()
]
assert len(calls) == 2, calls
start = [value.decode() for value in calls[0]]
check = [value.decode() for value in calls[1]]
expected = [
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "IdentityAgent=none",
    "-o", f"IdentityFile={root}/material/identity",
    "-o", f"CertificateFile={root}/material/certificate",
    "-o", f"UserKnownHostsFile={root}/material/known-hosts",
    "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "CheckHostIP=no",
    "-o", "PasswordAuthentication=no",
    "-o", "KbdInteractiveAuthentication=no",
    "-o", "PreferredAuthentications=publickey",
    "-o", "ConnectTimeout=10",
    "-o", "ConnectionAttempts=1",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=1",
    "-o", "ControlMaster=yes",
    "-o", "ControlPersist=no",
    "-o", "LogLevel=QUIET",
    "-M", "-S", f"{root}/control.sock", "-fN", destination,
]
assert start == expected, start
assert check == [
    "-S", f"{root}/control.sock", "-O", "check", destination
], check
PY

if waw_start_bounded_lightsail_ssh_master \
  "$ROOT/bin/timeout" \
  "$ROOT/bin/ssh" \
  "$ROOT/material/identity" \
  "$ROOT/material/certificate" \
  "$ROOT/material/known-hosts" \
  "$ROOT/control.sock" \
  fixture-user \
  192.0.2.10 \
  'different-user@192.0.2.10' >/dev/null 2>&1; then
  echo mismatched_destination_was_accepted >&2
  exit 1
fi

ln -s "$ROOT/material/identity" "$ROOT/material/identity-link"
if waw_start_bounded_lightsail_ssh_master \
  "$ROOT/bin/timeout" \
  "$ROOT/bin/ssh" \
  "$ROOT/material/identity-link" \
  "$ROOT/material/certificate" \
  "$ROOT/material/known-hosts" \
  "$ROOT/control.sock" \
  fixture-user \
  192.0.2.10 \
  "$destination" >/dev/null 2>&1; then
  echo symlink_identity_was_accepted >&2
  exit 1
fi

: >"$FAKE_SSH_LOG"
output="$(
  waw_probe_bounded_lightsail_ssh_master \
    "$ROOT/bin/timeout" "$ROOT/bin/ssh" "$ROOT/control.sock" "$destination"
)"
[[ "$output" == WAW_REMOTE_CHANNEL_READY ]]
python3 - "$FAKE_SSH_LOG" "$ROOT" "$destination" <<'PY'
import pathlib
import sys

log_path, root, destination = sys.argv[1:]
call = pathlib.Path(log_path).read_bytes().splitlines()[0].split(b"\0")[:-1]
assert [value.decode() for value in call] == [
    "-S", f"{root}/control.sock",
    "-o", "ControlMaster=no",
    "-o", f"ControlPath={root}/control.sock",
    "-o", "ProxyCommand=false",
    "-o", "ConnectionAttempts=1",
    "-o", "ConnectTimeout=1",
    destination,
    "/usr/bin/printf", "WAW_REMOTE_CHANNEL_READY\\n",
]
PY

: >"$FAKE_SSH_LOG"
output="$(
  printf 'fixture remote input\n' |
    waw_run_over_bounded_lightsail_ssh_master \
      "$ROOT/bin/timeout" "$ROOT/bin/ssh" "$ROOT/control.sock" "$destination"
)"
[[ -z "$output" ]]
python3 - "$FAKE_SSH_LOG" "$ROOT" "$destination" <<'PY'
import pathlib
import sys

log_path, root, destination = sys.argv[1:]
call = pathlib.Path(log_path).read_bytes().splitlines()[0].split(b"\0")[:-1]
assert [value.decode() for value in call] == [
    "-S", f"{root}/control.sock",
    "-o", "ControlMaster=no",
    "-o", f"ControlPath={root}/control.sock",
    "-o", "ProxyCommand=false",
    "-o", "ConnectionAttempts=1",
    "-o", "ConnectTimeout=1",
    destination,
    "/usr/bin/sudo", "-n", "/bin/bash", "-s",
]
PY

: >"$FAKE_SSH_LOG"
output="$(
  printf 'fixture direct remote input\n' |
    waw_run_over_bounded_lightsail_ssh_direct \
      "$ROOT/bin/timeout" \
      "$ROOT/bin/ssh" \
      "$ROOT/material/identity" \
      "$ROOT/material/certificate" \
      "$ROOT/material/known-hosts" \
      fixture-user \
      192.0.2.10 \
      "$destination" \
      "$ROOT/direct-error.log" \
      /bin/bash
)"
[[ -z "$output" ]]
python3 - "$FAKE_SSH_LOG" "$ROOT" "$destination" <<'PY'
import pathlib
import sys

log_path, root, destination = sys.argv[1:]
call = pathlib.Path(log_path).read_bytes().splitlines()[0].split(b"\0")[:-1]
assert [value.decode() for value in call] == [
    "-T",
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "IdentityAgent=none",
    "-o", f"IdentityFile={root}/material/identity",
    "-o", f"CertificateFile={root}/material/certificate",
    "-o", f"UserKnownHostsFile={root}/material/known-hosts",
    "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "CheckHostIP=no",
    "-o", "PasswordAuthentication=no",
    "-o", "KbdInteractiveAuthentication=no",
    "-o", "PreferredAuthentications=publickey",
    "-o", "ConnectTimeout=10",
    "-o", "ConnectionAttempts=1",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=1",
    "-o", "ControlMaster=no",
    "-o", "ControlPath=none",
    "-o", "ProxyCommand=none",
    "-o", "LogLevel=ERROR",
    destination,
    "/usr/bin/sudo", "-n", "/bin/bash", "-s",
]
PY

: >"$FAKE_SSH_LOG"
output="$(
  waw_stop_bounded_lightsail_ssh_master \
    "$ROOT/bin/timeout" "$ROOT/bin/ssh" "$ROOT/control.sock" "$destination"
)"
[[ -z "$output" ]]
python3 - "$FAKE_SSH_LOG" "$ROOT" "$destination" <<'PY'
import pathlib
import sys

log_path, root, destination = sys.argv[1:]
call = pathlib.Path(log_path).read_bytes().splitlines()[0].split(b"\0")[:-1]
assert [value.decode() for value in call] == [
    "-S", f"{root}/control.sock", "-O", "exit", destination
]
PY

: >"$ROOT/control.sock"
output="$(
  FAKE_SSH_EXIT_AFTER_REMOVE_FAIL=1 \
    waw_stop_bounded_lightsail_ssh_master \
      "$ROOT/bin/timeout" "$ROOT/bin/ssh" "$ROOT/control.sock" "$destination"
)"
[[ -z "$output" ]]
[[ ! -e "$ROOT/control.sock" ]]

: >"$ROOT/control.sock"
output="$(
  FAKE_SSH_STALE_SOCKET=1 \
    waw_stop_bounded_lightsail_ssh_master \
      "$ROOT/bin/timeout" "$ROOT/bin/ssh" "$ROOT/control.sock" "$destination"
)"
[[ -z "$output" ]]
[[ ! -e "$ROOT/control.sock" ]]

echo bounded_lightsail_ssh_fixture_passed
