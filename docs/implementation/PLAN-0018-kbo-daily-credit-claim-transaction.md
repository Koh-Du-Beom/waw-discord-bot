# 구현 계획: KBO KST 일일 크레딧 지급 transaction

- Status: Completed (local/disposable only)
- Related requirements: `FUN-023`, `FUN-031`
- Related ADRs: `ADR-0029`
- Depends on: migrations `0011`·`0012`, completed `PLAN-0016`·`PLAN-0017`
- Owner: Product owner

## 목표

활성 KBO 가입 사용자의 직접 요청에 대해 KST 날짜당 50,000 크레딧을 정확히
한 번 지급하고, 기존 correction debt를 먼저 상계하는 처리를 하나의 멱등
PostgreSQL transaction으로 구현한다.

## 현재 구현 상태

- `credit_account`는 non-negative available balance, correction debt와 version을
  보유하고 `credit_ledger_entry`는 `daily_claim`과 전후 projection을 기록한다.
- `daily_credit_claim`은 `(account_id, claim_date)`, operation과 ledger entry의
  중복을 DB constraint로 막는다.
- 가입 transaction store는 active enrollment와 0잔액 account를 만들지만 지급
  계산, KST 날짜 변환과 claim transaction은 없다.
- Bot workload는 account update와 ledger/claim/audit insert 및 관련 select가
  가능하지만 operation ledger select 권한은 없다.

## 범위

- 최소 daily claim domain input/result와 PostgreSQL store
- 서버가 제공한 현재 시각의 `Asia/Seoul` claim date 계산
- active enrollment 확인과 account `FOR UPDATE` lock
- 50,000 중 correction debt 우선 상계와 남은 available balance 증가
- operation, ledger, account projection, claim과 최소 audit의 단일 transaction
- 동일 operation 성공 재시도의 기존 지급 결과 반환
- 동일 account·KST 날짜의 순차·동시 중복 지급 방지
- 표 기반 unit test와 disposable PostgreSQL 통합 테스트

## 범위 제외

- Discord slash command, 사용자 문구·UI와 runtime 조립
- 자동 지급, scheduler, 과거 미수령분 누적과 client 날짜 입력
- 잔액·최근 지급 조회 DTO와 dashboard
- 베팅, payout, void, correction 생성과 관리자 조정
- 서버 탈퇴 처리와 보존 purge
- schema·migration·dependency 추가와 Production 적용·feature activation

## 선행 조건과 고정 경계

1. 입력 시각은 command 경계가 주입한 서버 현재 시각이며 client option을 받지
   않는다. Store는 유효한 `Date`만 받고 표준 `Intl.DateTimeFormat`의
   `Asia/Seoul` calendar parts로 `YYYY-MM-DD`를 만든다.
2. Active enrollment를 account와 함께 조회하고 account row를 `FOR UPDATE`로
   잠근다. 미가입·departed 사용자는 `not_enrolled`이며 mutation하지 않는다.
3. 지급 총액은 항상 50,000이다. `debtPaid = min(50,000, correction_debt)`,
   `availablePaid = 50,000 - debtPaid`로 계산한다.
4. Ledger는 `reason_code/source_type = daily_claim`, canonical source ID는 KST
   claim date, actor는 system으로 기록한다. `debt_delta`는 `-debtPaid`,
   `available_delta`는 `availablePaid`다.
5. Account balance/debt와 version update, operation claim, ledger, daily claim과
   audit 중 하나라도 실패하면 모두 rollback한다. 전액 debt 상계로 available
   증가가 0이어도 claim과 ledger를 기록하고 그 날짜 지급을 소비한다.
6. 같은 operation이 이미 성공했다면 `daily_credit_claim`과 연결 ledger를 조회해
   기존 `availablePaid`·`debtPaid`를 반환한다. Claim이 없는 중복 operation은
   현재 operation SELECT 권한을 늘리지 않고 `duplicate_operation`을 반환한다.
