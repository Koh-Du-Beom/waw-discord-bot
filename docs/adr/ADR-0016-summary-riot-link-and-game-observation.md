# ADR-0016: Conversation summary, Riot account links, and game observation

- Status: Proposed
- Date: 2026-07-25
- Owners: Product owner
- Related requirements: FUN-004, FUN-005, FUN-010 through FUN-015, PRI-001 through PRI-003, OWN-007, OWN-008, OWN-010 through OWN-012, OWN-015
- Related research: `docs/research/technology-options/discord-platform.md`, `docs/research/technology-options/riot-platform.md`, `docs/research/technology-options/summary-api-constraints.md`
- Supersedes:
- Superseded by:

## Context

The product needs three connected capabilities:

1. summarize a bounded Discord channel or thread conversation;
2. link one Discord member to one or more Riot accounts;
3. compare official Riot ranked-solo game observations with Discord Go Live observations.

Riot Sign On requires separate production approval. Until it is available, an
administrator-approved link is permitted by `OWN-015`, but must not be
represented as official Riot ownership verification. Discord message content
must not be persisted or written to logs.

## Decision drivers

- Preserve complete coverage of the requested summary range without silent truncation.
- Keep raw Discord message content ephemeral.
- Support members who actively use multiple Riot accounts.
- Prevent one Riot account from being actively assigned to multiple Discord members.
- Keep Riot and Discord observations separate so an outage or missing signal is not treated as misconduct.
- Make game-event correction and cancellation auditable and administrator-only.
- Allow RSO and a summary provider to be added without changing the domain model.

## Considered options

### Option A: one Riot account per Discord member

Simple, but does not match members who play on alternate accounts and would
encourage account replacement or manual workarounds.

### Option B: many Riot accounts per Discord member, globally unique active PUUID

Supports alternate accounts while preventing conflicting ownership. Riot ID is
display metadata; PUUID and platform identify the link.

### Option C: unrestricted many-to-many links

Flexible, but creates ambiguous game ownership and unsafe automated comparison.

## Decision

Choose Option B and the following boundaries.

### Commands

- `/summary start:<time> end:<time>` summarizes the current channel or thread.
- `/riot link riot-id:<name#tag> platform:<platform>` requests a link.
- `/riot list [member]` lists active links visible to the caller.
- `/riot unlink account:<account>` removes the caller's link.
- `/game status [member]` shows Riot and Go Live observations separately.
- `/game correct event:<event> ...` and `/game cancel event:<event> reason:<reason>`
  are administrator-only corrections.

Command responses use Korean user-facing text. Stable command identifiers remain
English to simplify Discord registration, documentation, and support.

### Conversation summary

- Read only the current channel or thread.
- Accept an explicit range no longer than 24 hours.
- Fetch Discord history with stable cursor pagination until the full requested
  range has been covered.
- Fail explicitly when permissions, deletion, rate limiting, or pagination make
  complete coverage unverifiable.
- Keep raw messages only in request memory and never persist or log them.
- Produce `핵심 논의`, `결정`, `할 일`, and `미해결` sections.
- Put provider-specific inference behind a `ConversationSummarizer` port. No
  external provider is selected by this ADR.

### Riot account links

- A Discord member may have zero or more active Riot accounts.
- An active PUUID may belong to only one Discord member.
- Store PUUID, platform, current Riot ID display fields, verification method,
  timestamps, and optional primary-account status.
- Before RSO approval, links require an administrator decision and are labeled
  `admin_approved_unverified`.
- After RSO approval, new official links use `rso_verified`; migration does not
  silently upgrade earlier administrator-approved links.
- Never request or store Riot passwords, session data, or OAuth authorization codes.

### Riot and Discord observations

- Poll the official Riot spectator API through a `RiotGameObserver` port.
- Treat ranked solo as queue ID `420`, with the queue mapping kept configurable.
- Observe Discord Go Live from Voice State `self_stream` and reconcile current
  state after reconnect.
- Persist normalized state transitions and evidence metadata, not raw Riot
  responses or unrelated participant data.
- Keep Riot state, Go Live state, and comparison result as separate fields.
- Use `unknown` for missing, rate-limited, or unavailable evidence.
- Apply the accepted five-minute start grace and two-minute interruption allowance.
- Deduplicate Riot observations by platform and game ID.

## Rationale

The 1:N link model matches real member behavior without weakening the identity
boundary. Separate observation streams avoid turning API failures into false
claims. Ports let RSO and the summary provider be selected only after their
external approvals and operational constraints are known.

## Consequences

### Positive

- Members can register alternate Riot accounts.
- Ownership conflicts are blocked by a database constraint.
- Summary and observation logic can be tested without external credentials.
- Provider and API outages degrade to explicit unknown states.

### Negative

- Administrator-approved Riot links require manual review until RSO is approved.
- Polling and reconciliation add scheduling and rate-limit complexity.
- A usable summary command still requires a separately approved inference provider.

### Risks

- Discord message permissions or deleted messages can make full-range summaries impossible.
- Riot spectator propagation may not meet the five-minute target in every case.
- Go Live events can be missed during Gateway disconnects and require reconciliation.
- Administrator approval is not proof of Riot account ownership.

## Validation

- Database tests prove Discord-member 1:N and active-PUUID global uniqueness.
- Pagination tests cover over 100 messages, boundary timestamps, deletion,
  permission loss, 429, timeout, and cancellation.
- State-machine tests cover duplicates, reconnect, five-minute grace,
  two-minute interruption, unknown evidence, correction, and cancellation.
- A consented Discord/Riot spike must validate Go Live and spectator propagation
  before automatic production judgments are enabled.
- Logs are scanned with message-content, token, Riot ID, and PUUID canaries.

## Rollback or migration

- Disable the command registrations and schedulers without deleting links or audit records.
- Preserve observation records for correction history, subject to retention policy.
- Remove a disputed active link by closing it with `removed_at`; do not reassign
  the PUUID without an explicit new approval or RSO verification.

## Conditions for reconsideration

- Riot changes RSO, spectator, queue, or rate-limit policy.
- Discord changes Message Content or Voice State access.
- The five-minute observation target fails the approved spike.
- Product policy permits a different account-ownership or summary-data boundary.

## Approval

- Owner decision:
- Approved date:
