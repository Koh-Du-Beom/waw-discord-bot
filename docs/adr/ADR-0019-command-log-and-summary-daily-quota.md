# ADR-0019: Dashboard command log and summary daily quota

- Status: Accepted
- Date: 2026-07-26
- Owners: Product owner
- Related requirements: FUN-004, FUN-005, PRI-001 through PRI-003
- Related research: `docs/research/technology-options/summary-api-constraints.md`
- Supersedes:
- Superseded by:

## Context

The selected dashboard design makes two new capabilities primary:

1. a paginated table of Discord command usage; and
2. an administrator-managed daily limit for the summary command, initially 10.

The bot already writes allowlisted `discord.command` audit rows without message
or option values. The dashboard API currently reads only
`settings.summary.update` audit rows. Its settings contract contains only
`summaryEnabled` and `version`; no quota or usage contract exists.

The summary limit is a correctness and cost boundary, not only a presentation
value. Concurrent commands must not exceed it. The browser must not become the
authority, and command logs must not expose Discord, guild, channel, message,
session, OAuth, PUUID, correlation, or operation identifiers.

The initial product is a private friend-community service with one allowed
Discord guild. The owner requires per-registered-user management. The data model
therefore retains both guild and user boundaries so one member cannot consume
another member's allowance.

## Decision drivers

- Enforce the limit in the bot/application boundary before provider invocation.
- Remain correct under concurrent requests, retries, process crashes, and more
  than one bot attempt.
- Preserve the existing opaque-session, role revalidation, CSRF, recent-auth,
  optimistic concurrency, audit, and least-privilege contracts.
- Make Korean calendar-day behavior explicit.
- Reuse the existing PostgreSQL and React/Fastify patterns.
- Keep messages, command options, stable platform identifiers, and secrets out
  of the dashboard DTO and operational logs.
- Support deterministic cursor pagination without silently truncating history.

## Considered options

### Option A: Count command audit rows when each request arrives

Query today's successful `/요약` audit rows and allow the next command when the
count is below the limit.

This reuses existing data but a count followed by an insert races under
concurrency. Serializing the audit table or relying on isolation retries would
couple a general audit sink to a cost-control invariant. Existing command audit
also represents command outcome, not whether a provider invocation was
reserved.

### Option B: In-memory daily counter

Keep the count in the bot process and reset it at midnight.

This is simple but loses state on restart, does not coordinate duplicate
processes, and cannot provide a reliable dashboard read model.

### Option C: PostgreSQL default, per-user overrides, counter, and reservation ledger

Store the administrator-controlled default in the singleton dashboard setting
and an optional override for each registered user. For every allowed guild,
registered user, and Korean calendar date, atomically upsert a daily counter and
create one unique reservation per command operation. Dashboard reads use a
redacted aggregate; administrator mutations use expected versions and audit.

This adds schema and transaction work but gives an explicit invariant and an
independent record for retry/idempotency reconciliation.

## Decision

Adopt Option C.

### Quota semantics

- Scope: each registered Discord user within each allowed guild.
- Calendar: `Asia/Seoul`; quota date is derived server-side from the trusted
  command receipt timestamp, never browser input.
- Default and initial user limit: 10 provider invocation reservations per day.
- A registered user may inherit the default, receive a 1–100 override, or have
  summary use disabled by an administrator.
- Allowed configured range: 1–100. Disabling summaries remains the existing
  `summaryEnabled` setting and is not represented by a zero limit.
- Consumption point: after command input, channel, and authorization validation,
  immediately before an external summary-provider invocation is dispatched.
- A committed reservation consumes one use even if the provider later times out
  or fails. This enforces a hard cost-attempt ceiling and avoids retry-based
  bypass.
- Validation, authorization, range, history-completeness, or quota rejection
  before provider dispatch does not consume usage.
- The same stable command operation ID can read back its existing reservation
  but cannot consume twice.
- Manual usage reset or decrement is outside version 1. Corrections require a
  separately approved audited operation.
- Changing the default never overwrites user overrides. Changing a user limit
  never deletes reservations. Lowering it below current usage blocks only that
  user until the next Korean date.

### Data and transaction boundary

- Extend `dashboard_setting` additively with
  `summary_daily_limit integer not null default 10` and a `1..100` check.
- Add a registered-user record with the minimum current display label required
  by the private dashboard. Never return its Discord identity key to the browser.
- Add an optional versioned per-user limit override and enabled/disabled state.
- Add a per-guild, per-user, per-quota-date counter with uniqueness on
  `(guild_id, discord_user_id, quota_date)`.
- Add a reservation ledger unique by stable command operation ID and referencing
  the counter scope/date. It stores no message content or command options.
- In one PostgreSQL transaction, lock/upsert the counter, read the current
  setting, reject disabled/exhausted use or increment and insert the reservation,
  and append an allowlisted audit result. Audit failure rolls back the entire
  quota decision.
