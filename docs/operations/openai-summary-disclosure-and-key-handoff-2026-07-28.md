# OpenAI summary disclosure and key handoff — 2026-07-28

- Status: disclosure implementation PASS; dedicated credential installation PASS
- Owner decision: approved recommended disclosure and data-processing policy

## Current provider boundary

The OpenAI API data-control documentation was rechecked on 2026-07-28. API
inputs and outputs are not used for training by default. Default
abuse-monitoring logs may contain customer content and may be retained for up
to 30 days. The WAW Responses request uses `store:false`, which prevents
Responses application-state storage but does not remove default
abuse-monitoring retention.

## Published product surfaces

The approved Korean disclosure is now part of:

- the authenticated dashboard summary settings panel; and
- the private `/도움말` response.

The source implementation and tests are complete. Production users will see
the new surfaces after the disclosure release is activated. No direct Discord
announcement was sent because the product has no approved announcement-channel
authority and selecting recipients or channels implicitly would widen the
approved messaging scope.

## Verification

- tests: `261`, pass `254`, explicit skip `7`, fail `0`;
- TypeScript typecheck: PASS;
- server and web production build: PASS;
- production dependency audit: zero vulnerabilities;
- diff whitespace check: PASS;
- provider calls, Discord messages and production changes: `0`.

## Dedicated credential installation

The owner created the dedicated project key and copied it without placing it in
chat or the repository. The one-time handoff installed only the production
credential source with root ownership and mode `0600`.

- bot-user direct source read: denied;
- bot service PID and start timestamp: unchanged;
- service restart: `0`;
- provider request: `0`;
- provider and rolling-hour quota flags: exact `0`;
- controller, CloudShell, remote and local key transients: removed.

The next bounded task is to package and activate the disclosure release, add
the bot-only `LoadCredential=summary-api-key` declaration, then enable provider
and rolling-hour quota together with health, singleton, redaction and rollback
verification.
