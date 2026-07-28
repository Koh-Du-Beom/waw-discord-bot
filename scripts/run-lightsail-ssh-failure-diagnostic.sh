#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

AWS_BIN="${WAW_AWS_BIN:-$(command -v aws || true)}"
SSH_BIN="${WAW_SSH_BIN:-$(command -v ssh || true)}"
SSH_KEYGEN_BIN="${WAW_SSH_KEYGEN_BIN:-$(command -v ssh-keygen || true)}"
TIMEOUT_BIN="${WAW_TIMEOUT_BIN:-$(command -v timeout || true)}"
PYTHON_BIN="${WAW_PYTHON_BIN:-/usr/bin/python3}"
INSTANCE_NAME="${WAW_LIGHTSAIL_INSTANCE_NAME:-}"
RUN_DIR=
MASTER_STARTED=0
DESTINATION=

cleanup() {
  local clean=1

  if [[ "$MASTER_STARTED" -eq 1 && -n "$RUN_DIR" &&
    -n "$DESTINATION" ]]; then
    if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=1s 5s \
      "$SSH_BIN" -S "$RUN_DIR/control.sock" -O exit "$DESTINATION" \
      </dev/null >/dev/null 2>&1 &&
      [[ -e "$RUN_DIR/control.sock" ]]; then
      clean=0
    fi
    MASTER_STARTED=0
  fi
  if [[ -n "$RUN_DIR" ]]; then
    case "$RUN_DIR" in
      /tmp/waw-ssh-failure.*)
        rm -rf -- "$RUN_DIR" || clean=0
        ;;
      *)
        clean=0
        ;;
    esac
  fi
  if [[ "$clean" -eq 1 && -n "$RUN_DIR" && -e "$RUN_DIR" ]]; then
    clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

finish() {
  local result="$1"

  if cleanup; then
    echo 'SSH_DIAGNOSTIC cleanup=PASS transient_remainders=0'
  else
    echo 'SSH_DIAGNOSTIC cleanup=FAIL transient_remainders=1'
    result=FAIL
  fi
  printf 'SSH_DIAGNOSTIC result=%s\n' "$result"
  [[ "$result" == PASS ]]
}

fail() {
  local stage="$1"

  printf 'SSH_DIAGNOSTIC %s=FAIL\n' "$stage"
  finish FAIL
  exit 1
}

classify_ssh_failure() {
  local log="$1"

  if grep -Eiq \
    'permission denied[[:space:]]*\\(publickey\\)|no supported authentication methods' \
    "$log"; then
    printf 'AUTHENTICATION'
  elif grep -Eiq \
    'host key verification failed|remote host identification has changed' \
    "$log"; then
    printf 'HOST_KEY'
  elif grep -Eiq \
    'certificate.*(expired|not yet valid)|certificate invalid' "$log"; then
    printf 'CERTIFICATE'
  elif grep -Eiq \
    'load key|invalid format|error in libcrypto' "$log"; then
    printf 'MATERIAL'
  elif grep -Eiq \
    'connection timed out|no route to host|connection refused|network is unreachable|could not resolve hostname' \
    "$log"; then
    printf 'TRANSPORT'
  else
    printf 'UNKNOWN'
  fi
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -x "$AWS_BIN" && -x "$SSH_BIN" && -x "$SSH_KEYGEN_BIN" &&
  -x "$TIMEOUT_BIN" && -x "$PYTHON_BIN" ]] || fail controller_start
