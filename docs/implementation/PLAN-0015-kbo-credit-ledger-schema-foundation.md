# 구현 계획: KBO 가입 계정과 불변 크레딧 원장 schema 기반

- Status: Completed — local/disposable only; Production unapplied
- Related requirements: `FUN-023`, `FUN-024`, `FUN-026`, `FUN-027`, `FUN-031`
- Related ADRs: `ADR-0029`
- Owner: Product owner

## 목표

기존 PostgreSQL migration·RLS·workload role 패턴을 재사용해 KBO 베팅 가입,
현재 잔액 projection과 불변 크레딧 원장이 이후 transaction 작업을 받을 수 있는
최소 schema 기반을 만든다.

## 현재 구현 상태

- migration은 `0010`까지 적용 순서와 checksum을 추적하며 `waw_web`과 `waw_bot`
  role, RLS와 disposable PostgreSQL 통합 검증을 이미 사용한다.
- `registered_discord_user`는 guild/user별 등록과 표시 label만 보유하며 KBO 베팅
  가입을 뜻하지 않는다.
- KBO에는 순수 최종 반환액 계산만 있고 가입, 계정, 원장 persistence는 없다.
- `ADR-0029`가 계정 projection, 불변 원장, debt와 workload capability를
  Accepted 상태로 결정했다. 새 architecture 결정은 필요하지 않다.

## 범위

- additive migration `0011`
- `betting_enrollment`: 명시적 가입 상태·정책 version·opaque account 연결
- `credit_account`: non-negative available balance/debt, version과 시각
- `credit_ledger_entry`: 허용 reason, 부호형 delta, 전후 balance/debt, operation과
  canonical source, actor와 발생 시각
- 원장 전후 값이 delta와 일치하는 DB check constraint
- 기존 등록 사용자 자동 가입·backfill 금지
- RLS와 최소 workload grant
- 실제 PostgreSQL에서 schema, 제약, 권한과 migration 등록 검증

## 범위 제외

- 가입 command/service와 가입 transaction
- 일일 지급, 베팅 접수, 정산·무효·정정과 관리자 조정 persistence
- 경기, market, bet과 settlement table
- 잔액 reconciliation job, 공개 DTO와 dashboard
- Discord/provider/Gateway 연동, feature flag와 production migration
- trigger, stored procedure와 복식부기 계정

## 선행 조건과 고정 경계

1. 기존 `registered_discord_user` row를 가입 또는 계정으로 backfill하지 않는다.
2. 신규 account는 `available_balance=0`, `correction_debt=0`, `version=0`으로만
   시작한다.
3. 직접 Discord 연결은 enrollment에만 두고 원장에는 opaque account ID만 둔다.
   서버 탈퇴 처리 구현 전에는 enrollment 삭제·익명화 동작을 추가하지 않는다.
4. `credit_ledger_entry`는 application workload에 UPDATE/DELETE를 부여하지 않는다.
   정정은 이후 새 entry insert로만 구현한다.
5. `waw_bot`만 enrollment/account mutation과 ledger insert를 받을 수 있다.
   `waw_web`은 SELECT만 받고 production runtime path에는 아직 연결하지 않는다.
6. 모든 금액 column은 PostgreSQL `bigint`를 사용하며 전후 available/debt는
   non-negative이고 `after = before + delta`를 만족해야 한다.

## 작업

### Task 1: additive schema migration과 PostgreSQL 계약 검증

- 목적: 후속 지급·베팅 transaction이 의존할 최소 DB 불변조건과 capability를
  application 코드 없이 먼저 고정한다.
- 변경 예상 파일: `migrations/0011_kbo_credit_ledger_foundation.sql`,
  `src/persistence/run-migration.ts`, migration/PostgreSQL integration tests,
  `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - migration `1..11` 순서·ledger 등록과 재적용 거부
  - 세 table, PK/FK/unique/check/index와 RLS 존재
  - 등록 사용자 존재만으로 enrollment/account/ledger가 생성되지 않음
  - account 음수 balance/debt와 음수 version 거부
  - 허용되지 않은 reason, 중복 operation/source, delta와 불일치하는 전후 값 거부
  - `waw_web` SELECT 허용·mutation 거부
  - `waw_bot` enrollment/account SELECT·INSERT·UPDATE와 ledger SELECT·INSERT 허용,
    ledger UPDATE·DELETE 거부
- 완료 기준: disposable PostgreSQL에서 위 계약이 모두 재현되고 기존 migration,
  RLS/grant와 전체 test/typecheck가 회귀하지 않는다.
- 위험: enrollment에 직접 Discord ID를 남겨 서버 탈퇴 익명화 작업과 결합될 수 있음
- 롤백: application runtime 미연결 상태에서 migration을 production에 적용하지
  않는다. local schema는 disposable DB와 새 migration 파일만 제거한다.

## 검증 계획

- migration 대상 PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

이 계획의 구현 승인은 local/disposable migration 작성만 허용한다. Production
schema 적용, feature activation, credential·service·실사용자 데이터 변경은
별도 exact owner gate와 최신 encrypted backup/restore 증거가 필요하다.

Migration은 additive이며 application runtime에서 사용하지 않는다. 이전 release는
새 table을 모른 채 계속 동작할 수 있다.

## 문서 갱신

- 구현 시 이 계획의 진행 결과
- `PROJECT_STATUS.md`
- Production 적용을 별도로 승인받을 때 migration/rollback runbook

## 승인

- Owner decision: Approved — Task 1 local/disposable 구현과 검증만 승인; Production 적용 금지
- Approved date: 2026-08-07

## 진행 결과

- Additive `0011` migration으로 `betting_enrollment`, `credit_account`,
  `credit_ledger_entry`와 schema version `11`을 등록했다.
- 기존 등록 사용자는 자동 가입하지 않는다. Bot account insert는 RLS에서
  opening balance/debt/version `0`만 허용한다.
- 원장은 허용 reason, operation/source 중복, delta와 전후 available/debt 일치,
  actor 형태를 DB constraint로 검증하고 application workload에는 UPDATE/DELETE
  권한을 주지 않는다.
- `waw_web`은 세 table SELECT-only, `waw_bot`은 enrollment/account
  SELECT·INSERT·UPDATE와 ledger SELECT·INSERT만 가진다.
- 대상 disposable PostgreSQL test `16/16`, 전체 test
  `293 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- 최초 sandbox 실행은 System V shared memory 권한 부족으로 PostgreSQL bootstrap이
  실패했다. 승인된 비-sandbox local disposable 실행에서 같은 테스트를 재실행해
  통과했고 임시 cluster는 test teardown으로 제거됐다.
- Production migration, credential, service, runtime과 실사용자 데이터 변경은
  수행하지 않았다.
