# ADR-0006: Supabase Free PostgreSQL를 첫 MVP 저장소로 사용

- Status: Accepted
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OWN-022`~`OWN-025`, `OWN-034`, `OPS-001`~`OPS-008`
- Related research: `docs/research/technology-options/persistent-storage-options.md`, `docs/research/spikes/storage-volume-concurrent-transition/README.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

첫 MVP는 서울 Lightsail의 단일 지속 server 경계에서 web과 bot을 함께 실행한다. 데이터는 감사 event, dedupe, session과 설정 변경 이력이며, 월 10,000회·1년 합성 시험에서 SQLite와 PostgreSQL의 database 및 export가 모두 40 MB 미만이었다. Supabase Free의 별도 disposable project에서 RLS를 활성화한 PostgreSQL table에 합성 10,000행을 기록해 10,000 unique operation과 1,864 kB 관계 크기를 확인했고, 해당 project는 즉시 삭제했다.

## Considered options

### Option A: Lightsail host의 SQLite

단일 host·낮은 write concurrency에서 가장 작은 운영 단위이며 database endpoint와 별도 credential이 없다. 그러나 host와 canonical data가 같은 장애 영역에 남고, 외부 backup·빈 Windows 복구가 운영 전제다.

### Option B: Supabase Free PostgreSQL

canonical data를 Lightsail host에서 분리하고 PostgreSQL role·RLS·표준 export 경로를 사용할 수 있다. Free tier는 500 MB database, 5 GB egress, 1 GB file storage이고 장기 유휴 project pause 및 automatic backup/PITR 부재가 제약이다.

### Option C: Lightsail host의 Docker PostgreSQL

PostgreSQL 호환성과 container 격리를 얻지만 host 장애 영역은 SQLite와 같고 database 운영·backup·upgrade·credential 관리가 추가된다. 첫 MVP의 낮은 concurrency에서 Option A나 B보다 강한 이점이 입증되지 않았다.

## Decision

첫 MVP의 canonical relational storage로 Supabase Free PostgreSQL를 사용한다. Lightsail은 application runtime만 실행하고 database credential은 application runtime secret으로만 주입한다. public browser에는 database credential이나 service-role credential을 제공하지 않는다.

자동 backup/PITR을 전제로 하지 않는다. 적어도 24시간마다 표준 PostgreSQL export를 별도 암호화 저장소로 만들고, 빈 Windows fallback 또는 새 host에서 restore·schema version·row count·핵심 invariant를 검증하는 절차를 구현 계획으로 둔다. Free tier pause·quota·provider outage 동안 storage-dependent 변경은 실패를 명확히 표시하며, host 장애 중 조회·변경 중단 허용 결정(`OWN-022`)을 확장해 stale data를 사실처럼 제공하지 않는다.

## Rationale

사용자는 개인 MVP에서 비용 0원과 host/data 장애 분리를 우선했다. disposable spike는 현재 데이터량이 Free tier 한도보다 충분히 작고 기본 PostgreSQL uniqueness·RLS 경로가 작동함을 보였다. Docker PostgreSQL은 동일 host 장애 영역을 유지하면서 운영 부담을 늘리므로 채택하지 않는다.

## Consequences

### Positive

- application host 장애와 canonical database 장애를 분리한다.
- PostgreSQL migration·standard dump/restore·role/RLS 경로를 초기에 사용한다.
- 현재 합성 보존량은 Free database quota보다 작다.

### Negative

- provider credential, network dependency, Free tier pause·quota를 운영해야 한다.
- automatic backup/PITR이 없으므로 export 복구 검증이 필수다.

### Risks

- Free tier policy 또는 quota 변경
- 유휴 pause 뒤 첫 query latency·availability
- service credential의 과도한 권한 또는 log 노출
- RLS를 application authorization의 유일한 경계로 오해하는 위험

## Validation

- Disposable Supabase Free project에서 RLS 활성화 table에 합성 10,000행 기록
- 10,000 unique operation 확인
- 관계 크기 1,864 kB 확인
- project 삭제 성공 toast 확인

## Rollback or migration

Free tier가 quota·pause·security·restore 기준을 만족하지 않으면 표준 PostgreSQL export를 이용해 paid managed PostgreSQL 또는 self-host PostgreSQL로 이관한다. SQLite 전환은 schema·timestamp·boolean·key semantics와 transaction 차이를 별도 migration Spike로 검증한 뒤에만 한다.

## Conditions for reconsideration

- 1년 예상 data 또는 egress가 Free tier 한도를 넘는 경우
- 24시간 export와 8시간 복구 목표를 반복 달성하지 못하는 경우
- Free pause 또는 provider outage가 MVP 운영 허용 범위를 넘는 경우
- D-07의 credential·workload 인증 설계가 managed database 접근을 최소 권한으로 만들지 못하는 경우

## Approval

- Owner decision: Approved — Supabase Free PostgreSQL
- Approved date: 2026-07-21
