# Application persistence migration runbook

- Status: Task 1 local/disposable contract and G1 production migration verified; Task 2 not started
- Scope: `PLAN-0004` Task 1, `ADR-0006`, `ADR-0007`, `ADR-0013`
- Production domain: `https://waw.dubeom.com`

## Implemented boundary

- `migrations/0001_auth_and_operations.sql` preserves the already-deployed version 1 baseline. `0002_application_persistence.sql` adds OAuth state, five-minute role cache, constraints, indexes, workload roles, policies and grants.
- All application data tables have RLS enabled. `waw_web` can use the application tables; `waw_bot` can use only `role_cache`. `PUBLIC` table access and public-schema create are revoked.
- `audit_event.operation_id` is an optional foreign key to the operation ledger. Session and authorization values have database checks.
- `src/persistence/postgres-persistence.ts` uses parameterized queries and transactions for session rotation, OAuth state consumption, operation dedupe plus audit append, role-cache expiry and database-size observation.
- `src/persistence/database-credential.ts` reads a database URL only from an absolute systemd credential directory. Provider errors are converted to fixed reason codes.
- `src/persistence/run-migration.ts` applies pending migrations in order, verifies checksums on resume and emits only applied versions or a fixed reason code.
- Migration checksums canonicalize `CRLF` and lone `CR` to `LF` before hashing.
  Resume also accepts the exact `CRLF` rendering checksum of the unchanged
  current migration text so the historical production 0001-0004 ledger remains
  valid across checkout platforms. Any change other than line endings remains
  a checksum mismatch. Newly applied migrations always record the canonical
  `LF` checksum.
- `migrations/0005_summary_riot_game.sql` adds additive Riot link, normalized
  link-request, game/observation, incident and immutable revision tables.
  Requests remain `pending_admin_approval` until an administrator decision
  supplies a PUUID; they are never represented as ownership verification. Active PUUID and
  `(platform_id, game_id)` uniqueness are enforced by PostgreSQL. Web remains
  read-only for these tables; bot mutation access is limited to the feature
  tables and command operation/audit inserts.
- `migrations/0006_admin_command_result.sql` adds the bot-only durable terminal
  result table for PLAN-0006. It stores only operation ID, allowlisted command,
  allowlisted outcome/reason and completion time; Riot IDs, PUUIDs, Discord
  message content and provider responses are excluded.
- `PostgresRiotCommandStore` commits link requests, unlink, administrator
  approval and their command audit in one transaction. A PUUID conflict keeps
  the request pending and commits a fixed failure audit; an audit write failure
  rolls the domain mutation and operation ledger back.
- Dashboard administrator command dispatch writes a separate
  `dashboard.admin_command.dispatch` audit event before IPC transmission. It
  correlates by operation ID without claiming the bot-owned operation ledger
  row and excludes request payload, Riot ID and PUUID. Audit failure prevents
  transport dispatch.
- Administrator decisions use a request `version` read from the pending list.
  Approval and rejection lock the row and require the same version; stale or
  already-decided requests cannot create a link. PUUID validation is a separate
  port and only its normalized value enters the approval transaction.

The migration creates non-login capability roles. Production login role creation, membership and credential materialization remain G1 operations and must use distinct credentials from backup and future bot/web runtimes.

## Local/disposable verification

PostgreSQL 17 must provide `initdb`, `pg_ctl` and a Unix socket. The integration test creates a temporary trust-authenticated cluster, uses synthetic records only and removes the cluster after the run.

```bash
node --test \
  src/persistence/database-credential.test.ts \
  src/persistence/postgres-persistence.integration.test.ts
npm test
npm run typecheck
```

The test must prove:

- Migration transaction, checksum/version record, reapplication rejection and failed-migration rollback.
- Exact legacy version 1 fingerprint adoption, version 2 forward upgrade, resumability and changed-checksum rejection.
- RLS, foreign key and actual web/bot allow/deny grants.
- Session rotation/revoke, idle clamping, OAuth single-use/expiry and five-minute role cache.
- One winner from 16 concurrent operation attempts and audit failure rollback.
- Non-secret DB-size snapshot and provider-error canary absence.
- Temporary PostgreSQL process and directory absence after the test.

On Windows without host `initdb`, the same migration sequence may be verified
in an ephemeral official PostgreSQL 17 container. The container must be removed
after schema versions 1 through 6, active-PUUID uniqueness and game-key
deduplication are checked. This does not authorize production migration.

## G1 owner gate

Do not connect to production or use a production credential until the owner approves an exact G1 execution window. Approval must identify:

1. Exact Supabase project and migration role; do not record their values in chat or Git.
2. SHA-256 and reviewed diff of both migration files.
3. Read-only current schema version, database size/quota, active connections and role-creation capability.
4. Active/enabled production backup and monitor timers and a latest verified backup no older than 24 hours.
5. A new pre-migration encrypted archive and empty-target verification.
6. Exact login-role membership/grant plan for web and bot, with separate credentials.
7. Maintenance window, stop condition, corrective-forward/restore owner and post-change checks.

