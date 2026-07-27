# Production application deployment runbook

This runbook implements PLAN-0004 Task 6. It does not authorize a production
change. G5 owner approval is required before creating or changing the operator,
opening an SSH session, installing credentials or assets, or changing services.

## G5 approval record

Record only non-secret metadata:

- exact Lightsail host name, instance ARN and Seoul region;
- exact release commit and archive SHA-256;
- rendered operator-policy SHA-256 and attached IAM principal;
- credential kinds required by each service, never values or fingerprints;
- maintenance-window start/end and rollback owner.

Stop if any item is absent or differs from the approved value.

## Least-privilege operator

Use a dedicated named IAM principal with MFA and no long-lived access key.
Render `deploy/iam/waw-production-operator-policy.json.tmpl` with the account ID
and the Lightsail instance UUID returned by read-only inventory:

```sh
node scripts/render-production-operator-policy.mjs \
  deploy/iam/waw-production-operator-policy.json.tmpl \
  /tmp/waw-production-operator-policy.json \
  123456789012 \
  01234567-89ab-cdef-0123-456789abcdef
```

The template allows only the Lightsail console's regional bootstrap read,
instance inventory and temporary SSH access. It grants no IAM, S3, DNS,
snapshot, instance lifecycle or firewall mutation. Some
Lightsail read APIs do not support resource-level permissions, so those actions
use `Resource: "*"` but remain bounded by Seoul region, MFA and a fixed action
allowlist. Temporary SSH access is restricted to the exact instance ARN.

Before attachment, validate JSON, record its SHA-256, run IAM policy simulation,
and prove:

- allowed: the listed read actions and `GetInstanceAccessDetails` on the exact
  production instance with MFA in `ap-northeast-2`;
- denied: another instance, no MFA, another region, instance create/delete,
  lifecycle, snapshot, domain, public-port, IAM and S3 actions.

Do not add `AWSCloudShellFullAccess` or `LightsailFullAccess`. If the console
needs broader access, stop and request a separate time-bounded owner decision.

## Read-only host preflight

The first SSH session is inspection-only. Capture status without secret values:

1. Confirm Ubuntu 24.04, available memory and disk space.
2. Confirm `waw-backup.timer` and `waw-monitor.timer` are enabled and active;
   their latest services succeeded and the verified backup marker is fresh.
3. Confirm journald is active and the accepted retention drop-in is unchanged.
   Do not vacuum the journal.
4. Inventory listening ports, systemd units, Caddy/default-site state,
   `/opt/waw`, service users and `/etc/waw-credentials`. Stop on conflicts.
5. Read schema version and migration hashes through the approved migration
   credential without printing the connection string. Do not run migrations.
6. Re-read Lightsail instance state, ports and alarm. No firewall mutation is
   part of Task 6; public DNS, 80/443 and certificate authority remain Task 7.

Stop on inactive timers, stale backup, failed monitoring, schema/hash mismatch,
insufficient capacity, an unexpected listener/unit/config, or credential-path
conflict. Preserve the host and collect metadata-only evidence.

## Deployment and rollback boundary

After a clean preflight and explicit continuation:

1. Stage the exact immutable release and verify its archive and lockfile hashes.
2. Install service users, root-only credential sources and systemd assets.
3. Validate units and Caddy configuration without granting public authority.
4. Start web on loopback, verify storage, then start exactly one bot and verify
   its singleton/Gateway health.
5. Recheck backup, monitoring, journald and alarm after each bounded step.
6. Switch `/opt/waw/current` only after health passes.

The production units require these exact inputs:

- web file credentials: `web-database-url`, `web-oauth-client-secret`,
  `web-csrf-key`;
- bot file credentials: `bot-discord-token`, and the separately scoped
  `bot-database-url` for the `waw_bot` application role;
- web non-secret environment: production auth environment, Discord client ID,
  exact canonical origin/redirect, guild ID, operator/admin role IDs, provider
  timeout and release version;
- bot non-secret environment: guild ID and the same operator/admin role IDs.

Never place credential values in the environment files. Apply pending
`0003_session_recent_auth.sql` and `0004_dashboard_settings.sql` only through a
separately approved Supabase migration gate before starting the new web
release. The `0004` migration creates the singleton low-risk setting and grants
only `waw_web` read/update access; `waw_bot` remains denied.

