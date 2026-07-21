# D-12 백업·복구 보관 후보 조사

- 상태: Research — 기술 선택 아님
- 작성일: 2026-07-21
- 범위: Accepted `ADR-0006`의 Supabase Free PostgreSQL 논리 export를 암호화·분리 보관하고 빈 Windows fallback에서 복구 검증하는 방식
- 비범위: backup provider 계정 생성, billing/credential 입력, production database export·복구, 운영 배포

## 1. 결정 입력과 성공 기준

- `ADR-0006`은 Supabase Free의 automatic backup/PITR을 전제로 하지 않고, **24시간마다** 표준 PostgreSQL export를 별도 암호화 저장소에 두도록 확정했다.
- `OWN-005`의 RPO는 24시간, RTO는 8시간이다. `OWN-009`에 따라 dashboard는 마지막 backup·restore 점검 상태와 수동 절차만 표시하며 웹에서 복구를 실행하지 않는다.
- `OPS-005`, `OPS-006`, `DAT-004`, `SEC-007`, `SEC-008`에 따라 backup은 runtime과 분리되고 암호화되며, credential·Discord 원문·OAuth/session 비밀을 포함하지 않아야 하고 실제 restore로 검증해야 한다.
- `OWN-004`의 30일 복구 유예 뒤 삭제·익명화 요구를 넘겨 식별 정보를 되살리지 않도록 backup retention은 최대 30일이어야 한다. 이 문서는 일별 30개 snapshot을 비교 기준으로 쓴다.

성공은 다음을 모두 만족하는 것이다.

1. 일별 logical export가 실패하면 성공으로 기록하지 않고 다음 실행에서 재시도·경보한다.
2. runtime host가 아닌 object storage에 client-side encrypted archive와 비민감 manifest를 보관한다.
3. 빈 Windows 또는 새 host에서 archive를 복호화해 빈 PostgreSQL에 restore하고 schema version, row count, foreign key와 핵심 invariant를 검사한다.
4. export 생성·업로드·복구 검증의 시간과 결과만 감사하고 connection string, password, archive 내용, raw DB 오류는 기록하지 않는다.
5. 24시간 RPO와 8시간 RTO를 실제 측정으로 판정하며, migration 전에는 같은 방식으로 즉시 backup을 한 번 더 만든다.

## 2. 확인된 공식 사실

