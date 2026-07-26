# Administrator command IPC production rollout

- Status: Draft execution checklist — owner approval required
- Scope: PLAN-0006 Task 8 only
- Canonical domain: `https://waw.dubeom.com`
- Local/disposable prerequisite: PLAN-0006 Tasks 1~7 GREEN

This runbook does not authorize production access or mutation. AWS, Supabase,
system users/groups, systemd units, credentials, release activation and feature
flags require a separate owner-approved maintenance window. Do not print a
database URL, token, OAuth/session value, PUUID or Riot ID while collecting
evidence.

## Blocking prerequisites

Stop before rollout unless all of the following are resolved:

1. The owner approves the exact production identities, maintenance window,
   release commit/archive hash and rollback owner.
2. Read-only AWS and Supabase preflight is separately approved.
3. A new encrypted pre-migration backup no older than 24 hours has passed an
   empty-target PostgreSQL restore rehearsal.
4. The production schema version and migration checksums match the reviewed
   migration sequence. Only pending additive migrations may run.
5. `waw-admin-command` is absent or has exactly the intended membership:
   `waw-bot` owns the socket and only `waw-web` receives client membership.
6. The existing member-role socket, backup, monitoring, Caddy, DNS and HTTPS
   are healthy and have no path/group conflict.
7. A Riot PUUID validation provider and its credential boundary are separately
   approved before claiming that approval commands are functional. Without it,
   `riot_link_request_approve` must remain visibly `validator_unavailable`.

## Gate A — read-only preflight

After explicit approval, collect metadata-only evidence:

1. Confirm the canonical DNS/HTTPS endpoint and `/health` response without
   changing DNS, firewall or Caddy.
2. Record active release ID, exact Git commit/archive SHA-256, previous immutable
   rollback release and service versions.
3. Read systemd unit definitions and effective environment names. Confirm both
   administrator IPC feature flags are `0`.
4. Confirm `waw-web` has no bot token or bot database credential and `waw-bot`
   has no OAuth secret, CSRF key, browser session or web database credential.
5. Inventory `/run/waw-admin-command`, users, groups, supplementary membership,
   listeners, disk capacity and failed units. Stop on any unexpected state.
6. Through the approved migration identity, read schema versions, migration
   checksums, RLS policies and grants without rendering the connection string.
7. Confirm backup/monitor timers and their latest services are healthy.

Any mismatch stops Task 8. Do not repair it inside the preflight.

## Gate B — backup and migration

This gate requires a second explicit approval containing the exact database
project, migration versions and reviewed checksums.

1. Create a fresh encrypted backup and verify it in a disposable empty
   PostgreSQL target.
2. Stage the reviewed immutable release but do not activate it.
3. Apply only pending additive migrations in order with the one-shot migration
   credential. PLAN-0006 requires `0006_admin_command_result.sql`; if earlier
   versions are pending, their separate approved prerequisites still apply.
4. Read back version/checksum, table constraints, RLS and grants.
5. Revoke or remove the one-shot migration credential.

Do not down-migrate on application rollback. Preserve operation, terminal result
and audit rows.

## Gate C — bot server rollout

1. Create `waw-admin-command` and the reviewed membership without modifying
   `waw-member-role`.
2. Install the reviewed units with feature flags still `0`; validate them before
   daemon reload.
3. Activate the immutable release and restart only the bot.
4. Observe only fixed Gateway state fields and fixed reason-code counts for at
   least 45 seconds. Require lifecycle `ready`, Gateway `connected` and member
   reconciliation `current`. The wait covers two 15-second reconciliation
   attempts and the 2-second retry delay. Roll back on
   `gateway_member_reconciliation_retry_exhausted`, or when the required state
   is not reached within the bounded observation window.
5. Confirm singleton ownership and existing Gateway/member-role health.
6. Set only the bot administrator IPC flag to `1`, restart the bot, then verify:
   - directory `waw-bot:waw-admin-command` mode `0750`;
   - socket `/run/waw-admin-command/admin-command.sock`;
   - socket owner/group `waw-bot:waw-admin-command`, mode `0660`;
   - unrelated-user denial and bounded local health;
   - no PUUID, Riot ID, token, OAuth/session value or provider body in logs.

Do not enable the web client until the bot server is healthy.

## Gate D — web client and external verification

1. Set only the web administrator IPC flag to `1` and restart the web service.
2. Verify `/`, immutable assets and `/health` before administrator operations.
3. With an approved administrator account, verify bounded list pagination,
   stale 409, unavailable 503 and timeout 504/result reconciliation.
4. Verify web pre-dispatch and bot terminal audits correlate by operation ID
   without payload, PUUID or Riot ID.
5. Verify duplicate delivery does not repeat a mutation.
6. Verify the canonical external endpoint again and inspect allowlisted logs.

Approval must not be reported as functional while the PUUID validator remains
unconfigured.

## Immediate rollback

On any failure:

1. Set the web administrator IPC flag to `0` and restart web, restoring the
   explicit 503 fail-closed ports.
2. If the bot socket is implicated, set its flag to `0`, restart bot and verify
   the existing member-role socket and Discord commands remain healthy.
3. Restore the previous immutable release if the application release is
   implicated.
4. Preserve additive schema, operation results and audit evidence.
5. Remove the administrator runtime socket/directory and group membership only
   after both services are disabled and no approved consumer remains.
6. Recheck `/health`, backup, monitoring, journald and canonical HTTPS.

Record only timestamps, release IDs, fixed reason codes and pass/fail evidence.
Do not record credentials, account identifiers, request payloads or message
content.

ADR-0018 permits Account API existence-only validation after the bot-only
`riot-api-key` credential is installed. A successful validation does not prove
ownership and every resulting link remains `admin_approved_unverified`.
