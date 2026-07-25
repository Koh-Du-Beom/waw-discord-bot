# PLAN-0004 resume handoff

- Date: 2026-07-24
- Checkpoint: Tasks 1~5 local/disposable, G1 and production assembly complete; G2/G3, production migrations `0003`~`0004` and G5~G7 pending
- Canonical plan: [`PLAN-0004`](./PLAN-0004-application-production-rollout.md)
- Persistence runbook: [`application-persistence-runbook`](../operations/application-persistence-runbook.md)
- Authentication runbook: [`authentication-runbook`](../operations/authentication-runbook.md)

## Current evidence

- Approved migration hashes:
  - `0001=337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10`
  - `0002=fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d`
- Production versions are `[1,2]`; the migration ledger contains both approved hashes.
- The owner-approved pre-migration archive completed at `2026-07-23T06:22:56Z`.
- Publication evidence: schema version 1, expected row count 0, encrypted bytes 7,084, invariant `constraints_valid`, archive SHA-256 `c71a9f61a6d6d14a1e563f5bc5c3ea88bc5344c5635d07bd3c0682474e7d62ab`, backup service result `success`.
- Existing backup/monitor timers and journald remained active during the preceding read-only preflight.
- Fresh repository checks at the checkpoint: tests `90/90`, typecheck passed and `git diff --check` passed.
- Exact-object download, ciphertext hash/byte verification, wrong-identity rejection and PostgreSQL 17 empty-target restore passed. Temporary AWS/local restore resources were removed.
- Post-migration read-back confirmed RLS on five workload tables, six policies, expected role/grant/deny boundaries, zero rows and zero invalid constraints.
- Backup/monitor services remain successful, timers enabled/active, journald active and the Lightsail alarm `OK`.

## Unresolved operational defect

`journal.dropped` was confirmed as a false critical and fixed in production. Only exit `1` with empty stdout/stderr maps to zero; other failures remain invalid. Ten clear observations produced one resolved notification. Installed hash, monitor/backup timers and services, journald, Lightsail alarm `OK` and cleanup were verified. The first vacuum remains unapproved.

## Safety boundary

- Production migration is complete; do not rerun it or start Task 2 implicitly.
- Do not restore into the original Supabase project.
- Use a temporary exact-object S3 reader and delete its user, policy, access key, downloaded archive, manifest, container/target and any identity copy in the same run.
- Keep existing backup, monitoring, journald and the Lightsail alarm active.
- Do not run the first journald vacuum.
- Stop before any unexpected schema/hash/role difference; do not improvise a production repair or destructive down migration.

## Recommended next prompt

> AGENTS.md 필수 문서를 읽고 local `journal.dropped` fix의 diff와 test evidence를 검토해. Production monitor asset hash와 rollback을 준비하되 배포는 owner 승인 전 하지 마. Journald 설정·retention·vacuum은 변경하지 마.

## Work after Task 1

Continue one bounded task per session:

1. Local production assembly is complete. Keep G2 actual OAuth and G3 bot-side member lookup closed; do not apply production migrations `0003`~`0004` without a separate gate.
2. Task 3: minimal Fastify API plus React dashboard vertical slice; synthetic providers only.
3. Task 4: Discord Gateway runtime, singleton and health; G3 for actual bot credential/intents.
4. Task 5: production-like disposable Ubuntu/systemd integration; G4 before creating AWS resources.
5. Task 6: least-privilege production operator and Lightsail application/Caddy deployment; G5.
6. Task 7: `waw.dubeom.com` DNS/HTTPS/OAuth redirect and monitoring/non-zero restore expansion; separate G6 and G7.

GPT, Riot/RSO and KBO remain outside PLAN-0004 and require later research, Proposed ADRs and owner gates.