- The bot workload can reserve and read back its own result but cannot change
  the configured limit. The web workload can read redacted per-user aggregates
  and update defaults or overrides only through the authenticated service.
- Existing migrations remain immutable. The change uses the next additive
  migration.

### Dashboard command log

- Add a separate cursor-paginated dashboard endpoint for allowlisted
  `discord.command` events. Do not overload the settings-audit DTO.
- Sort by `(occurred_at, event_id)` descending and use an opaque bounded cursor.
- Default page size is 50; maximum is 100.
- DTO fields are limited to display timestamp, allowlisted Korean command label,
  synthetic/display-safe actor label when available, normalized outcome, public
  reason label, and optional bounded duration only if a trustworthy duration is
  added later.
- Version 1 must not return actor ID, guild ID, channel ID, event ID,
  correlation/operation ID, message content, command options, Riot identifiers,
  PUUID, OAuth/session data, or secrets.
- Command logs use the registered user's current display label when available
  and otherwise show `서버 멤버`. Names are not copied into every audit row.
- Filters are command and normalized outcome plus an explicit bounded time
  range. Pagination must expose `nextCursor`; the UI must not claim it covers a
  full range when more pages exist.

### Authorization

- Authorized operators and administrators may read redacted command logs and
  per-user quota status.
- Only administrators may change the default, a user override, or enabled state.
- The mutation retains same-origin CSRF, current role revalidation, optimistic
  settings version, structured audit, and fail-closed behavior. A daily limit
  change is a normal administrator mutation; it does not reset usage.

## Rationale

A durable reservation is the smallest model that distinguishes “provider call
budget consumed” from “Discord command eventually succeeded.” It permits a hard
daily ceiling without holding a database transaction open across a network
call. A separate redacted command-log DTO avoids turning internal audit storage
into a public schema and preserves the current settings-audit contract.

## Consequences

### Positive

- Concurrent summary commands cannot exceed each user's effective daily limit.
- Restart and retry do not reset or double-consume the quota.
- Operators can see current usage without receiving sensitive identifiers.
- Command activity becomes independently pageable and filterable.
- Existing settings and audit routes remain backward compatible.

### Negative

- A provider attempt that fails after reservation still consumes one use.
- A crash after reservation but before actual provider dispatch can consume one
  use. This is conservative for cost control but can underutilize the daily
  allowance.
- Registered display labels require explicit refresh and retention rules.
- Additional tables, retention policy, and indexes increase operational work.

### Risks

- Deriving dates in application code and database code differently could split
  one Korean day.
- A poorly indexed log query could compete with audit writes.
- Returning raw audit columns could disclose stable Discord or internal IDs.
- Treating provider failure as refundable could create retry-based limit bypass.
- Allowing manual reset in version 1 could weaken auditability.

## Validation

- Disposable PostgreSQL tests with at least 20 concurrent reservations for one
  user prove exactly 10 accepts, while another user's allowance is independent.
- Duplicate operation tests prove one reservation and stable readback.
- Fake-clock tests cover 23:59:59 to 00:00:00 in `Asia/Seoul`, including UTC date
  differences.
- Disabled, exhausted, lowered-below-use, provider failure, timeout, process
  restart, and forced audit-failure paths are verified.
- Web tests prove operator read, administrator mutation, non-admin denial, CSRF,
  stale conflict, inheritance, override/disable, and fail-closed behavior.
- Cursor tests cover equal timestamps, page boundaries, malformed cursors, full
  traversal, and no duplicated/skipped rows.
- DTO, logs, browser fixtures, and test output are scanned with canaries for
  message text, command option values, actor/guild/channel IDs, PUUID, OAuth,
  session, token, correlation, and operation identifiers.
- Orca built-in browser validates the selected Pretendard dashboard at desktop
  and 360 px mobile widths, keyboard focus order, table-to-list transformation,
  status labels, and WCAG AA.

## Rollback or migration

- Deploy schema additively with quota enforcement and new UI behind default-off
  feature gates.
- If the quota path fails, fail closed for summary provider invocation rather
  than bypassing the limit.
- Roll back the application to the previous immutable release and disable the
  new endpoint/UI. Preserve quota reservations and audit rows; do not drop or
  rewrite them during emergency rollback.
- A later data-removal migration requires a separate retention decision.

## Conditions for reconsideration

- The provider supplies a stricter authoritative per-project quota that can be
  safely queried atomically before use.
- The service supports multiple time zones or group/shared quota pools.
- Product policy decides only successful summaries should consume usage.
- Operators need audited manual credits/resets.
- Command volume makes direct audit-table pagination operationally unsafe.

## Approval

- Owner decision: Approved registered-user-specific management on 2026-07-26.
  Each registered user inherits the default 10 unless an administrator sets an
  override or disables that user. Existing Korean-day, atomic reservation,
  audit, authorization, and no-secret constraints remain.
- Approved date: 2026-07-26
