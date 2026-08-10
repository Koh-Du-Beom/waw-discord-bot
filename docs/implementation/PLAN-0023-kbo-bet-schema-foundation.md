# 구현 계획: KBO 베팅 등록 schema 기반

- Status: Completed (local/disposable only; Production unapplied)
- Related requirements: `FUN-025`, `OWN-041`, `OWN-044`
- Related ADRs: `ADR-0029`, internal game boundary from `ADR-0028`
- Depends on: migrations `0011`·`0012`
- Owner: Product owner

## 목표

후속 베팅 등록 transaction이 활성 가입 계정의 예측·선택 점수·원금과 KST 접수
날짜를 한 번만 기록하고, 원자적 `bet_stake` 원장 차감에 결합할 수 있도록 가장
작은 additive PostgreSQL schema 계약을 만든다.

## 현재 구현 상태

- Migration `0011`은 active enrollment, non-negative account projection과
  `bet_stake` reason을 허용하는 불변 credit ledger를 제공한다.
- Migration `0012`와 현재 store는 KST 날짜 계산, account row lock, operation과
  ledger를 한 transaction으로 처리하는 패턴을 검증했다.
- ADR-0029는 내부 game ID·market version별 베팅, 사용자·서버·경기당 활성 한 건,
  1,000 단위의 1,000~50,000 원금과 KST 일일 원금 50,000 한도를 결정했다.
- `kbo_bet` table과 canonical 내부 `kbo_game` projection은 아직 없다. ADR-0031의
  외부 봇 ingestion은 Proposed이며 정상 경기 schema Spike도 보류 상태다.

## 범위

- Additive migration `0013`의 `kbo_bet` table
- opaque bet/account/internal game ID와 positive market version
- 홈 승·무승부·원정 승 선택과 선택적 홈·원정 예상 점수 쌍
- 1,000 단위의 1,000~50,000 stake DB constraint
- 서버 시각에서 계산될 KST `stake_date`와 접수 시각
- operation과 `bet_stake` ledger entry의 1:1 참조
- account·game·market 중복과 pending active bet 중복 방지
- pending/settled/void의 최소 lifecycle 상태
- web read-only, bot select/insert의 기존 RLS·최소 권한 패턴
- disposable PostgreSQL schema·constraint·grant 계약 테스트

## 범위 제외

- 베팅 등록 계산·transaction store, account 차감과 일일 합계 조회
- game/market lock, 경기 시작 시각·상태·신선도·권리 gate 검증
- `kbo_game`, provider adapter, ingestion, revision과 supplier schema
- bet status 전이, 정산·무효 환불·정정과 settlement table
- Discord command·component, 최근 베팅 조회와 dashboard
- 기존 row backfill, trigger, stored procedure와 새 dependency
- Production migration 적용·배포와 feature activation

## 선행 조건과 고정 경계

1. `kbo_bet`은 `bet_id`, `guild_id`, `account_id`, opaque `game_id`,
   `market_version`, `prediction`, optional predicted score pair, `stake`,
   `stake_date`, `status`, operation/ledger reference와 `placed_at`만 저장한다.
   공급자 ID, 팀 이름, 원본 payload와 Discord user ID를 복제하지 않는다.
   `bet_id`·`account_id`는 16~128자, `game_id`는 8~128자, `guild_id`는
   17~20자리 숫자로 제한한다.
2. `prediction`은 `home_win`, `draw`, `away_win`만 허용한다. 예상 점수는 둘 다
   null이거나 둘 다 non-negative `smallint`여야 하며 한쪽만 입력할 수 없다.
3. `stake`는 PostgreSQL `bigint`, `stake between 1000 and 50000`,
   `stake % 1000 = 0`을 모두 만족해야 한다. 가용 잔액과 사용자 KST 일일 합계
   50,000은 account lock이 필요한 후속 transaction에서 검증한다.
4. `stake_date`는 후속 store가 서버 현재 시각을 `Asia/Seoul`로 변환해 전달한다.
   Client 날짜를 받지 않고 `placed_at`이나 PostgreSQL session timezone에서 다시
   추론하지 않는다.
5. `(guild_id, account_id, game_id, market_version)`은 unique하다. 또한
   `status = 'pending'`인 `(guild_id, account_id, game_id)`에 partial unique index를
   두어 다른 market version의 동시 활성 베팅도 막는다.
6. 첫 status는 `pending`이며 DB 허용값은 후속 lifecycle이 필요한 `pending`,
   `settled`, `void`만 둔다. Task 1은 bot에 UPDATE 권한이나 상태 전이 동작을
   추가하지 않는다. 새 market 접수가 이전 market의 `void` 뒤에만 가능한지는
   후속 transaction이 잠금 아래 검증한다.
