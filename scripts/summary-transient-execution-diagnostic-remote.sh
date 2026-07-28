#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

UNIT=waw-summary-transient-diagnostic
SYSTEMCTL=/usr/bin/systemctl
SYSTEMD_RUN=/usr/bin/systemd-run
NODE=/usr/local/bin/node
RELEASE=/opt/waw/releases/f42e2b0
EXPECTED_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
RUN_DIR=
CREDENTIAL=/run/waw-summary-transient-diagnostic-key

cleanup() {
  local clean=1
  "$SYSTEMCTL" stop "$UNIT.service" >/dev/null 2>&1 || true
  "$SYSTEMCTL" reset-failed "$UNIT.service" >/dev/null 2>&1 || true
  rm -f -- "$CREDENTIAL" 2>/dev/null || clean=0
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" 2>/dev/null || clean=0
  fi
  load_state="$(
    "$SYSTEMCTL" show -p LoadState --value "$UNIT.service" 2>/dev/null || true
  )"
  [[ "$clean" -eq 1 && "$load_state" == not-found && ! -e "$CREDENTIAL" ]]
}

fail() {
  printf 'SUMMARY_TRANSIENT_DIAGNOSTIC stage=%s result=FAIL\n' "$1"
  if cleanup; then
    echo 'SUMMARY_TRANSIENT_DIAGNOSTIC cleanup=PASS transient=0'
  else
    echo 'SUMMARY_TRANSIENT_DIAGNOSTIC cleanup=FAIL transient=UNKNOWN'
  fi
  exit 1
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -x "$SYSTEMCTL" && -x "$SYSTEMD_RUN" && -x "$NODE" ]] ||
  fail PRECONDITION
[[ -d "$RELEASE" && ! -L "$RELEASE" &&
  -f "$RELEASE/.waw-release-sha256" &&
  "$(<"$RELEASE/.waw-release-sha256")" == "$EXPECTED_SHA256" ]] ||
  fail IDENTITY
RUN_DIR="$(mktemp -d /run/waw-summary-transient-diagnostic.XXXXXX)" ||
  fail MATERIAL
chmod 755 "$RUN_DIR" || fail MATERIAL
cat >"$RUN_DIR/runner.mjs" <<'JS'
import fs from "node:fs";

console.log("SUMMARY_TRANSIENT_DIAGNOSTIC bootstrap=PASS");
const { OpenAiConversationSummarizer } = await import(
  "/opt/waw/releases/f42e2b0/dist/server/summary/openai-conversation-summarizer.js"
);
const { evaluateSummaryMarkers } = await import(
  "/opt/waw/releases/f42e2b0/dist/server/summary/summary-marker-contract.js"
);
console.log("SUMMARY_TRANSIENT_DIAGNOSTIC imports=PASS");
const directory = process.env.CREDENTIALS_DIRECTORY;
if (!directory) throw new Error("credential_directory_missing");
const key = fs.readFileSync(`${directory}/summary-api-key`, "utf8").trim();
if (key !== "synthetic-no-network-key") throw new Error("credential_mismatch");
console.log("SUMMARY_TRANSIENT_DIAGNOSTIC credential_read=PASS");
const summarizer = new OpenAiConversationSummarizer(key, async () => {
  throw new Error("network_forbidden");
});
const body = summarizer.validate({
  messages: [{
    authorLabel: "synthetic",
    content: "[WAW:CORE:DIAGNOSTIC]",
    createdAt: new Date("2026-07-28T00:00:00Z"),
  }],
  manifest: [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }],
  signal: AbortSignal.timeout(1_000),
});
if (!body.includes('"store":false')) throw new Error("request_shape_invalid");
const counts = evaluateSummaryMarkers(
  { coreDiscussion: ["[WAW:CORE:DIAGNOSTIC]"], decisions: [], actionItems: [], unresolved: [] },
  [{ marker: "[WAW:CORE:DIAGNOSTIC]", section: "coreDiscussion" }],
);
if (Object.values(counts).some((value) => value !== 0)) {
  throw new Error("marker_contract_invalid");
}
console.log("SUMMARY_TRANSIENT_DIAGNOSTIC child_stdout=PASS");
console.error("SUMMARY_TRANSIENT_DIAGNOSTIC child_stderr=PASS");
JS
chmod 555 "$RUN_DIR/runner.mjs" || fail MATERIAL
printf 'synthetic-no-network-key' >"$CREDENTIAL" || fail MATERIAL
chmod 600 "$CREDENTIAL" || fail MATERIAL

