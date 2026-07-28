#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

AWS_BIN="${WAW_AWS_BIN:-$(command -v aws || true)}"
TIMEOUT_BIN="${WAW_TIMEOUT_BIN:-$(command -v timeout || true)}"
PYTHON_BIN="${WAW_PYTHON_BIN:-/usr/bin/python3}"
INSTANCE_NAME="${WAW_LIGHTSAIL_INSTANCE_NAME:-}"
RUN_DIR=

cleanup() {
  local clean=1

  if [[ -n "$RUN_DIR" ]]; then
    case "$RUN_DIR" in
      /tmp/waw-access-response.*)
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
    echo 'ACCESS_DIAGNOSTIC cleanup=PASS transient_remainders=0'
  else
    echo 'ACCESS_DIAGNOSTIC cleanup=FAIL transient_remainders=1'
    result=FAIL
  fi
  printf 'ACCESS_DIAGNOSTIC result=%s\n' "$result"
  [[ "$result" == PASS ]]
}

fail() {
  local stage="$1"

  printf 'ACCESS_DIAGNOSTIC %s=FAIL\n' "$stage"
  finish FAIL
  exit 1
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -x "$AWS_BIN" && -x "$TIMEOUT_BIN" && -x "$PYTHON_BIN" ]] ||
  fail controller_start
[[ "$INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ && "$INSTANCE_NAME" != -* ]] ||
  fail controller_start

RUN_DIR="$(mktemp -d /tmp/waw-access-response.XXXXXX)" ||
  fail controller_start
chmod 700 "$RUN_DIR" || fail controller_start
echo 'ACCESS_DIAGNOSTIC controller_start=PASS'

if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
  "$AWS_BIN" lightsail get-instance-access-details \
  --instance-name "$INSTANCE_NAME" \
  --protocol ssh \
  --region ap-northeast-2 \
  --output json >"$RUN_DIR/access.json" 2>/dev/null; then
  fail access_api
fi
chmod 600 "$RUN_DIR/access.json" || fail access_api
echo 'ACCESS_DIAGNOSTIC access_api=PASS'

if ! "$PYTHON_BIN" - "$RUN_DIR/access.json" >/dev/null 2>/dev/null <<'PY'
import ipaddress
import json
import pathlib
import re
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
details = payload.get("accessDetails")
if not isinstance(details, dict):
    raise SystemExit(20)

required_strings = (
    details.get("privateKey"),
    details.get("certKey"),
    details.get("username"),
    details.get("ipAddress"),
)
if not all(isinstance(value, str) and value for value in required_strings):
    raise SystemExit(21)

if not re.fullmatch(r"[a-z_][a-z0-9_-]*", details["username"]):
    raise SystemExit(22)
ipaddress.IPv4Address(details["ipAddress"])

host_keys = details.get("hostKeys")
if not isinstance(host_keys, list) or not host_keys:
    raise SystemExit(23)
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
PY
then
  fail access_response
fi

echo 'ACCESS_DIAGNOSTIC access_response=PASS'
finish PASS
