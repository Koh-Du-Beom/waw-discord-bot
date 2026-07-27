# ADR-0021: Summary command rolling-hour cooldown

- Status: Accepted
- Date: 2026-07-27
- Owners: Product owner
- Supersedes: ADR-0019 quota semantics only

## Context

The owner replaced the configurable daily summary allowance with one simpler
cost boundary: `/요약` may be dispatched once per registered user per rolling
hour. Command-log pagination from ADR-0019 remains unchanged.

## Decision

- Scope the restriction only to `/요약`.
- Reserve immediately before summary-provider dispatch.
- Serialize decisions by locking the existing registered-user row.
- Allow when no successful reservation exists in the preceding 60 minutes.
- Preserve operation-ID idempotency and consume a reservation even when the
  provider later fails or times out.
- Remove the daily default, per-user override, Korean-date counter, reset, and
  quota-management UI from the active production assembly.
- Keep summary enforcement default-off. Game observation is independent.

Migration `0008` removes the daily database structures while retaining the
minimal reservation ledger. Previous releases remain safe after migration
because their quota and dashboard quota flags are default-off.

## Validation

- Twenty concurrent attempts by one user produce one reservation.
- The same operation is idempotent.
- `59:59.999` is denied and exactly `60:00.000` is allowed.
- A different user has an independent cooldown.
- Migration `0001` through `0008`, RLS, workload grants, build, and immutable
  archive staging pass on disposable Linux/PostgreSQL.

## Approval

The owner explicitly approved implementation of the rolling-hour contract and
removal of the daily-limit model on 2026-07-27.
