# PLAN-0008 migration packaging repair handoff — 2026-07-27

- Status: packaging repair verified; production deployment not started
- Candidate commit:
  `f126ce3462fecd503425e48a6c5d144fafda8b5c`
- Release ID: `f126ce3`
- Source archive SHA-256:
  `76cbae5aea2d7213fb0cd978e56f8a6d1981eb984a7af41ed3d0d1898e804435`
- Source archive bytes: `610034`
- Migration `0007` SHA-256:
  `32588ca4d830b7c2cd9f4c6d16c1046c16ac574375fd483dc899a6ae91eba4db`

## Failure and repair

The previously approved `5c8d7da` archive staged successfully, but its
production build did not copy SQL migration assets into `dist/migrations`.
The built migration runner resolves its SQL files relative to that directory,
so its production invocation failed with the fixed
`migration_unexpected_failure` reason before opening a migration transaction.
Immediate read-only verification found schema version `6` and no migration
ledger row for version `7`.

The repair makes `build:server` copy every canonical `migrations/000*.sql`
asset into a freshly recreated `dist/migrations` directory. The production
release manager now refuses staging unless the built migration runner exists
and every source migration has an identical readable compiled asset. Its
fixture covers the runner and SQL asset contract.

No migration SQL, quota behavior, unit flag, database policy, DNS, firewall,
certificate, backup schedule, or monitor configuration changed.

## Verification

Local verification used Node `24.18.0` and a short `TMPDIR` for macOS Unix
socket compatibility.

- `npm run typecheck`: passed.
- `npm run build`: passed and reported
  `migration_assets_copied count=7`.
- All seven `dist/migrations/000*.sql` files were byte-for-byte identical to
  their source files.
- `bash deploy/test-production-application-assets.sh`: passed.
- `TMPDIR=/tmp npm test`: 245 tests, 238 passes, seven explicit skips, zero
  failures.
- A fresh extraction of the exact archive completed `npm ci --ignore-scripts`,
  typecheck, build, and `npm prune --omit=dev`.
- The pruned archive stage retained the built migration runner and seven
  identical SQL assets.
- The staged bot and web assets retained
  `WAW_SUMMARY_QUOTA_ENABLED=0` and
  `WAW_DASHBOARD_QUOTA_ENABLED=0`.

`deploy/test-production-release-manager.sh` is Linux-specific because the
production manager uses GNU `mv -T` and the test uses GNU `stat -c`. Run that
test and the exact release-manager stage on Linux before requesting the
production mutation gate.

## Production state after the failed attempt

The failed runner invocation caused no database or service mutation:

- active release remained `86f06fb`;
- schema max version remained `6`;
- migration ledger version `7` was absent;
- production bot, web, and Caddy remained active;
- backup and monitor timers remained active and enabled;
- loopback and canonical health were healthy;
- failed systemd units were `0`;
- the one-shot migration credential and transient failed-unit state were
  removed;
- temporary CloudShell SSH material was removed.

The previous staged directory `/opt/waw/releases/5c8d7da` is not an approved
deployment candidate after this packaging failure. Do not patch it in place or
reuse it for migration execution.

## Next gate

Before any production mutation:

1. Obtain owner approval for the exact commit, release ID, archive hash, byte
   count, and unchanged migration `0007` hash listed above.
2. On an isolated Linux target, verify the archive hash, run
   `deploy/test-production-release-manager.sh`, and stage the exact archive
   through `deploy/manage-production-release.sh stage`.
3. Confirm the staged runner and all seven compiled SQL assets exist and match
   their source hashes after production prune.
4. Reconfirm both quota flags are exactly `0`, current release is `86f06fb`,
   schema max version is `6`, ledger version `7` is absent, health is green,
   and failed units are `0`.
5. Obtain the migration-owner database URL through hidden user input and
   repeat the credential, connection, schema, permission, and workload-role
   preflight without printing the URL or provider data.
6. Execute migration `0007` once with the exact staged built runner and perform
   the complete schema, ledger, checksum, RLS, policy, grant, constraint, and
   application-role verification.
7. Only after the migration verifies, preserve rollback units, install the
   exact default-off units, activate `f126ce3`, restart bot and web
   sequentially, and complete local, canonical, timer, failed-unit, alarm,
   UI, and API checks.

Production mutation remains separately owner-gated. Quota activation is not
part of this candidate deployment.