PLAN-0004 approval and Task 1 local completion do not approve G1.

## 2026-07-23 production read-only preflight

- PostgreSQL is 17.6. The database was `10,661,011` bytes (about 2.13% of a decimal 500 MB quota), with five other active connections.
- The inspected identity was not superuser but could create roles and databases; `public` schema usage/create was available to that identity.
- Production contains the historical version 1 baseline: `app_schema_version=1`, three empty application tables, RLS enabled, no policies, no workload roles and no `waw_schema_migration` ledger.
- Therefore the previously expanded `0001` was not production-safe. It was replaced locally by the preserved baseline plus forward `0002`; exact legacy fingerprint adoption and mismatch refusal are disposable-tested.
- Reviewed hashes are `0001=337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10` and `0002=fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d`.
- During the first SQL-editor attempt, stale editor content also executed `alter role waw_backup bypassrls`. Repository bootstrap policy already requires that exact role attribute, and read-back remained `rolbypassrls=true`, non-superuser, non-createdb and non-createrole. No effective permission change was detected. Subsequent checks used new empty snippets only.
- Existing Lightsail alarm configuration was read back without modification. At `2026-07-23T06:03:30Z`, backup and monitor timers were active/enabled, both last service results were `success`, journald was active, and the next backup was scheduled for `2026-07-24 03:06:35 UTC`.
- The latest publication completed at `2026-07-23T03:10:12Z`, was `published`, schema version 1, expected row count 0 and 10,398 seconds old. The marker and monitor credential were mode `0600`; journal usage was 35.9 MB and filesystem free space was 37,456,715,776 bytes.

No schema, row, credential, backup, timer, journald, monitoring or AWS resource was intentionally changed. No backup was created and no journald vacuum was run. The current publication is fresh enough for preflight, but G1 still requires a new migration-compatible encrypted archive plus empty-target verification after owner approval.

## 2026-07-23~24 G1 execution

- Owner approved the exact `0001` and `0002` hashes and production execution.
- A new pre-migration archive completed at `2026-07-23T06:22:56Z`: status `published`, schema version 1, expected row count 0, encrypted bytes 7,084, invariant `constraints_valid`, and backup service result `success`.
- The exact archive and manifest alone were downloaded through a temporary Get-only IAM user. Other-object Get, Put and Delete were denied; SHA-256 and 7,084-byte size matched the manifest.
- Wrong identity rejection and valid offline identity restore to disposable PostgreSQL 17 passed with schema version 1, row count 0 and invalid constraint count 0.
- The temporary IAM user/key/policy, downloaded archive/manifest, decrypted dump, ephemeral SSH material and restore container were removed.
- Production exact legacy v1 fingerprint matched. Baseline ledger adoption and exact `0002` ran in one transaction; versions `[1,2]` and both approved checksums read back correctly.
- Five workload tables had RLS enabled, six expected policies existed, `waw_web`/`waw_bot` remained non-login least-privilege roles, PUBLIC access remained denied, row count was 0 and invalid constraint count was 0.
- Backup/monitor timers and journald remained active, timers enabled, service results successful and the Lightsail alarm `OK`. No vacuum or original-project restore ran.
- The independent `journal.dropped` false critical was caused by treating `journalctl --grep` no-match exit `1` as invalid despite zero suppression lines. The bounded production fix accepts only exit `1` with empty stdout/stderr as zero and leaves other failures invalid. Ten clear observations produced a resolved notification; monitoring, backup, journald and the alarm remained healthy.

## Future production execution

After G1 approval only:

1. Capture the read-only preflight and verify no unexpected schema/role conflict.
2. Publish and verify the pre-migration archive without changing the existing schedule.
3. Stage the migration database URL as a root-owned `database-url` source for a one-shot systemd credential context. Do not use an environment variable, argument or shell trace.
4. Execute `node src/persistence/run-migration.ts` from the exact reviewed release.
5. Read back migration version/checksum, RLS policies, grants and application-role smoke tests.
6. Confirm backup and monitoring timers remain active/enabled and no credential or raw session/token entered the journal.
7. Revoke/remove the one-shot migration credential after the application roles are verified.

If role creation or RLS/grant behavior differs from the disposable contract, stop. Do not broaden privileges or edit production manually; assess whether a corrective plan or Proposed ADR is required.

## Rollback

Migrations are forward-only and application traffic does not depend on version 2 before later Tasks. On failure:

- Do not run destructive down SQL.
- Do not restore into the original Supabase project without a separate owner decision.
- Disable/revoke the new application and migration credentials.
- Keep the existing backup, journald and monitoring services running.
- Use a reviewed corrective forward migration, or restore the verified archive into a disposable empty target to diagnose.

Any suspected partial change, unexpected role, residual credential or missing backup/monitor state blocks Task 2.
