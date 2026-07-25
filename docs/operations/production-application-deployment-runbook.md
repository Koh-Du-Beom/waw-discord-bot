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

On failure, disable the application Caddy route, stop the web/bot units, restore
the previous release symlink and credential-source version atomically, and
recheck existing backup/monitoring/journald. Do not roll back the compatible
schema. Revoke a new provider credential only after the restored release is
healthy.

Root is break-glass only. Record reason, start/end and action names without
account IDs, tokens, session identifiers or secret material, then log out.
