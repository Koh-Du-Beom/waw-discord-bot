# ADR-0029: 불변 크레딧 원장과 멱등 베팅 정산

- Status: Accepted
- Date: 2026-07-31
- Owners: 프로젝트 소유자
- Related requirements: `FUN-023`~`FUN-031`, `OWN-041`~`OWN-045`, `OWN-048`, `PRI-002`~`PRI-003`, `DAT-001`~`DAT-005`, `SEC-001`~`SEC-009`, `INT-002`~`INT-003`
- Related research: `docs/research/technology-options/kbo-discord-bot-and-credit-prediction-system.md`, `docs/research/technology-options/kbo-betting-product-decisions.md`
- Related ADRs: `ADR-0006`, `ADR-0007`, `ADR-0017`, `ADR-0019`, `ADR-0025`, `ADR-0028`
- Supersedes: 없음
- Superseded by: 없음

## Context

KBO 승부 예측 가입 사용자는 KST 날짜마다 직접 요청해 50,000 비현금
크레딧을 받고, 경기 결과에 크레딧을 걸 수 있다. 한 경기에는 한 베팅만
허용하며 결과 실패는 0배, 결과 적중은 원금 포함 2배, 정확 점수 적중은
3배를 반환한다. 사용자는 가용 잔액과 최근 5개 베팅 및 공개 랭킹을 조회한다.

동시 지급, 중복 interaction, process 재시작, 정산 재시도와 공식 결과 정정은
같은 잔액을 여러 번 바꿀 수 있다. 잔액을 직접 수정하거나 감사 row를 나중에
추가하면 부분 실패에서 잔액과 설명 가능한 이력이 달라진다.

대시보드는 현재 feature table을 읽기만 하며 관리자 mutation은 ADR-0017의
별도 Unix socket을 사용한다. 크레딧 조정을 위해 web에 직접 쓰기 권한을
주거나 generic mutation을 추가하면 기존 trust boundary를 깨뜨린다.

## Decision drivers

1. 일일 지급, 베팅 차감, 반환·무효 환불과 관리자 조정이 중복 실행되지
   않아야 한다.
2. 모든 잔액 변화는 원인, 행위자 또는 system source, 전후 잔액과 시각으로
   설명 가능해야 한다.
3. 사용자 가용 잔액은 음수가 될 수 없고, 베팅 등록과 차감은 한 transaction
   이어야 한다.
4. 사용자·서버·경기당 베팅 하나와 시작 시각 잠금을 DB와 domain 양쪽에서
   강제해야 한다.
5. 정산과 반환액 지급, 무효 환불, 공식 정정은 멱등하고 재시작에 안전해야 한다.
6. 기존 등록과 베팅 가입을 구분하고 랭킹에는 가입 사용자만 포함해야 한다.
7. Dashboard web은 bot token 또는 feature mutation DB 권한을 받지 않아야 한다.
8. 관리자 조정은 자기 계정, stale 화면, 중복 클릭, 권한 상실과 response
   timeout에 안전해야 한다.
9. Discord ID, OAuth/session/CSRF, 베팅 입력과 provider body를 운영 log에
   노출하지 않아야 한다.
10. 첫 버전에 사용자 간 송금이나 현실 가치 교환을 암묵적으로 열지 않아야 한다.

## Considered options

### Option A: 부호형 불변 원장과 transactionally maintained 잔액 projection

각 잔액 변화를 immutable ledger entry로 추가하고 `credit_account` 현재 잔액을
같은 transaction에서 갱신한다. Account row lock과 unique operation/source
constraint로 동시성과 멱등성을 제어한다.

장점은 잔액 조회가 빠르고 모든 변화를 설명할 수 있으며 PostgreSQL transaction과
현재 프로젝트 패턴을 재사용하는 것이다. 단점은 projection과 원장 합계의
불변 조건을 migration·검증·복구 절차로 계속 확인해야 한다.

### Option B: 원장 합계만으로 매번 잔액 계산

별도 current balance를 두지 않아 projection 불일치는 없지만 베팅 등록마다
원장 전체 합계와 동시 writer 직렬화를 해결해야 한다. 랭킹과 관리자 목록에서
반복 집계 비용이 커지고 account-level lock 경계가 불명확하다.

### Option C: 변경 가능한 잔액과 별도 감사 로그

구현은 단순하지만 잔액 update와 감사 write가 분리되기 쉽고, 기록 삭제·수정,
중복 정산과 장애 복구를 검증하기 어렵다. 사용자가 승인한 불변 원장 요구를
충족하지 못한다.