set +e
"$SYSTEMD_RUN" --wait --collect --pipe \
  --unit="$UNIT" \
  --uid=waw-bot \
  --gid=waw-member-role \
  --property=NoNewPrivileges=yes \
  --property=PrivateTmp=yes \
  --property=ProtectHome=yes \
  --property=ProtectSystem=strict \
  --property=ReadOnlyPaths="$RELEASE $RUN_DIR" \
  --property=LoadCredential="summary-api-key:$CREDENTIAL" \
  "$NODE" "$RUN_DIR/runner.mjs" \
  >"$RUN_DIR/stdout" 2>"$RUN_DIR/stderr"
runner_rc=$?
set -e

stdout_count="$(grep -cx 'SUMMARY_TRANSIENT_DIAGNOSTIC child_stdout=PASS' "$RUN_DIR/stdout" || true)"
stderr_count="$(grep -cx 'SUMMARY_TRANSIENT_DIAGNOSTIC child_stderr=PASS' "$RUN_DIR/stderr" || true)"
credential_count="$(
  grep -cx 'SUMMARY_TRANSIENT_DIAGNOSTIC credential_read=PASS' \
    "$RUN_DIR/stdout" || true
)"
bootstrap_count="$(
  grep -cx 'SUMMARY_TRANSIENT_DIAGNOSTIC bootstrap=PASS' "$RUN_DIR/stdout" ||
    true
)"
imports_count="$(
  grep -cx 'SUMMARY_TRANSIENT_DIAGNOSTIC imports=PASS' "$RUN_DIR/stdout" ||
    true
)"
if grep -Eiq 'credential_directory_missing' "$RUN_DIR/stderr"; then
  failure_class=CREDENTIAL_DIRECTORY
elif grep -Eiq 'credential_mismatch' "$RUN_DIR/stderr"; then
  failure_class=CREDENTIAL_MISMATCH
elif grep -Eiq 'failed to set unit properties|unknown assignment|invalid argument' \
  "$RUN_DIR/stderr"; then
  failure_class=PROPERTY
elif grep -Eiq 'credential|loadcredential' "$RUN_DIR/stderr"; then
  failure_class=CREDENTIAL_LOAD
elif grep -Eiq 'permission denied|access denied|not authorized' "$RUN_DIR/stderr"; then
  failure_class=PERMISSION
elif grep -Eiq 'already exists|unit.*exists' "$RUN_DIR/stderr"; then
  failure_class=UNIT_CONFLICT
elif grep -Eiq 'ERR_MODULE_NOT_FOUND|cannot find module' "$RUN_DIR/stderr"; then
  failure_class=MODULE_IMPORT
elif grep -Eiq 'ENOENT' "$RUN_DIR/stderr"; then
  failure_class=FILE_MISSING
elif grep -Eiq 'EACCES' "$RUN_DIR/stderr"; then
  failure_class=FILE_PERMISSION
elif [[ "$runner_rc" -eq 0 ]]; then
  failure_class=NONE
else
  failure_class=UNKNOWN
fi
printf 'SUMMARY_TRANSIENT_DIAGNOSTIC execution_rc=%s bootstrap_count=%s imports_count=%s credential_count=%s stdout_count=%s stderr_count=%s\n' \
  "$runner_rc" "$bootstrap_count" "$imports_count" "$credential_count" \
  "$stdout_count" "$stderr_count"
printf 'SUMMARY_TRANSIENT_DIAGNOSTIC failure_class=%s\n' "$failure_class"
[[ "$runner_rc" -eq 0 && "$bootstrap_count" -eq 1 && "$imports_count" -eq 1 &&
  "$credential_count" -eq 1 && "$stdout_count" -eq 1 &&
  "$stderr_count" -eq 1 && "$failure_class" == NONE ]] ||
  fail RESULT_DELIVERY

cleanup || fail CLEANUP
trap - EXIT
echo 'SUMMARY_TRANSIENT_DIAGNOSTIC cleanup=PASS transient=0'
echo 'SUMMARY_TRANSIENT_DIAGNOSTIC result=PASS network=0 credential=0 request=0'
