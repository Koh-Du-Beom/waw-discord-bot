# PLAN-0008 Gate A checksum repair handoff — 2026-07-27

- Status: PASS; production mutation approval required
- Candidate commit:
  `1d9a1fa37e0049a9de4281704d369e35ae7ee275`
- Release ID: `1d9a1fa`
- Source archive SHA-256:
  `867aa6e4b64906626d3c322c661f10c8da8af2e5e5075d167ef147f5225855b4`
- Source archive bytes: `611980`
- Migration `0007` SHA-256:
  `32588ca4d830b7c2cd9f4c6d16c1046c16ac574375fd483dc899a6ae91eba4db`

## Root cause

Candidate `1785255` stopped before migration or release activation with
`migration_checksum_mismatch`. Read-only production diagnostics proved that
the CRLF historical checksums for migrations `0003` and `0004` are accepted by
the exact staged compiled module. Versions `0001` through `0004` and `0006`
all returned `accepted=true`.

The actual mismatch is migration `0005`. Its production ledger value is 62
characters:

`d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66d71f97972b71d32a`

The reviewed canonical migration `0005` SHA-256 is:

`d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66a6d71f97972b71d32a`

The ledger value omitted the two characters `a6` during the historical
production recording. Prior PLAN-0006 Gate B evidence already verified the
resulting version-5 schema, seven RLS-enabled application tables, constraints
and workload capability boundary. No migration SQL or production schema was
changed during this diagnosis.

## Repair

The compatibility exception accepts the exact 62-character production value
only when both conditions hold:

1. the migration version is exactly `5`; and
2. the supplied SQL has the exact reviewed canonical migration `0005` hash.

A different version or any changed migration `0005` text remains rejected.
Canonical LF and byte-identical CRLF behavior for all migrations is unchanged.

## Verification

- Targeted checksum tests: `4 pass / 0 fail`.
- Typecheck, server/web build and `git diff --check`: passed.
- Disposable PostgreSQL 17 full run:
  `246 tests / 239 pass / 7 explicit external-boundary skips / 0 fail`.
- The disposable resume test replaced ledger versions `0001` through `0005`
  with their exact production historical values, including the 62-character
  version-5 value, and safely resumed through migration `0007`.
- The immutable archive was generated twice with
  `git archive --format=tar 1d9a1fa | gzip -n`; the byte streams matched.
- Clean Linux `node:24-bookworm` exact archive stage:
  - release-manager fixture passed;
  - clean install, typecheck and build passed;
  - seven migration assets were byte-identical;
  - production prune reported zero vulnerabilities;
  - immutable release marker matched the exact archive hash;
  - compiled version-5 historical checksum acceptance passed;
  - the same checksum was rejected for version `4` and changed SQL;
  - staged writable-file count was zero.

The Linux container was disposable and removed automatically.

## CloudShell Gate A

AWS CloudShell in `ap-northeast-2` independently repeated the exact archive
stage on Amazon Linux 2023 without making any AWS API or production mutation.

- Uploaded archive SHA-256 and byte count matched the values above.
- Preinstalled Node `20.20.2` was not used for the build.
- Official Node `24.18.0` was downloaded temporarily and verified against its
  published `SHASUMS256.txt` entry.
- Release-manager fixture emitted `production_release_manager_test_passed`.
- Exact isolated stage completed clean install, typecheck, server/web build,
  seven byte-identical migration assets and production prune.
- Production dependency audit reported zero vulnerabilities.
- Compiled version-5 historical compatibility check passed while rejecting the
  same value for another version or changed SQL.
- Migration `0007` retained the reviewed source and compiled SHA-256.
- Bot and dashboard quota flags remained exactly `0`.
- Release marker matched the exact source archive SHA-256 and the staged tree
  had zero writable files.
- Final marker was `exact_archive_stage_passed`.

The first cleanup count was taken before the interactive shell's EXIT trap had
run and therefore showed the isolated stage and uploaded archive still present.
The exact validated directory and archive were then removed explicitly. Final
CloudShell `/tmp` and home matching artifact counts were both `0`.

Production database, service, release link, unit, feature flag, DNS, IAM and
network state were not changed. Candidate `1785255` remains staged but inactive
on the host.

## Production approval request

Gate A passed. Request owner approval for this exact bounded change:

1. Reconfirm active release, schema version `6`, absent migration `0007`,
   healthy canonical endpoint, active timers and zero failed units.
2. Stage exact release `1d9a1fa` on the production host and verify its archive
   marker, compiled compatibility check, migration assets and default-off flags.
3. Apply additive migration `0007` once with the exact staged runner and verify
   ledger checksum, schema, RLS, policies, grants, constraints and workload
   roles.
4. Preserve rollback units, install the exact default-off units, activate
   release `1d9a1fa`, and restart bot then web sequentially.
5. Verify singleton, local and canonical `/health`, canonical dashboard/login,
   logs, timers, failed units and alarm.

Stop before activation on any migration or unit mismatch. After activation,
restore the previous immutable release on service, health, login or capability
regression; preserve the additive schema. Quota enforcement and dashboard quota
activation are not included and remain a separate final gate.

## Production execution result

Owner approval was received for the exact candidate, migration `0007`, and
default-off release. Quota activation was explicitly excluded.

- The production host received an archive with the exact SHA-256 and byte count
  recorded above and staged immutable release `1d9a1fa`.
- The staged marker matched the archive, all staged files were non-writable, and
  dashboard quota, summary quota, game observation, and administrator IPC flags
  remained `0`.
- Migration `0007` was applied once by the exact staged compiled runner. Catalog
  verification found four required tables, four RLS-enabled tables, eight
  policies, no invalid constraints, the summary daily-limit column, and both
  web and bot workload boundaries.
- The first activation check observed HTTP 200 with a semantically degraded
  health body while the Discord Gateway was still reconnecting. The release and
  unit files were immediately restored to `86f06fb`; no schema rollback was
  attempted because migration `0007` is additive.
- A second activation used the same immutable release with a bounded Gateway
  readiness gate. Gateway connected after 25 seconds and local health became
  healthy 10 seconds after web restart.
- Final state: active release `1d9a1fa`, previous release `86f06fb`, one bot
  process, zero service restarts, zero failed units, active backup and monitor
  timers, and exact healthy local and canonical health bodies.
- Orca's embedded browser verified the production login screen, Discord OAuth
  callback, authenticated dashboard, connected Gateway and storage indicators,
  and the default-off summary setting.
- The pending `고두범#KR1` request passed Riot ID existence validation and was
  stored as an administrator-approved, unverified link. Reload showed no
  pending requests and a successful approval audit entry. This is not Riot RSO
  ownership verification.
- Exact transfer files in `/tmp` were removed after staging. The immutable
  release and rollback unit evidence were retained.

Automatic Riot game observation and stack accumulation remain disabled. The
accepted domain model, scheduler, evidence persistence, incident handling, and
Discord Go Live adapter exist, but the production Riot Spectator observer is
not assembled. Enabling `WAW_GAME_OBSERVATION_ENABLED` in this release fails
closed with `game observation adapter is not configured`; a new reviewed
candidate and a consented production spike are required before activation.