### Option D: 복식부기형 시스템 계정

모든 지급·베팅을 treasury, escrow, payout 계정 간 transfer로 표현한다.
보존 법칙은 강하지만 크레딧 총량이 일일 무상 지급으로 의도적으로 늘고
사용자 간 거래도 없으므로 첫 버전에는 과도한 계정·정산 복잡성을 만든다.

## Decision

Option A를 선택한다. 단일 사용자 계정에 대한 부호형 불변 원장을 source of
truth로 하고, 현재 가용 잔액은 같은 transaction에서 유지하는 검증 가능한
projection으로 둔다.

### 가입과 계정

- `betting_enrollment`는 `(guild_id, discord_user_id)`별 가입·서버 탈퇴에
  따른 비활성 상태, 동의한 정책 version과 상태 변경 시각을 가진다.
- 기존 `registered_discord_user` row는 가입 자격 확인에 재사용할 수 있지만
  자동으로 `betting_enrollment`를 만들지 않는다.
- 최초 활성 가입 때 `credit_account`를 만들며 시작 잔액은 0이다. 사용자용
  가입 해제·복구는 제공하지 않고 Discord 서버 탈퇴의 비활성화·직접 연결
  제거·원장 수명은 `OWN-048`을 따른다.
- Account는 opaque 내부 ID, non-negative `available_balance`, non-negative
  `correction_debt`, non-negative `version`과 생성·갱신 시각을 가진다.
- 공개 DTO와 운영 log는 raw Discord user ID 대신 필요한 경우 현재
  display label 또는 opaque account ID를 사용한다.

### 불변 원장

`credit_ledger_entry`는 최소한 다음을 저장한다.

- account ID와 단조 증가 entry ID
- `daily_claim`, `bet_stake`, `bet_payout`, `bet_void_refund`,
  `settlement_correction`, `admin_adjustment` 중 하나인 reason code
- 양수 또는 음수 `available_delta`와 `debt_delta`
- 조정 전·후 가용 잔액과 correction debt
- stable operation ID와 source type/source ID
- system 또는 관리자 actor의 최소 식별자
- 발생 시각

원장 entry는 보존 기간 중 application에서 update/delete하지 않는다. 잘못된
entry는 새 보상 entry로만 수정한다. `OWN-048`의 수명 만료에 따른 사용자 단위
삭제는 원장 정정이 아니라 별도 정책적 lifecycle purge다. 같은 account에서
`(operation_id, reason_code)`와 reason별 canonical source key를 unique하게 해
재시도를 중복 적용하지 않는다.

Account row lock, 잔액 검증, domain row 변경, ledger insert, account projection
update와 감사·terminal result는 한 PostgreSQL transaction에서 commit하거나
rollback한다.

`available_balance`와 `correction_debt`를 직접 상계하거나 덮어쓰지 않는다.
Debt 생성·상계도 원인과 전후 값을 가진 원장 entry로만 반영한다.

### 일일 지급

- `daily_credit_claim`은 `Asia/Seoul`에서 계산한 `claim_date`를 저장한다.
- `(guild_id, discord_user_id, claim_date)`를 unique하게 한다.
- 서버가 검증한 현재 시각에서 날짜를 계산하며 client 날짜를 신뢰하지 않는다.
- Claim insert와 50,000 credit는 한 transaction이다. 기존 correction debt가
  있으면 `min(50,000, correction_debt)`를 debt에서 먼저 차감하고 나머지만
  available balance에 더한다. 전액 상계되더라도 해당 날짜의 claim은 소비된다.
- 같은 Discord interaction 또는 operation 재시도는 기존 성공을 반환하며 새
  지급을 만들지 않는다.

### 베팅 등록

- `kbo_bet`은 내부 game ID와 `market_version`, account ID,
  홈승·무승부·원정승 선택, 선택적 홈·원정 예상 점수, stake, 등록 시각과
  상태를 가진다.
- `(guild_id, account_id, game_id, market_version)`을 unique하게 하고 활성
  상태에는 `(guild_id, account_id, game_id)` partial unique constraint를 둬
  한 경기의 동시 복수 베팅을 금지한다.
- 연기 환불 뒤 검증된 새 일정이 생기면 새 market version에 다시 베팅할 수
  있지만 과거 void bet을 수정하거나 되살리지 않는다.
- Account와 game을 잠근 뒤 가입 활성, 양의 정수 stake, 충분한 잔액, 권리·
  신선도 gate, correction debt 0, 경기 상태와
  `now < scheduled_start_at`을 다시 검증한다.
