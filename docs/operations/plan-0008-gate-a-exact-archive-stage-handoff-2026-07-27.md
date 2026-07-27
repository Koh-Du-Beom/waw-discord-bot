# PLAN-0008 Gate A exact archive stage handoff — 2026-07-27

- Status: PASS; production mutation approval required
- Candidate commit:
  `178525578fa9d28562bc5288867e1d9bdbf9b221`
- Release ID: `1785255`
- Source archive SHA-256:
  `1d0001a6dafa16ef333cebe47007904359eff284f2c6abc416fd8541fd288e14`
- Source archive bytes: `611578`
- Migration `0007` SHA-256:
  `32588ca4d830b7c2cd9f4c6d16c1046c16ac574375fd483dc899a6ae91eba4db`

## Repair

The Linux fixture failure was limited to its EXIT cleanup. The release manager
correctly made the staged tree read-only, but the fixture then attempted to
remove that tree without first restoring owner write permission.

Candidate `1785255` adds only `chmod -R u+w "$ROOT"` before the fixture's
existing `rm -rf`. The production release manager and its immutable staged
release contract are unchanged.

## CloudShell Linux evidence

An isolated AWS CloudShell session on Amazon Linux 2023 performed no AWS API,
production host, database, IAM, Lightsail, service or release mutation.

- The uploaded archive matched the exact SHA-256 and `611578` byte count.
- CloudShell's installed Node `20.20.2` was not used for the build.
- Official Node `24.18.0` was downloaded temporarily and its published
  SHA-256 was verified before use.
- `deploy/test-production-release-manager.sh` emitted
  `production_release_manager_test_passed`, exited `0`, and left zero matching
  `/tmp/waw-release-manager.*` fixture directories.
- `deploy/manage-production-release.sh stage` staged release `1785255` under
  an isolated temporary `WAW_INSTALL_ROOT`.
- The staged migration runner existed after production prune.
- All seven compiled SQL assets were byte-identical to their source files.
- Migration `0007` retained the reviewed SHA-256 above.
- Bot `WAW_SUMMARY_QUOTA_ENABLED` and web
  `WAW_DASHBOARD_QUOTA_ENABLED` remained exactly `0`.
- The staged release marker contained the exact source archive SHA-256.
- Final markers were `exact_archive_stage_passed`, `cleanup_complete rc=0`
  and runner exit `0`.
- Uploaded archive, runner, result, run log, temporary Node runtime, source,
  fixture and staged release were removed. Final matching `/tmp` and
  CloudShell home artifact counts were both `0`.

## Gate decision

Gate A exact archive stage passed. This evidence authorizes requesting, but
does not itself grant, owner approval for the bounded production mutation.

The requested next approval is limited to the exact candidate, release ID,
archive hash and byte count above:

1. Reconfirm production is still on release `86f06fb`, schema max version is
   `6`, ledger version `7` is absent, both quota flags are `0`, health is
   green and failed units are `0`.
2. Obtain the migration-owner database URL through hidden input and repeat
   the credential, connection, schema, permission and workload-role preflight.
3. Apply migration `0007` once with the exact staged built runner and verify
   ledger checksum, schema, RLS, policies, grants, constraints and application
   roles.
4. Preserve rollback units, install the exact default-off units, activate
   `1785255`, restart bot and web sequentially, and complete local, canonical,
   timer, failed-unit, alarm, UI and API checks.

Quota activation is not included. Stop and roll back the application release
on any mismatch; do not reverse the additive schema.