7. `operation_id`와 `ledger_entry_id`는 각각 unique FK로 둬 한 등록 operation과
   stake ledger가 여러 bet에 연결되지 않게 한다. Ledger reason이 `bet_stake`이고
   account·operation·stake delta가 bet과 일치하는지는 교차-table CHECK로 표현하지
   않고 후속 transaction과 PostgreSQL 통합 테스트에서 검증한다.
8. `account_id`는 `credit_account`를 참조한다. `guild_id`와 active enrollment의
   일치는 후속 transaction이 account lock과 함께 검증한다. Departed account나
   존재하지 않는 내부 game을 Task 1 schema만으로 접수 가능하다고 간주하지 않는다.
9. Canonical `kbo_game` table이 없으므로 `game_id` FK를 추측해 만들지 않는다.
   후속 provider-independent game projection의 식별자가 승인·구현되면 additive FK
   migration을 먼저 완료한 뒤 실제 베팅 접수를 연결한다.
10. Application workload에는 `kbo_bet` UPDATE/DELETE를 주지 않는다. Task 1은
    local/disposable schema 기반일 뿐 Discord/runtime이나 Production 베팅 활성화를
    허용하지 않는다.

## 작업

### Task 1: additive `0013` bet schema와 PostgreSQL 계약 테스트

- 목적: 베팅 접수 application 코드 전에 입력 형태, 원장 결합과 동시 중복 방지
  계약만 DB에 고정한다.
- 변경 예상 파일: `migrations/0013_kbo_bet_foundation.sql`,
  `src/persistence/run-migration.ts`, PostgreSQL migration/integration test,
  `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - migration version `13` 등록, `1..13` 순서와 재적용 거부
  - 세 prediction과 null/null 또는 유효 score pair 허용
  - 알 수 없는 prediction, 한쪽 점수, 음수·`smallint` 초과 점수 거부
  - stake 1,000·50,000 허용, 0·999·1,001·50,001과 bigint 범위 밖 거부
  - 같은 account/game/market 중복과 다른 market의 동시 pending 중복 거부
  - 기존 bet이 void일 때 새 market version pending 허용, 동일 market 재사용 거부
  - 존재하지 않는 account, operation, ledger entry와 중복 operation/ledger 연결 거부
  - stake date와 `placed_at` 저장 계약 및 ID 길이 constraint 검증
  - web은 SELECT-only, bot은 SELECT·INSERT만 가능하고 UPDATE·DELETE는 거부
  - migration 적용만으로 enrollment/account/bet/ledger backfill이 발생하지 않음
- 완료 기준: disposable PostgreSQL에서 입력·중복·참조·권한 계약이 재현되고 전체
  test/typecheck와 diff check가 통과한다.
- 위험: game FK가 없으므로 Task 1 schema만 단독으로 runtime에 연결하면 임의 game
  ID가 저장될 수 있다. 실제 접수 연결은 canonical game projection·FK와 권리·상태·
  신선도 gate가 승인된 뒤에만 계획한다.
- 롤백: Production 미적용 상태에서 migration 등록과 additive table을 제거한다.
  기존 account·claim·ledger와 Discord command에는 영향이 없다.

## 검증 계획

- 대상 migration/PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Task 1 승인 시에도 migration은 local/disposable PostgreSQL에만 적용한다. Production
적용은 canonical game FK, 최신 encrypted backup/restore 증거와 exact owner gate
전까지 금지한다. Runtime과 Discord command는 새 table을 사용하지 않는다.

## 문서 갱신

- 구현 시 이 계획의 진행 결과
- `PROJECT_STATUS.md`
- Production 적용을 별도 승인받을 때 migration/rollback runbook

## 승인

- Owner decision: Approved — Task 1의 additive `0013` migration과 PostgreSQL
  계약 테스트만 구현; Production 적용 금지
- Approved date: 2026-08-07

## 구현 결과

- Additive `0013` migration으로 prediction·선택 score pair·stake·KST stake date,
  operation/ledger 참조와 pending 중복 제약을 가진 `kbo_bet` table을 등록했다.
- Web은 SELECT-only, bot은 pending row SELECT·INSERT만 허용하며 application
  workload의 UPDATE·DELETE는 허용하지 않는다.
- Disposable PostgreSQL suite `20/20`, 전체 test
  `321 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- Transaction store, game/provider ingestion, Discord/runtime과 Production
  migration 적용·배포는 수행하지 않았다. Canonical game FK는 계속 후속 gate다.