- `OWN-044`에 따라 stake는 1,000 단위의 최소 1,000·경기당 최대 50,000이고,
  KST 사용자 일일 원금 합계는 50,000 이하다. 같은 KST 날짜에 공식 무효
  환불된 금액만 당일 한도에서 해제하며 관리자별 예외는 허용하지 않는다.
- Bet insert, 음수 `bet_stake` 원장과 account 차감은 한 transaction이다.
- Discord interaction ID 또는 안정된 application operation ID로 중복 제출을
  같은 결과에 결합한다.

### 정산과 정정

- `bet_settlement`는 bet ID, 사용한 game revision, 결과 분류, multiplier,
  반환액과 정산 시각을 가진다.
- 결과 실패는 `0`, 결과만 적중은 `stake × 2`, 결과와 점수 적중은
  `stake × 3`, 무효는 `stake × 1`을 반환한다.
- 점수를 입력하지 않은 적중 베팅은 2배이고 정확 점수 3배 대상이 아니다.
- 하나의 bet과 하나의 game revision에 한 canonical settlement만 적용한다.
- Bet lock, settlement insert, payout/refund ledger, account update는 한
  transaction이다. 반환액 0인 패배도 settlement와 audit를 기록한다.
- 2배·3배 당첨금은 기존 correction debt를 먼저 상계하고 남은 금액만
  available balance에 더한다. Void 원금 반환은 당첨금이 아니므로 debt를
  상계하지 않고 available balance로 반환한다.
- 공식 정정은 기존 settlement·ledger를 수정하지 않고 이전 반환액과 새
  반환액의 차이를 `settlement_correction`으로 추가한다.
- 정정 회수액은 available balance에서 가능한 만큼 차감한다. 부족분은
  available balance를 0으로 유지한 채 correction debt를 늘린다.
- 양수 정정액은 기존 correction debt를 먼저 줄이고 남은 금액만 available
  balance에 더한다.
- Debt 생성, 부분 상계와 완전 상계는 game revision과 correction operation에
  결합한 멱등 원장 entry로 기록한다. Debt가 남아 있는 동안 새 베팅은
  거부하지만 본인 조회와 일일 지급 요청은 허용한다.

### 랭킹과 최근 기록

- 최근 5개는 등록 시각과 안정적인 tie-breaker를 내림차순으로 조회하며
  pending, settled, void와 corrected 상태를 모두 표시한다.
- 모든 서버 사용자가 조회할 수 있는 크레딧 랭킹은 가입 account projection,
  적중 랭킹은 canonical settlement projection에서 계산한다.
- 공개 크레딧 랭킹은 available balance만 사용하고 correction debt를 공개하지
  않는다. 본인 조회와 관리자 dashboard에는 debt를 별도 상태로 표시한다.
- 보유 크레딧은 시즌 간 유지하는 현재 잔액 랭킹이고, 적중 지표는 공급자
  competition/season별로 정규시즌과 포스트시즌을 분리해 계산한다. 공식 정정은
  최신 과거 시즌 revision에 반영하고 이전 snapshot은 감사용으로 보존한다.
- 관리자 조정은 실제 available balance와 공개 `관리자 조정 포함` 표식에
  반영하되 조정액·사유·관리자 신원은 공개하지 않고 적중 지표에는 영향을
  주지 않는다.
- 무효는 횟수와 적중률 분모에서 제외하고 적중률은 유효 정산 10건 이상만
  순위에 포함한다.
- 랭킹 DTO에는 현재 server display label, 통계와 본인 여부만 포함하고 raw
  Discord ID, account ID, operation ID와 ledger entry ID를 노출하지 않는다.
- 동점은 공동 순위로 처리하며 안정적인 내부 정렬은 동점을 임의로 깨지 않는다.

### 서버 탈퇴와 원장 수명

- `OWN-048`에 따라 Discord 서버 탈퇴 즉시 새 지급·베팅과 모든 공개 랭킹
  노출을 중단하되 열린 베팅은 정상 정산한다.
- 서버 탈퇴 처리를 원자적·내구적으로 기록한 뒤 표시명과 KBO 계정의 직접
  Discord 연결을 제거한다. 열린 베팅과 정산은 재연결할 수 없는 opaque
  account ID로 처리하며 복구·중복 가입 방지용 재연결 토큰은 만들지 않는다.
