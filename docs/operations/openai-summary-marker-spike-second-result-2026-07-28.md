# OpenAI summary marker synthetic spike second result — 2026-07-28

- Status: FAIL; no retry performed
- Candidate:
  `f42e2b06b23695bee113091581aba635ec343494`
- Release ID: `f42e2b0`
- Activation: `0`
- Service restart: `0`
- Feature flags after cleanup: `0,0,0,0`

## Result

The exact staged candidate, service health, zero failed units and all four
default-off flags passed preflight. A newly issued dedicated project
credential was installed as `root:root` mode `0600` and supplied only to the
bounded transient execution.

The transient execution failed before it emitted any allowlisted runner
metadata. The owner subsequently confirmed that the usage view had no
2026-07-28 request. The single Responses/Chat Completions request and 342
tokens visible in the supplied view belong to the prior 2026-07-27 spike, not
this attempt. Therefore this attempt stopped before a provider request was
recorded. The controller's
reported `request_total=1` was an accounting defect: it counted the transient
execution attempt rather than an observed adapter request. The remote runner
was corrected after the attempt to report `UNKNOWN` unless it observes the
runner's fixed `observed_requests` line.

No retry was made. No response body, request body, marker text, credential
value, recognizable credential prefix, provider error or host/account
identifier was printed or retained.

## Cleanup

- production credential source removed;
- transient execution cleanup reported PASS;
- CloudShell controller and transfer bundle removed;
- local clipboard cleared;
- application activation, migration, symlink change and service restart
  remained zero.

The owner revoked the key used for the failed attempt and issued a new key,
which was not installed or used. A new credentialed spike remains prohibited
until the transient execution failure is isolated, corrected and Gate A is
rerun.

## Follow-up

Use a production-free/systemd-only diagnostic with a synthetic local
credential and a no-network runner to isolate the transient-unit startup
failure. Any later OpenAI request requires a new bounded approval after the
root cause is corrected and Gate A is rerun.
