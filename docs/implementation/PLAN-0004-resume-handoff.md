# PLAN-0004 resume handoff

- Date: 2026-07-23
- Checkpoint: Task 1 local/disposable GREEN; G1 pre-migration archive published; production migration not started
- Canonical plan: [`PLAN-0004`](./PLAN-0004-application-production-rollout.md)
- Persistence runbook: [`application-persistence-runbook`](../operations/application-persistence-runbook.md)

## Current evidence

- Approved migration hashes:
  - `0001=337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10`
  - `0002=fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d`
- Production remains on the historical schema version 1 baseline. Baseline adoption and `0002` have not run.
- The owner-approved pre-migration archive completed at `2026-07-23T06:22:56Z`.
- Publication evidence: schema version 1, expected row count 0, encrypted bytes 7,084, invariant `constraints_valid`, archive SHA-256 `c71a9f61a6d6d14a1e563f5bc5c3ea88bc5344c5635d07bd3c0682474e7d62ab`, backup service result `success`.
- Existing backup/monitor timers and journald remained active during the preceding read-only preflight.
- Fresh repository checks at the checkpoint: tests `49/49`, typecheck passed and `git diff --check` passed.

## Exact blocker

ADR-0009 requires the passphrase-protected owner `age` identity to remain outside Git, the runtime host and S3. It was not present in searchable local paths, so exact-object download and valid-identity empty-target restore have not run. This is the intended security boundary, not a missing application credential.

Before resuming:

1. Place the encrypted owner identity in an ephemeral local path outside this repository.
2. Provide only its absolute path to the next agent.
3. Enter its passphrase only in the interactive `age` prompt. Never paste the identity content or passphrase into chat.
4. Ensure Docker Desktop can run PostgreSQL 17, or use an owner-approved disposable empty target. The last Docker inventory probe returned an API `500`, so recheck the engine before restore.

## Safety boundary

- Do not start production migration before exact ciphertext size/hash, wrong-identity rejection and valid-identity empty-target restore pass.
- Do not restore into the original Supabase project.
- Use a temporary exact-object S3 reader and delete its user, policy, access key, downloaded archive, manifest, container/target and any identity copy in the same run.
- Keep existing backup, monitoring, journald and the Lightsail alarm active.
- Do not run the first journald vacuum.
- Stop before any unexpected schema/hash/role difference; do not improvise a production repair or destructive down migration.

## One-prompt resume

Replace `<IDENTITY_ABSOLUTE_PATH>` and paste the complete prompt:

> AGENTS.md와 필수 문서를 순서대로 읽고 `docs/implementation/PLAN-0004-resume-handoff.md`, PLAN-0004와 application persistence runbook을 기준으로 작업을 재개해. Offline owner recovery identity는 repository 밖의 `<IDENTITY_ABSOLUTE_PATH>`에 준비되어 있다. Identity 내용이나 passphrase를 출력·기록·복사하지 말고 passphrase는 interactive `age` secure prompt로만 입력받아. 이미 승인되고 publish된 pre-migration archive에 대해 temporary exact-object S3 reader를 만들고 ciphertext byte/hash와 manifest를 확인한 뒤 wrong-identity failure와 disposable empty PostgreSQL 17 valid-identity restore를 수행해. Schema version 1, row count 0, constraints/invariant와 cleanup을 확인하고 reader user/policy/key, archive/manifest copy, container/target와 temporary identity copy가 모두 제거된 경우에만 승인된 hashes `0001=337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10`, `0002=fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d`의 production legacy v1 baseline adoption과 `0002` migration을 실행해. 적용 전후 schema/checksum/RLS/grant/role deny matrix, DB size와 active connection, backup/monitor timer, journald와 Lightsail alarm을 read-back해. 예상 밖 schema/hash/role 차이, backup restore 실패 또는 cleanup 잔존물이 있으면 migration 전에 멈춰. Original Supabase restore, 기존 backup·monitoring·journald 변경/중단과 최초 journald vacuum은 실행하지 마. Task 1 G1을 완전히 검증하고 문서를 갱신한 뒤 Task 2를 시작하지 말고 다음 추천 프롬프트를 보고해.

## Work after Task 1

Continue one bounded task per session:

1. Task 2: Discord OAuth callback, opaque session and guild/role authorization, local/disposable first; G2 for actual OAuth secret and redirect.
2. Task 3: minimal Fastify API plus React dashboard vertical slice; synthetic providers only.
3. Task 4: Discord Gateway runtime, singleton and health; G3 for actual bot credential/intents.
4. Task 5: production-like disposable Ubuntu/systemd integration; G4 before creating AWS resources.
5. Task 6: least-privilege production operator and Lightsail application/Caddy deployment; G5.
6. Task 7: `waw.dubeom.com` DNS/HTTPS/OAuth redirect and monitoring/non-zero restore expansion; separate G6 and G7.

GPT, Riot/RSO and KBO remain outside PLAN-0004 and require later research, Proposed ADRs and owner gates.