- Opaque 사용자 원장은 서버 탈퇴와 마지막 KBO 원장 항목 중 늦은 때부터 1년
  보존한다. 만료 전에는 불변 원장, 공식 정정과 correction debt 규칙을 계속
  적용하고 만료 뒤 계정·사용자 원장·남은 debt를 삭제한다.
- 서버 재가입은 기존 계정 복구가 아니라 명시적 신규 가입과 0 잔액으로
  처리한다. 30일 rolling backup 복구 뒤에는 탈퇴 상태와 직접 연결 제거를
  다시 적용한다.

### 관리자 조정 IPC

- ADR-0017의 별도 관리자 command socket에 exact command
  `credit_account_adjust`를 추가한다. Generic ledger write, SQL, batch와
  wildcard target은 금지한다.
- Payload는 `accountId`, `expectedVersion`, 0이 아닌 bounded integer
  `delta`, allowlisted `reasonCode`, `confirmation: true`만 허용한다.
- Browser session, OAuth/CSRF 증거, raw Discord user ID, 현재 잔액과 자유
  서술 note는 payload에 넣지 않는다.
- Web은 exact Origin/CSRF, 15분 이내 OAuth, 현재 administrator 역할과
  대상·금액·사유 확인을 검증하고 pre-dispatch 감사 실패 시 IPC를 호출하지
  않는다.
- Bot은 현재 Discord administrator 역할을 다시 확인하고 account의 canonical
  사용자가 actor와 같으면 대상 데이터를 바꾸기 전에 거부한다.
- Bot은 account row를 잠그고 expected version과 차감 후 non-negative 잔액을
  확인한다.
- 관리자 command는 available balance만 조정하며 correction debt를 직접
  생성·감소·삭제하거나 상계 순서를 우회할 수 없다. 관리자 debt 변경이
  필요해지면 별도 exact command와 새 ADR을 요구한다.
- Operation claim, admin ledger entry, account update, terminal result와 bot
  audit는 한 transaction이다.
- Response timeout은 실패로 추정하지 않고 같은 operation ID로 기존
  `operation_status`를 조회한다.

## Rationale

현재 잔액 row와 불변 원장을 같은 transaction에서 유지하면 Discord 명령과
랭킹 조회 성능을 확보하면서 지급·베팅·정산·관리자 조정을 모두 설명할 수
있다. Account row lock과 unique source key는 동일 사용자의 동시 명령과
process retry를 한 경계에서 처리한다.

관리자 조정을 기존 exact-command IPC에 추가하면 web read-only DB 권한과 bot
credential 분리를 유지한다. 자기 조정 거부와 optimistic version은 관리자
오용과 오래된 화면의 잘못된 차감을 줄인다.

## Consequences

### Positive

- 모든 크레딧 변화와 잔액을 원인별로 재구성할 수 있다.
- 동시 일일 지급, 중복 베팅과 재시작 후 이중 정산을 DB 제약과 transaction으로
  방지한다.
- 사용자 조회와 서버 랭킹은 current projection으로 효율적으로 제공한다.
- 결과 정정과 관리자 복구가 과거 기록을 삭제하지 않는다.
- 기존 dashboard read-only와 관리자 IPC 보안 경계를 유지한다.

### Negative

- Account의 available/debt projection과 원장 합계를 정기적으로 검증해야 한다.
- 가입, account, claim, bet, settlement와 ledger table 및 index가 추가된다.
- Debt가 있는 계정의 지급과 당첨금은 표시 금액과 실제 가용 증가액이 다를 수
  있어 상계 내역을 사용자에게 설명해야 한다.
- 즉시 직접 연결 제거, 1년 opaque 원장 수명과 backup의 최대 30일 삭제 지연을
  일관되게 관리해야 한다.

### Risks

- Application과 DB의 KST 날짜 계산이 다르면 일일 지급이 중복되거나 누락될 수
  있다.
- Game lock과 account lock 순서가 일관되지 않으면 deadlock이 생길 수 있다.
- Ledger entry를 운영자가 직접 수정하면 projection 검증과 감사가 무너진다.
- 정산 직후 사용자가 잘못 지급된 크레딧을 쓰면 correction debt가 생기고
  이후 지급·당첨금의 가용 증가가 지연될 수 있다.
- 자유 서술 관리자 사유를 추가하면 개인정보나 비밀이 감사·로그에 들어갈 수 있다.
- 랭킹이 가입 기간과 일일 지급 참여도를 예측 실력처럼 보이게 할 수 있다.

## Validation

