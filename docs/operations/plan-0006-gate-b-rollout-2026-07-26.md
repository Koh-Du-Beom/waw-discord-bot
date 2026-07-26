# PLAN-0006 Task 8 Gate B rollout — 2026-07-26

- Status: Gate C blocked; production rolled back healthy
- Canonical domain: `https://waw.dubeom.com`
- Previous production release: `1943fd8`
- Reviewed candidate: `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b`
- Reviewed source archive SHA-256:
  `7a72e9fe5bc2c9b3ed87ca86e60efae7b1033ac47b62c3f33c39b63b65c7d27b`

## Owner-approved recovery exception

A fresh encrypted backup completed successfully before migration. Its local
publication marker is valid, fresh, `published`, mode `0600`, and records schema
version `4`, a positive encrypted byte count and a 64-character SHA-256.

The offline owner recovery identity is available only on a separate Mac and
could not be brought into this execution environment. On 2026-07-26 the owner
explicitly accepted the resulting recovery risk and deferred the fresh
empty-target restore rehearsal until 2026-07-27. This is a one-run exception to
the normal blocking prerequisite; it does not change the backup policy or make
the archive `verified`.

The rollout must still stop on migration checksum mismatch, unexpected schema
objects, failed constraints or grants, failed service health, capability
boundary drift, or feature-gate behavior inconsistent with the reviewed plan.
Application rollback must preserve the additive schema. The deferred rehearsal
remains a required follow-up.

## Archive branch assessment

A Git archive branch can preserve a convenient name for a source commit, but it
is mutable and cannot restore PostgreSQL data. The existing full commit IDs,
reviewed immutable source archive hash, and previous release directory are the
actual code rollback evidence for this rollout. Do not create or push an archive
branch during the database gate. After successful rollout, an immutable signed
release tag is preferable to a branch if the owner wants an additional remote
code landmark; that is a separate Git remote mutation.

## Execution evidence

Populate this section only with non-sensitive timestamps, fixed outcomes,
schema versions/checksums, release IDs, health results and rollback decisions.
Do not record database URLs, tokens, OAuth/session values, PUUIDs, Riot IDs,
message content or provider payloads.

- The production migration ledger already contained versions `0005` and `0006`
  with the reviewed checksums. No migration was replayed. All seven queried
  application tables had RLS enabled, no invalid constraint was returned, and
  the reviewed web-deny/bot-allow result-table capability boundary matched.
- The active production release remained `1943fd8`. `waw-web`, `waw-bot`,
  `waw-backup.timer`, and `waw-monitor.timer` were active and enabled, and no
  failed unit was listed. The `waw-admin-command` group and socket were absent.
- The exact reviewed archive was transferred to the host and independently
  matched byte count `555010` and SHA-256
  `7a72e9fe5bc2c9b3ed87ca86e60efae7b1033ac47b62c3f33c39b63b65c7d27b`.
  Release `aaf5069` then passed production staging, including clean install,
  typecheck, server/web build, production prune, and entrypoint checks.
- Rollout stopped before group creation, unit installation, release activation,
  service restart, or feature-flag change. The reviewed bot unit runs with
  primary group `waw-member-role`, creates `/run/waw-admin-command` as mode
  `0750` without setgid, and the server only applies socket mode `0660`; it
  never assigns socket group `waw-admin-command`. Consequently the staged
  configuration cannot establish the required
  `waw-bot:waw-admin-command 0660` socket ownership for the web client.
  This is a release-design mismatch, not an operator repair to make in
  production. A reviewed corrective change and fresh immutable release are
  required before Gate C.

## Corrective release preparation

The corrective implementation keeps `waw-bot` on its existing primary
`waw-member-role` group, grants only the required `waw-admin-command`
supplementary group, and assigns a newly created administrator socket to the
group of its real, non-symlink parent runtime directory before applying mode
`0660`. It does not use a host-specific numeric GID and does not change the
existing member-role socket boundary.

Local unit tests, typecheck, build, and production asset checks passed. A
production-realistic Linux process check used primary group `waw-member-role`
and supplementary group `waw-admin-command`; it observed directory
`waw-bot:waw-admin-command 0750`, socket
`waw-bot:waw-admin-command 0660`, allowed the `waw-web` client, and denied an
unrelated user. The full local suite returned `202` pass, `7` explicit
PostgreSQL-tooling skips, and `0` failures.

This evidence prepares a replacement immutable release candidate only. The
previously staged `aaf5069` remains blocked and must not be activated.

## Corrective candidate Gate C attempt

- Owner-approved candidate:
  `d0d7a5dd1910fc6146d5ad05343918f7f8133e1b`
- Source archive SHA-256:
  `2cc2aa32452205eeb0d3bca4f1052232588b1e72c0708b312c4875d4d866c858`
- Source archive byte count: `558047`

The host independently verified the corrective archive and successfully staged
release `d0d7a5d`, including clean install, typecheck, build, production prune,
and release-marker verification. Gate C then created the reviewed
`waw-admin-command` group, added only `waw-web` as an OS group member, installed
the reviewed bot and web units with administrator IPC still disabled, validated
the units, activated the immutable release, and attempted to restart only the
bot.

