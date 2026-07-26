# ADR-0018: Riot PUUID existence validation

- Status: Accepted
- Date: 2026-07-27
- Owners: Product owner
- Related requirements: OWN-007, OWN-015, PRI-002
- Related research: `docs/research/technology-options/riot-platform.md`
- Supersedes:
- Superseded by:

## Context

Administrator approval of a pending Riot account link currently fails closed
because the production bot has no `PuuidValidationPort` adapter. Riot approved
the private, non-commercial `WAW /몰랭검거` League of Legends application and
issued a Personal API key. RSO remains unavailable, so this integration cannot
prove that the Discord member owns the Riot account.

## Decision drivers

- Keep administrator-approved links visibly distinct from RSO verification.
- Reject nonexistent PUUID input before creating a link.
- Keep the Riot credential in the bot process only.
- Never log or audit API keys, PUUIDs, Riot IDs, provider bodies, or identifying
  URL paths.
- Fail closed during provider, credential, rate-limit, or network failure.
- Stay within the approved small private community and Personal-key limits.

## Considered options

### Option A: Account API existence validation with a Personal key

Call the official regional Account API by PUUID. A matching successful response
proves only that the identifier exists. It does not prove account ownership.

### Option B: Spectator API lookup

This validates only accounts currently in a visible game, so an offline player
would be incorrectly rejected.

### Option C: RSO ownership verification

This is the strongest ownership evidence but requires a Production application
and separate RSO approval that are not currently available.

### Option D: Keep the validator unavailable

This preserves the current fail-closed state but leaves the approved
administrator workflow unusable.

## Decision

Choose Option A.

- The bot reads `riot-api-key` from its systemd credential directory.
- The adapter uses HTTPS and the fixed `asia.api.riotgames.com` host for the
  supported KR platform.
- The request path is built from a strictly validated PUUID and is never logged.
- HTTP 200 is valid only when the bounded JSON response contains the exact same
  PUUID. The normalized stored value is the validated input.
- HTTP 404 is `invalid_puuid`.
- Unsupported platform input is `platform_mismatch`.
- HTTP 401, 403, 429, 5xx, timeout, malformed/oversized response, redirect, and
  network failure are provider unavailability and must not mutate the request.
- No automatic retry occurs in the administrator mutation path. A later
  operator retry is a new audited attempt.
- Links remain `admin_approved_unverified`; UI and audit must not call this
  ownership verification or RSO verification.
- Personal-key usage remains limited to the approved private community and
  documented Riot rate limits.

## Rationale

The Account API can reject nonexistent identifiers without falsely claiming
ownership. Spectator lookup has the wrong availability semantics, while RSO is
not yet approved. A bot-only systemd credential reuses the accepted credential
boundary and avoids exposing the key to the dashboard.

## Consequences

### Positive

- Gate D approval can reject nonexistent PUUIDs before mutation.
- The web process never receives the Riot credential.
- Provider outages remain explicit and fail closed.

### Negative

- Administrator review remains responsible for ownership evidence.
- Personal-key limits constrain future polling volume.
- The bot gains a bounded outbound HTTPS dependency.

### Risks

- Riot can revoke or change the Personal application or API.
- A valid PUUID can still be submitted for the wrong Discord member.
- Accidental URL/error logging could expose an identifier unless all errors are
  normalized at the adapter boundary.

## Validation

- Unit tests cover exact match, mismatch, 404, unsupported platform,
  401/403/429/5xx, redirect, timeout, malformed and oversized responses.
- Canary tests prove key, PUUID, Riot ID and provider bodies are absent from
  errors and logs.
- systemd verification proves only `waw-bot` can read `riot-api-key`.
- Gate D exercises list, invalid approval, valid approval or non-destructive
  reconciliation, duplicate result lookup, stale version, and audit records
  without printing identifiers.

## Rollback or migration

Remove `LoadCredential=riot-api-key`, restore the unavailable validator, restart
only the bot, and verify Gate D returns `validator_unavailable`. Existing links
remain unchanged and retain `admin_approved_unverified`.

## Conditions for reconsideration

- Riot grants Production and RSO access.
- The application becomes public or exceeds Personal-key limits.
- Riot changes Account API routing, identifier policy, or product approval.
- Ownership evidence rather than existence validation becomes required.

## Approval

- Owner decision: Approved as proposed, including Account API existence-only
  semantics, `admin_approved_unverified`, bot-only systemd credential,
  identifier-free diagnostics, production rollout, and Gate C/D validation.
- Approved date: 2026-07-27