7. 같은 날짜의 다른 operation은 account lock 뒤 기존 claim을 확인해
   `already_claimed`로 종료하며 잔액·ledger·claim을 늘리지 않는다.
8. Raw Discord ID, operation ID와 잔액을 운영 log나 public error에 반사하지 않는다.

## 작업

### Task 1: 일일 지급 계산과 PostgreSQL transaction store

- 목적: 사용자-facing command 없이 KST 일일 지급의 계산·멱등성·원자성만
  구현한다.
- 변경 예상 파일: `src/kbo/daily-credit-claim.ts`,
  `src/persistence/postgres-kbo-daily-credit-claim-store.ts`, 관련 unit/PostgreSQL
  integration test, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - KST 23:59:59와 00:00:00, UTC 날짜가 다른 시각의 claim date 표
  - debt 0, 1~49,999, 50,000 초과에서 available/debt delta와 합계 50,000
  - 최초 지급은 account projection/version, operation, ledger, claim, audit 각
    정확한 한 건을 같은 transaction에 기록
  - debt 부분·완전 상계와 available 증가 0인 경우의 전후 값
  - 동일 operation 순차·동시 재시도는 기존 성공 결과를 반환하고 row를 늘리지 않음
  - 서로 다른 operation의 동일 account/date 동시 요청 20개는 한 건만 지급하고
    나머지는 `already_claimed`
  - 다음 KST 날짜는 다시 지급 가능하고 미수령 날짜를 소급 생성하지 않음
  - 미가입·departed 사용자는 `not_enrolled`이고 mutation 없음
  - ledger, claim 또는 audit 강제 실패 시 account와 operation 포함 전부 rollback
  - malformed/oversized ID와 잘못된 시각은 DB 연결 전에 비반사 오류로 거부
- 완료 기준: unit/disposable PostgreSQL에서 KST 경계, debt-first 계산, 중복·동시성,
  기존 성공 재조회와 rollback이 재현되고 전체 test/typecheck가 통과한다.
- 위험: application과 PostgreSQL session timezone에 의존하면 날짜가 달라질 수
  있으므로 SQL의 current date를 사용하지 않고 계산된 ISO claim date 하나를 모든
  source/claim write에 전달한다.
- 롤백: Discord/runtime에 연결되지 않은 새 store와 domain 파일만 제거하며
  migrations `0011`·`0012`와 Production 데이터에는 영향이 없다.

## 검증 계획

- 대상 unit/PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

새 migration은 없다. 구현 승인 시에도 store는 local/disposable PostgreSQL에서만
검증하고 Discord command나 bot runtime에 연결하지 않는다. Migrations `0011`·
`0012`의 Production 적용은 exact owner gate와 backup·restore 증거 전까지 금지한다.

## 문서 갱신

- 이 계획과 `PROJECT_STATUS.md`에 local/disposable 완료 결과를 기록했다.

## 승인

- Owner decision: Approved — Task 1의 계산, PostgreSQL transaction store와
  unit/PostgreSQL 테스트만 구현; Discord command와 Production 연결 금지
- Approved date: 2026-08-07

## 진행 결과

- 표준 `Intl.DateTimeFormat`으로 서버 시각의 KST claim date를 계산하고 50,000을
  correction debt에 먼저 배분하는 domain 계약을 구현했다.
- Active enrollment의 account lock 뒤 operation, account projection, 불변 ledger,
  daily claim과 audit을 한 transaction으로 처리하는 store를 구현했다.
- 동일 성공 operation은 claim·ledger의 기존 결과를 반환한다. 동일 날짜의 다른
  operation 20개 동시 요청은 정확히 한 건만 지급했다.
- Unit test `4/4`, disposable PostgreSQL suite `18/18`, 전체 test
  `303 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- Discord command/runtime, schema·migration, dependency와 Production은
  연결·추가·적용하지 않았다.
