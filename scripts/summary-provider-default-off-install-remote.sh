#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

MANAGER_B64=__WAW_MANAGER_B64__
SOURCE_B64=__WAW_SOURCE_B64__
EXPECTED_MANAGER_SHA256=6e9783a73c9c48210ce42a164cc0f5d6748dc3a2c0e6c47a0bc320747af81ad7
EXPECTED_SOURCE_SHA256=b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a
ROOT="${WAW_INSTALL_ROOT:-/}"
RUN_DIR=
INSTALLED=0
BEFORE_IDENTITY=

if [[ "$ROOT" == / ]]; then
  TARGET=/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf
  SYSTEMCTL=/usr/bin/systemctl
  CURL=/usr/bin/curl
  PYTHON=/usr/bin/python3
  EXPECTED_OWNER=root
  EXPECTED_GROUP=root
else
  TARGET="${ROOT%/}/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf"
  SYSTEMCTL="${WAW_SYSTEMCTL_BIN:?fixture_systemctl_required}"
  CURL="${WAW_CURL_BIN:?fixture_curl_required}"
  PYTHON="${WAW_PYTHON_BIN:-/usr/bin/python3}"
  EXPECTED_OWNER="$(id -un)"
  EXPECTED_GROUP="$(id -gn)"
fi

file_metadata() {
  stat -c '%U:%G:%a' "$1" 2>/dev/null ||
    stat -f '%Su:%Sg:%Lp' "$1" 2>/dev/null
}

bot_identity() {
  local state pid started
  state="$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)"
  pid="$("$SYSTEMCTL" show -p MainPID --value waw-bot.service 2>/dev/null || true)"
  started="$("$SYSTEMCTL" show -p ExecMainStartTimestampMonotonic --value \
    waw-bot.service 2>/dev/null || true)"
  [[ "$state" == active && "$pid" =~ ^[1-9][0-9]*$ &&
    "$started" =~ ^[1-9][0-9]*$ ]] || return 1
  printf '%s:%s' "$pid" "$started"
}

