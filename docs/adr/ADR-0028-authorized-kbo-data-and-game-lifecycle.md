# ADR-0028: 권리 확인형 KBO 데이터 어댑터와 경기 생명주기

- Status: Accepted
- Date: 2026-07-31
- Owners: 프로젝트 소유자
- Related requirements: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`, `OWN-039`~`OWN-041`, `DAT-001`~`DAT-005`, `OPS-002`~`OPS-004`, `SEC-007`~`SEC-010`
- Related research: `docs/research/technology-options/kbo-data-sources.md`, `docs/research/technology-options/kbo-discord-bot-and-credit-prediction-system.md`
- Related ADRs: `ADR-0001`, `ADR-0004`, `ADR-0006`, `ADR-0014`
- Supersedes: 없음
- Superseded by: 없음

## Context

2026-07-31 소유자 결정으로 KBO 일정·결과·순위와 비현금형 크레딧 승부
예측이 제품 범위에 다시 포함됐다. 기존 `FUN-007`~`FUN-009`는 폐기 이력으로
남기고 새 `FUN-021`~`FUN-031`을 사용한다.

공식 KBO 웹 화면은 필요한 정보를 보여 주지만 자동 접근·저장·Discord
재표시 권리와 운영 SLA를 제공하는 공개 API 계약은 확인되지 않았다. 공개
`kbo-game` 패키지는 웹 내부 endpoint를 호출할 뿐 데이터 권리, 안정적인
schema, timeout과 상태 완전성을 보장하지 않는다. 외부 Discord 봇도 UX 비교
대상일 뿐 데이터 공급 계약이 아니다.

승부 예측은 단순 조회보다 강한 데이터 계약이 필요하다. 더블헤더, 연기,
취소, 노게임, 서스펜디드, 무승부와 최종 기록 정정을 잘못 매핑하면 접수 잠금과
크레딧 정산이 틀어진다. 공급자 원본 상태를 domain 전반에 직접 노출하면
공급자 교체와 schema 변경의 영향도 커진다.

## Decision drivers

1. Discord·대시보드 표시, 자동 접근, 저장과 필요한 보존 권리를 서면으로
   확인하기 전에는 운영 수집을 활성화하지 않아야 한다.
2. 공개 웹 크롤링, 소비자 앱 내부 API와 외부 봇 응답을 fallback으로 사용하지
   않아야 한다.
3. 공급자의 안정적인 경기 ID로 더블헤더와 재편성 경기를 구분해야 한다.
4. 홈·원정, 예정 시작 시각, 상태, 최종 점수와 공급자 정정을 손실 없이
   내부 모델로 투영해야 한다.
5. 알 수 없는 상태, 오래된 데이터와 공급자 장애에서 조회와 베팅이 현재
   데이터인 것처럼 동작하지 않아야 한다.
6. 경기 결과 정정의 출처와 버전을 보존하고 정산이 보상 처리할 수 있어야 한다.
7. 공급자 credential과 원본 body를 로그·공개 DTO·감사에 노출하지 않아야 한다.
8. 단일 bot/scheduler 배포에서 중복 poller와 동시에 적용되는 revision을
   방지해야 한다.
9. 공급자를 바꾸더라도 정산된 과거 경기의 출처와 ID를 설명할 수 있어야 한다.

## Considered options

### Option A: 권리 확인형 공급자 어댑터와 내부 최소 경기 모델

서면 권리가 확인된 KBO 직접 feed 또는 계약형 공급자를 adapter 뒤에 두고,
제품에는 필요한 최소 경기 projection만 제공한다. 공급자가 결정되기 전에는
adapter port와 합성 fixture만 정의하며 운영 ingestion은 feature gate로 닫는다.

장점은 데이터 권리와 runtime 활성화를 같은 gate로 묶고, 공급자 schema와
제품의 베팅 상태를 분리하며, 장애 시 실패 폐쇄하기 쉽다는 점이다. 단점은
공급자별 상태 mapping과 revision 검증이 필요하고 계약 전 실제 adapter를
완성할 수 없다는 점이다.

### Option B: KBO 또는 스포츠투아이 전용 직접 연동

권한 있는 원천과 직접 계약해 전용 integration을 만든다. 권리 출처와
공식성이 가장 분명할 수 있지만 제공 형식, 계약 가능성, 가격, SLA와 기술
지원이 아직 확인되지 않았다. 직접 feed가 계약되면 Option A의 첫 adapter가
될 수 있으므로 구조적으로 상충하지는 않는다.

### Option C: KBO 공개 웹 또는 내부 endpoint 수집

초기 비용과 구현량은 작아 보이지만 자동 접근·재표시 권리가 확인되지 않았고,
version 계약과 SLA가 없으며 상태 변경에 취약하다. 운영 fallback으로도
허용하지 않는다.

### Option D: 외부 Discord 봇 응답 또는 관리자 수동 입력

외부 봇은 출처·권리·정확성을 검증할 수 없고 자동 소비 계약도 없다. 관리자
수동 입력은 비생산 fixture에는 사용할 수 있지만 오입력·정정·실시간 운영
부담 때문에 공식 정산 원천이 될 수 없다.

## Decision

Option A를 선택한다. 구체 공급자는 이 ADR에서 선택하지 않는다. KBO 또는
스포츠투아이 직접 계약도 권리와 기술 조건을 충족하면 같은 adapter 경계에
들어오는 공급자 후보로 유지한다.

### 활성화 gate

- 운영 ingestion과 베팅 feature flag는 기본값을 off로 한다.
- 운영 활성화 전 계약 또는 서면 허가에서 KBO 범위, Discord와
  `waw.dubeom.com` 표시, 자동 접근, 캐시·저장·보존, 파생 결과, 출처 표기,
  호출 한도, 가격, 종료 조건을 확인한다.
- 공급자의 안정적인 경기 ID, 상태표, 정정 방식과 데이터 시각을 sandbox 또는
  허용된 시험 환경에서 검증한다.
- 위 증거가 하나라도 없으면 조회는 합성 개발 fixture에만 머물고 운영
  ingestion과 베팅을 활성화하지 않는다.

### 공급자 port와 저장 projection

공급자 adapter는 최소한 다음을 정규화한다.

- `provider_key`, `provider_game_id`, 시즌과 경기 종류
- 홈·원정 팀의 내부 ID와 공급자 ID
- 더블헤더 차수 또는 공급자가 보장하는 구분자
- 예정 시작 시각과 공급자 시간대
- 공급자 원본 상태에 대응하는 내부 상태
- 홈·원정 최종 점수
- 공급자 데이터 갱신 시각과 WAW 수집 시각
- 단조 증가 revision 또는 동일 변경을 식별할 content fingerprint

공급자 원본 payload 전체는 기본적으로 저장하지 않는다. 계약과 장애 분석에
필요하다는 별도 결정이 있을 때만 허용 필드, 암호화, 접근과 보존 기간을
정한다.

### 내부 경기 상태

공급자 상태는 다음 내부 상태 중 하나로 명시적으로 매핑한다.

- `scheduled`
- `postponed`
- `cancelled`
- `no_game`
- `suspended`
- `in_progress`
- `final_pending`
- `final`

공급자의 알 수 없는 값은 `scheduled`이나 `final`로 추정하지 않고 ingestion
오류와 `unknown` read 상태로 격리한다. `open`과 `locked`는 공급자 경기 상태가
아니라 예정 시작 시각과 데이터 신선도에서 계산하는 베팅 가능 상태다.

- 예정 시작 시각 이상이면 공급자 live 상태와 무관하게 잠근다.
- 시작 시각, 팀, 경기 ID 또는 상태가 불명확하면 잠근다.
- `postponed`, `cancelled`, `no_game`은 신규 접수를 닫고 원금 환불 대상
  event를 만든다.
- `postponed` 경기가 공급자의 새 revision에서 검증된 미래 시작 시각으로 다시
  편성되면 기존 베팅을 되살리지 않고 새 `market_version`의 베팅 시장을 열 수
  있다. 기존 시장은 void 상태로 유지한다.
- `suspended`는 신규 접수를 닫고 공식 재개 또는 최종 판정까지 정산을
  보류한다.
- 공급자 final을 바로 정산 가능 상태로 승격하지 않고 설정된 정정 유예를
  통과한 뒤 `final`로 확정한다. 유예 시간은 공급자 실측 후 구현 계획 전에
  결정한다.

### 수집, revision과 관측

- 기존 단일 활성 scheduler 원칙을 재사용해 중복 ingestion worker를 막는다.
- `(provider_key, provider_game_id, provider_revision)` 또는 검증된 동등 key로
  중복 event 적용을 방지한다.
- 한 revision의 경기 projection 갱신과 후속 정산 대상 event 기록은 같은
  PostgreSQL transaction에서 commit하거나 rollback한다.
- final 이후 변경은 기존 row와 정산 이력을 삭제하지 않고 새 revision과
  correction event로 기록한다.
- 데이터 건강 상태는 마지막 성공 수집 시각, 공급자 데이터 시각, 지연,
  오류, 알 수 없는 상태와 미정산 경기 수를 분리해 표시한다.
- 신선도 임계값은 공개 문서의 cache TTL을 SLA로 오해하지 않고 계약과 실제
  관측값으로 정한다.

### 조회와 실패 정책

- Discord 응답은 출처, 공급자 데이터 시각과 수집 시각을 표시한다.
- 오래된 데이터는 마지막 관측 시각과 함께 `stale`로 표시하고 최신이라고
  표현하지 않는다.
- 베팅 접수는 공급자 장애, stale, unknown 상태와 권리 gate 비활성에서
  fail closed한다.
- 장애 시 KBO 웹, 소비자 앱 또는 외부 봇으로 자동 fallback하지 않는다.
- Dashboard web은 경기 projection과 공급 상태를 읽기만 하며 공급자
  credential이나 ingestion mutation 권한을 받지 않는다.

## Rationale

권리 확인을 단순 문서 할 일이 아니라 runtime gate로 만들면 허가가 없는
수집이 구현 편의상 운영에 들어가는 것을 막을 수 있다. 공급자 adapter와
최소 경기 모델은 구체 vendor를 미리 추상화하지 않으면서도 원본 schema가
베팅·랭킹·대시보드에 퍼지는 것을 막는다.

예정 시각 기반 잠금과 알 수 없는 상태의 실패 폐쇄는 늦은 provider status로
경기 시작 후 베팅이 열리는 위험을 줄인다. Revision과 correction event를
보존하면 결과 정정 뒤 원장을 삭제하지 않고 재정산할 수 있다.

## Consequences

### Positive

- 데이터 권리와 운영 활성화 조건이 명시적이다.
- 더블헤더·무승부·연기·취소·서스펜디드·정정을 한 모델에서 구분한다.
- 공급자 장애가 경기 시작 후 접수나 잘못된 자동 정산으로 이어지지 않는다.
- 공급자 변경 시 제품 domain과 Discord 명령의 변경 범위를 줄인다.
- 출처와 데이터 신선도를 사용자와 관리자에게 설명할 수 있다.

### Negative

- 공급 계약 전에는 실제 운영 조회와 베팅을 출시할 수 없다.
- 공급자별 상태 mapping, revision과 데이터 건강 관측을 구현해야 한다.
- `final_pending` 때문에 공식 화면보다 크레딧 지급이 늦을 수 있다.
- 계약형 공급자의 가격이 기존 월 지출 목표를 초과할 수 있다.

### Risks

- 주문서의 허용 `Property`가 Discord 봇을 포함하지 않을 수 있다.
- 공급자가 안정적 revision을 제공하지 않으면 fingerprint와 correction
  검증이 복잡해질 수 있다.
- 재편성 경기의 provider ID가 바뀌면 기존 베팅과 새 경기를 잘못 연결할 수 있다.
- 같은 provider ID의 연기 경기를 기존 시장으로 다시 열면 환불된 과거 베팅과
  새 베팅이 섞일 수 있다.
- 서로 다른 팀·상태 용어를 무리하게 정규화하면 공급자 의미를 잃을 수 있다.
- 계약 종료 뒤 과거 provider ID나 점수를 보존할 권리가 없을 수 있다.

## Validation

- 계약/권리 체크리스트에서 표시 속성, 저장·보존, 파생 결과, 출처, 종료
  조건을 모두 서면 확인한다.
- 허용된 sandbox 또는 합성 fixture로 10개 팀, 정규시즌·포스트시즌,
  더블헤더, 재편성, 무승부를 검증한다.
- `scheduled`, `postponed`, `cancelled`, `no_game`, `suspended`,
  `in_progress`, `final_pending`, `final`, 알 수 없는 상태 fixture를 검증한다.
- 같은 provider game ID의 연기·환불·재편성에서 새 market version만 열리고
  과거 void bet은 되살아나지 않는지 검증한다.
- 예정 시작 경계 전후, stale, 공급자 timeout·429·오류에서 베팅이
  fail closed하는지 가짜 시간으로 검증한다.
- 동일 revision 재수신, out-of-order revision, final correction과 process
  재시작에서 projection과 correction event가 중복되지 않는지 검증한다.
- 원본 body, API key, 계약 식별자와 내부 provider 오류가 운영 log·Discord
  응답·browser DTO에 노출되지 않는지 canary로 검사한다.
- 데이터 건강 화면이 source update와 fetch time, stale과 unavailable을
  구분하는지 desktop/mobile 접근성으로 확인한다.

## Rollback or migration

- Schema는 additive migration으로 도입하고 ingestion과 KBO 명령·베팅을 서로
  분리된 default-off feature flag 뒤에 둔다.
- 장애 또는 권리 만료 시 먼저 신규 ingestion과 베팅 접수를 끈다. 마지막
  데이터는 stale로 표시하거나 조회를 닫는다.
- 이미 열린 베팅은 승인된 경기 예외 정책에 따라 공식 공급자 결과로 정산하거나
  무효·환불하고 공급 경로를 임의 변경하지 않는다.
- 이전 application release로 돌아가도 저장된 경기 revision, correction event와
  정산 출처는 삭제하지 않는다.
- 공급자 교체는 열린 베팅을 자동 이동하지 않고 경기 ID 대응을 검증한 별도
  migration 계획을 요구한다.

## Conditions for reconsideration

- KBO 또는 스포츠투아이가 안정적인 공식 공개 API와 명시적 Discord 재표시
  라이선스를 제공하는 경우
- 계약 공급자가 경기 revision 또는 필요한 예외 상태를 제공하지 못하는 경우
- 공급자 비용이 승인된 월 지출 상한을 초과하는 경우
- 다중 guild, 다른 리그 또는 실시간 play-by-play가 제품 범위에 추가되는 경우
- final 정정 지연 실측이 현재 상태 모델이나 정산 유예로 감당되지 않는 경우

## Approval

- Owner decision: Approved — 권리 확인형 공급자 adapter, 내부 최소 경기
  projection, 안정적 경기 ID·revision, 명시적 예외 상태, 예정 시각 잠금,
  final 정정 유예, 실패 폐쇄와 권리 미확인 fallback 금지를 승인함
- Approved date: 2026-07-31
