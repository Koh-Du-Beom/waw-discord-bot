# KBO 데이터 공급 문의 패키지

- 상태: Cancelled — 외부 미전송
- 작성일: 2026-08-07
- 연결 문서: `ADR-0028`, Proposed `ADR-0031`,
  `kbo-provider-selection-and-freshness.md`
- 용도: Sportradar와 KBO/스포츠투아이 문의문, 답변 비교표, owner 승인 양식

실제 사용자·Discord ID, API key, 계약 식별자와 production 정보를 문의에 넣지
않는다. 아래 문안은 2026-08-07 owner 검토를 통과했지만 제품 의도 정정으로
취소됐고 전송하지 않았다.

## Sportradar 문의문

**Subject:** KBO data licensing and Global Baseball API evaluation for a private Discord community

```text
Hello Sportradar Sales Team,

I am evaluating Sportradar Global Baseball API v2 for WAW, a non-commercial
service for one private Discord community. The proposed service would show KBO
schedules, completed results, and standings in Discord and on its administrator
dashboard at https://waw.dubeom.com. It may also use the data to settle a
free, non-transferable virtual-credit prediction feature. Credits cannot be
purchased, sold, transferred, redeemed, exchanged for prizes or benefits, or
connected to subscriptions, donations, advertising, or server boosts.

Before requesting a trial or selecting a provider, please confirm the following
in writing and identify which terms would appear in the order form or licence:

1. Coverage
   - Does the production Global Baseball v2 package cover all ten KBO teams,
     regular season and postseason schedules, completed results, standings,
     doubleheaders, postponements, cancellations, no-games, suspended games,
     rescheduling, and official result corrections for 2026 and later seasons?
   - Which feeds and coverage tier provide these items?
   - Are sport-event, season, competition, team, and doubleheader identifiers
     stable across schedule changes and corrections?

2. Rights and permitted properties
   - Does Sportradar hold the rights required to license this KBO data for the
     uses described above? Please identify the contractual source or warranty
     of those rights to the extent you can disclose it.
   - May WAW automatically access the API and display normalized KBO data in
     bot responses inside one private Discord server and on
     https://waw.dubeom.com?
   - May WAW derive non-cash prediction settlement, accuracy statistics, and
     public community rankings from the licensed data?
   - Are attribution text, links, or branding required? Team logos and emblems
     will be excluded unless separately licensed.

3. Storage, retention, and termination
   - May WAW store the minimum normalized projection needed for schedules,
     results, standings, source timestamps, stable IDs, statuses, and revisions?
   - May event IDs, result revisions, and settlement provenance be retained for
     one year to explain the immutable virtual-credit ledger?
   - What cache, archival, deletion, export, and post-termination requirements
     apply? How must already settled historical records be handled at termination?

4. Freshness, corrections, and SLA
   - What are the measured and contractually committed delivery times for
     schedule changes, game status, final score, confirmed/closed result,
     standings updates, and later official corrections?
   - From which source event and timestamp is each latency measured?
   - Does the API expose a provider-generated timestamp, monotonic revision, or
     equivalent change identifier?
   - Please confirm the exact meanings and transitions for ended/closed,
     postponed, cancelled, abandoned/no-game, delayed, interrupted, and
     suspended KBO events.
   - What monthly availability commitment, maintenance exclusions, incident
     notification, support response, service credit, or other remedy applies?

5. Commercial and operational terms
   - Please quote setup and recurring fees, taxes, minimum term, renewal,
     cancellation, and any minimum spend.
   - What production request quota and QPS limits apply, and what happens when
     either limit is exceeded?
   - Are separate trial, preview, and production credentials available, and
     what key rotation and revocation controls are supported?
   - May trial data be retained only in a private, disposable evaluation
     environment? Please state any prohibition on external display during trial.

6. Trial
   - Can you provide a 30-day KBO-enabled trial with the same data freshness as
     production and enough quota to observe at least ten completed games, all
     ten teams, standings changes, and any available exceptional game state?
   - If the default 1,000-request quota is insufficient for that bounded test,
     can a higher evaluation quota be approved?

Please answer each numbered item explicitly and attach or reference the proposed
coverage matrix, SLA, licence/order-form language, pricing, and retention terms.
An API key is not needed at this stage.

Thank you.
```

## KBO·스포츠투아이 문의문

**제목:** 비상업 단일 Discord 커뮤니티용 KBO 데이터 B2B 공급·이용 허가 문의

