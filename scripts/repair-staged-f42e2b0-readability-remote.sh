#!/usr/bin/env bash
set -Eeuo pipefail
set +x

TARGET=/opt/waw/releases/f42e2b0
EXPECTED_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
CURRENT=/opt/waw/current
PREVIOUS=/opt/waw/previous
RUNUSER=/usr/sbin/runuser
NODE=/usr/local/bin/node
RUNNER=/run/waw-release-readability-check.mjs

cleanup() {
  rm -f -- "$RUNNER" 2>/dev/null || true
  [[ ! -e "$RUNNER" ]]
}

fail() {
  printf 'RELEASE_READABILITY stage=%s result=FAIL\n' "$1"
  if cleanup; then
    echo 'RELEASE_READABILITY cleanup=PASS transient=0'
  else
    echo 'RELEASE_READABILITY cleanup=FAIL transient=UNKNOWN'
  fi
  exit 1
}

trap 'cleanup >/dev/null 2>&1 || true' EXIT

[[ -x "$RUNUSER" && -x "$NODE" &&
  -d "$TARGET" && ! -L "$TARGET" &&
  -f "$TARGET/.waw-release-sha256" &&
  "$(<"$TARGET/.waw-release-sha256")" == "$EXPECTED_SHA256" &&
  "$(readlink -f "$CURRENT")" != "$TARGET" &&
  "$(readlink -f "$PREVIOUS")" != "$TARGET" ]] ||
  fail PRECONDITION
echo 'RELEASE_READABILITY precondition=PASS activation=0 restart=0'

chmod -R a+rX "$TARGET" || fail PERMISSIONS
chmod -R a-w "$TARGET" || fail PERMISSIONS
writable_count="$(find "$TARGET" -type f -perm /222 | wc -l | tr -d ' ')"
[[ "$writable_count" -eq 0 ]] || fail PERMISSIONS

cat >"$RUNNER" <<'JS'
const { OpenAiConversationSummarizer } = await import(
  "/opt/waw/releases/f42e2b0/dist/server/summary/openai-conversation-summarizer.js"
);
const { evaluateSummaryMarkers } = await import(
  "/opt/waw/releases/f42e2b0/dist/server/summary/summary-marker-contract.js"
);
const summarizer = new OpenAiConversationSummarizer(
  "synthetic-no-network-key",
  async () => { throw new Error("network_forbidden"); },
);
const body = summarizer.validate({
  messages: [{
    authorLabel: "synthetic",
    content: "[WAW:CORE:READABILITY]",
    createdAt: new Date("2026-07-28T00:00:00Z"),
  }],
  manifest: [{ firstOrdinal: 0, lastOrdinal: 0, count: 1 }],
  signal: AbortSignal.timeout(1_000),
});
if (!body.includes('"store":false')) throw new Error("shape_invalid");
const counts = evaluateSummaryMarkers(
  { coreDiscussion: ["[WAW:CORE:READABILITY]"], decisions: [], actionItems: [], unresolved: [] },
  [{ marker: "[WAW:CORE:READABILITY]", section: "coreDiscussion" }],
);
if (Object.values(counts).some((value) => value !== 0)) {
  throw new Error("contract_invalid");
}
console.log("RELEASE_READABILITY bot_import=PASS validate=PASS network=0");
JS
chmod 555 "$RUNNER" || fail BOT_IMPORT
output="$("$RUNUSER" -u waw-bot -- "$NODE" "$RUNNER" 2>/dev/null || true)"
[[ "$output" == 'RELEASE_READABILITY bot_import=PASS validate=PASS network=0' ]] ||
  fail BOT_IMPORT
printf '%s\n' "$output"

cleanup || fail CLEANUP
trap - EXIT
echo 'RELEASE_READABILITY permissions=PASS readable=1 writable=0'
echo 'RELEASE_READABILITY cleanup=PASS transient=0'
echo 'RELEASE_READABILITY result=PASS activation=0 restart=0'