- Supabase는 Free tier에 regular `db dump`와 off-site backup을 권고한다. Pro 이상만 daily backup을 제공하며, project 삭제 시 provider에 있는 backup도 영구 삭제된다. [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- Supabase CLI 문서는 role, schema, data를 분리한 logical dump와 새 project에 대한 `psql` restore 절차를 제공한다. 따라서 provider 고유 snapshot이 아니라 PostgreSQL 호환 export를 사용한다. [Supabase Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- Cloudflare R2 Standard에는 매월 10 GB-month, Class A 100만 회, Class B 1,000만 회의 free usage가 있고 egress는 무료다. 그러나 R2 시작에는 account의 R2 subscription checkout이 필요하며 free usage 초과분은 사용량 과금이다. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 getting started](https://developers.cloudflare.com/r2/get-started/)
- Amazon S3는 bucket 생성 자체에는 과금하지 않지만 storage, request, transfer 사용량에 과금한다. 신규 AWS account의 Free Tier credit은 기간·선택 plan에 따라 달라지므로 영구 0원 보장으로 취급할 수 없다. [S3 getting started](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html), [S3 pricing](https://aws.amazon.com/s3/pricing/)

## 3. 후보 비교

| 후보 | RPO/RTO·이식성 | 비용 경계 | 보안·운영 경계 | 판단 |
|---|---|---|---|---|
| A. Cloudflare R2 Standard + client-side encrypted archive | S3-compatible object store, 10 GB free usage는 현재 40 MB 미만 합성 export의 30일 보관에 충분한 여유가 있다. `pg_dump`/`pg_restore`로 provider 이탈 가능 | free allowance는 hard cap이 아니며 subscription checkout과 overage 가능성이 있다 | Supabase·Lightsail과 다른 provider라 control plane을 분리한다. 별도 scoped API token과 account recovery 절차가 필요 | 비용 0원 목표에 가장 가깝지만 새 account·billing 경계가 추가된다 |
| B. 기존 AWS S3 bucket + client-side encrypted archive | S3 object와 PostgreSQL dump는 portable하며 Windows restore 절차가 동일하다 | 작은 backup도 storage/request 사용량 과금 가능; credit·budget alert은 비용 상한을 보장하지 않는다 | Lightsail과 같은 AWS account면 root account compromise 범위가 넓다. backup 전용 IAM principal·bucket policy로 runtime credential과 분리해야 한다 | 이미 가진 계정을 재사용할 수 있지만 '0원 보장' 후보는 아니다 |
| C. Windows 또는 Lightsail local disk에 encrypted copy | 복호화·restore 자체는 가능하나 host/disk·account 장애와 같은 failure domain에 남는다 | 직접 cloud cost는 작을 수 있다 | `ADR-0006`의 별도 보관 위치와 off-site 요구를 만족하지 못한다 | 탈락 |

## 4. 공통 보안·복구 설계 초안

선택 provider와 무관하게 다음 경계를 유지한다.

```text
Supabase logical dump (backup-only DB credential)
  -> compressed archive
  -> client-side encryption (public recipient only on runtime)
  -> object store (backup-only write credential)
  -> manifest: schema version, UTC time, archive hash, byte count

offline owner-held private recovery key
  -> empty Windows/new-host PostgreSQL restore
  -> schema / row count / FK / invariant verifier
```

- runtime에는 encryption **public recipient**와 write-only object-store credential만 둔다. private recovery key, bucket administrator credential, Supabase owner password, Discord token은 backup job과 저장소에 주입하지 않는다.
- archive는 DB의 허용된 영구 데이터만 포함한다. dump 전에 schema 검토로 Discord message content, OAuth access/refresh token, browser session raw ID, API key와 password가 schema에 없음을 확인한다.
- object key는 UTC timestamp와 schema version만 사용하고 user·guild·channel ID를 넣지 않는다. manifest와 로그에는 hash, size, success/failure reason code, duration만 기록한다.
- retention job은 30일을 넘는 archive를 삭제하며, 삭제·익명화가 일어난 data는 다음 backup에서 사라지는지 restore 검증에 포함한다. object versioning/retention lock은 복구 유예와 충돌할 수 있으므로 owner가 retention을 별도 연장 승인하기 전에는 활성화하지 않는다.
- restore는 original Supabase project를 덮어쓰지 않는다. disposable empty database 또는 Windows/new-host PostgreSQL에서만 수행하고, test data와 temporary database·archive는 runbook에 따라 정리한다.

## 5. 남은 검증과 승인 지점

문서만으로는 provider endpoint, scoped credential, client-side encryption tooling의 실제 상호운용성과 Windows restore 시간을 보장할 수 없다. 다음은 선택 후 별도 승인 범위다.

1. owner가 선택한 backup provider에 로그인해 disposable bucket/container와 최소 권한 credential을 만든다. credential 값은 채팅·저장소·로그에 공유하지 않는다.
2. synthetic PostgreSQL dump 하나를 encrypt/upload/download/decrypt/restore하고, 8시간 RTO 안에서 verifier가 통과하는지 측정한다.
3. disposable object와 test database를 삭제하고 provider billing/resource 화면에서 잔존 resource를 확인한다.
4. 통과 뒤에만 production Supabase project의 backup credential과 scheduled job을 별도 bounded task로 구성한다.

## 6. 잠정 권고 — 선택 아님

**기존 AWS S3에 client-side encrypted PostgreSQL archive를 30일 rolling retention으로 보관**한다. 프로젝트는 Lightsail을 위해 이미 AWS account를 운영하므로, account recovery·IAM·audit·billing 흐름을 한 provider로 통일하는 운영 단순성을 provider control plane 분리보다 우선한다. S3도 storage/request 과금과 동일 account compromise 위험을 없애지 못하므로 backup 전용 IAM principal, budget monitoring과 client-side encryption을 필수로 둔다.

## 7. 정확한 소유자 결정 질문

`ADR-0008`은 2026-07-21 owner 승인으로 기존 AWS S3를 선택했다. S3 bucket·IAM credential 생성과 disposable restore Spike는 실제 AWS login/credential 입력이 필요한 별도 실행 단계다.
