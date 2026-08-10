# ADR-0030: KBO 데이터 공급자와 신선도 gate

- Status: Rejected
- Date: 2026-08-07
- Owners: 프로젝트 소유자
- Related requirements: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`, `OWN-040`
- Related research: `docs/research/technology-options/kbo-provider-selection-and-freshness.md`
- Related ADRs: `ADR-0028`, `ADR-0029`
- Supersedes: 없음
- Superseded by: 없음

## Context

`ADR-0028`은 권리가 확인된 공급자 adapter와 실패 폐쇄를 승인했지만 구체
공급자, 신선도 임계값과 `final_pending` 정정 유예는 실측 뒤 결정하도록
남겼다. 공개 웹이나 소비자 앱은 재표시권·schema·SLA가 없어 사용할 수 없다.

## Decision drivers

1. KBO·Discord·dashboard 표시, 자동 접근, 저장과 보존 권리를 서면 확인한다.
2. 일정·결과·순위, 안정적인 ID와 경기 예외 상태를 제공한다.
3. stale 데이터로 베팅하거나 불확실한 결과를 정산하지 않는다.
4. 비용, quota, SLA와 종료 조건을 운영 전에 알 수 있다.
5. 실제 계약 후보 하나가 생기기 전 다중 공급자 구현을 만들지 않는다.

## Considered options

### Option A: Sportradar Global Baseball v2

공개 문서로 KBO와 필요한 endpoint·상태를 확인할 수 있고 30일 trial이 있다.
가격, KBO 권리 출처, Discord 재표시권과 SLA는 주문서 확인이 필요하다.

### Option B: KBO 또는 스포츠투아이 직접 B2B feed

권리 사슬이 가장 짧을 수 있지만 공개 API, 계약 가능성, 형식, 가격과 SLA를
확인하지 못했다.

### Option C: 공개 웹·소비자 앱 또는 외부 봇

재표시권, version 계약과 SLA가 없어 `ADR-0028`이 금지한다.

## Decision

Option A를 **조건부 1순위 계약·trial 후보**로 선택한다. 이는 production
공급자 확정이나 계약 승인이 아니다.

다음 gate를 순서대로 모두 통과해야 이 ADR을 Accepted로 전환할 수 있다.

1. Sportradar 주문서가 KBO 권리 출처, Discord와 `waw.dubeom.com` 표시,
   자동 접근, 최소 projection·revision 저장/보존, 파생 정산·랭킹, 가격,
   quota, SLA, 장애 통지와 종료 처리를 명시한다.
2. 같은 조건의 KBO/스포츠투아이 직접 견적과 비교하고 직접 경로가 더 명확하고
   승인 예산 안이면 Option B로 이 ADR을 수정한다.
3. 소유자가 견적과 30일 trial Spike를 승인한다.
4. Research 문서의 실제 KBO 표본과 실패 경로 검증이 통과한다.
5. 소유자가 아래 값 또는 실측으로 수정한 값을 승인한다.
   - 시작 2시간 전 베팅 접수: 마지막 성공 fetch 5분 이하
   - 다른 예정 경기와 standings 조회: 30분 이하
   - 진행·`ended`·`closed`: 5분 이하
   - 최초 `closed` 후 정산: 30분 유예와 5분 이상 간격의 동일 결과 2회

어느 gate든 실패하면 KBO 조회·베팅 production flag는 off로 유지한다.

구현은 선택된 adapter 하나만 만든다. 공급자 port와 내부 최소 projection은
`ADR-0028`을 그대로 사용하고 공급자 factory, fallback과 두 번째 adapter는
만들지 않는다.

## Rationale

Sportradar는 현재 공개 근거가 가장 완전해 검증을 시작할 현실적인 후보지만,
계약과 실측 없이 권리·비용·신선도를 추정할 수 없다. 조건부 결정은 조사
대상을 하나로 줄이면서 운영 gate를 약화하지 않는다.

## Consequences

### Positive

- 계약 문의와 trial의 합격 기준이 명확하다.
- stale 베팅과 조기 정산이 기본 거부된다.
- 실제 필요 전 다중 공급자 복잡성을 만들지 않는다.

### Negative

- 견적과 30일 표본 전에는 구현 계획을 승인할 수 없다.
- 공개 가격이 없어 월 비용 적합성을 지금 판단할 수 없다.
- 1,000회 trial quota에 맞춘 표본 수집 계획이 필요하다.

### Risks

- Discord 또는 비현금 예측이 허용 property/use case에서 제외될 수 있다.
- trial 기간에 예외 경기나 공식 정정이 발생하지 않을 수 있다.
- `closed`가 KBO 공식 확정과 정확히 일치하지 않을 수 있다.

## Validation

- Research 문서의 주문서 체크리스트와 trial 합격 기준을 사용한다.
- 계약 답변과 원본 trial payload는 저장소에 커밋하지 않는다.
- 상태 mapping, 지연 분포, 429·timeout·unknown enum을 재현 가능한 합성
  fixture와 비공개 측정 결과로 검증한다.

## Rollback or migration

이 Proposed ADR은 제품 코드·schema·dependency와 production을 바꾸지 않는다.
기각 시 문서를 Rejected로 표시하고 기존 default-off 상태를 유지한다.

## Conditions for reconsideration

- KBO/스포츠투아이가 더 명확한 권리와 승인 예산 내 직접 feed를 제공하는 경우
- Sportradar가 필요한 표시·파생 이용을 허용하지 않는 경우
- 실제 지연이나 정정 빈도가 후보 임계값을 충족하지 못하는 경우
- 계약 비용 또는 최소 기간이 승인 예산을 넘는 경우

## Approval

- Owner decision: Rejected — 2026-08-07 owner가 외부 KBO Discord 봇 응답을
  WAW가 읽어 경기 정보와 정산 입력으로 쓰는 제품 의도를 명확히 해 계약형 API
  우선 선택이 현재 목표와 다름을 확인함. `ADR-0031`에서 대안을 재검토함.
- Approved date: 2026-08-07
