# Dashboard policy-alignment audit — 2026-07-28

## Verdict

The dashboard refresh had reached `main`, but its daily summary-quota surface
was no longer valid after Accepted ADR-0021 replaced that policy with one
rolling-hour reservation per registered user. Production remained safe because
the legacy dashboard quota flag was `0`, but the source still contained a
feature-gated daily quota DTO, API, persistence mutation and React UI.

No new architecture decision is required. ADR-0021 already requires removal of
the daily default, per-user override, Korean-date counter, reset and quota
management UI from the active production assembly. ADR-0019 command-log
pagination remains valid.

## Production read-only observation

On 2026-07-28:

- `https://waw.dubeom.com/` returned HTTP `200`;
- `https://waw.dubeom.com/health` returned HTTP `200` and
  `{"status":"healthy"}`.

The unauthenticated check did not inspect private dashboard content, session
state, Riot data or identifiers.

## Preserved behavior

- canonical `https://waw.dubeom.com` origin;
- Discord OAuth, opaque session, CSRF, current-role and recent-auth boundaries;
- Riot administrator request review;
- redacted cursor command log;
- summary external-processing disclosure and low-risk enable setting;
- bot-side rolling-hour enforcement and reservation ledger;
- historical immutable migrations and audit rows.

## Removed stale active-source behavior

- daily quota DTOs and same-origin endpoint paths;
- dashboard quota read and administrator mutation ports;
- PostgreSQL reads and writes against structures removed by migration `0008`;
- session feature advertisement and web feature flag;
- daily quota React UI and browser client methods;
- production web unit declaration for the retired dashboard flag.

Historical release controllers and evidence that verify old exact candidates
remain unchanged for auditability.

## Validation

- `npm.cmd test`: 249 tests, 241 pass, 8 explicit PostgreSQL-tool skips,
  0 fail;
- `npm.cmd run typecheck`: PASS;
- `npm.cmd run build`: PASS, eight migration assets copied;
- `npm.cmd run test:browser`: PASS, one accessibility/keyboard test;
- `git diff --check`: PASS.

The PostgreSQL integration suite was not rerun because the required local tools
were unavailable. The removed dashboard code referenced tables already removed
by migration `0008`; rolling-hour persistence tests remain in the suite.

## Release gate

The source is locally ready for exact-candidate preparation, but production is
not yet authorized from this document alone. Before deployment:

1. commit the complete intended source and documentation state;
2. build and hash an exact immutable archive from that commit;
3. run the normal read-only production preflight and clean Linux archive stage;
4. identify current and previous release targets;
5. obtain owner approval for the exact activation and rollback change set;
6. activate, verify canonical root/health/OAuth/session/authorization and
   command-log behavior, then record rollback evidence.

Riot request creation, Riot API validation and game observation remain outside
this dashboard release.
