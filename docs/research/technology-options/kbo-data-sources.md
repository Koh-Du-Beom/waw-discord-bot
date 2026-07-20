# KBO 데이터 공급 가능성 조사

- 상태: Research
- 작성일 및 문서 확인일: 2026-07-20 (KST)
- 연결 요구사항: `FUN-007`, `FUN-008`, `FUN-009`, `OWN-006`
- 범위: 현재 시즌 KBO 리그 10개 구단의 일정, 종료 경기 결과, 순위, 기본 팀 정보
- 비범위: 실시간 점수, 공급자 최종 선택, ADR, 구현 및 자동 수집 실행

## 결정 질문과 판정

현재 확인된 공식 또는 공급자 1차 문서만으로, 요구 데이터를 Discord 봇에서 합법적으로 재표시하면서 출처와 갱신 시각을 표시하고 최대 30분 지연을 보장할 수 있는 공급 경로가 있는가?

**판정: 조건부 가능하나, 현재 공개 근거만으로 바로 운영 가능한 경로는 확인되지 않았다.**

- KBO 공식 웹사이트에는 현재 시즌 10개 구단의 일정·결과, 순위와 구단 정보가 공개된다.
- 그러나 KBO 웹사이트 약관은 게시 자료의 상업적 이용을 원칙적으로 금지하고 사전 동의 예외만 두며, 사전 승낙 없는 복제·유통·상업적 이용도 금지한다. 비상업적 Discord 재표시와 자동 수집 허가는 명시되어 있지 않다.
- 공개 페이지에는 원천 데이터 갱신 시각이나 30분 이내 갱신 보장이 없다. 따라서 수집 시각만 표시해서 `FUN-008`을 충족했다고 볼 수 없고, `OWN-006`의 최대 지연도 보장할 수 없다.
- 계약형 데이터 API라는 현실적인 경로는 존재한다. 다만 실제 KBO 2026 범위, 권리 출처, Discord 봇에서의 표시·재배포 권리, 갱신 SLA와 가격은 개별 계약서나 주문서로 확인해야 한다.

## 요구사항과 평가 기준

| 요구사항 | 이 조사에서의 통과 기준 |
|---|---|
| `FUN-007` | 현재 시즌 정규리그 10개 구단 전체의 일정, 종료 상태·최종 점수, 순위, 기본 팀 식별정보를 제공한다. |
| `FUN-008` | 최종 응답에 표시할 출처와 **공급자 데이터 갱신 시각** 또는 이를 산출할 신뢰 가능한 필드가 있다. |
| `FUN-009` | 오류, 누락, 공급자 지연과 오래된 캐시를 탐지할 수 있고 정상 데이터와 구분할 계약·메타데이터가 있다. |
| `OWN-006` | 실시간 점수 없이도 종료 경기 후 30분 이내 결과·순위 반영을 계약 또는 검증 가능한 공급 명세로 보장한다. |

부가 기준은 이용 허가, 자동 접근 허용 여부, 데이터 형태와 버전 정책, 가용성, 비용, 운영 부담, 공급자 종속성과 종료 시 데이터 처리 조건이다.

## 후보별 확인 결과

### 1. KBO 공식 공개 웹 정보

**확인된 사실**

