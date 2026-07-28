#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ARCHIVE_B64=__WAW_CANDIDATE_ARCHIVE_B64__
MANAGER_B64=__WAW_RELEASE_MANAGER_B64__
EXPECTED_ARCHIVE_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
EXPECTED_ARCHIVE_BYTES=640107
EXPECTED_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
RELEASE_ID=f42e2b0
RELEASE_ROOT=/opt/waw/releases
TARGET="$RELEASE_ROOT/$RELEASE_ID"
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
SYSTEMCTL=/usr/bin/systemctl
CURL=/usr/bin/curl
PYTHON=/usr/bin/python3
RUN_DIR=
CREATED=0
CURRENT_BEFORE=
PREVIOUS_BEFORE=
BOT_ENV_FILE="/tmp/waw-release-stage-bot-environment.$$"
WEB_ENV_FILE="/tmp/waw-release-stage-web-environment.$$"
HEALTH_FILE="/tmp/waw-release-stage-health.$$"

cleanup() {
  local clean=1
  rm -f -- "$BOT_ENV_FILE" "$WEB_ENV_FILE" "$HEALTH_FILE" 2>/dev/null ||
    clean=0
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" || clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

safe_release_rollback() {
  [[ "$CREATED" -eq 1 ]] || return 0
  [[ -d "$TARGET" && ! -L "$TARGET" &&
    -f "$TARGET/.waw-release-sha256" &&
    "$(<"$TARGET/.waw-release-sha256")" == "$EXPECTED_ARCHIVE_SHA256" ]] ||
    return 1
  [[ "$(readlink -f "$CURRENT")" != "$TARGET" &&
    "$(readlink -f "$PREVIOUS")" != "$TARGET" ]] || return 1
  find "$TARGET" -depth -delete
  CREATED=0
}

fail() {
  local stage="$1"
  local rollback=NOT_REQUIRED
  if [[ "$CREATED" -eq 1 ]]; then
    if safe_release_rollback; then
      rollback=PASS
    else
      rollback=CONFLICT
    fi
  fi
  if cleanup; then
    echo 'RELEASE_STAGE cleanup=PASS transient_remainders=0'
  else
    echo 'RELEASE_STAGE cleanup=FAIL transient_remainders=1'
  fi
  printf 'RELEASE_STAGE rollback=%s\n' "$rollback"
  printf 'RELEASE_STAGE result=FAIL stage=%s\n' "$stage"
  exit 1
}

[[ -x "$SYSTEMCTL" && -x "$CURL" && -x "$PYTHON" ]] ||
  fail PRECONDITION
[[ -L "$CURRENT" && -L "$PREVIOUS" && ! -e "$TARGET" ]] ||
  fail PRECONDITION
CURRENT_BEFORE="$(readlink -f "$CURRENT")"
PREVIOUS_BEFORE="$(readlink -f "$PREVIOUS")"
[[ -d "$CURRENT_BEFORE" && -d "$PREVIOUS_BEFORE" &&
  "$CURRENT_BEFORE" != "$PREVIOUS_BEFORE" &&
  "$CURRENT_BEFORE" != "$TARGET" && "$PREVIOUS_BEFORE" != "$TARGET" ]] ||
  fail PRECONDITION
for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] ||
    fail PRECONDITION
done
failed_count="$(
  "$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
    sed '/^[[:space:]]*$/d' |
    wc -l |
    tr -d ' '
)"
[[ "$failed_count" -eq 0 ]] || fail PRECONDITION
"$SYSTEMCTL" show -p Environment --value waw-bot.service \
  >"$BOT_ENV_FILE" 2>/dev/null ||
  fail PRECONDITION
"$SYSTEMCTL" show -p Environment --value waw-web.service \
  >"$WEB_ENV_FILE" 2>/dev/null ||
  fail PRECONDITION
bot_environment="$(<"$BOT_ENV_FILE")"
web_environment="$(<"$WEB_ENV_FILE")"
rm -f -- "$BOT_ENV_FILE" "$WEB_ENV_FILE"
for flag in \
  WAW_SUMMARY_PROVIDER_ENABLED=0 \
  WAW_SUMMARY_QUOTA_ENABLED=0 \
  WAW_GAME_OBSERVATION_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail PRECONDITION
