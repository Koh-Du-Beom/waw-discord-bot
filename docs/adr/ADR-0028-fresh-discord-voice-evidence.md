# ADR-0028: Fresh Discord Voice evidence for game observations

- Status: Accepted
- Date: 2026-07-31
- Owners: Product owner
- Related requirements: FUN-010, FUN-013, FUN-015, DAT-005
- Related research: `docs/research/technology-options/data-flow-and-threat-model.md`
- Supersedes:
- Superseded by:

## Context

Production evidence from four anonymized ranked-solo games showed one incident
remaining `open/grace`, one becoming `confirmed/violation`, and two becoming
`open/compliant`. The user independently confirmed that Discord Go Live was not
active for any of the four games.

The scheduler currently caches the latest Discord Voice State and reuses it on
each 30-second Riot poll. Persistence records the poll time as `observed_at`,
not the time at which the underlying Voice State event or reconciliation was
observed. A cached `active` value can therefore look like fresh evidence and
produce `compliant` without preserving enough metadata to distinguish a new
event, a reconciliation result, or an old cached state.

The first game disappeared from Spectator before the accepted five-minute start
grace elapsed. Spectator alone cannot prove its duration or recover the missing
post-grace evidence.

## Decision drivers

- Do not treat old Discord evidence as current proof of compliance.
- Preserve external-event time separately from scheduler processing time.
- Reconcile even while the Gateway appears healthy because individual events
  can be missed without a disconnect signal.
- Keep reconciliation bounded so member fetches do not overlap or create an
  unbounded Discord rate-limit load.
- Preserve the accepted five-minute grace and two-minute interruption policy.
- Do not infer a violation from a Spectator disappearance during grace.
- Keep Match-V5 recovery and recent-match display behind a separate decision
  and implementation gate.

## Considered options

### Option A: Continue treating the cached Voice State as current

This requires no change but cannot distinguish fresh and stale `active`
evidence. It can continue producing false `compliant` decisions.

### Option B: Preserve evidence time, expire cached evidence, and reconcile periodically

Each Discord observation carries its source observation time separately from
the Riot poll time. Evidence older than an approved freshness window becomes
`unknown` until a Voice State event or successful reconciliation refreshes it.
A single-flight periodic reconciliation refreshes current states while the
Gateway is healthy.

### Option C: Reconcile all Discord members before every Riot poll

This maximizes freshness but repeats an expensive guild-member fetch every 30
seconds and can recreate the startup rate-limit failure already observed in
production.

## Decision

Choose Option B.

- Add a source observation timestamp to normalized Discord evidence.
- Keep the scheduler poll timestamp as the comparison and persistence
  processing timestamp.
- Persist the two meanings separately; do not overwrite source time with poll
  time.
- An `active` or `inactive` Discord observation older than the configured
  freshness window becomes `unknown` for comparison.
- A successful Voice State event or targeted reconciliation refreshes the source
  observation time.
- Reconcile only distinct Discord users in the current observation target set
  through Discord's current user Voice State boundary instead of requesting the
  full guild member list.
- Run targeted reconciliation every two minutes while the Gateway is healthy.
- Treat Discord evidence older than three minutes as stale. This leaves one
  minute beyond the expected reconciliation point for bounded completion while
  expiring evidence before it can span the accepted five-minute start grace by
  itself.
- Permit only one reconciliation in flight per guild and do not start another
  run while it is pending.
- A reconciliation failure leaves evidence `unknown`; it does not refresh the
  timestamp or infer inactive.
- Reconciliation and freshness intervals must be explicit validated runtime
  settings with defaults of two and three minutes respectively. Freshness must
  be greater than reconciliation and no greater than the accepted five-minute
  start grace.
- Do not automatically confirm an incident that disappears from Spectator
  during the five-minute grace.
- Record such an incident without changing it to `violation`; Match-V5
  post-game verification is a separate future ADR and feature gate.

## Rationale

Freshness is part of the meaning of external evidence. Keeping source and
processing timestamps separate makes the decision auditable, while `unknown`
preserves the existing fail-closed policy when current evidence cannot be
proved. Discord documents a per-guild rate limit for requesting all guild
members and separately exposes a current user Voice State resource. Targeted
single-flight reconciliation is therefore narrower than repeating the full
member fetch used at startup.

Spectator disappearance is not sufficient proof that a game ended or lasted
beyond grace. Deferring that case avoids replacing one false-negative risk with
an unsupported automatic violation.

## Consequences

### Positive

- Cached `active` cannot indefinitely suppress a valid violation.
- Stored evidence shows when Discord state was actually refreshed.
- Healthy-Gateway missed events can be repaired.
- Match-V5 recovery remains isolated from the live observation path.

### Negative

- Reconciliation adds one bounded current-state read per distinct observation
  target every two minutes.
- Expired evidence produces more `unknown` decisions during Discord failures.
- An additive migration is required to preserve both timestamps.
- Grace-only missed games remain unconfirmed until a future Match-V5 decision.

### Risks

- The three-minute freshness window can create `unknown` periods when a
  two-minute reconciliation is delayed by more than one minute.
- Targeted current-state reads can still encounter Discord rate limits.
- A late reconciliation response could overwrite a newer Gateway event unless
  generation ordering is enforced.
- Reconciliation cannot prove historical Go Live state for an already ended
  game.

## Validation

- An anonymized regression proves source observation time differs from poll
  time.
- A cached `active` value older than the freshness window compares as
  `unknown`, not `compliant`.
- A fresh event or reconciliation restores normal comparison.
- Periodic reconciliation occurs while the Gateway remains healthy, is
  single-flight, and does not run again before its interval.
- A late reconciliation response cannot overwrite a newer Voice State event.
- Reconciliation timeout, rate limit, and provider failure leave `unknown`.
- A game disappearing during grace remains non-violation and is marked for
  future Match-V5 verification without calling Match-V5.
- Existing five-minute grace, two-minute interruption, deduplication, one-stack,
  and one-alert tests remain green.

## Rollback or migration

Before activation, keep the observation feature default-off for any release
that requires a timestamp migration. Rollback disables the new runtime path and
returns to the previous compatible release; additive evidence columns remain
preserved. Do not rewrite historical poll timestamps as if they were source
event timestamps.

## Conditions for reconsideration

- Discord exposes a stronger current or historical Go Live API.
- Measured reconciliation traffic cannot stay inside the accepted rate-limit
  boundary.
- Match-V5 post-game verification is accepted and supplies a separate recovery
  path.
- Product policy changes the five-minute grace or definition of sufficient
  compliance evidence.

## Approval

- Owner decision: On 2026-07-31 the owner approved Option B and delegated the
  exact interval recommendation to the bounded implementation plan. The
  accepted defaults are a two-minute targeted reconciliation interval and a
  three-minute evidence freshness window. Production access, migration
  application, deployment, credential and external-service changes remain a
  separate final gate.
- Approved date: 2026-07-31
