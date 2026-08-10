# 구현 계획: KBO 일일 크레딧 지급 claim schema

- Status: Completed (local/disposable only; Production unapplied)
- Related requirements: `FUN-023`, `FUN-031`
- Related ADRs: `ADR-0029`
- Depends on: `PLAN-0018` migration `0013`, `PLAN-0019` enrollment transaction
- Owner: Product owner

## 목표

가입 계정의 KST 날짜별 50,000 크레딧 직접 요청을 이후 transaction에서 정확히
한 번만 처리할 수 있도록 최소 PostgreSQL claim 계약을 추가한다.

## 현재 구현 상태

- Migration `0013`은 0잔액 `credit_account`, active `betting_enrollment`와
  `daily_claim` reason을 허용하는 불변 `credit_ledger_entry`를 제공한다.
- 가입 transaction store는 account와 enrollment를 만들지만 일일 지급을
  처리하지 않는다.
- KST 날짜별 claim row와 DB unique constraint가 없어 application check만으로는
  동시 지급을 안전하게 막을 수 없다.

## 범위

- Additive migration `0014`의 `daily_credit_claim` table
- Opaque account와 KST `claim_date`별 정확히 한 건을 보장하는 unique constraint
- operation과 지급 ledger entry의 1:1 참조
- claim 시각과 참조 무결성
- web read-only, bot insert/select의 기존 최소 권한·RLS 패턴
- 실제 disposable PostgreSQL 계약 테스트

## 범위 제외

- 50,000 지급 계산, correction debt 우선 상계와 account projection update
- 지급 transaction store, domain port와 Discord command/runtime 연결
- client 입력 날짜, scheduler, 자동 지급과 미수령분 누적
- 조회 DTO, dashboard와 사용자 응답
- betting, settlement, correction과 서버 탈퇴 lifecycle 구현
- Production migration 적용, credential·service와 feature activation

## 선행 조건과 고정 경계

1. `claim_date`는 이후 store가 검증한 현재 시각을 `Asia/Seoul`로 변환해 계산하며
   client가 제공하지 않는다.
2. 한 가입은 opaque account 하나에만 연결되므로 `(account_id, claim_date)`를
   canonical 중복 방지 key로 사용한다. 이는 서버 탈퇴 시 직접 Discord ID 연결을
   제거하면서도 과거 claim의 멱등성을 보존한다.
3. `daily_credit_claim`은 stable operation 하나와 `daily_claim` ledger entry
   하나를 참조한다. Claim만 단독으로 commit하는 application 흐름은 허용하지 않는다.
4. Claim row는 금액이나 잔액 projection을 중복 저장하지 않는다. 지급 전후 금액과
   debt 상계는 불변 ledger entry가 보존한다.
5. 날짜 경계와 50,000 지급·debt 상계의 application 동작은 후속 별도 계획에서
   account lock과 한 transaction으로 구현한다.

## 작업

### Task 1: additive 0012 claim migration과 PostgreSQL 계약 테스트

- 목적: 일일 지급 구현 전에 날짜별 중복 방지와 claim-ledger 참조 무결성만
  PostgreSQL에 고정한다.
- 변경 예상 파일: `migrations/0014_kbo_daily_credit_claim.sql`,
  `src/persistence/run-migration.ts`, PostgreSQL integration test,
  `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - 같은 account와 KST claim date는 한 건만 허용
  - 서로 다른 account 또는 claim date는 허용
  - 존재하지 않는 account, operation 또는 ledger entry 참조 거부
  - operation과 ledger entry의 claim 중복 연결 거부
  - bot은 필요한 select/insert만 가능하고 update/delete는 거부
  - web은 select만 가능하고 insert/update/delete는 거부
  - migration version `12` 기록과 전체 migration 순서 검증
- 완료 기준: disposable PostgreSQL에서 uniqueness, 참조 무결성, RLS와 grant가
  재현되고 전체 test/typecheck와 diff check가 통과한다.
- 위험: schema만으로 ledger reason이 `daily_claim`인지 교차 table constraint로
  확인할 수 없다. 후속 transaction store가 account lock 아래 canonical 값으로
  두 row를 만들고 통합 테스트로 검증한다.
- 롤백: application이 연결되지 않은 additive table만 제거할 수 있으며 Production
  데이터에는 적용하지 않는다.

## 검증 계획

- 대상 PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Task 1 승인 시에도 migration은 local/disposable PostgreSQL에만 적용한다.
Production 적용은 exact migration, backup·restore 증거와 별도 owner gate 전까지
금지한다.

## 문서 갱신

- 이 계획과 `PROJECT_STATUS.md`에 local/disposable 완료 결과를 기록했다.

## 승인

- Owner decision: Approved — Task 1의 additive `0014` migration과 PostgreSQL
  계약 테스트만 구현; Production 적용 금지
- Approved date: 2026-08-07

## 진행 결과

- Additive `0014` migration으로 `daily_credit_claim`과 schema version `12`를
  등록했다.
- `(account_id, claim_date)`, operation과 ledger entry를 각각 unique하게 하고
  account·operation·ledger 참조 무결성을 추가했다.
- `waw_web`은 SELECT-only, `waw_bot`은 SELECT·INSERT만 허용하며 application
  workload의 UPDATE·DELETE는 허용하지 않는다.
- 대상 disposable PostgreSQL suite `17/17`, 전체 test
  `298 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- 지급 계산·debt 상계 store, Discord/runtime와 Production은 연결·적용하지 않았다.
