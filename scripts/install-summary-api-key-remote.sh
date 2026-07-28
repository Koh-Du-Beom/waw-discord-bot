#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

KEY_B64=__WAW_OPENAI_KEY_B64__
TARGET=/etc/waw-credentials/bot-summary-api-key
SYSTEMCTL=/usr/bin/systemctl
RUNUSER=/usr/sbin/runuser
RUN_DIR=
CREATED=0

cleanup() {
  local clean=1
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" || clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

rollback() {
  [[ "$CREATED" -eq 1 ]] || return 0
  [[ -f "$TARGET" && ! -L "$TARGET" ]] || return 1
  rm -f -- "$TARGET"
  CREATED=0
}

fail() {
  local stage="$1" rollback_status=NOT_REQUIRED
  if [[ "$CREATED" -eq 1 ]]; then
    if rollback; then rollback_status=PASS; else rollback_status=FAIL; fi
  fi
  cleanup >/dev/null 2>&1 || true
  printf 'SUMMARY_CREDENTIAL rollback=%s\n' "$rollback_status"
  printf 'SUMMARY_CREDENTIAL result=FAIL stage=%s\n' "$stage"
  exit 1
}

[[ -x "$SYSTEMCTL" && -x "$RUNUSER" &&
  (! -e "$TARGET" || (-f "$TARGET" && ! -L "$TARGET")) ]] ||
  fail PRECONDITION
echo 'SUMMARY_CREDENTIAL precondition=PASS'
for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION
done
before_pid="$("$SYSTEMCTL" show -p MainPID --value waw-bot.service 2>/dev/null)"
before_started="$("$SYSTEMCTL" show -p ExecMainStartTimestampMonotonic --value \
  waw-bot.service 2>/dev/null)"
[[ "$before_pid" =~ ^[1-9][0-9]*$ && "$before_started" =~ ^[1-9][0-9]*$ ]] ||
  fail PRECONDITION
bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
for flag in WAW_SUMMARY_PROVIDER_ENABLED=0 WAW_SUMMARY_QUOTA_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail PRECONDITION
done
bot_environment=
echo 'SUMMARY_CREDENTIAL default_off=PASS'

RUN_DIR="$(mktemp -d /tmp/waw-summary-credential.XXXXXX)" || fail MATERIAL
chmod 700 "$RUN_DIR"
printf '%s' "$KEY_B64" | base64 -d >"$RUN_DIR/key" 2>/dev/null ||
  fail MATERIAL
python3 - "$RUN_DIR/key" >/dev/null 2>/dev/null <<'PY' || fail MATERIAL
import pathlib, sys
value = pathlib.Path(sys.argv[1]).read_bytes()
if not 20 <= len(value) <= 512 or any(c in value for c in (b"\r", b"\n", b"\0")):
    raise SystemExit(1)
PY
echo 'SUMMARY_CREDENTIAL material=PASS'
install -d -o root -g root -m 0700 /etc/waw-credentials
if [[ -e "$TARGET" ]]; then
  cmp -s "$RUN_DIR/key" "$TARGET" || fail CONFLICT
  chown root:root "$TARGET"
  chmod 0600 "$TARGET"
else
  install -o root -g root -m 0600 "$RUN_DIR/key" "$TARGET"
  CREATED=1
fi

[[ "$(stat -c '%U:%G:%a' "$TARGET" 2>/dev/null || true)" == root:root:600 ]] ||
  fail METADATA
if "$RUNUSER" -u waw-bot -- test -r "$TARGET" 2>/dev/null; then
  fail ISOLATION
fi
after_pid="$("$SYSTEMCTL" show -p MainPID --value waw-bot.service 2>/dev/null)"
after_started="$("$SYSTEMCTL" show -p ExecMainStartTimestampMonotonic --value \
  waw-bot.service 2>/dev/null)"
[[ "$after_pid" == "$before_pid" && "$after_started" == "$before_started" ]] ||
  fail IDENTITY

CREATED=0
cleanup || fail CLEANUP
echo 'SUMMARY_CREDENTIAL install=PASS metadata=root:root:600'
echo 'SUMMARY_CREDENTIAL isolation=PASS bot_direct_read=DENY'
echo 'SUMMARY_CREDENTIAL identity=PASS restart=0 provider_calls=0'
echo 'SUMMARY_CREDENTIAL cleanup=PASS transient=0'
echo 'SUMMARY_CREDENTIAL result=PASS'
