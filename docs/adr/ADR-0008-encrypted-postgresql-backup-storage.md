# ADR-0008: 암호화된 PostgreSQL backup 저장 경계

- Status: Proposed
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OPS-005`~`OPS-008`, `DAT-004`, `SEC-007`~`SEC-008`, `OWN-004`, `OWN-005`, `OWN-009`, `ADR-0006`
- Related research: `docs/research/technology-options/backup-and-restore-options.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

`ADR-0006`은 Supabase Free PostgreSQL를 canonical store로 선택했고, Free automatic backup/PITR에 의존하지 않는다. 따라서 24시간마다 표준 PostgreSQL logical export를 encrypted, off-site location에 보관하고 empty Windows/new-host에서 restore를 실제 검증해야 한다. 현재 합성 1년 export는 40 MB 미만이었으나 backup provider·encryption·retention은 아직 선택되지 않았다.

## Considered options

### Option A: Cloudflare R2 Standard + client-side encryption + 30-day rolling retention

Supabase/Lightsail과 다른 provider의 S3-compatible object storage에 client-side encrypted archive를 저장한다. 현재 R2 Standard free monthly allowance는 10 GB storage와 충분한 operation 수지만 checkout 및 free allowance 초과 과금 가능성이 있다.

### Option B: Existing AWS S3 + client-side encryption + 30-day rolling retention

이미 사용하는 AWS account의 dedicated bucket에 동일 archive를 둔다. 별도 provider account는 필요 없지만 storage/request 사용량은 과금될 수 있으며 Lightsail과 account recovery boundary를 공유한다.

### Option C: Runtime/local fallback disk

암호화하더라도 runtime host·disk 또는 동일 account failure domain에서 분리되지 않아 `ADR-0006`의 외부 backup 조건을 충족하지 못한다.

## Proposed decision

Option A를 채택한다.

- Cloudflare R2 Standard에 하루 한 개의 compressed, client-side encrypted PostgreSQL logical archive를 둔다.
- retention은 UTC 기준 최근 30일 rolling archive다. 30일 뒤 제거·익명화 요구와 충돌하는 object lock/versioning은 사용하지 않는다.
- backup job에는 public encryption recipient와 backup-only object-store write credential만 주입한다. private recovery key는 owner의 offline recovery custody에 두고, Supabase owner password·Discord token·browser credential은 job에 주입하지 않는다.
- 실제 restore는 original production project가 아닌 empty Windows/new-host PostgreSQL에서만 실행한다. schema version, row count, foreign key와 핵심 invariant가 통과할 때만 backup을 verified로 표시한다.
- free allowance를 초과할 가능성이 감지되면 backup job은 저장 용량을 임의로 늘리거나 billing을 변경하지 않고 실패·경보한다. paid expansion은 별도 owner decision이다.

## Rationale

R2의 현재 free allowance는 현재 합성 export의 30일 보관에 충분한 여유가 있고, Supabase와 Lightsail의 provider control plane에서 backup을 분리한다. client-side encryption은 provider-side encryption만으로 runtime·object-store credential compromise를 구분하지 못하는 위험을 줄인다. 30일 retention은 삭제/익명화의 복구 유예보다 오래된 개인 식별 정보를 되살리지 않도록 제한한다.

## Consequences

### Positive

- database, runtime host, backup provider의 장애·credential 경계를 나눈다.
- PostgreSQL logical export를 사용하므로 Supabase 및 backup provider 이탈 경로가 남는다.
- dashboard에는 비민감한 last backup/restore verification 상태만 표시할 수 있다.

### Negative

- Cloudflare account recovery, checkout, scoped API credential과 offline recovery key custody가 추가된다.
- free allowance는 월 비용 hard cap이 아니며 usage monitoring과 failure handling이 필요하다.

## Validation

승인 후 disposable synthetic database와 disposable R2 bucket에서 encrypt/upload/download/decrypt/restore를 1회 실행한다. empty Windows/new-host PostgreSQL의 schema version, row count, foreign key와 invariant verifier가 통과하고 총 시간이 8시간 미만인지 기록한다. 모든 disposable object, test database, credential과 local temporary file을 정리한 뒤에만 production backup 구현으로 진행한다.

## Rollback or migration

archive는 PostgreSQL logical dump와 provider-independent encrypted file이므로 S3-compatible 또는 다른 object storage로 복사해 이동할 수 있다. R2 provider·free allowance·security 기준이 실패하면 새 provider에 disposable restore를 먼저 통과시킨 후 write target을 바꾸고, 기존 archive는 approved retention 만료까지 읽기 전용으로 유지한다.

## Conditions for reconsideration

- R2 checkout, credential scope 또는 account recovery가 owner의 운영 허용 범위를 넘는 경우
- 30일 archive가 free allowance를 넘거나 비용 hard cap을 보장할 수 없는 경우
- client-side encryption과 Windows restore가 8시간 RTO를 반복 충족하지 못하는 경우
- deletion/anonymous propagation을 retention 안에서 검증하지 못하는 경우

## Approval

- Owner decision: Pending
- Approved date: Pending