PLAN-0005 adds `0005` feature tables and command audit inserts for `waw_bot`.
Do not materialize `bot-database-url`, apply `0005`, restart the bot or register
Discord commands until the corresponding production migration and credential
gate is separately approved.

PLAN-0006 adds the `0006` durable administrator-command terminal result table.
Task 2 disposable verification does not authorize applying `0006` to Supabase,
changing a production credential or enabling the administrator IPC transport.

The repository units define the administrator IPC as disabled by default with
`WAW_ADMIN_COMMAND_IPC_ENABLED=0`. The reviewed host rollout must create the
`waw-admin-command` group before either unit starts, verify
`/run/waw-admin-command` is `waw-bot:waw-admin-command` mode `0750`, and verify
the socket is mode `0660`. `waw-web` may receive only supplementary group
membership; it must not receive the bot token or bot database credential.
Changing the feature flag or host group/unit remains a separate owner gate.

Task 6 process-boundary evidence used disposable Ubuntu 24.04 and PostgreSQL 17.
It verified directory `0750`, socket `0660`, `waw-web` access, unrelated-user
denial, crash-stale restart, bounded connections, timeout reconciliation and
audit rollback. This evidence does not authorize creating the production group,
installing units, applying migration `0006` or enabling the feature flag.

The Riot administrator dashboard routes must not receive direct `waw_bot`
database mutation capability. Until an accepted local-command IPC contract
connects web authorization to the bot-owned executor, production ports return
`riot_admin_ipc_unavailable` and HTTP 503. Do not work around this by granting
feature-table writes to `waw_web`.

The bot service pins `WAW_GAME_OBSERVATION_ENABLED=0`. Candidates containing
the approved Riot Spectator adapter still remain default-off. Do not change the
flag to `1` until the exact candidate is deployed, the bot-only credential is
verified without disclosure, and the consented propagation spike in ADR-0016
has passed. Releases without the adapter fail fast when enabled; never run a
partial scheduler.

For the Supabase session pooler, preserve encrypted libpq-compatible TLS
semantics in the file credential with both `sslmode=require` and
`uselibpqcompat=true`. Without the compatibility flag, the Node PostgreSQL
driver treats `require` as certificate-chain verification and rejects the
pooler's certificate chain. Never print the rendered connection string while
validating these parameters.

Use `deploy/manage-production-release.sh stage` with the approved source archive
SHA-256. `activate` changes only the immutable symlink; service restart and
loopback `/health` verification remain explicit bounded runbook steps.
`rollback` restores only the recorded previous release and does not reverse
compatible database migrations.

On failure, disable the application Caddy route, stop the web/bot units, restore
the previous release symlink and credential-source version atomically, and
recheck existing backup/monitoring/journald. Do not roll back the compatible
schema. Revoke a new provider credential only after the restored release is
healthy.

Root is break-glass only. Record reason, start/end and action names without
account IDs, tokens, session identifiers or secret material, then log out.

## Public ingress activation

This section implements PLAN-0004 Task 7 and requires the separate G6 approval.
Before activation, record the existing DNS answer and Lightsail IPv4/IPv6
firewall rules. Do not expose the Fastify loopback port.

1. Install the official stable Caddy package and preserve the staged Caddyfile.
2. Validate `deploy/caddy/Caddyfile.production`, then install it as root-owned
   `/etc/caddy/Caddyfile`.
3. Publish only `waw.dubeom.com A 54.180.239.42`; do not publish the instance
   IPv6 address unless an explicit AAAA decision is made.
4. Permit TCP 80 and 443 for IPv4 and IPv6 in Lightsail. Keep port 18080
   private.
5. Start Caddy and verify certificate issuance, HTTP-to-HTTPS redirect,
   canonical HTTPS health, wrong-host denial and loopback-only Fastify.
6. Register exactly
   `https://waw.dubeom.com/auth/discord/callback` in the Discord application,
   then verify allowed-role login, denied-role login and logout.
7. Only after the public certificate is valid, deploy monitoring with
   `waw-web.service`, `waw-bot.service`, `caddy.service`, loopback health and
   `waw.dubeom.com` certificate checks enabled.

Rollback in reverse order: disable OAuth login, restore the previous Discord
redirect and DNS record, restore the validated staged Caddyfile, and close
80/443. Keep web/bot on loopback and do not delete Caddy certificate state with
an application release.