done
[[ "$(tr ' ' '\n' <<<"$web_environment" |
  grep -cx 'WAW_DASHBOARD_QUOTA_ENABLED=0' || true)" -eq 1 ]] ||
  fail PRECONDITION
bot_environment=
web_environment=
"$CURL" --fail --silent --show-error \
  http://127.0.0.1:18080/health >"$HEALTH_FILE" 2>/dev/null ||
  fail PRECONDITION
"$PYTHON" - "$HEALTH_FILE" >/dev/null 2>/dev/null <<'PY' ||
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload != {"status": "healthy"}:
    raise SystemExit(1)
PY
  fail PRECONDITION
rm -f -- "$HEALTH_FILE"
echo 'RELEASE_STAGE precondition=PASS flags=0,0,0,0'

RUN_DIR="$(mktemp -d /tmp/waw-release-stage.XXXXXX)" || fail MATERIAL
chmod 700 "$RUN_DIR" || fail MATERIAL
printf '%s' "$ARCHIVE_B64" | base64 -d >"$RUN_DIR/candidate.tar.gz" 2>/dev/null ||
  fail MATERIAL
printf '%s' "$MANAGER_B64" | base64 -d >"$RUN_DIR/manage-production-release.sh" \
  2>/dev/null || fail MATERIAL
chmod 600 "$RUN_DIR/candidate.tar.gz" || fail MATERIAL
chmod 700 "$RUN_DIR/manage-production-release.sh" || fail MATERIAL
[[ "$(sha256sum "$RUN_DIR/candidate.tar.gz" | awk '{print $1}')" == "$EXPECTED_ARCHIVE_SHA256" ]] ||
  fail MATERIAL
[[ "$(wc -c <"$RUN_DIR/candidate.tar.gz" | tr -d ' ')" == "$EXPECTED_ARCHIVE_BYTES" ]] ||
  fail MATERIAL
[[ "$(sha256sum "$RUN_DIR/manage-production-release.sh" | awk '{print $1}')" == "$EXPECTED_MANAGER_SHA256" ]] ||
  fail MATERIAL
echo 'RELEASE_STAGE material=PASS sha256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b bytes=640107'

"$RUN_DIR/manage-production-release.sh" \
  stage \
  "$RELEASE_ID" \
  "$RUN_DIR/candidate.tar.gz" \
  "$EXPECTED_ARCHIVE_SHA256" \
  >"$RUN_DIR/stage.log" 2>&1 || fail BUILD
CREATED=1
echo 'RELEASE_STAGE build=PASS'

[[ -d "$TARGET" && ! -L "$TARGET" &&
  -f "$TARGET/.waw-release-sha256" &&
  "$(<"$TARGET/.waw-release-sha256")" == "$EXPECTED_ARCHIVE_SHA256" ]] ||
  fail IDENTITY
[[ -r "$TARGET/dist/server/bot/main.js" &&
  -r "$TARGET/dist/server/web/main.js" &&
  -r "$TARGET/dist/server/summary/openai-conversation-summarizer.js" &&
  -r "$TARGET/dist/server/summary/summary-marker-contract.js" ]] ||
  fail IDENTITY
migration_count="$(find "$TARGET/migrations" -maxdepth 1 -type f \
  -name '000*.sql' | wc -l | tr -d ' ')"
[[ "$migration_count" -eq 8 ]] || fail IDENTITY
writable_count="$(find "$TARGET" -type f -perm /222 | wc -l | tr -d ' ')"
[[ "$writable_count" -eq 0 ]] || fail IDENTITY
[[ "$(readlink -f "$CURRENT")" == "$CURRENT_BEFORE" &&
  "$(readlink -f "$PREVIOUS")" == "$PREVIOUS_BEFORE" ]] ||
  fail IDENTITY
echo 'RELEASE_STAGE identity=PASS migrations=8 writable=0'

CREATED=0
cleanup || fail CLEANUP
echo 'RELEASE_STAGE cleanup=PASS transient_remainders=0'
echo 'RELEASE_STAGE result=PASS release=f42e2b0 activation=0 restart=0'
