# PLAN-0005 consented Riot observation spike — 2026-07-27

- Status: Ready for separate production approval
- Scope: all active administrator-approved KR Riot links
- Default release state: `WAW_GAME_OBSERVATION_ENABLED=0`
- Quota changes: none

## Purpose

Validate the remaining external assumptions in ADR-0016 without treating
missing evidence as misconduct:

1. Spectator v5 reports a ranked-solo game within the accepted five-minute
   window.
2. Discord Gateway `VoiceState.streaming` reports Go Live transitions and can
   be reconciled after reconnect.
3. The scheduler persists separate Riot and Discord evidence without duplicate
   game incidents.

This spike does not prove Riot account ownership, does not enable RSO, and does
not authorize automatic punishment or public use.

## Preconditions

- Obtain fresh owner approval naming the exact candidate and time window.
- Confirm every target is an active link that its Discord member requested and
  an administrator approved under the product policy.
- Confirm the active release marker matches the approved archive.
- Confirm migration `0007`, healthy bot/web services, at least one active KR target,
  and a readable bot-only `riot-api-key` credential without printing values.
- Confirm the exact candidate unit remains default-off and quota flags are `0`.
- Preserve the active release and unit/drop-in files as rollback evidence.

Stop if consent, candidate identity, credential boundary, health, singleton, or
default-off flags do not match.

## Bounded procedure

1. Install a temporary root-owned systemd drop-in that sets only
   `WAW_GAME_OBSERVATION_ENABLED=1`; do not edit the immutable release.
2. Reload systemd and restart only `waw-bot`.
3. Require Gateway connected and canonical health healthy before observation.
4. Start a ranked-solo queue `420` game on one active target. Record only
   non-identifying timestamps and fixed outcome codes.
5. Observe once without Go Live during the five-minute grace, then start Go
   Live and verify separate Riot `active` and Discord `active` evidence.
6. Stop Go Live for less than two minutes and restore it to exercise the
   interruption allowance without creating a violation.
7. End the game and verify Riot `inactive`, one stable `(platform, gameId)`
   incident, increasing observation generations, and no duplicate incident.
8. Run `/몰랭검거 현황` and verify the two evidence streams remain separately
   labeled. Do not print PUUID, Riot ID, provider URLs, or response bodies.

## Stop conditions

Immediately disable the drop-in and restart the bot if any of these occur:

- bot restart loop, duplicate process, disconnected Gateway, or degraded health;
- 401/403, repeated 429 after `Retry-After`, sustained 5xx/timeout, malformed
  response, or identifier-bearing logs;
- a non-queue-420 game is persisted as observed;
- missing evidence is promoted from `unknown` to compliant or violation;
- duplicate incidents, partial Riot/Discord evidence, or unconsented targets.

## Rollback

Remove only the temporary observation drop-in, reload systemd, restart
`waw-bot`, and require connected Gateway plus healthy local and canonical
health. Preserve normalized observation and incident rows for audit and
correction; do not delete schema or linked accounts. Revoke the Riot credential
only for suspected exposure or provider instruction.

## Pass criteria and remaining gate

Pass requires the start, Go Live, interruption, reconnect if exercised, and end
transitions above with identifier-free diagnostics and no duplicate incident.
The flag returns to `0` after the spike even on pass.

The current persistence model records a `violation` comparison on an `open`
incident; it does not automatically transition the incident to `confirmed` or
maintain a numeric stack total. Therefore this spike can approve continuous
observation, but automatic one-stack accumulation requires a separately
reviewed state transition and regression test before permanent activation.
