# PLAN-0010 summary hourly cooldown Gate A handoff — 2026-07-27

- Status: Gate A PASS; production mutation approval pending
- Candidate commit: `2ac0996070fc89667d9d1c2cd698ff35ea14af7d`
- Release ID: `2ac0996`
- Archive SHA-256:
  `86c1520a01b49d7e38131f9f25b4235b0447c22ada612832bd6944db7267e66f`
- Archive bytes: `618752`
- Production mutation performed: none
- Feature-flag mutation performed: none

## Exact change

- Replaced daily `/요약` quotas with one provider reservation per registered
  user per rolling hour.
- Reused the registered-user row as the PostgreSQL concurrency lock and retained
  operation-ID idempotency.
- Added migration `0008`, which removes the daily default, per-user override,
  Korean-date counter, and reset model while retaining the reservation ledger.
- Removed legacy dashboard quota activation from the production web assembly.
- Kept `WAW_SUMMARY_QUOTA_ENABLED=0`,
  `WAW_DASHBOARD_QUOTA_ENABLED=0`, and
  `WAW_GAME_OBSERVATION_ENABLED=0`.

No provider credential, Discord registration, production schema, release,
service, quota flag, game-observation flag, or Riot state changed.

## Verification evidence

- Local full suite:
  `247 tests / 240 pass / 7 explicit external-URL skips / 0 fail`.
- Disposable PostgreSQL 17 direct cooldown test:
  `1 pass / 0 fail`.
  Twenty concurrent attempts produced one reservation; duplicate operation,
  `59:59.999` denial, exact `60:00.000` acceptance, and another user's
  independent allowance passed.
- Clean PostgreSQL 17 Linux full suite:
  `247 tests / 240 pass / 7 explicit external-URL skips / 0 fail`,
  marker `postgres_17_full_test_passed`.
- Typecheck, server/web build, production application asset contract, and
  `git diff --check`: passed.
- The deterministic archive was generated twice with
  `git archive --format=tar 2ac0996 | gzip -n`; both streams matched.
- Clean `node:24-bookworm` exact archive stage:
  - archive hash and byte count matched;
  - release-manager and application-asset fixtures passed;
  - clean install, typecheck, build, production prune, and zero-vulnerability
    production dependency audit passed;
  - eight source/compiled migrations were byte-identical;
  - immutable marker matched and writable-file count was zero;
  - all three relevant feature flags were `0`;
  - final marker was `EXACT_ARCHIVE_GATE_A_PASS`.
- AWS CloudShell `Linux` exact archive stage:
  - uploaded bytes re-read as SHA-256
    `86c1520a01b49d7e38131f9f25b4235b0447c22ada612832bd6944db7267e66f`
    and `618752` bytes;
  - official Node.js `v24.18.0` archive checksum passed;
  - release-manager and production-application asset fixtures passed;
  - clean install, typecheck, build, production prune, and zero-vulnerability
    audit passed;
  - eight source/compiled migrations were byte-identical;
  - immutable marker matched, writable-file count was zero, and summary quota,
    dashboard quota, and game observation flags were all `0`;
  - final marker:
    `CLOUDSHELL_GATE_A_PASS candidate=2ac0996 ... writable=0 flags=0,0,0 migrations=8`.

The first migration test failed because PostgreSQL truncated an automatically
generated foreign-key name to 63 bytes. Migration `0008` was corrected to use
the actual catalog name and then passed fresh and resume verification.

## Production boundary

CloudShell reverified this exact archive without production mutation.
Production migration `0008` drops the obsolete daily quota tables and setting,
so applying it requires a fresh verified backup and separate exact owner
approval. Stop on any archive, schema, ledger, permission, or flag mismatch.

Application rollback preserves schema version `8`; the previous default-off
release remains operational because neither legacy quota path is assembled
while its flags are `0`. Do not enable summary quota until the chosen provider,
credential boundary, synthetic Korean-summary spike, and real-message retention
decision pass their separate gates. Do not enable game observation as part of
this change.
