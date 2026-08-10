# KBO 공급자 선정과 데이터 신선도 조사

- 상태: Research
- 작성일 및 문서 확인일: 2026-08-07 (KST)
- 연결 요구사항: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`, `OWN-040`,
  `ADR-0028`
- 범위: 공급자 후보, 이용 권리, 가격, SLA, 정정 방식과 신선도 검증 기준
- 비범위: 계약 체결, trial 발급, 운영 수집, 제품 코드와 구현 계획

## 결론

**Sportradar Global Baseball v2를 계약·trial 검증의 조건부 1순위로 추천한다.**
공개 1차 자료에서 KBO coverage, 일정·결과·순위 endpoint, 한국어, 안정적인
sport event/season ID와 필요한 경기 상태를 함께 확인할 수 있는 유일한 후보이기
때문이다.

다만 2026 KBO 주문서의 Discord·`waw.dubeom.com` 재표시권, 자동 접근,
저장·보존, 파생 랭킹, KBO 권리 출처, 가격과 보장 SLA는 공개 자료로 확인되지
않았다. 이 항목 중 하나라도 서면으로 확인되지 않거나 승인된 월 비용을 넘으면
선정하지 않는다. KBO 또는 스포츠투아이의 직접 B2B feed가 같은 조건을
충족하면 더 짧은 권리 사슬 때문에 우선한다.

## 후보 비교

| 후보 | 공개 근거로 확인된 범위 | 권리·가격·SLA | 판정 |
|---|---|---|---|
| Sportradar Global Baseball v2 | KBO, 일정·결과·순위, 한국어, event/season ID, `postponed`·`suspended`·`cancelled`·`ended`·`closed` | production 가격·KBO 권리 출처·Discord 표시권·보장 SLA는 견적/주문서 필요 | 조건부 1순위 |
| KBO/스포츠투아이 직접 B2B | KBO 공식 웹과 소비자 서비스의 운영 주체임은 확인 | B2B API/파일, 가격, 표시권, SLA 모두 비공개 | 강한 대안, 서면 문의 필요 |
| SportsDataIO | 공개 coverage 자료는 MLB 중심이며 KBO 상품을 확인하지 못함 | 가격/coverage 문의 필요 | KBO 확인 전 제외 |
| 공개 KBO 웹·소비자 앱·외부 Discord 봇 | 사람이 보는 일정·결과는 존재 | 자동 접근·재표시권·schema·SLA 없음 | 운영 공급원 금지 |

Sportradar 문서는 Global Baseball이 KBO를 지원한다고 명시하고, Season
Standings가 season ID와 한국어를 지원하며, 상태 FAQ가 `ended`와 결과가
확정된 `closed`를 구분한다. Trial은 30일, rolling 30일 1,000회와 1 QPS가
기본이며 production과 데이터 갱신 빈도는 같다고 설명한다. 따라서 내부 평가용
coverage·지연 Spike에는 쓸 수 있지만 5분 poll을 30일 내내 실행하기에는
1,000회 한도가 부족하다.

공개 cache TTL은 원천 데이터의 도착 보장이나 계약 SLA가 아니다. 가격도
공개 정가가 아니라 sales 견적 대상이므로 숫자를 추정하지 않는다.

## 주문서 필수 확인 항목

다음 항목을 모두 서면으로 확인해야 `ADR-0028`의 운영 활성화 gate를 통과한다.

1. 2026 이후 KBO 정규시즌·포스트시즌 10개 팀의 schedule, result,
   standings와 더블헤더 coverage
2. KBO 또는 권리자로부터 받은 데이터 권리와 WAW에 재허가할 권한
3. 단일 Discord 서버의 bot 응답과 `https://waw.dubeom.com` 표시 허용
4. 자동 API 접근, 최소 projection 저장, 1년 원장 설명에 필요한 경기
   식별자·revision 보존과 계약 종료 후 처리
5. 공급자 표기 문구; 구단 로고·엠블럼은 별도 허가 없으면 제외
6. schedule 변경, 경기 상태·최종 점수, standings의 측정 기준과 보장 지연,
   월 가용성, 장애 통지와 위반 구제
7. `ended`→`closed`, 경기 정정, 취소·노게임·연기·서스펜디드의 의미와
   revision 또는 변경 식별 방식
8. production quota/QPS, 초과 동작, 월·초기 비용, 최소 기간, 자동 갱신과
   해지 조건