```text
안녕하세요.

개인 비상업 Discord 커뮤니티 한 곳에서 운영하는 WAW 서비스에 KBO 일정,
종료 경기 결과와 순위를 제공할 수 있는 공식 B2B API 또는 데이터 feed를
검토하고 있습니다. 데이터는 Discord 봇 응답과 관리자 대시보드
https://waw.dubeom.com 에 표시할 예정입니다.

추가로 현실 가치가 전혀 없는 가상 크레딧 승부 예측의 정산과 적중 통계에
경기 결과를 사용할 가능성이 있습니다. 크레딧은 구매·판매·현금화·양도·대여,
상품·경품·역할·권한·광고·유료 혜택과의 교환, 후원·구독·서버 부스트 연계를
모두 금지합니다.

공급자 선정이나 시험 연동 전에 아래 항목을 서면으로 확인하고자 합니다.

1. 공급 범위
   - 2026년 이후 KBO 10개 구단의 정규시즌·포스트시즌 일정, 종료 결과,
     순위, 더블헤더, 연기, 취소, 노게임, 서스펜디드, 재편성과 공식 결과
     정정을 제공하는 B2B API 또는 파일 feed가 있습니까?
   - 각 항목의 상품명, 제공 형식, 문서, coverage 범위와 안정적인 경기·시즌·
     대회·구단·더블헤더 식별자 제공 여부를 알려주십시오.

2. 권리와 허용 매체
   - 귀사가 위 KBO 데이터를 공급하고 WAW에 재이용을 허가할 수 있는 권리의
     근거와 계약상 보증 범위를 알려주십시오.
   - 단일 비공개 Discord 서버의 봇 응답과
     https://waw.dubeom.com 에 자동 조회한 최소 데이터를 재표시할 수 있습니까?
   - 비현금 가상 크레딧 정산, 적중 통계와 커뮤니티 공개 랭킹 같은 파생 이용이
     허용됩니까?
   - 필수 출처 문구·링크·브랜드 표시가 있습니까? 구단 로고와 엠블럼은 별도
     허가가 없으면 사용하지 않습니다.

3. 저장·보존·계약 종료
   - 일정, 결과, 순위, 공급자 시각, 안정적 ID, 상태와 revision의 최소 정규화
     projection을 저장할 수 있습니까?
   - 불변 가상 크레딧 원장의 정산 근거를 설명하기 위해 경기 ID, 결과 revision과
     정산 출처를 1년 보존할 수 있습니까?
   - 캐시·보관·삭제·내보내기 제한과 계약 종료 후 이미 정산된 과거 기록의
     처리 조건을 알려주십시오.

4. 신선도·정정·SLA
   - 일정 변경, 경기 상태, 최종 점수, 공식 확정 결과, 순위와 후속 공식 정정의
     실제 갱신 시간과 계약상 보장 시간을 각각 알려주십시오.
   - 각 지연은 어떤 원천 사건과 시각부터 측정합니까?
   - 공급자 생성 시각, 단조 증가 revision 또는 동등한 변경 식별자를 제공합니까?
   - 종료/공식 확정, 연기, 취소, 노게임, 지연, 중단과 서스펜디드 상태의 정확한
     의미와 전이·경기 ID 유지 규칙을 알려주십시오.
   - 월 가용성, 예정 점검 제외, 장애 통지, 지원 응답시간과 SLA 미달 시 구제
     조건을 알려주십시오.

5. 가격·운영 조건
   - 초기비, 월·연 비용, 세금, 최소 계약 기간·금액, 자동 갱신과 해지 조건을
     포함한 견적을 요청드립니다.
   - 호출량·QPS 제한과 초과 시 동작, 시험·개발·운영 credential 분리,
     credential 회전·폐기 지원 여부를 알려주십시오.
   - 외부 게시 없이 폐기 가능한 비공개 환경에서 coverage와 신선도를 검증할
     trial 또는 sandbox가 있습니까? 시험 데이터 보존·외부 표시 제한도
     알려주십시오.

6. 시험 검증
   - 정상 종료 10경기 이상, 10개 팀 전체, 순위 변경 3회 이상과 발생 가능한
     예외 경기 상태를 관측할 수 있는 시험 기간과 quota를 제공할 수 있습니까?
   - 시험과 운영 데이터의 갱신 빈도가 같습니까?

각 번호에 대한 답변과 함께 가능한 경우 상품 설명서, coverage 표, schema·상태
문서, SLA, 이용허가 문구, 견적과 보존·종료 조건을 부탁드립니다. 현재 단계에서는
credential 발급이나 계약 체결을 요청하지 않습니다.

감사합니다.
```

## 답변 비교표

`확인`에는 계약서·주문서·SLA의 문서명과 조항을 적는다. 영업 담당자의 구두
설명이나 “지원 가능”만으로 통과 처리하지 않는다.