cleanup() {
  local clean=1
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" || clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

fail() {
  local stage="$1"
  local rollback=NOT_REQUIRED
  if [[ "$INSTALLED" -eq 1 ]]; then
    rollback=CONFLICT
    if [[ -f "$TARGET" && ! -L "$TARGET" &&
      "$(sha256sum "$TARGET" 2>/dev/null | awk '{print $1}')" == "$EXPECTED_SOURCE_SHA256" &&
      "$(file_metadata "$TARGET" || true)" == "$EXPECTED_OWNER:$EXPECTED_GROUP:644" ]]; then
      if "$RUN_DIR/manage-summary-provider-default-off.sh" rollback \
        >/dev/null 2>&1; then
        rollback=PASS
        INSTALLED=0
      else
        rollback=FAIL
      fi
    fi
  fi
  if cleanup; then
    printf 'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0\n'
  else
    printf 'PROVIDER_DEFAULT_OFF cleanup=FAIL transient_remainders=1\n'
  fi
  printf 'PROVIDER_DEFAULT_OFF rollback=%s\n' "$rollback"
  printf 'PROVIDER_DEFAULT_OFF result=FAIL stage=%s\n' "$stage"
  exit 1
}

[[ "$ROOT" == /* && -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" ]] ||
  fail PRECONDITION
[[ ! -e "$TARGET" ]] || fail PRECONDITION
BEFORE_IDENTITY="$(bot_identity || true)"
[[ -n "$BEFORE_IDENTITY" ]] || fail PRECONDITION
echo 'PROVIDER_DEFAULT_OFF precondition=PASS'

RUN_DIR="$(mktemp -d /tmp/waw-provider-default-off-install.XXXXXX)" ||
  fail MATERIAL
chmod 700 "$RUN_DIR" || fail MATERIAL
mkdir -m 700 "$RUN_DIR/systemd" || fail MATERIAL
printf '%s' "$MANAGER_B64" | base64 -d \
  >"$RUN_DIR/manage-summary-provider-default-off.sh" 2>/dev/null ||
  fail MATERIAL
printf '%s' "$SOURCE_B64" | base64 -d \
  >"$RUN_DIR/systemd/waw-summary-provider-default-off.conf" 2>/dev/null ||
  fail MATERIAL
chmod 700 "$RUN_DIR/manage-summary-provider-default-off.sh" ||
  fail MATERIAL
chmod 600 "$RUN_DIR/systemd/waw-summary-provider-default-off.conf" ||
  fail MATERIAL
[[ "$(sha256sum "$RUN_DIR/manage-summary-provider-default-off.sh" |
  awk '{print $1}')" == "$EXPECTED_MANAGER_SHA256" ]] || fail MATERIAL
[[ "$(sha256sum "$RUN_DIR/systemd/waw-summary-provider-default-off.conf" |
  awk '{print $1}')" == "$EXPECTED_SOURCE_SHA256" ]] || fail MATERIAL
echo 'PROVIDER_DEFAULT_OFF material=PASS'

WAW_INSTALL_ROOT="$ROOT" \
WAW_SYSTEMCTL_BIN="$SYSTEMCTL" \
  "$RUN_DIR/manage-summary-provider-default-off.sh" install \
  >/dev/null 2>&1 || fail INSTALL
INSTALLED=1
echo 'PROVIDER_DEFAULT_OFF install=PASS daemon_reload=1 service_restart=0'

[[ -f "$TARGET" && ! -L "$TARGET" &&
  "$(sha256sum "$TARGET" | awk '{print $1}')" == "$EXPECTED_SOURCE_SHA256" &&
  "$(file_metadata "$TARGET")" == "$EXPECTED_OWNER:$EXPECTED_GROUP:644" ]] ||
  fail METADATA
echo 'PROVIDER_DEFAULT_OFF metadata=PASS'

"$SYSTEMCTL" cat waw-bot.service >"$RUN_DIR/unit" 2>/dev/null ||
  fail DECLARATION
zero_count="$(grep -c '^Environment=WAW_SUMMARY_PROVIDER_ENABLED=0$' \
  "$RUN_DIR/unit" || true)"
one_count="$(grep -c '^Environment=WAW_SUMMARY_PROVIDER_ENABLED=1$' \
  "$RUN_DIR/unit" || true)"
other_count="$(grep -Ec '^Environment=WAW_SUMMARY_PROVIDER_ENABLED=.+$' \
  "$RUN_DIR/unit" || true)"
other_count=$((other_count - zero_count - one_count))
[[ "$zero_count" -eq 1 && "$one_count" -eq 0 && "$other_count" -eq 0 ]] ||
  fail DECLARATION
echo 'PROVIDER_DEFAULT_OFF declaration=PASS zero=1 one=0 other=0'

"$SYSTEMCTL" show -p Environment --value waw-bot.service \
  >"$RUN_DIR/environment" 2>/dev/null || fail RESOLVED
tr ' ' '\n' <"$RUN_DIR/environment" >"$RUN_DIR/environment-lines"
zero_count="$(grep -cx 'WAW_SUMMARY_PROVIDER_ENABLED=0' \
  "$RUN_DIR/environment-lines" || true)"
one_count="$(grep -cx 'WAW_SUMMARY_PROVIDER_ENABLED=1' \
  "$RUN_DIR/environment-lines" || true)"
other_count="$(grep -Ec '^WAW_SUMMARY_PROVIDER_ENABLED=.+$' \
  "$RUN_DIR/environment-lines" || true)"
other_count=$((other_count - zero_count - one_count))
[[ "$zero_count" -eq 1 && "$one_count" -eq 0 && "$other_count" -eq 0 ]] ||
  fail RESOLVED
echo 'PROVIDER_DEFAULT_OFF resolved=PASS zero=1 one=0 other=0'

[[ "$(bot_identity || true)" == "$BEFORE_IDENTITY" ]] || fail BOT_IDENTITY
echo 'PROVIDER_DEFAULT_OFF bot_identity=PASS'

"$CURL" --fail --silent --show-error \
  http://127.0.0.1:18080/health >"$RUN_DIR/health" 2>/dev/null ||
  fail HEALTH
"$PYTHON" - "$RUN_DIR/health" >/dev/null 2>/dev/null <<'PY' ||
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload != {"status": "healthy"}:
    raise SystemExit(1)
PY
  fail HEALTH
echo 'PROVIDER_DEFAULT_OFF health=PASS'

failed_count="$(
  "$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
    sed '/^[[:space:]]*$/d' |
    wc -l |
    tr -d ' '
)"
[[ "$failed_count" -eq 0 ]] || fail FAILED_UNITS
echo 'PROVIDER_DEFAULT_OFF failed_units=PASS count=0'

INSTALLED=0
cleanup || fail CLEANUP
echo 'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0'
echo 'PROVIDER_DEFAULT_OFF result=PASS'