9. 파생 베팅 정산·비현금 크레딧·공개 랭킹 허용 여부
10. API key의 환경 분리·회전과 sandbox/trial 데이터의 외부 게시 금지 조건

## Trial 신선도 Spike

### 가설

허용된 trial에서 KBO 데이터가 안정적인 ID와 상태로 제공되고, 실제 변경이
아래 후보 임계값 안에 관측된다.

### 최소 표본

- 정상 종료 10경기 이상, 10개 팀 모두 포함
- 더블헤더 또는 재편성 1건 이상
- 취소·연기·서스펜디드 중 관측 가능한 모든 사례
- 정규시즌 standings 변경 3회 이상

사례가 trial 기간에 발생하지 않으면 합성 fixture로 parser만 확인하고 실제
상태·지연은 미검증으로 남긴다.

### 측정값

- 공급자 event/season/team ID와 홈·원정·경기 차수
- 응답 `generated_at` 또는 동등한 공급자 시각, HTTP 수신 시각과 cache header
- 상태·시작 시각·점수·standings가 바뀐 최초 관측 시각
- 최초 `ended`, 최초 `closed`, 이후 같은 결과가 유지된 시간과 후속 revision
- timeout, 429, 5xx, 알 수 없는 enum과 누락 필드

원본 응답은 암호화된 폐기성 trial 작업공간에만 두고 문서와 log에는 credential,
전체 payload, 계약 식별자를 남기지 않는다.

### 후보 임계값

아래 값은 승인된 정책이 아니라 Spike의 합격 기준 초안이다.

| 용도 | 후보 임계값 | 실패 시 동작 |
|---|---:|---|
| 시작 2시간 전부터 베팅 접수 | 마지막 성공 schedule/status fetch 5분 이하 | 신규 베팅 거부 |
| 그 밖의 예정 경기 조회 | 마지막 성공 fetch 30분 이하 | stale 표시 |
| 진행·`ended`·`closed` 경기 | 마지막 성공 fetch 5분 이하 | unknown, 정산 보류 |
| 순위 조회 | 마지막 성공 fetch 30분 이하 | stale 표시 |
| 최초 `closed` 후 정산 유예 | 30분이며 5분 이상 간격의 동일 결과 2회 | 정산 보류 |

`closed` 이후 정정은 불변 원장의 보상 정산으로 처리하므로 유예가 모든 후속
정정을 막는다고 가정하지 않는다. Spike p95가 후보 임계값의 80%를 넘거나
계약 SLA가 더 느리면 값을 임의 완화하지 않고 소유자가 다시 결정한다.

### 합격 기준

- 주문서 필수 항목이 모두 서면 확인됨
- 안정적인 ID로 표본을 중복 없이 구분함
- 필수 상태가 손실 없이 `ADR-0028` 내부 상태로 매핑됨
- 정상 표본의 결과·순위 지연이 계약 SLA와 후보 임계값을 모두 만족함
- stale, 429, timeout, unknown enum이 최신 데이터로 오인되지 않음
- 월 비용이 소유자가 승인한 KBO 예산 안임

하나라도 실패하면 production 공급자로 선정하지 않는다.

## 권고 순서

1. 같은 질문표로 Sportradar와 KBO/스포츠투아이에 서면 견적을 요청한다.
2. 완전한 답변과 월 비용을 비교해 소유자가 trial 진행 후보 하나를 승인한다.
3. 외부 게시 없이 30일 trial Spike를 수행한다.
4. 측정 결과로 신선도·정정 유예를 확정하고 Proposed `ADR-0031`을 승인 또는
   기각한다.
5. Accepted 이후에만 bounded 구현 계획을 작성한다.

## 출처

- Sportradar [Baseball API Overview](https://developer.sportradar.com/baseball/reference/overview)
- Sportradar [Global Baseball Season Standings](https://developer.sportradar.com/baseball/reference/global-baseball-season-standings)
- Sportradar [Global Baseball FAQ와 상태 정의](https://developer.sportradar.com/baseball/reference/global-baseball-faq)
- Sportradar [계정, trial과 quota](https://developer.sportradar.com/getting-started/docs/your-account)
- Sportradar [Global Baseball v2 변경 기록](https://developer.sportradar.com/baseball/reference/global-baseball-change-log)
- KBO [홈페이지 이용약관](https://m.koreabaseball.com/Member/Join/Accessterms.aspx?appCk=false)
- SportsDataIO [공개 coverage](https://sportsdata.io/files/SDio_Coverage.pdf)