[[ "$INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ && "$INSTANCE_NAME" != -* ]] ||
  fail controller_start
RUN_DIR="$(mktemp -d /tmp/waw-ssh-failure.XXXXXX)" ||
  fail controller_start
chmod 700 "$RUN_DIR" || fail controller_start
echo 'SSH_DIAGNOSTIC controller_start=PASS'

if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
  "$AWS_BIN" lightsail get-instance-access-details \
  --instance-name "$INSTANCE_NAME" \
  --protocol ssh \
  --region ap-northeast-2 \
  --output json >"$RUN_DIR/access.json" 2>/dev/null; then
  fail access_acquisition
fi
chmod 600 "$RUN_DIR/access.json" || fail access_acquisition

if ! "$PYTHON_BIN" - "$RUN_DIR/access.json" "$RUN_DIR" \
  >/dev/null 2>/dev/null <<'PY'
import ipaddress
import json
import os
import pathlib
import re
import sys

access_path, output_path = map(pathlib.Path, sys.argv[1:])
payload = json.loads(access_path.read_text(encoding="utf-8"))
details = payload.get("accessDetails")
if not isinstance(details, dict):
    raise SystemExit(20)
private_key = details.get("privateKey")
certificate = details.get("certKey")
remote_user = details.get("username")
remote_host = details.get("ipAddress")
host_keys = details.get("hostKeys")
if not all(isinstance(value, str) and value for value in (
    private_key,
    certificate,
    remote_user,
    remote_host,
)):
    raise SystemExit(21)
if not re.fullmatch(r"[a-z_][a-z0-9_-]*", remote_user):
    raise SystemExit(22)
ipaddress.IPv4Address(remote_host)
if not isinstance(host_keys, list) or not host_keys:
    raise SystemExit(23)
known_hosts = []
for host_key in host_keys:
    if not isinstance(host_key, dict):
        raise SystemExit(24)
    algorithm = host_key.get("algorithm")
    public_key = host_key.get("publicKey")
    if not isinstance(algorithm, str) or not re.fullmatch(
        r"[A-Za-z0-9@._+-]+",
        algorithm,
    ):
        raise SystemExit(25)
    if not isinstance(public_key, str) or not re.fullmatch(
        r"[A-Za-z0-9+/=]+",
        public_key,
    ):
        raise SystemExit(26)
    known_hosts.append(f"{remote_host} {algorithm} {public_key}\n")
files = {
    "identity": private_key.rstrip("\n") + "\n",
    "certificate": certificate.rstrip("\n") + "\n",
    "known-hosts": "".join(known_hosts),
    "remote-user": remote_user + "\n",
    "remote-host": remote_host + "\n",
    "destination": f"{remote_user}@{remote_host}\n",
}
for name, value in files.items():
    target = output_path / name
    target.write_text(value, encoding="utf-8")
    os.chmod(target, 0o600)
PY
then
  fail access_response
fi
echo 'SSH_DIAGNOSTIC access=PASS'

if ! "$SSH_KEYGEN_BIN" -y -f "$RUN_DIR/identity" \
  >"$RUN_DIR/identity.pub" 2>/dev/null ||
  ! "$SSH_KEYGEN_BIN" -Lf "$RUN_DIR/certificate" \
    >"$RUN_DIR/certificate.info" 2>/dev/null; then
  fail material_parse
fi
chmod 600 "$RUN_DIR/identity.pub" "$RUN_DIR/certificate.info" ||
  fail material_parse
private_fingerprint="$(
  "$SSH_KEYGEN_BIN" -lf "$RUN_DIR/identity.pub" -E sha256 2>/dev/null |
    awk 'NR == 1 {print $2}'
)"
certificate_fingerprint="$(
  awk '$1 == "Public" && $2 == "key:" {print $4; exit}' \
    "$RUN_DIR/certificate.info"
)"
[[ "$private_fingerprint" =~ ^SHA256:[A-Za-z0-9+/]+$ &&
  "$private_fingerprint" == "$certificate_fingerprint" ]] ||
  fail key_certificate_match
private_fingerprint=
certificate_fingerprint=
echo 'SSH_DIAGNOSTIC material=PASS'
echo 'SSH_DIAGNOSTIC key_certificate_match=PASS'

if ! "$SSH_KEYGEN_BIN" -lf "$RUN_DIR/known-hosts" -E sha256 \
  >/dev/null 2>/dev/null; then
  fail host_keys
fi
echo 'SSH_DIAGNOSTIC host_keys=PASS'

remote_user="$(<"$RUN_DIR/remote-user")"
remote_host="$(<"$RUN_DIR/remote-host")"
DESTINATION="$(<"$RUN_DIR/destination")"
ssh_options=(
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o "IdentityFile=$RUN_DIR/identity"
  -o "CertificateFile=$RUN_DIR/certificate"
  -o "UserKnownHostsFile=$RUN_DIR/known-hosts"
  -o GlobalKnownHostsFile=/dev/null
  -o StrictHostKeyChecking=yes
  -o CheckHostIP=no
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
  -o PreferredAuthentications=publickey
  -o ConnectTimeout=10
  -o ConnectionAttempts=1
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=1
  -o ControlMaster=yes
  -o ControlPersist=no
)

if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
  "$SSH_BIN" -vv "${ssh_options[@]}" \
  -M -S "$RUN_DIR/control.sock" -fN "$DESTINATION" \
  </dev/null >/dev/null 2>"$RUN_DIR/ssh.log"; then
  failure_class="$(classify_ssh_failure "$RUN_DIR/ssh.log")"
  printf 'SSH_DIAGNOSTIC connection=FAIL class=%s\n' "$failure_class"
  finish FAIL
  exit 1
fi
MASTER_STARTED=1
echo 'SSH_DIAGNOSTIC connection=PASS'

if ! "$SSH_BIN" -S "$RUN_DIR/control.sock" -O check "$DESTINATION" \
  </dev/null >/dev/null 2>"$RUN_DIR/ssh.log"; then
  echo 'SSH_DIAGNOSTIC master_check=FAIL'
  finish FAIL
  exit 1
fi
echo 'SSH_DIAGNOSTIC master_check=PASS'
finish PASS
