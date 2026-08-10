# 구현 계획: KBO 본인 크레딧 잔액 조회

- Status: Completed (local/disposable only)
- Related requirements: `FUN-024`, `FUN-031`
- Related ADRs: `ADR-0029`
- Depends on: migration `0013`, completed `PLAN-0019`·`PLAN-0021`
- Owner: Product owner

## 목표

활성 KBO 가입 사용자가 자신의 가용 크레딧과 correction debt를 정확한 정수로
조회할 수 있는 최소 read-only domain 계약과 PostgreSQL store를 구현한다.

## 현재 구현 상태

- `betting_enrollment`는 active guild/user를 opaque `credit_account`에 연결한다.
- `credit_account`의 available balance와 correction debt projection은 지급
  transaction에서 같은 account row에 원자적으로 갱신된다.
- Bot workload는 enrollment와 account SELECT 권한이 있지만 이를 조합한 본인
  조회 계약과 store는 없다.
- 최근 5개 베팅 schema는 아직 없으므로 `FUN-024` 전체가 아니라 현재 존재하는
  잔액·debt 조회만 분리해 구현할 수 있다.

## 범위

- guild/user 입력을 받는 최소 self-balance read port
- active enrollment와 account의 단일 PostgreSQL SELECT
- `availableBalance`와 `correctionDebt`의 정확한 `bigint` 반환
- 미가입·departed 사용자의 동일한 `not_enrolled` 결과
- 경계 입력 검증과 비반사 persistence 오류
- unit test와 disposable PostgreSQL 통합 테스트

## 범위 제외

- Discord slash command, 응답 문구·formatting과 runtime 조립
- 최근 5개 베팅, 지급 이력, 원장 entry와 account ID 노출
- 공개 랭킹과 dashboard 관리자 조회
- operation/audit 기록; 실제 command audit은 command 경계의 후속 작업
- mutation, transaction, row lock과 cache
- schema·migration·dependency와 Production 적용·feature activation

## 선행 조건과 고정 경계

1. 조회 key는 현재 guild ID와 호출자의 Discord user ID다. Account ID를 client
   입력으로 받지 않는다.
2. `betting_enrollment.status = active`이고 직접 user 연결이 남아 있는 account만
   조회한다. 미가입과 departed는 모두 `not_enrolled`로 반환해 과거 account의
   존재를 구분해 노출하지 않는다.
3. Available balance와 correction debt는 같은 account row의 단일 SELECT에서
   읽는다. Read-only 조회에 transaction이나 `FOR UPDATE`를 추가하지 않는다.
4. PostgreSQL `bigint`는 JavaScript `number`로 변환하지 않고 `bigint`로 parse해
   정밀도 손실을 막는다.
5. 결과에는 raw Discord ID, opaque account ID, operation/ledger ID, version과
   내부 시각을 포함하지 않는다. Correction debt는 본인 결과에만 포함한다.
6. DB 오류는 고정 `kbo_credit_balance_read_failed` reason으로 정규화하고 입력값을
   오류나 log에 반사하지 않는다.

## 작업

### Task 1: 본인 잔액 read contract와 PostgreSQL store

- 목적: Discord command 없이 현재 projection의 최소 본인 조회 경계만 고정한다.
- 변경 예상 파일: `src/kbo/credit-balance.ts`,
  `src/persistence/postgres-kbo-credit-balance-store.ts`, 관련 unit/PostgreSQL
  integration test, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - active 가입의 0·양수 available balance와 0·양수 correction debt를 정확히 반환
  - 지급 transaction 뒤 변경된 두 projection을 다음 조회에서 반환
  - 미가입, departed와 다른 guild의 사용자는 동일한 `not_enrolled`
  - 결과 key에 account ID, raw Discord ID, operation/ledger ID와 version이 없음
  - malformed/oversized guild/user ID는 DB 호출 전에 비반사 오류로 거부
  - PostgreSQL 실패는 입력을 노출하지 않는 고정 persistence reason으로 정규화
- 완료 기준: unit/disposable PostgreSQL에서 active-only self lookup, exact bigint와
  정보 최소화가 재현되고 전체 test/typecheck와 diff check가 통과한다.
- 위험: 이후 command가 `bigint`를 JSON serialize하면 실패하므로 command 경계는
  이를 한국어 숫자 문자열로 명시적으로 format해야 한다. 이번 store는 command를
  추가하지 않는다.
- 롤백: runtime 미연결 read contract/store 파일만 제거하며 schema와 운영 데이터
  영향이 없다.

## 검증 계획

- 대상 unit/PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

새 migration은 없다. 구현 승인 시에도 store는 local/disposable PostgreSQL에서만
검증하고 Discord command나 bot runtime에 연결하지 않는다. Production 적용과
feature activation은 별도 owner gate 전까지 금지한다.

## 문서 갱신

- 이 계획과 `PROJECT_STATUS.md`에 local/disposable 완료 결과를 기록했다.

## 승인

- Owner decision: Approved — Task 1의 read contract, PostgreSQL store와
  unit/PostgreSQL 테스트만 구현; Discord command와 Production 연결 금지
- Approved date: 2026-08-07

## 진행 결과

- Guild/user 경계 입력을 검증하고 active enrollment와 account projection을
  단일 SELECT로 읽는 최소 contract/store를 구현했다.
- 결과는 `availableBalance`, `correctionDebt`의 정확한 `bigint` 또는
  `not_enrolled`만 반환하며 내부 ID와 version을 노출하지 않는다.
- Unit test `2/2`, disposable PostgreSQL suite `19/19`, 전체 test
  `306 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- Discord command/runtime, transaction·audit, schema·migration·dependency와
  Production은 연결·추가·적용하지 않았다.
