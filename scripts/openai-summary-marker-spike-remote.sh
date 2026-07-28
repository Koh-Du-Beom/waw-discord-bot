#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

RELEASE=/opt/waw/releases/f42e2b0
EXPECTED_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
CREDENTIAL=/etc/waw-credentials/bot-summary-api-key
UNIT=waw-summary-marker-spike
SYSTEMCTL=/usr/bin/systemctl
SYSTEMD_RUN=/usr/bin/systemd-run
NODE=/usr/local/bin/node
CURL=/usr/bin/curl
KEY_B64=__WAW_OPENAI_KEY_B64__
RUN_DIR=
REQUEST_TOTAL=UNKNOWN

cleanup() {
  local clean=1
  "$SYSTEMCTL" stop "$UNIT.service" >/dev/null 2>&1 || true
  "$SYSTEMCTL" reset-failed "$UNIT.service" >/dev/null 2>&1 || true
  rm -f -- "$CREDENTIAL" 2>/dev/null || clean=0
  if [[ -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" 2>/dev/null || clean=0
  fi
  RUN_DIR=
  unit_load_state="$(
    "$SYSTEMCTL" show -p LoadState --value "$UNIT.service" 2>/dev/null || true
  )"
  [[ "$clean" -eq 1 && ! -e "$CREDENTIAL" &&
    "$unit_load_state" == not-found ]]
}

finish() {
  local result="$1"
  local stage="$2"
  if cleanup; then
    echo 'SUMMARY_SPIKE cleanup=PASS credential=0 transient=0'
  else
    echo 'SUMMARY_SPIKE cleanup=FAIL credential=UNKNOWN transient=UNKNOWN'
    result=FAIL
    stage=CLEANUP
  fi
  printf 'SUMMARY_SPIKE request_total=%s retry=0\n' "$REQUEST_TOTAL"
  printf 'SUMMARY_SPIKE result=%s stage=%s flags=0,0,0,0 activation=0 restart=0\n' \
    "$result" "$stage"
  [[ "$result" == PASS ]]
}

fail() {
  finish FAIL "$1"
  exit 1
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -x "$SYSTEMCTL" && -x "$SYSTEMD_RUN" && -x "$NODE" && -x "$CURL" ]] ||
  fail PRECONDITION
[[ -d "$RELEASE" && ! -L "$RELEASE" &&
  -f "$RELEASE/.waw-release-sha256" &&
  "$(<"$RELEASE/.waw-release-sha256")" == "$EXPECTED_SHA256" &&
  -r "$RELEASE/dist/server/summary/openai-conversation-summarizer.js" &&
  -r "$RELEASE/dist/server/summary/summary-marker-contract.js" ]] ||
  fail IDENTITY
[[ ! -e "$CREDENTIAL" ]] || fail CREDENTIAL_CONFLICT
[[ "$("$SYSTEMCTL" is-active waw-bot.service 2>/dev/null || true)" == active &&
  "$("$SYSTEMCTL" is-active waw-web.service 2>/dev/null || true)" == active ]] ||
  fail HEALTH
failed_count="$(
  "$SYSTEMCTL" --failed --no-legend --plain 2>/dev/null |
    sed '/^[[:space:]]*$/d' | wc -l | tr -d ' '
)"
[[ "$failed_count" -eq 0 ]] || fail HEALTH

bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
web_environment="$("$SYSTEMCTL" show -p Environment --value waw-web.service 2>/dev/null)"
for flag in \
  WAW_SUMMARY_PROVIDER_ENABLED=0 \
  WAW_SUMMARY_QUOTA_ENABLED=0 \
  WAW_GAME_OBSERVATION_ENABLED=0; do
  [[ "$(tr ' ' '\n' <<<"$bot_environment" | grep -cx "$flag" || true)" -eq 1 ]] ||
    fail FLAGS
