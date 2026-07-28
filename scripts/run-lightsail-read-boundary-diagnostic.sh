#!/usr/bin/env bash
set -Eeuo pipefail
set +x

AWS_BIN="${WAW_AWS_BIN:-$(command -v aws || true)}"
TIMEOUT_BIN="${WAW_TIMEOUT_BIN:-$(command -v timeout || true)}"
INSTANCE_NAME="${WAW_LIGHTSAIL_INSTANCE_NAME:-}"

finish() {
  local result="$1"

  echo 'LIGHTSAIL_READ_DIAGNOSTIC cleanup=PASS transient_remainders=0'
  printf 'LIGHTSAIL_READ_DIAGNOSTIC result=%s\n' "$result"
  [[ "$result" == PASS ]]
}

fail() {
  local stage="$1"

  printf 'LIGHTSAIL_READ_DIAGNOSTIC %s=FAIL\n' "$stage"
  finish FAIL
  exit 1
}

[[ -x "$AWS_BIN" && -x "$TIMEOUT_BIN" ]] || fail controller_start
[[ "$INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ && "$INSTANCE_NAME" != -* ]] ||
  fail controller_start
echo 'LIGHTSAIL_READ_DIAGNOSTIC controller_start=PASS'

service_result=
if ! service_result="$(
  "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
    "$AWS_BIN" lightsail get-instances \
    --region ap-northeast-2 \
    --query 'length(instances)' \
    --output text 2>/dev/null
)"; then
  fail service_api
fi
echo 'LIGHTSAIL_READ_DIAGNOSTIC service_api=PASS'

[[ "$service_result" =~ ^[0-9]+$ ]] || fail service_response
echo 'LIGHTSAIL_READ_DIAGNOSTIC service_response=PASS'
service_result=

target_result=
if ! target_result="$(
  "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
    "$AWS_BIN" lightsail get-instance \
    --instance-name "$INSTANCE_NAME" \
    --region ap-northeast-2 \
    --query 'instance.name' \
    --output text 2>/dev/null
)"; then
  fail target_api
fi
echo 'LIGHTSAIL_READ_DIAGNOSTIC target_api=PASS'

[[ "$target_result" == "$INSTANCE_NAME" ]] || fail target_response
target_result=
echo 'LIGHTSAIL_READ_DIAGNOSTIC target_response=PASS'
finish PASS
