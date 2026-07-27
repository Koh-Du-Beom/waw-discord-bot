# OpenAI summary retention and synthetic spike approval request — 2026-07-27

- Requested decision: approve or reject both decisions below
- Candidate commit: `cff6308846a447cda17cdf9c496a8b85192ce3ae`
- Release ID: `cff6308`
- Archive SHA-256:
  `9badc975212b2d6d3d23bc7db6a3d2598760b69d3a9d71825bd55d1c78051fd9`
- Archive bytes: `632208`
- Gate A: PASS on local Linux and AWS CloudShell Linux
- Production mutation performed by this request: none

## Decision 1: retention boundary

Approve this exact interpretation for eventual real `/요약` use:

- use the paid OpenAI API, which does not use API inputs and outputs for model
  training by default;
- send Responses requests only with `store:false`, without background mode,
  conversations, files, tools, or provider-side application state;
- accept that `store:false` is not Zero Data Retention and that default abuse
  monitoring may retain API content for up to 30 days;
- disclose this external processing and possible safety retention to registered
  users before real Discord content is enabled;
- keep raw Discord messages out of project persistence and logs;
- stop and require a new approval if OpenAI retention, training, endpoint,
  region, model, or data-control terms materially change.

Reject this decision if provider-side retention is not acceptable. Rejection
means no real Discord message may be sent until an approved Zero Data Retention
arrangement or a newly accepted provider boundary exists.

## Decision 2: synthetic-only credentialed production spike

Approve only the following bounded mutations after Decision 1 is approved:

1. read-only production preflight confirming current release, rollback target,
   schema version `8`, healthy services/timers, and provider, summary quota,
   game observation, and dashboard quota flags all `0`;
2. transfer and stage the exact candidate archive under
   `/opt/waw/releases/cff6308` without activating it or restarting a service;
3. install one newly issued, dedicated OpenAI project key at
   `/etc/waw-credentials/bot-summary-api-key`, owner `root:root`, mode `0600`,
   without displaying or logging its value, hash, or recognizable prefix;
4. run one transient, non-restarting, bot-user systemd unit that:
   - receives only `summary-api-key` through `LoadCredential=`;
   - imports the staged compiled `OpenAiConversationSummarizer`;
   - sends one fixed synthetic Korean conversation containing only invented
     discussion, decision, action-item, and unresolved markers;
   - uses the candidate's pinned model, `store:false`, schema, limits and
     120-second deadline;
   - emits only fixed pass/fail metadata and marker-recall counts, never the
     credential, request body, response body, or provider error body;
5. use the dedicated OpenAI project usage view to confirm the bounded call and
   record only token counts, elapsed time and calculated cost;
6. remove the transient unit state, revoke the dedicated key, and remove the
   root credential source regardless of pass or failure;
7. verify journal redaction, bot/web health, singleton ownership, all four flags
   still `0`, no credential file/runtime credential/transient unit remains, and
   no OpenAI request other than the single synthetic call occurred.

The staged immutable release may remain only if the spike passes and its exact
marker is intact. Otherwise remove only `/opt/waw/releases/cff6308` after
verifying that it is neither `current` nor `previous`.

## Explicit exclusions

This approval does not allow:

- real Discord messages, Discord command invocation, or user identifiers;
- activation of release `cff6308`;
- `WAW_SUMMARY_PROVIDER_ENABLED=1`;
- `WAW_SUMMARY_QUOTA_ENABLED=1`;
- dashboard quota or game observation activation;
- migration execution, database mutation, Discord registration, Riot changes,
  web changes, OAuth changes, or any unrelated provider request;
- retaining the spike credential after cleanup.

## Pass criteria

PASS only if all are true:

- exact archive identity and staged immutability still match;
- the response passes the four-section strict schema;
- every invented marker appears in its intended section and no invented fact is
  added;
- elapsed time is below 120 seconds;
- the provider reports a completed response and bounded usage/cost;
- journal and audit scans contain no credential derivative, request/response
  content, or untrusted provider body;
- cleanup and all four default-off flags are verified.

## Stop and rollback

Stop before credential creation on any preflight, archive, release, migration,
health, timer, rollback-target, permission, or flag mismatch.

Stop after credential creation without sending a request if credential
ownership/mode, transient-unit isolation, fixed synthetic input, pinned request
shape, logging allowlist, or one-call bound cannot be proved.

On timeout, redirect, TLS/network error, non-200 response, refusal, incomplete
response, malformed output, marker loss, hallucinated fact, unexpected usage,
redaction failure, or extra request, do not retry. Revoke and remove the
credential, remove transient state, restore all flags to `0`, verify health and
report failure. No application rollback is needed because the candidate is not
activated; remove its staged directory only under the identity checks above.

## Subsequent approval

A passing spike still does not activate `/요약`. Default-off release deployment
and the simultaneous provider plus rolling-hour quota activation require a
later owner approval naming this candidate tuple, the accepted retention
decision, spike evidence, exact systemd drop-in, smoke test, stop conditions and
rollback.