- Disposable PostgreSQL 17에서 같은 사용자의 동시 claim 20개가 정확히 한
  번만 50,000을 지급하는지 검증한다.
- 가짜 시간으로 KST 23:59:59/00:00:00과 UTC 날짜 차이를 검증한다.
- 동일 경기 동시 bet, 잔액 부족, 시작 시각 경계, stale/unknown 공급 상태,
  duplicate interaction과 process restart를 검증한다.
- 홈 승·무승부·원정 승과 선택적/정확/오답 점수의 전체 판정표에서 0/2/3배와
  무효 1배를 검증한다.
- 동일 settlement 재시도, response 유실, out-of-order correction, ledger/audit
  insert 실패가 중복 지급 없이 전체 rollback되는지 검증한다.
- 가용 잔액보다 작은·같은·큰 정정 회수, debt 생성, 일일 지급과 2배·3배
  당첨금의 부분/완전 상계, 양수 정정 상계, void 원금 반환 비상계와 debt 중
  베팅 거부를 검증한다.
- Account available/debt projection과 ledger 합계를 전체 fixture와 migration
  전후에 대조한다.
- 관리자 operator·자기 조정·stale OAuth·wrong CSRF/Origin·missing
  confirmation·stale version·음수 결과·Discord timeout·중복 operation을
  거부하는지 검증한다.
- Raw Discord ID, 베팅 option, provider body, OAuth/session/CSRF와 자유 서술이
  운영 log와 public error에 없는지 canary로 검사한다.
- 최근 5개 정렬, 무효 제외, 10경기 최소 적중률, 동점과 pagination을 검증한다.
- 전체 test, typecheck, build, migration checksum, backup과 실제 restore
  rehearsal을 구현 완료 gate로 둔다.

## Rollback or migration

- 가입, 지급, 베팅, 랭킹과 관리자 조정을 서로 분리된 default-off feature
  flag 뒤에 둔다.
- Schema는 account·ledger부터 additive migration하고 기존
  `registered_discord_user`를 베팅 가입으로 backfill하지 않는다.
- 장애 시 신규 claim과 bet을 닫고 settlement worker를 무조건 중단하지 않는다.
  공식 결과와 데이터 권리를 확인할 수 있으면 열린 베팅을 정산하고, 그렇지
  않으면 정책에 따라 무효·환불한다.
- Application rollback에서 ledger, claim, bet, settlement와 operation result를
  삭제하거나 이전 mutable balance로 변환하지 않는다. Available balance와
  correction debt projection 및 debt 원장도 함께 보존한다.
- Projection 불일치는 신규 mutation을 fail closed하고 원장 기반의 별도
  검증·복구 계획으로 다시 계산한다.
- 관리자 IPC command를 allowlist에서 제거하면 dashboard는 read-only로
  유지한다. 이미 성공한 조정은 자동 취소하지 않고 새 보상 조정만 허용한다.

## Conditions for reconsideration

- 사용자 간 송금, 유료 충전, 경품 또는 현실 가치 교환이 제품 범위에 들어오는
  경우
- 다중 guild 또는 매우 큰 랭킹이 current projection과 direct query로 감당되지
  않는 경우
- 공식 결과 정정 빈도나 correction debt 규모가 운영상 감당되지 않는 경우
- 관리자 조정에 2인 승인이나 별도 owner break-glass가 필요한 경우
- 시즌 초기화가 잔액 자체를 초기화하거나 별도 경쟁 점수를 요구하는 경우
- PostgreSQL이 아닌 저장소로 이전해 현재 row lock·transaction 가정이 바뀌는 경우

## Approval

- Owner decision: Approved — 부호형 불변 원장과 transactionally maintained
  available/debt projection, 멱등 일일 지급·베팅·정산, 별도 가입, 공개 랭킹,
  관리자 IPC 조정을 승인함. 공식 정정 회수액이 가용 잔액을 초과하면 잔액을
  0으로 유지하고 correction debt를 기록해 이후 일일 지급·당첨금·양수
  정정액으로 먼저 상계하며 debt 중 새 베팅을 거부함
- Approved date: 2026-07-31
- Subsequent owner product decisions: `OWN-044`~`OWN-045`, `OWN-048` —
  베팅 한도, 시즌 랭킹·관리자 조정 표시와 최소 서버 탈퇴·원장 수명을
  구체화한다. `OWN-048`은 사용자용 탈퇴·복구를 포함한 `OWN-046`을 대체하며
  Option A와 관리자 IPC architecture 선택은 변경하지 않음
