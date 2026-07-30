# ADR-0027: Confirm observed game violations

- Status: Accepted
- Date: 2026-07-30
- Owners: Product owner
- Related requirements: FUN-010, FUN-013, FUN-015
- Related research: `docs/research/technology-options/data-flow-and-threat-model.md`
- Supersedes:
- Superseded by:

## Context

The observation store currently records a policy violation on an `open`
incident. The stack query counts only `confirmed` incidents, and a later Riot
inactive observation overwrites the visible comparison with `compliant`.
Consequently the same evidence can trigger a public violation event without
producing one stack, while a completed game can appear normal.

## Decision drivers

- Keep the public alert, incident status and stack count consistent.
- Preserve the first policy-compliant violation decision for audit and
  administrator correction.
- Keep duplicate polls and later game-end observations from adding stacks or
  downgrading a confirmed incident.
- Reuse the accepted schema and correction workflow.

## Considered options

### Option A: Keep incidents open for manual confirmation

This preserves the current behavior but leaves automatic detection disconnected
from stack accumulation and the public alert.

### Option B: Confirm the first observed policy violation

The transaction that first persists `comparison_state = 'violation'` also sets
the incident to `confirmed`. Terminal incident states reject later observation
updates while normalized evidence continues to be stored.

### Option C: Confirm only after Match-V5 end verification

This could add end evidence but introduces a new API, routing, rate-limit and
propagation boundary that has not passed the approved spike.

## Decision

Choose Option B.

- A first `violation` insert or transition sets `status = 'confirmed'`.
- A confirmed incident keeps its `violation` comparison when later active or
  inactive observations arrive.
- A legacy `open/violation` incident is promoted on its next observation
  without emitting the first-violation event again.
- Only the first violation transition returns `violation_recorded`, so it
  produces one public alert and one stack.
- `corrected` and `cancelled` remain administrator-only terminal changes.
- Match-history backfill and production observation activation remain separate
  operational gates.

## Rationale

The accepted research model defines `confirmed` as an incident satisfying the
policy evidence and deduplication conditions and assigns it one stack. The
comparison executor already applies those conditions, and the database unique
key already supplies deduplication. Reusing that transaction is the smallest
consistent change.

## Consequences

### Positive

- Automatic violations appear in the existing stack query.
- End observations cannot erase a confirmed decision.
- No schema migration or new dependency is required.

### Negative

- Games missed while observation is disabled or unavailable are not recovered.
- Existing incidents whose violation comparison was already overwritten cannot
  be repaired without separate historical evidence review.

### Risks

- A false positive becomes visible immediately and requires the existing
  administrator correction or cancellation path.
- An alert delivery failure followed by a process restart can still lose the
  in-memory retry; durable delivery is outside this decision.

## Validation

- PostgreSQL integration proves violation-to-confirmed transition.
- A later inactive observation preserves `confirmed` and `violation`.
- The existing stack read model returns exactly one stack.
- Scheduler tests continue to prove one notification for the first violation.

## Rollback or migration

Revert the observation-store update. Existing confirmed incidents remain
auditable and must not be bulk-downgraded.

## Conditions for reconsideration

- Match-V5 end verification passes an approved spike.
- Product policy introduces manual review before public alerts.
- Durable notification delivery is required across process restarts.

## Approval

- Owner decision: After receiving the diagnosis and proposed
  violation-to-confirmed correction, the owner instructed the agent to proceed
  with the work.
- Approved date: 2026-07-30