- KBO의 [경기일정·결과](https://www.koreabaseball.com/Schedule/Schedule.aspx) 화면은 정규시즌 일정과 `LG`, `한화`, `SSG`, `삼성`, `NC`, `KT`, `롯데`, `KIA`, `두산`, `키움` 필터 및 경기 결과 표를 제공한다.
- KBO의 [팀 순위](https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx) 화면은 2026년 10개 팀의 경기·승·패·무·승률·게임차 등을 제공한다.
- KBO의 [구단 소개](https://www.koreabaseball.com/Kbo/League/TeamInfo.aspx) 화면은 구단명, 사무실, 공식 홈페이지, 창단연도, 연고지역 등 기본 정보를 제공한다.
- KBO 홈페이지 [이용약관](https://m.koreabaseball.com/Member/Join/Accessterms.aspx?appCk=false)은 스포츠투아이㈜가 KBO 홈페이지의 유·무선 서비스를 제공한다고 밝힌다(제1조). 서비스에서 얻은 자료의 상업적 사용은 정보 제공 회사나 제휴사의 사전 동의가 있을 때만 허용하며(제17조), 사전 승낙 없는 정보 복제·유통·상업적 이용을 제한한다(제21조). 약관 시행일은 2024-02-26이다.
- 같은 약관은 서비스가 원칙적으로 24시간 제공되지만 점검, 장애, 폭주 등으로 제한·중지될 수 있다고 정하며(제18조, 제20조), 정보의 정확성에 대한 책임을 부인한다(제23조).
- 각 공개 화면은 `Copyrightⓒ KBO, All Rights Reserved.`를 표시한다.

**추론**

- 사람에게 보여 주는 공식 원천으로서 데이터 범위는 `FUN-007`과 대체로 맞는다.
- 하지만 공개 HTML을 봇이 반복 조회하고 그 결과를 Discord에 재표시하는 행위는 단순 열람과 다르다. 약관에 자동 수집 허가가 없으므로 이를 허용된 것으로 간주할 수 없다.
- HTML 화면과 비공개 내부 요청 형식은 공개 API 계약이 아니다. DOM, 요청 매개변수, 봇 차단 정책이 예고 없이 바뀔 수 있어 운영 연동의 변경 위험이 높다.

**미확인**

- 비상업적 개인 Discord 서버에서의 데이터 재표시 허용 여부
- robots 정책과 별개인 계약상 자동 크롤링 허용 여부, 호출 한도 및 캐시 허용 기간
- 결과·순위의 원천 갱신 시각, 경기 종료 후 반영 시간과 30분 SLA
- 구단명 외 로고·엠블럼 사용 권리
- 공식 공개 API 또는 공식 데이터 파일의 존재와 이용 조건

**판정:** 화면 범위 확인과 수동 대조에는 적합하지만, 서면 허가와 갱신 보장 없이는 운영 데이터 공급원으로 부적합하다.

### 2. 스포츠투아이의 소비자용 서비스

**확인된 사실**

- 스포츠투아이의 [ruta 서비스 소개](https://ruta.sports2i.com/)는 KBO 공식 경기 데이터 기반, 실시간 기록 반영·검증, 경기 일정부터 상세 기록까지의 제공을 명시한다.
- [ruta 이용약관](https://ruta.sports2i.com/terms-of-service)은 서비스를 자체 모바일 앱으로 제공되는 KBO 경기 정보·선수/팀 통계·실시간 점수 등으로 정의하고(제2조), 일정·결과와 팀 통계 제공을 명시한다(제10조). 시행일은 2026-03-28이다.
- 같은 약관은 회사 동의 없는 영리 목적 사용을 금지하고(제9조), 회사에 귀속된 정보를 사전 승낙 없이 영리 목적으로 복제·송신·출판·배포하거나 제3자가 이용하게 하는 것을 금지한다(제15조).
- 서비스는 변경·중단될 수 있고 무료 서비스에는 별도 보상이 없을 수 있다(제11조).

**추론**

- KBO 공식 데이터의 수집·검증 역량이 있는 직접 협의 후보임은 확인되지만, ruta는 소비자 앱 계약이지 제3자용 데이터 API나 재배포 라이선스가 아니다.
- 앱 화면 또는 앱의 내부 통신을 자동 수집할 권리는 확인되지 않았다.

**미확인**

- 스포츠투아이의 B2B KBO 데이터 상품, API/파일 형식, 가격, 호출 한도와 계약 가능 최소 규모
- Discord 봇 표시 및 비상업적 재배포 권리
- 종료 결과·순위 30분 SLA, 원천 갱신 시각 필드와 장애 통지 방식

**판정:** 소비자 앱을 공급원으로 사용하면 안 된다. KBO 데이터 권리와 B2B 제공 권한을 포함한 별도 서면 계약 가능성만 문의할 가치가 있다.

### 3. 계약형 상용 스포츠 데이터 API 범주

Sportradar는 구체적 형태와 계약 위험을 검토하기 위한 **대표 사례**이며 최종 후보 선정이 아니다.

**확인된 사실**

- Sportradar의 [Global Baseball API 변경 기록](https://developer.sportradar.com/sportradar-updates/changelog/global-baseball-api-3)은 KBO League 경기와 팀·경기장 식별정보 예시를 공개한다.
- [Season Summaries](https://developer.sportradar.com/baseball/reference/global-baseball-season-summaries)는 한 시즌 전체 경기의 일정과 득점 결과를, [Season Standings](https://developer.sportradar.com/baseball/reference/global-baseball-season-standings)는 시즌 순위를, [Season Info](https://developer.sportradar.com/baseball/reference/global-baseball-season-info)는 참가 팀과 리그 구조를 제공한다고 명시한다. API는 JSON/XML과 API 키 기반의 trial/production 접근을 사용한다.
- Season Standings 문서는 TTL 10초, [Daily Summaries](https://developer.sportradar.com/baseball/reference/global-baseball-daily-summaries)는 TTL 300초를 표시한다. 이는 호출 캐시 지침이지 원천 경기 종료 후 30분 내 정정 완료 SLA는 아니다.
- 공급자 [계정 문서](https://developer.sportradar.com/getting-started/docs/your-account)는 trial과 production의 데이터 갱신 빈도는 같지만 trial은 낮은 호출 한도와 30일 기간을 가진다고 설명한다.
- 공급자 [약관](https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions)은 무료 trial을 내부 평가·비상업 용도로만 제한하고 공개·표시를 금지한다(§3). 유료 사용은 주문서에 지정된 제품과 웹/앱 속성에서의 표시로 제한되며(§2.1~2.3), 데이터의 정확성과 문서상 갱신 일정 준수를 위해 상업적으로 합리적인 노력을 기울이되 지연 가능성과 책임 제한을 둔다(§2.11). 지원 API는 현재 및 이전 두 버전이며 대체 feed에는 90일 사전 통지를 둔다(§2.1.2).
- 같은 약관은 유료 제품 가용성을 월 99.5%로 정하지만 예외 사유가 있고, 표시 속성에는 `powered by Sportradar` 표시를 요구한다. 로고 권리는 별도로 부여되지 않는다.

**추론**

- API 형태, 버전 정책, 캐시 지침과 상태 필드는 공개 웹 HTML보다 안정적인 운영 경로다.
- 문서상 TTL은 30분 목표보다 짧지만, KBO 2026 실제 coverage와 데이터 발생 지연을 보장하지 않으므로 `OWN-006` 충족 증거가 아니다.
- Discord 서버/봇이 약관의 허용 `Property`에 포함되는지, 봇 응답이 허용된 display인지 주문서에 명시해야 한다.

**미확인**

- 2026 KBO 정규시즌 10개 팀에 대한 각 endpoint의 실제 production coverage
- 해당 KBO 데이터의 권리 출처와 한국 내 비상업 Discord 재표시 허가
- 원천 갱신 시각 필드, 30분 이내 종료 결과·순위 반영 SLA와 위반 구제
- 가격, 최소 계약 기간, 호출량, 저장·캐시·종료 후 삭제 조건

**판정:** 기술 형식은 요구 범위를 충족할 가능성이 가장 높지만, 계약과 실제 coverage 확인 전에는 적합 판정을 내릴 수 없다.

## 제공 형태별 안정성과 변경 위험

| 형태 | 범위 | 이용 권리 | 갱신/30분 | 안정성 및 변경 위험 |
|---|---|---|---|---|
| KBO 공개 웹 HTML | 화면상 충족 | 자동 수집·비상업 재표시 미확인; 상업 사용은 사전 동의 필요 | 갱신 시각·SLA 없음 | DOM/내부 요청 변경, 차단, 점검 위험이 높고 버전 계약 없음 |
| 공식 데이터 파일 | 존재 미확인 | 미확인 | 미확인 | 파일·스키마·배포 주기가 확인되면 단순할 수 있으나 현재 근거 없음 |
| 스포츠투아이 소비자 앱 | 앱 기능상 일정·결과·팀 통계 제공 | 제3자 API/재배포 권리 없음 | 실시간 반영 주장만 있고 SLA 없음 | 앱 계약과 내부 형식 변경에 종속; 운영 공급원으로 사용 불가 |
| 계약형 상용 API | endpoint 문서상 충족 가능 | 주문서에 지정된 속성·용도로 제한 | 짧은 TTL은 확인, 원천 30분 SLA 미확인 | 인증·스키마·버전 정책이 명시적이나 계약, coverage와 공급자 종속 위험 존재 |

## 합법적인 허가 공급자 범주

공식 공개 경로가 부족할 때 검토할 수 있는 범주는 다음으로 제한한다.

1. **KBO 또는 KBO가 권한을 부여한 기록·데이터 운영사와의 직접 계약:** Discord 표시, 비상업/상업 구분, 자동 접근, 저장·캐시, 출처 문구, 로고 제외, 30분 SLA를 서면으로 허가받는 방식.
2. **KBO 데이터를 계약상 재허가할 권리가 있는 상용 데이터 사업자:** 그 사업자의 자기 주장만으로 충분하지 않으며, KBO 범위의 권리 출처와 재표시 권한을 주문서·부속합의서로 확인해야 한다.
3. **각 구단의 기본 정보에 한정한 구단 직접 허가:** 경기 결과·리그 순위의 대체 공급원은 아니며, 구단 소개나 상표/엠블럼 사용이 필요한 경우 별도로 적용한다.

“공개되어 있음”, “비영리 서비스임” 또는 API 키 발급 가능성만으로 자동 수집·재배포 허가를 추정하지 않는다.

## 운영·보안·비용·이식성 평가

- **보안/데이터:** 공개 데이터라 개인정보 위험은 낮지만 API 키는 비밀로 관리해야 한다. 제공 데이터와 내부 감사 로그에는 원천 응답 전체 대신 공급자 ID, 공급자 갱신 시각, 수집 시각, 상태와 오류만 필요한 범위로 남긴다.
- **운영:** `FUN-009`를 위해 원천 갱신 시각이 없으면 `unknown`으로 표시하고 정상 최신 데이터로 단정하지 않아야 한다. 공급자 SLA와 별개로 마지막 성공 수집, 데이터의 경기 상태, 지연 임계치를 구분해야 한다.
- **비용:** KBO/스포츠투아이 B2B와 상용 API 모두 공개된 적용 가격을 확인하지 못했다. `OWN-005`의 월 지출 상한과 비교할 견적이 필요하다.
- **유지보수/종속성:** 공개 HTML은 결합도가 가장 높다. 계약 API도 공급자 ID와 스키마에 종속되므로 원천 필드와 제품 내부 최소 모델의 매핑 및 원본 출처 보존이 필요하다. 다중 공급자 추상화는 실제 두 번째 공급자가 생기기 전에는 불필요하다.
- **마이그레이션/롤백:** 계약 종료 시 보유 데이터의 삭제·보관 조건을 먼저 확인한다. 공급자 장애 때 권리 미확인 웹 크롤링으로 자동 전환하면 안 되며, 마지막 데이터가 오래되었음을 표시하거나 명시적으로 실패하는 것이 안전하다.

## 사실과 구분한 가정

- 이 프로젝트는 단일 개인 Discord 서버에서 비상업적으로 운영된다고 가정했다. 비상업이라도 재배포나 자동 수집 권리가 생긴다고 가정하지 않았다.
- “기본 팀 정보”는 구단명, 식별자, 연고지, 창단연도와 공식 홈페이지까지로 가정했다. 로고·엠블럼은 별도 권리 때문에 제외했다.
- 30분 지연은 예정 시작 시각이 아니라 공식 경기 종료 상태가 공급자에 기록된 시점부터 결과와 그 결과가 반영된 순위가 제공되는 시간으로 해석했다. 계약 협의 시 기준 시점을 명문화해야 한다.

## 증거 공백과 필요한 검증

코드 Spike보다 먼저 다음 서면 확인이 필요하다.

1. KBO 및 스포츠투아이에 비상업 Discord 봇의 자동 조회·재표시 허용 여부와 공식 API/파일/B2B feed 존재를 문의한다.
2. 후보 공급자에게 2026 KBO coverage 표, 데이터 권리 출처, Discord를 허용 속성으로 하는 재표시 조건, 가격, 원천 갱신 시각과 30분 SLA를 요청한다.
3. 계약 가능한 후보가 생긴 뒤에만 별도 승인된 Spike로 합성 데이터 또는 trial의 내부 평가 범위에서 10개 팀, 일정, 종료 상태·점수, 순위, 팀 정보와 timestamp 필드를 검증한다. trial 데이터를 Discord에 게시하지 않는다.

성공 기준은 다섯 데이터 항목의 완전성, 공급자 갱신 시각 식별, 종료 후 30분 이내 결과·순위 반영, 지연/오류 식별이다. 실패 기준은 하나라도 coverage가 없거나 권리·시간 기준을 서면으로 확인하지 못하는 것이다.

## 임시 방향, 가장 강한 대안과 뒤집을 조건

- **임시 방향:** 공급자를 선택하지 않는다. 먼저 KBO/스포츠투아이 직접 허가 경로를 확인하고, 불가하거나 SLA가 없으면 KBO 재허가 권리를 계약으로 보증하는 상용 API 범주의 견적과 coverage를 비교한다.
- **가장 강한 대안:** 지정된 Discord 속성에서 표시할 권리와 30분 SLA를 주문서에 담을 수 있는 계약형 상용 API. 공개 문서상 구조화 데이터와 버전 정책이 가장 명확하지만 KBO 권리와 가격은 미확인이다.
- **주요 위험:** 자동 수집 권리 오판, 원천 갱신 시각 부재, 30분 SLA 미충족, 로고 권리 혼동, 공급자 계약 종료와 월 비용 상한 초과.
- **뒤집을 조건:** KBO 또는 권한 있는 운영사가 비상업 자동 조회·재표시, 구조화 형식, 원천 갱신 시각과 30분 보장을 서면으로 제공하면 직접 공식 경로가 우선 비교 대상이 된다. 반대로 어떤 허가 공급자도 범위·SLA·비용 상한을 만족하지 못하면 KBO 기능 범위 또는 지연 목표에 대한 소유자 정책 재검토가 필요하다.

## 출처 목록

모든 링크는 2026-07-20 (KST)에 확인했다.

- KBO: [경기일정·결과](https://www.koreabaseball.com/Schedule/Schedule.aspx), [팀 순위](https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx), [구단 소개](https://www.koreabaseball.com/Kbo/League/TeamInfo.aspx), [홈페이지 이용약관](https://m.koreabaseball.com/Member/Join/Accessterms.aspx?appCk=false)
- 스포츠투아이: [회사 홈페이지](https://www.sports2i.com/), [ruta 서비스 소개](https://ruta.sports2i.com/), [ruta 이용약관](https://ruta.sports2i.com/terms-of-service)
- Sportradar: [KBO가 포함된 Global Baseball 변경 기록](https://developer.sportradar.com/sportradar-updates/changelog/global-baseball-api-3), [Season Info](https://developer.sportradar.com/baseball/reference/global-baseball-season-info), [Season Summaries](https://developer.sportradar.com/baseball/reference/global-baseball-season-summaries), [Season Standings](https://developer.sportradar.com/baseball/reference/global-baseball-season-standings), [Daily Summaries](https://developer.sportradar.com/baseball/reference/global-baseball-daily-summaries), [계정 및 trial](https://developer.sportradar.com/getting-started/docs/your-account), [버전 정책](https://developer.sportradar.com/getting-started/docs/versioning), [이용약관](https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions)

## 정확한 다음 프롬프트

```text
AGENTS.md의 필수 문서를 순서대로 읽고 docs/prompts/research.md 절차를 따라
KBO와 스포츠투아이에 보낼 KBO 데이터 이용 허가·B2B 공급 문의 체크리스트만 조사해.
FUN-007~009, OWN-005~006을 연결하고 Discord 봇 재표시 권리, 자동 접근,
현재 시즌 10개 구단 coverage, 원천 갱신 시각, 종료 결과·순위 30분 SLA,
캐시·보관·삭제, 출처 표시, 로고 제외, 가격을 서면 확인 항목으로 만들어.
공급자를 선택하거나 ADR·구현을 작성하지 마.
```
