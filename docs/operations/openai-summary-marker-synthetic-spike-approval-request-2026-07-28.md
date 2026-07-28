# OpenAI summary marker synthetic spike approval request — 2026-07-28

- Requested decision: approve or reject the exact scope below
- Candidate commit: `f42e2b06b23695bee113091581aba635ec343494`
- Release ID: `f42e2b0`
- Archive SHA-256:
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`
- Archive bytes: `640107`
- Gate A: PASS on local macOS and AWS CloudShell Linux
- Production mutation performed by this request: none
- OpenAI credential created or request sent by this request: none

## Existing approved provider boundary

The owner accepted on 2026-07-27 that:

- the paid OpenAI API does not use API inputs and outputs for model training by
  default;
- Responses requests use `store:false`, without background mode,
  conversations, files, tools or provider-side application state;
- `store:false` is not Zero Data Retention and default abuse monitoring may
  retain API content for up to 30 days;
- real Discord content remains prohibited until registered users receive the
  approved external-processing and retention disclosure;
- raw Discord messages remain excluded from project persistence and logs;
- a material change to provider retention, training, endpoint, region, model or
  data-control terms requires a new approval.

This request does not change that decision. Reject or pause this request if the
accepted provider boundary is no longer acceptable or has materially changed.

## Requested synthetic-only spike

Approve only these bounded actions against the exact tuple above:

1. run a read-only production preflight confirming the current release,
   rollback target, schema version `8`, healthy bot/web/timers, zero failed
   units, and provider, summary quota, game observation and dashboard quota
   flags all exactly `0`;
2. transfer, independently verify and stage the exact archive only at
   `/opt/waw/releases/f42e2b0`, without activation, symlink change, migration or
   service restart;
3. create one newly issued dedicated OpenAI project key and install it only as
   root-owned mode `0600`
   `/etc/waw-credentials/bot-summary-api-key`, without displaying or recording
   its value, hash or recognizable prefix;
4. verify before execution that the root-owned runner is readable by the bot
   user, the staged source is immutable, the compiled shared marker contract is
   present and all four feature flags remain `0`;
5. run one non-restarting transient bot-user systemd unit that:
   - receives only `summary-api-key` through `LoadCredential=`;
   - imports the staged compiled `OpenAiConversationSummarizer` and shared
     `evaluateSummaryMarkers`;
   - sends one fixed invented Korean conversation containing only synthetic
     CORE, DECISION, ACTION and UNRESOLVED markers;
   - uses the candidate's pinned `gpt-5.4-mini-2026-03-17` model,
     `store:false`, strict four-section schema, 4,096 output-token limit and
     120-second deadline;
   - permits exactly one Responses API request and no retry;
   - emits only fixed pass/fail metadata, elapsed time, token counts and the
     four aggregate marker counts, never a credential, request/response body,
     marker text or provider error body;
6. use the dedicated OpenAI project usage view to confirm that exactly one
   request occurred and record only elapsed time, token counts and calculated
   cost;
7. revoke the dedicated key and remove the credential source, runtime
   credential and transient runner/unit state regardless of pass or failure;
8. verify journal redaction, bot/web/timer health, singleton ownership, all four
   flags still `0`, no credential or transient artifact remains, and no OpenAI
   request other than the single synthetic call occurred.

The staged release may remain only if the spike passes and its exact immutable
marker is intact. Otherwise remove only `/opt/waw/releases/f42e2b0` after
proving it is neither `current` nor `previous`.

## Pass criteria

PASS only if every condition below is true:

- archive SHA-256, byte count, release marker, compiled contract, migration
  count and staged immutability match the approved candidate;
- the Responses API reports one completed response within 120 seconds;
- the response passes the strict four-section schema;
- evaluator output is exactly:
  `omissionCount=0`, `duplicateCount=0`, `wrongSectionCount=0` and
  `unmarkedItemCount=0`;
- no invented output fact or unexpected output item is observed by the
  synthetic validator;
- the dedicated usage view reports exactly one request with bounded
  token/cost evidence;
- journal and audit scans contain no credential derivative, request/response
  content, marker text or untrusted provider body;
- cleanup passes and all four feature flags remain exactly `0`.

Any nonzero marker count is FAIL. Aggregate counts may be recorded; response
content and marker text must not be retained to diagnose the failure.

## Stop conditions and cleanup

Stop before credential creation on any preflight, archive, release identity,
schema, migration, health, timer, rollback-target, permission, compiled
contract, immutability or feature-flag mismatch.

Stop after credential creation without sending a request if bot-user runner
readability, transient-unit isolation, fixed synthetic input, pinned request
shape, response-free evaluator output, logging allowlist or one-call bound
cannot be proved.

On timeout, redirect, TLS/network error, non-200 response, refusal, incomplete
response, malformed output, any nonzero marker count, invented fact,
unexpected usage, redaction failure or extra request:

1. do not retry;
2. revoke and remove the credential;
3. remove transient state;
4. verify all four flags remain `0`;
5. remove the staged candidate only after the `current`/`previous` identity
   checks;
6. verify service health and report FAIL with fixed metadata only.

No application rollback is required because activation is not authorized.

## Explicit exclusions

This approval does not allow:

- real Discord messages, Discord command invocation or user identifiers;
- activation of `f42e2b0`, release symlink changes or service restart;
- provider, summary quota, dashboard quota or game-observation activation;
- migration execution or database mutation;
- Discord registration, Riot, OAuth, dashboard or unrelated provider changes;
- more than one OpenAI request or any retry;
- retaining the spike credential or response content after cleanup.

## Decision requested

Approve or reject this exact tuple and scope:

```text
candidate=f42e2b06b23695bee113091581aba635ec343494
release=f42e2b0
sha256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
bytes=640107
request_count=1
real_discord_content=0
activation=0
flags=0,0,0,0
retry=0
```

A passing spike still does not authorize default-off release deployment or
real `/요약` activation. Those require a later owner approval naming this
candidate tuple, the accepted retention boundary, spike evidence, exact
systemd drop-in, smoke test, stop conditions and rollback.