The bot failed before application startup with systemd result
`243/CREDENTIALS`. Metadata-only inspection established that both required
application database credential files were absent:
`/etc/waw-credentials/bot-database-url` and
`/etc/waw-credentials/web-database-url`. No credential value was rendered.
The previous production bot unit required only the Discord bot token, so this
was a missing production application-persistence prerequisite rather than the
corrective socket ownership implementation failing.

Immediate rollback restored the previous bot and web units and active release
`1943fd8`. After restart and a bounded settling interval, `waw-bot`, `waw-web`,
`waw-backup.timer`, and `waw-monitor.timer` were active, `/health` returned
`healthy`, and systemd listed no failed unit. Administrator IPC was never
enabled, the web service was never restarted on the corrective candidate, and
Gate D was not entered. Additive schema state was preserved.

The corrective release remains staged. A retry is blocked until the owner
separately approves and materializes distinct least-privilege web and bot
database login-role memberships and root-owned credential files. The bot
credential must not be copied from the web runtime or backup/migration
identities. Preserve the required TLS connection parameters and do not expose
either connection string in terminal output, logs, documentation, or chat.

## Credential materialization and second Gate C attempt

The owner approved separate `waw_web_runtime` to `waw_web` and
`waw_bot_runtime` to `waw_bot` login-role memberships and TLS-preserving
credential materialization. Both login roles were read back as inheriting,
non-superuser, non-createdb, non-createrole, non-replication, and
non-bypass-RLS. Intended memberships were present and cross-memberships were
absent. The host authenticated each runtime over TLS before atomically
installing separate root-owned mode `0600` credential files. The bounded
handoff rows were consumed and its unlogged, RLS-enabled handoff table was
dropped immediately afterward.

The second Gate C attempt activated `d0d7a5d` with administrator IPC still
disabled, but the bot failed before `ExecStartPre` with systemd result
`226/NAMESPACE`. The candidate unit requires
`/run/waw-admin-command` as a mandatory `ReadWritePaths` entry while relying on
`ExecStartPre` to create that same volatile path. Mount namespace setup occurs
first, so a clean boot or clean runtime directory cannot start the service.
Automatic rollback again restored release `1943fd8`; bot and web were active
and systemd listed no failed units.

Manually pre-creating the directory would make this maintenance attempt pass
but would leave the next reboot unsafe. The release therefore remains blocked.
The minimal corrective change makes only the volatile administrator path an
optional `ReadWritePaths` entry, retaining `ExecStartPre` ownership and mode
enforcement. A fresh immutable release and explicit approval are required
before another Gate C attempt.

## Replacement candidate staging and Gate C retry

The owner approved replacement candidate
`ebc1ec334cb425216e469dcdf03205b0fcc7e388` with source archive SHA-256
`80cb9cb4ecfa0331c28f52e818b7278ab01798a309c02e1b58aaed95ec8439e7`.
The host independently verified the 557728-byte archive and staged release
`ebc1ec3`; clean install, typecheck, build, production prune, and immutable
release-marker creation all passed.

Gate C confirmed that the optional volatile `ReadWritePaths` correction allows
the bot unit to start on a clean administrator runtime directory. With the bot
administrator IPC flag enabled, the directory was
`waw-bot:waw-admin-command` mode `0750`, the socket was
`waw-bot:waw-admin-command` mode `0660`, the web user had read/write access,
and an unrelated user had neither. The existing member-role socket remained
present, the bot and web units remained active, and no systemd unit failed.

Gate C did not pass because the replacement bot's Discord Gateway health did
not reach `connected` within the bounded observation window; loopback health
remained `degraded`. No fixed gateway failure reason code was emitted during
the attempts. Gate D was not entered. Automatic rollback restored release
`1943fd8` and the previous units. Final readback showed bot, web, backup timer,
and monitor timer active, loopback health `healthy`, and zero failed units.
The replacement release remains staged, but must not be activated again until
the Gateway connection regression is diagnosed and a fresh candidate receives
explicit approval.

## Gateway diagnostic assessment and replacement preparation

The previous candidate's process remained active and `client.login()` completed,
but the shared health snapshot stayed `disconnected`. The existing runtime
defines that outcome as either a non-ready lifecycle or incomplete/failed
member reconciliation. Because Discord login resolves only after the public
ready boundary and no normalized disconnect or gateway-event rejection was
recorded, the remaining production evidence narrows the failure to the
ready-to-member-reconciliation boundary. The old implementation silently
converted reconciliation exceptions to failed health and emitted neither the
failed stage nor the bounded runtime state, so the historical evidence cannot
safely distinguish guild fetch from member fetch without another candidate.

The next candidate adds only non-identifying diagnostics:

- fixed `gateway_guild_fetch_failed` and
  `gateway_member_reconciliation_failed` reason codes around the two
  reconciliation fetch stages;
- a deduplicated `gateway.state` event containing only lifecycle, shared
  gateway state, reconciliation state, and reconnect-attempt count;
- tests proving that sequence values, Discord identifiers, provider payloads,
  credentials, and exception text are not serialized.

This is diagnostic hardening, not evidence that the Gateway regression is
resolved. A future Gate C must first observe `gateway.state` reach
`ready`/`connected`/`current`. If it does not, the fixed reason code and
allowlisted state event determine the next bounded correction without exposing
Discord or credential data.