done
[[ "$(tr ' ' '\n' <<<"$web_environment" |
  grep -cx 'WAW_DASHBOARD_QUOTA_ENABLED=0' || true)" -eq 1 ]] ||
  fail FLAGS
bot_environment=
web_environment=
"$CURL" --fail --silent --show-error http://127.0.0.1:18080/health \
  >/dev/null 2>&1 || fail HEALTH
echo 'SUMMARY_SPIKE precondition=PASS flags=0,0,0,0'

RUN_DIR="$(mktemp -d /run/waw-summary-spike.XXXXXX)" || fail MATERIAL
chmod 755 "$RUN_DIR" || fail MATERIAL
printf '%s' "$KEY_B64" | base64 -d >"$CREDENTIAL" 2>/dev/null ||
  fail CREDENTIAL
KEY_B64=
[[ -s "$CREDENTIAL" && ! -L "$CREDENTIAL" ]] || fail CREDENTIAL
chown root:root "$CREDENTIAL" || fail CREDENTIAL
chmod 600 "$CREDENTIAL" || fail CREDENTIAL

cat >"$RUN_DIR/runner.mjs" <<'JS'
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { OpenAiConversationSummarizer } from "/opt/waw/releases/f42e2b0/dist/server/summary/openai-conversation-summarizer.js";
import { evaluateSummaryMarkers } from "/opt/waw/releases/f42e2b0/dist/server/summary/summary-marker-contract.js";

const expectations = [
  { marker: "[WAW:CORE:ALPHA-731]", section: "coreDiscussion" },
  { marker: "[WAW:DECISION:BRAVO-284]", section: "decisions" },
  { marker: "[WAW:ACTION:CHARLIE-956]", section: "actionItems" },
  { marker: "[WAW:UNRESOLVED:DELTA-417]", section: "unresolved" },
];
const messages = [
  { authorLabel: "합성 사용자 A", content: "핵심 논의 [WAW:CORE:ALPHA-731]", createdAt: new Date("2026-07-28T00:00:00Z") },
  { authorLabel: "합성 사용자 B", content: "결정 사항 [WAW:DECISION:BRAVO-284]", createdAt: new Date("2026-07-28T00:01:00Z") },
  { authorLabel: "합성 사용자 A", content: "후속 작업 [WAW:ACTION:CHARLIE-956]", createdAt: new Date("2026-07-28T00:02:00Z") },
  { authorLabel: "합성 사용자 B", content: "미해결 질문 [WAW:UNRESOLVED:DELTA-417]", createdAt: new Date("2026-07-28T00:03:00Z") },
];
let requestCount = 0;
let usage = null;
const transport = async (url, init) => {
  requestCount += 1;
  if (requestCount !== 1) throw new Error("request_bound");
  const response = await fetch(url, init);
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    usage = parsed?.usage ?? null;
  } catch {}
  return new Response(body, { status: response.status, headers: response.headers });
};
const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
if (!credentialDirectory) throw new Error("credential_unavailable");
const key = fs.readFileSync(`${credentialDirectory}/summary-api-key`, "utf8").trim();
const started = performance.now();
try {
  const summarizer = new OpenAiConversationSummarizer(key, transport, 120_000);
  const sections = await summarizer.summarize({
    messages,
    manifest: [{ firstOrdinal: 0, lastOrdinal: 3, count: 4 }],
    signal: AbortSignal.timeout(120_000),
  });
  const counts = evaluateSummaryMarkers(sections, expectations);
  const inputTokens = Number(usage?.input_tokens);
  const outputTokens = Number(usage?.output_tokens);
  const totalTokens = Number(usage?.total_tokens);
  if (![inputTokens, outputTokens, totalTokens].every(Number.isSafeInteger)) {
    throw new Error("usage_invalid");
  }
  console.log(`SUMMARY_SPIKE request=PASS completed=1 elapsed_ms=${Math.round(performance.now() - started)} input_tokens=${inputTokens} output_tokens=${outputTokens} total_tokens=${totalTokens}`);
  console.log(`SUMMARY_SPIKE markers omission=${counts.omissionCount} duplicate=${counts.duplicateCount} wrong_section=${counts.wrongSectionCount} unmarked=${counts.unmarkedItemCount}`);
  if (Object.values(counts).some((value) => value !== 0)) {
    throw new Error("marker_validation_failed");
  }
  console.log("SUMMARY_SPIKE validator=PASS schema=PASS invented=0 unexpected=0");
} catch (error) {
  const known = new Set(["request_bound", "credential_unavailable", "usage_invalid", "marker_validation_failed", "summary_provider_unavailable", "summary_provider_response_invalid"]);
  const label = known.has(error?.message) ? error.message : "unclassified";
  console.log(`SUMMARY_SPIKE execution=FAIL class=${label}`);
  process.exitCode = 1;
} finally {
  console.log(`SUMMARY_SPIKE observed_requests=${requestCount}`);
}
JS
chmod 555 "$RUN_DIR/runner.mjs" || fail MATERIAL
echo 'SUMMARY_SPIKE credential=PASS metadata=root:root:600'

set +e
"$SYSTEMD_RUN" --quiet --wait --collect --pipe \
  --unit="$UNIT" \
  --uid=waw-bot \
  --gid=waw-member-role \
  --property=NoNewPrivileges=yes \
  --property=PrivateTmp=yes \
  --property=ProtectHome=yes \
  --property=ProtectSystem=strict \
  --property=ReadOnlyPaths="$RELEASE $RUN_DIR" \
  --property=LoadCredential="summary-api-key:$CREDENTIAL" \
  "$NODE" "$RUN_DIR/runner.mjs" >"$RUN_DIR/result" 2>/dev/null
runner_rc=$?
set -e
result="$(<"$RUN_DIR/result")"
printf '%s\n' "$result"
if [[ "$result" =~ SUMMARY_SPIKE\ observed_requests=([0-9]+) ]]; then
  REQUEST_TOTAL="${BASH_REMATCH[1]}"
fi
[[ "$runner_rc" -eq 0 ]] || fail EXECUTION
[[ "$result" =~ SUMMARY_SPIKE\ observed_requests=1 ]] || fail REQUEST_BOUND
[[ "$result" =~ SUMMARY_SPIKE\ markers\ omission=0\ duplicate=0\ wrong_section=0\ unmarked=0 ]] ||
  fail VALIDATION

finish PASS COMPLETE
trap - EXIT
