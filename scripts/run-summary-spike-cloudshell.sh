#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

BUNDLE="$HOME/waw-summary-controller-fixed-20260728.tar.gz"
KEY_INPUT="$HOME/key-input"
TARGET_INPUT="$HOME/.waw-summary-target"
RUN_DIR=/tmp/waw-summary-controller-final
EXPECTED_BUNDLE_SHA256=2849d038b84983d9a143fc664518ffe99050f5e5c5250da6806bfdfdbcb905e0

cleanup() {
  local clean=1
  if [[ -d "$RUN_DIR" ]]; then
    find "$RUN_DIR" -depth -delete 2>/dev/null || clean=0
  fi
  find "$BUNDLE" "$KEY_INPUT" "$TARGET_INPUT" -maxdepth 0 -type f -delete \
    2>/dev/null || clean=0
  [[ "$clean" -eq 1 && ! -e "$RUN_DIR" && ! -e "$BUNDLE" &&
    ! -e "$KEY_INPUT" && ! -e "$TARGET_INPUT" ]]
}

fail() {
  printf 'SUMMARY_CLOUDSHELL stage=%s result=FAIL\n' "$1"
  if cleanup; then
    echo 'SUMMARY_CLOUDSHELL cleanup=PASS key=0 bundle=0'
  else
    echo 'SUMMARY_CLOUDSHELL cleanup=FAIL key=UNKNOWN bundle=UNKNOWN'
  fi
  exit 1
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -f "$TARGET_INPUT" && ! -L "$TARGET_INPUT" &&
  "$(stat -c '%a' "$TARGET_INPUT" 2>/dev/null || true)" == 600 &&
  -f "$BUNDLE" && ! -L "$BUNDLE" &&
  -f "$KEY_INPUT" && ! -L "$KEY_INPUT" ]] ||
  fail PRECONDITION
WAW_LIGHTSAIL_INSTANCE_NAME="$(<"$TARGET_INPUT")"
[[ "$WAW_LIGHTSAIL_INSTANCE_NAME" =~ ^[A-Za-z0-9._-]+$ ]] ||
  fail TARGET
export WAW_LIGHTSAIL_INSTANCE_NAME
[[ "$(sha256sum "$BUNDLE" | awk '{print $1}')" == "$EXPECTED_BUNDLE_SHA256" ]] ||
  fail BUNDLE
[[ "$(stat -c '%a' "$KEY_INPUT" 2>/dev/null || true)" == 600 ]] ||
  fail KEY_METADATA
python3 - "$KEY_INPUT" >/dev/null 2>/dev/null <<'PY' ||
import pathlib
import sys

value = pathlib.Path(sys.argv[1]).read_bytes()
if not 20 <= len(value) <= 512:
    raise SystemExit(1)
if any(marker in value for marker in (b"\r", b"\n", b"\0")):
    raise SystemExit(1)
PY
  fail KEY_SHAPE

mkdir -m 700 "$RUN_DIR" || fail MATERIAL
tar -xzf "$BUNDLE" -C "$RUN_DIR" 2>/dev/null || fail MATERIAL
chmod 700 "$RUN_DIR/scripts/run-production-schema-failure-stage-diagnostic.sh" ||
  fail MATERIAL
echo 'SUMMARY_CLOUDSHELL material=PASS'

(
  cd "$RUN_DIR"
  WAW_SCHEMA_EXECUTION_MODE=SUMMARY_TRANSIENT_DIAGNOSTIC \
    ./scripts/run-production-schema-failure-stage-diagnostic.sh
) || fail TRANSIENT_DIAGNOSTIC
echo 'SUMMARY_CLOUDSHELL transient_diagnostic=PASS'

(
  cd "$RUN_DIR"
  {
    cat "$KEY_INPUT"
    printf '\n'
  } |
    WAW_SCHEMA_EXECUTION_MODE=SUMMARY_MARKER_SPIKE \
      ./scripts/run-production-schema-failure-stage-diagnostic.sh
) || fail MARKER_SPIKE

cleanup || fail CLEANUP
trap - EXIT
echo 'SUMMARY_CLOUDSHELL cleanup=PASS key=0 bundle=0'
echo 'SUMMARY_CLOUDSHELL result=PASS'