| 평가 항목 | 필수 기준 | Sportradar 답변·근거 | KBO/스포츠투아이 답변·근거 | 판정 |
|---|---|---|---|---|
| 10개 팀·정규·포스트시즌 | 전부 제공 |  |  | 대기 |
| 일정·결과·순위 | 세 항목 모두 제공 |  |  | 대기 |
| 더블헤더·재편성 | 안정적 ID와 구분자 |  |  | 대기 |
| 예외 상태 | 연기·취소·노게임·서스펜디드 표현 |  |  | 대기 |
| 공식 정정 | revision/변경 ID와 과거 추적 |  |  | 대기 |
| 권리 출처 | KBO 데이터 공급·재허가 권한 서면 보증 |  |  | 대기 |
| Discord 표시 | 단일 서버 bot 응답 명시 허용 |  |  | 대기 |
| Dashboard 표시 | `waw.dubeom.com` 명시 허용 |  |  | 대기 |
| 파생 이용 | 비현금 정산·통계·랭킹 명시 허용 |  |  | 대기 |
| 자동 접근 | API/feed 자동 수집 허용 |  |  | 대기 |
| 저장·1년 보존 | 최소 projection·ID·revision·정산 출처 허용 |  |  | 대기 |
| 종료 후 처리 | 삭제·보존·과거 정산 처리 가능 |  |  | 대기 |
| 출처 표시 | 문구·링크·브랜드 조건 수용 가능 |  |  | 대기 |
| 로고 제외 | 별도 상표권 없이 텍스트 데이터 사용 가능 |  |  | 대기 |
| 공급자 시각 | generated timestamp 제공 |  |  | 대기 |
| 결과 신선도 | 측정 기준과 보장 지연 명시 |  |  | 대기 |
| 순위 신선도 | 측정 기준과 보장 지연 명시 |  |  | 대기 |
| 가용성·장애 | SLA·통지·지원·구제 명시 |  |  | 대기 |
| quota/QPS | 예상 poll을 수용하고 초과 동작 명시 |  |  | 대기 |
| credential 분리 | trial/preview/production과 회전 지원 |  |  | 대기 |
| trial | KBO coverage·지연 비공개 검증 가능 |  |  | 대기 |
| 전체 비용 | 초기·반복·세금·최소 기간이 승인 예산 내 |  |  | 대기 |
| 계약 갱신·해지 | 자동 갱신·해지·가격 변경 조건 수용 가능 |  |  | 대기 |

최종 판정은 `통과`, `실패`, `미확인`만 사용한다. 필수 항목 하나라도 `실패`나
`미확인`이면 production 공급자로 승인하지 않는다.

## Owner 승인 양식

### Gate 1 — 문의문 전송 승인

```text
검토 문서: docs/research/technology-options/kbo-provider-inquiry-package.md

[x] 위 두 문의문의 외부 전송을 승인한다.
[ ] 전송 전 아래 수정이 필요하다.

수정 사항: 없음

전송 승인 범위:
- Sportradar: [x] 승인 [ ] 미승인
- KBO/스포츠투아이: [x] 승인 [ ] 미승인
- credential 발급·trial 시작·계약 체결 권한: 승인하지 않음
- 실제 외부 전송: 수행하지 않음

Owner: 프로젝트 소유자
결정일: 2026-08-07
```

### Gate 2 — 답변 비교와 trial 후보 승인

```text
비교표 확인일:
확인한 계약·주문서·SLA 문서:
월·초기 비용 및 세금:
승인된 KBO 월 예산:

필수 항목 결과: [ ] 전부 통과 [ ] 실패/미확인 있음

결정:
[ ] Sportradar trial Spike만 승인한다.
[ ] KBO/스포츠투아이 trial Spike만 승인한다.
[ ] 두 후보 모두 거절한다.
[ ] 추가 서면 답변을 요청한다.

승인 범위:
- 비공개·폐기 가능한 trial 환경만 허용
- 외부 Discord/dashboard 표시 금지
- production credential·계약·배포·DB mutation 승인 아님
- Trial 비용 상한:
- Trial 기간·quota:

Owner:
결정일:
```

### Gate 3 — 실측 후 ADR-0031 결정

```text
Trial 결과 문서:
표본: 정상 종료 __경기 / __팀 / standings 변경 __회 / 예외 상태 __건
결과·순위 지연 p50/p95/max:
미검증 상태:

신선도·정정 유예 결정:
- 시작 2시간 전 베팅 접수 최대 fetch age:
- 다른 예정 경기 최대 fetch age:
- 진행·ended·closed 최대 fetch age:
- standings 최대 fetch age:
- closed 후 정산 유예와 동일 결과 확인 조건:

결정:
[ ] ADR-0031을 위 값과 선택 공급자로 Accepted 전환한다.
[ ] ADR-0031 수정을 요구한다.
[ ] 후보를 거절하고 feature flag를 off로 유지한다.

이 결정은 구현 계획 작성을 허용하지만 구현·migration·계약 체결·production
활성화를 자동 승인하지 않는다.

Owner:
결정일:
```
