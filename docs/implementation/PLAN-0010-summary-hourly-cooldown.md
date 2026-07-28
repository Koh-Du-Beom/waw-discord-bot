# PLAN-0010: Summary rolling-hour cooldown

- Status: Approved
- Related ADR: ADR-0021
- Owner: Product owner

## Scope and success

1. Add migration `0008` to remove daily default, override, and counter state.
2. Reuse the reservation ledger and registered-user row lock for one accepted
   `/요약` reservation per rolling hour.
3. Keep summary enforcement, dashboard quota, and game observation flags `0`.
4. Pass deterministic unit tests, disposable PostgreSQL 17 concurrency and
   migration tests, full regression, production asset checks, and exact Linux
   archive staging.
5. Freeze a new immutable candidate and write a production-mutation-free Gate A
   handoff.

## Dashboard alignment follow-up

On 2026-07-28 the active source was aligned with ADR-0021 by removing the
superseded daily quota DTO, API, persistence mutation, UI and web feature flag.
The redacted command-log contract from ADR-0019 remains. Local validation and
the production read-only canonical health check passed; exact candidate
preparation and production activation remain separately gated.

Production migration, release deployment, summary-provider credential,
provider activation, Discord registration, and game-observation activation are
outside this plan and require their own gates.
