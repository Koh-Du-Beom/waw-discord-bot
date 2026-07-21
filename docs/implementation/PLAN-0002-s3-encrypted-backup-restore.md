# PLAN-0002: S3 암호화 PostgreSQL backup과 restore 검증

- Status: In progress — Task 1 complete; Task 2 S3 transport/cleanup partial
- Date: 2026-07-21
- Owner: Project owner
- Related ADRs: [`ADR-0006`](../adr/ADR-0006-supabase-free-postgresql-storage.md), [`ADR-0008`](../adr/ADR-0008-encrypted-postgresql-backup-storage.md), [`ADR-0009`](../adr/ADR-0009-age-recipient-backup-encryption.md)
- Related requirements: `DAT-004`, `OPS-005`~`OPS-007`, `SEC-007`~`SEC-008`

## 목표

Supabase Free PostgreSQL의 logical dump를 24시간마다 S3에 client-side encrypted archive로 보관하고, 원본 project를 건드리지 않는 empty Windows/new-host PostgreSQL restore로 24시간 RPO·8시간 RTO 증거를 만든다.

## 범위

- `age` public-recipient archive format, non-secret manifest와 verifier
- S3 dedicated bucket, least-privilege writer/reader IAM policy, 30-day lifecycle expiration
- synthetic disposable database와 object를 이용한 encrypt/upload/download/decrypt/restore Spike
- verified backup의 UTC timestamp, byte size, archive hash, schema version, row count와 verifier result 관측

## 비범위

- production Supabase project·credential·data export
- production owner recovery identity 생성·보관 또는 채팅 공유
- dashboard에서 backup/restore 실행
- S3 Object Lock, Glacier transition, cross-account replication, automatic billing expansion
- KBO와 Riot production data

## 선행 조건과 권한 경계

1. `ADR-0008`과 `ADR-0009` Accepted — 완료.
2. `age` 1.3.1 local synthetic contract — 완료.
3. actual S3 Task 전 owner AWS console login과 disposable resource 생성 권한이 필요하다. account ID, access key, secret, bucket URL, database password는 채팅·문서·로그에 기록하지 않는다.
4. backup writer는 bucket의 `backups/` prefix에 `PutObject`만, lifecycle/service role은 expiration만, restore reader는 명시적 human-run restore에서만 `GetObject`를 가진다. writer에는 `GetObject`, `DeleteObject`, bucket policy/lifecycle/IAM 변경 권한을 주지 않는다.
5. account-level monthly budget alert 및 cost visibility는 owner가 AWS Billing에서 설정한다. Budgets data는 최소 일 단위로 갱신될 수 있어 hard spending cap은 아니다. paid storage class 전환은 별도 owner decision이다.

## 작업

### Task 1 — Archive manifest·local verifier

- 목적: S3/Supabase credential 없이 archive metadata와 restore success criteria를 고정한다.
- 변경 예상: `src/backup/`, `docs/research/spikes/backup-age-contract/`
- 테스트: valid manifest, bad hash, missing schema version, expired retention과 row-count/invariant mismatch의 unit test
- 완료 기준: manifest가 raw dump·key·connection string을 담지 않고 invalid archive를 verified로 승격하지 않는다.
- 롤백: local verifier module과 test fixture만 제거한다.

### Task 2 — Disposable S3 synthetic restore Spike

- 목적: 실제 S3 IAM/bucket/lifecycle와 `age` archive upload/download 경로를 한 번 증명한다.
- 변경 예상: `docs/research/spikes/s3-encrypted-restore/` runbook·result only; production source change 없음
- 절차: owner login → uniquely tagged disposable bucket/object/IAM principal → synthetic archive upload/download → local empty PostgreSQL restore → verifier → object/bucket/IAM principal 및 local temp 제거 → billing/resource absence 확인
- 테스트: writer의 read/delete/policy-change deny, encrypted object upload/download, wrong identity deny, valid identity restore, lifecycle prefix scope review
- 완료 기준: no production data/credential exposure, verifier pass, cleanup evidence, elapsed time < 8h
- 롤백: disposable objects, bucket, IAM principal/policy와 local artifacts를 same-run cleanup; any cleanup failure is recorded and escalated

#### 2026-07-21 실행 결과

- 통과: disposable bucket 생성, 331-byte client-side encrypted synthetic archive upload, object count `1`, object delete, bucket delete, final bucket count `0`, local temporary artifact 삭제.
- 통과: local Docker PostgreSQL 16 source/empty-target companion에서 encrypted custom dump의 byte round trip, restore row count `2`와 invariant를 확인하고 containers/temp artifacts를 삭제했다.
- 미통과/미검증: Orca browser download hook이 expected local path에 파일을 전달하지 못해 downloaded-byte checksum과 decrypt/restore verifier를 실행하지 못했다. temporary least-privilege IAM principal, lifecycle prefix scope, wrong-identity failure와 empty PostgreSQL restore도 아직 실행하지 않았다.
- 정리: CSV download로 같은 hook 한계를 재현한 temporary self-managed access key는 secret을 저장하지 않은 채 비활성화·삭제했고 access-key count `0`을 확인했다. temporary self access-key IAM policy attachment의 제거는 owner console action으로 남아 있다.
- 판정: Task 2는 **partial**이며 완료가 아니다. local container restore는 Windows/new-host recovery evidence를 대체하지 않는다. production source·Supabase project·production credential에는 접근하지 않았다.

### Task 3 — Production backup job and first restore rehearsal

- 목적: backup-only DB/S3 credential, owner recovery identity와 scheduler를 production host에 안전하게 주입한다.
- 변경 예상: deployment configuration, secret provisioning procedure, backup runbook, monitoring status adapter
- 테스트: scheduled synthetic dry run, manual production logical dump in maintenance-safe window, empty target restore and invariant check, 30-day lifecycle/retention review
- 완료 기준: last-success and last-verified state are non-sensitive, RPO <=24h/RTO <=8h measured, no secret/plain dump persists on runtime
- 롤백: scheduler disable, backup credential revoke, no production restore without an explicit separate owner decision

## 실패 처리와 관측

- `age`, `pg_dump`, S3 upload/download, checksum, decrypt, `pg_restore`와 invariant 검증 중 하나라도 실패하면 archive는 `unverified`다. previous verified archive를 overwrite하거나 success로 표시하지 않는다.
- manifest/log에는 UTC timestamp, schema version, archive SHA-256, encrypted byte count, outcome/reason code, elapsed time만 기록한다.
- archive key는 random UUID와 UTC timestamp만 사용하고 guild/user/channel ID, raw SQL, secrets를 포함하지 않는다.
- S3 lifecycle은 `backups/` prefix에서 30일 expiration만 적용한다. versioning/Object Lock은 privacy deletion과 충돌할 수 있어 초기 범위에서 비활성화한다.

## 검증·완료 기준

각 Task를 독립 commit으로 두고 `npm run typecheck`, `npm test`, `git diff --check`와 해당 verifier를 새로 실행한다. Task 2의 AWS cleanup and billing/resource absence를 확인하기 전에는 Task 3으로 가지 않는다. Task 3은 production credential 입력·host deployment·Supabase data 접근이므로 owner가 명시적으로 승인한 별도 실행 창에서만 수행한다.

## 다음 승인 게이트

Task 2는 disposable AWS resource 생성과 실제 account login이 필요하다. owner가 Orca browser에서 IAM operator로 로그인한 뒤에만 시작하며, S3 writer IAM principal과 disposable bucket을 만들어도 되는지 한 번 확인받는다.
