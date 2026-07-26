# PLAN-0006 Task 8 Gate B rollout — 2026-07-26

- Status: In progress
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
