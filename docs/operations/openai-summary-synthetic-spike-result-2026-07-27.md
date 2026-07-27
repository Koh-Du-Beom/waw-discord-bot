# OpenAI summary synthetic production spike result — 2026-07-27

- Result: FAIL, no retry
- Candidate: `cff6308846a447cda17cdf9c496a8b85192ce3ae`
- Release ID: `cff6308`
- Archive SHA-256:
  `9badc975212b2d6d3d23bc7db6a3d2598760b69d3a9d71825bd55d1c78051fd9`
- Archive bytes: `632208`
- Real Discord content sent: none
- Production release activated: no
- Provider, quota, dashboard quota and game-observation flags changed: no

## Evidence

The owner accepted `store:false` with the default abuse-monitoring retention
boundary of up to 30 days and approved one credentialed synthetic-only call.
Production preflight confirmed:

- `current=2ac0996`, `previous=cb93ed8`;
- bot, web, backup timer and monitor timer active, with no failed units;
- provider, rolling-hour quota, dashboard quota and game observation disabled;
- public health healthy;
- the exact candidate marker and read-only staged tree.

The first transient-unit start ended before import with `EACCES` because the
root-owned runner was mode `0500`. Runtime was 59 ms and no provider request was
made. The runner was changed only to root-owned mode `0544`; bot-user
readability was then checked before the approved call.

The one actual Responses API request completed in 2,613 ms. The adapter parsed
a valid four-section structured response, but the external spike validator
returned:

```text
SYNTHETIC_SPIKE_FAIL code=marker_validation_failed elapsed_ms=2613
```

The owner-provided OpenAI usage view confirms one request on July 27, 342 total
tokens, 342 input tokens in the Responses and Chat Completions capability view,
and displayed spend of `$0.00` at the dashboard's precision. The dedicated key
was revoked by the owner after the call.

## Root cause

The failure was a test-oracle mismatch, not evidence of transport, credential,
schema or provider availability failure:

1. The production adapter instruction asks for a Korean summary, no invented
   facts and four separated sections. It does not require opaque marker tokens
   to be preserved verbatim or assigned to predetermined sections.
2. The strict JSON schema constrains the four property names and array-of-string
   shapes only. Arrays may be empty and strings have no marker constraint.
3. The existing fake-transport regression intentionally proves that a
   marker-free structured response is accepted by the adapter.
4. The disposable production runner imposed a stronger, undocumented oracle:
   every marker exactly once in its intended section, no marker in another
   section, and no output item without a marker.

The model therefore was not given the contract that the runner graded. Because
the response body was correctly excluded from logs and discarded at process
exit, evidence cannot distinguish marker omission, duplication, section
movement or an unmarked output item. The fixed aggregate failure code was safe
for production logs but insufficient for that finer diagnosis.

## Cleanup and rollback

The failed call was not retried. The host cleanup verified:

- credential source and runtime credential absent;
- transient runner and unit absent;
- failed staged `/opt/waw/releases/cff6308` removed after confirming it was
  neither `current` nor `previous`;
- current and previous releases unchanged;
- all four feature flags still disabled;
- bot, web, timers and public health healthy;
- transient-unit journal contained no API-key pattern or synthetic marker text.

No application rollback was needed because `cff6308` was never activated.

## Required follow-up

Do not run another credentialed spike against `cff6308`. Before a new call:

1. define one observable marker-recall contract shared by the adapter prompt,
   schema where practical, fake response corpus and production validator;
2. report per-condition numeric counts without response text so omission,
   duplication, movement and unmarked items remain distinguishable;
3. add deterministic fake regressions for those conditions;
4. review any prompt change as product behavior, then build a new immutable
   candidate and obtain a new exact production spike approval.

Real Discord content, release activation and provider/quota/game-observation
activation remain prohibited.
