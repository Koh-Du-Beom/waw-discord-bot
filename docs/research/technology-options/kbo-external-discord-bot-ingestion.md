# 외부 Discord 봇 KBO 응답 수집 가능성 조사

- 상태: Research
- 작성일 및 문서 확인일: 2026-08-07 (KST)
- 연결 요구사항: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`
- 범위: 사용자가 외부 KBO 봇을 호출하고 WAW가 공개 응답을 관측·파싱하는 경로
- 비범위: 외부 봇 초대, 메시지 수집, production 코드와 정책 변경

## 정정된 제품 의도

WAW가 KBO 공급 API를 직접 계약하는 것이 우선 목표가 아니다. 사용자가 같은
Discord 서버에서 기존 KBO 봇의 slash command를 실행하면, WAW가 그 봇의
공개 응답을 읽어 일정·결과·순위를 정규화하고 비현금 크레딧 베팅의 경기 입력과
정산 근거로 사용하는 것이 목표다.

이 의도는 현재 제품 정책과 Accepted `ADR-0028`의 “다른 Discord 봇 응답을
운영 데이터 공급원으로 사용하지 않는다”는 결정과 충돌한다. 구현 전에 기존
결정을 대체해야 한다.

## 판정

**수동 호출 뒤 공개 응답 관측은 기술적으로 가능성이 있지만, 현재 근거만으로
production 사용은 승인할 수 없다.**

- Discord는 guild의 `MESSAGE_CREATE`를 Gateway로 전달한다. WAW가 채널을 볼
  수 있고 `GUILD_MESSAGES`와 `MESSAGE_CONTENT` intent를 사용하면 다른 봇이
  작성한 일반 메시지의 content, embeds, attachments와 components를 받을 수
  있다.
- `MESSAGE_CONTENT`가 없으면 위 필드는 비어 있다. 외부 봇 응답이 ephemeral이면
  호출 사용자에게만 보이므로 WAW가 관측할 일반 채널 메시지가 없다.
- Application command interaction은 명령 소유 앱에 전달된다. WAW가 다른 앱의
  slash command를 Discord API로 실행하는 지원 경로는 확인되지 않았다. 사용자
  계정을 자동화하는 self-bot은 금지되므로 **사람 호출만 허용 후보**다.
- Discord Developer Policy §20은 Discord 서비스의 데이터·content·정보를
  mining 또는 scraping하지 말라고 명시한다. 외부 봇 응답을 반복적으로 구조화해
  경기 DB와 정산에 쓰는 행위는 이 금지에 해당할 위험이 높다.
- 외부 봇의 출력 이용 허가, 데이터 출처, 안정적인 ID, 정정과 보존 계약도
  확인되지 않았다.

따라서 parser 구현 전 **전용 시험 서버에서 응답 형태를 사람이 관찰하는
Spike**와 외부 봇 개발자의 명시적 허용이 필요하다. 자동 수집은 Discord의
서면 확인 없이는 활성화하지 않는다.

## 후보

| 후보 | 현재 공개 정보 | 1차 판정 |
|---|---|---|
| 설윤 (`1390247647293603881`) | 인증된 봇, 약 5,897개 서버, `/야구`, 일부 명령 유료, 공개 지원 서버·제작자 | 가장 현실적인 UX/응답 Spike 후보 |
| KBO Hub (`1525428456966586538`) | 일정·실시간 알림·뉴스 표방, 약 4개 서버, 조사 시점 오프라인 | 현재 제외 |
| SportsEye (`1328614858593140786`) | KBO를 표방하지만 영어 AI chat 중심이며 정확성·출처 불명 | 정산 원천 후보로 부적합 |

설윤 공개 초대는 조사 시점 `Administrator` 권한을 요청한다. 운영 서버에 바로
추가하지 않고 실제 사용자·webhook·민감 채널이 없는 시험 서버만 사용한다.

## 최소 동작 흐름

```text
사람이 외부 봇 명령 실행
  → 외부 봇이 전용 공개 채널에 응답
  → WAW가 allowlist된 bot ID의 새 메시지만 관측
  → guild/channel/author ID와 응답 schema 검증
  → 신뢰할 수 없는 candidate로 파싱
  → 검증 gate 통과 뒤 경기 projection에 반영
```

다음은 금지한다.

- 사용자 token, self-bot 또는 client 자동화로 외부 slash command 실행
- 모든 봇·모든 채널 메시지의 범용 수집
- 외부 봇 응답 원문·embed 전체의 장기 저장 또는 log 기록
- 작성자 이름만 신뢰하거나 webhook·복제 봇 메시지를 수용
- 형식이 바뀌거나 필드가 빠졌을 때 이전 값 또는 정상 상태로 추정
- 외부 봇 응답만으로 예외 경기·공식 정정을 임의 확정

## 전용 시험 서버 Spike

### 2026-08-07 관찰 결과

Owner가 지정한 실제 사용자·민감 채널이 없는 시험 서버의 공개 텍스트 채널에서
Orca 내장 브라우저만 사용해 설윤의 `/야구 오늘`을 사람이 실행했다.

- 명령은 무료로 선택·실행됐고 응답은 ephemeral이 아닌 일반 채널 메시지였다.
  같은 채널을 다시 불러온 뒤에도 동일한 source message가 남아 있었다.
- Discord UI는 호출자, 실행한 `야구 오늘`, 설윤의 `인증된 앱` 표식과 응답을
  하나의 일반 메시지 article로 표시했다.
- 실제 데이터는 legacy embed가 아니라 Components V2 container와 markdown
  component에 있었다. 일반 content만 보는 parser로는 충분하지 않다.
- 관찰일에는 5경기 전부 취소로 표시됐고 날짜, 경기 수, `취소/연기`, 취소 사유가
  제공됐다. 개별 홈·원정 팀, 시작 시각, 안정적인 경기 ID, revision, 공급자 생성
  시각과 정정 이력은 이 응답에서 확인할 수 없었다.
- 응답은 새 메시지로 생성됐다. edit/update 동작과 정상 경기일의 팀·점수 schema는
  아직 확인하지 않았다.

따라서 **public-message gate만 통과**했다. 이 한 건은 Gateway payload의 실제
components 구조, 정상 경기·더블헤더·정정 표현 또는 자동 정산 적합성을 입증하지
않는다. 설윤은 시험 서버에 남아 있으며 권한 축소 또는 제거는 별도 owner 작업이다.

정상 경기가 있는 날의 `/야구 오늘` Gateway payload 관찰은 2026-08-07 owner
지시로 **Deferred**했다. 공급자 독립적인 베팅 domain 작업을 먼저 진행하며,
이 보류는 `ADR-0032`의 미통과 gate를 해소하거나 listener 구현을 승인하지 않는다.

### 2026-08-10 추가 관찰

Orca 내장 브라우저의 Discord 앱 상세 화면에서 네이티브 `야구 오늘 보내기`를
실행했다. 별도 로그인이 필요하지 않았고 설윤은 새 public channel message로
응답했다. 응답은 Components V2로 `오늘은 KBO 경기가 없어요`, 기준 날짜와
`월요일 정규 휴식일`을 표시했다. 이는 휴식일 `no_game` 표현을 추가로 확인하지만
정상 경기의 팀·시작 시각·안정적 경기 ID·revision·정정 schema는 여전히
확인하지 못했다. 따라서 관찰되지 않은 정상 경기 parser를 추측해 구현하지 않고
production ingestion과 베팅 활성화 gate를 계속 닫는다.

### 선행 gate

1. Owner가 정확한 시험 서버와 후보 봇 하나를 승인한다.
2. 초대 화면의 실제 application ID와 권한을 read-back한다.
3. 가능하면 `Administrator` 대신 전용 채널의 View/Send/Embed/History만
   부여한다. 봇이 축소 권한으로 동작하지 않으면 Spike 뒤 즉시 제거한다.
4. 외부 봇 개발자에게 응답을 WAW가 자동 파싱·저장·정산 입력으로 사용해도
   되는지 확인한다.
5. 이 단계에서는 WAW 자동 listener를 만들지 않고 사람이 응답 형태만 기록한다.

### 확인 항목

- `/야구`의 subcommand·option과 무료/유료 여부
- 응답이 public message인지 ephemeral인지
- author application ID, message type, interaction metadata 존재 여부
- content/embed/component 중 실제 데이터 위치
- 일정, 시작 시각, 홈·원정, 점수, 상태, 순위와 데이터 출처 표시
- 더블헤더, 무승부, 연기·취소·노게임·서스펜디드 표현
- 안정적인 경기 ID·revision·공급자 시각 존재 여부
- 같은 명령의 응답 형식 안정성, edit/new-message 동작과 오류 응답

스크린샷이나 sanitized fixture가 필요하면 봇 개발자가 허용한 범위에서 실제
Discord/user/server ID를 제거하고 최소 필드만 남긴다.

### 성공 기준

- 외부 봇 개발자가 자동 파싱과 필요한 최소 저장을 명시적으로 허용함
- Discord가 이 사용을 scraping 금지 위반이 아니라고 확인하거나 그에 준하는
  명확한 공식 근거가 있음
- 응답이 public이고 WAW의 기존 Gateway에서 관측 가능함
- 안정적인 경기 구분과 필수 상태·정정 정보를 손실 없이 얻을 수 있음
- 형식 변경·오류·stale을 안전하게 실패시킬 수 있음

하나라도 충족하지 못하면 외부 봇 응답을 자동 정산 원천으로 사용하지 않는다.
일정·결과 표시 보조 또는 관리자가 명시적으로 확인하는 후보 입력으로 범위를
낮추는 것은 별도 owner 결정이다.

## 가장 작은 구현 후보

Spike가 통과하면 첫 구현은 설윤 하나, 전용 channel 하나, 정확한 bot ID 하나와
관측된 schema 하나만 지원한다. 기존 `discord.js` Gateway와 `messageCreate`를
재사용하고 새 dependency, provider factory와 fallback은 만들지 않는다.

메시지 ID는 중복 처리 방지에만 쓰고 원문은 저장하지 않는다. 파싱된 최소 경기
필드, source bot ID, source message ID, 관측 시각과 parser version만 보존한다.
응답 edit를 지원해야 한다는 증거가 있을 때만 `messageUpdate`를 추가한다.

## 출처

- Discord [Gateway와 Message Content Intent](https://docs.discord.com/developers/events/gateway)
- Discord [Message Resource](https://docs.discord.com/developers/resources/message)
- Discord [Application Commands](https://docs.discord.com/developers/interactions/application-commands)
- Discord [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)
- [설윤 공개 목록](https://koreanbots.dev/bots/1390247647293603881)
- [KBO Hub 공개 목록](https://koreanbots.dev/bots/1525428456966586538)
- [SportsEye 공개 목록](https://top.gg/bot/1328614858593140786)

## 권고

설윤의 공개 응답은 확인했지만 자동 수집 코드는 아직 만들지 않는다. 다음 최소
검증은 정상 경기일의 `/야구 오늘` Gateway payload를 민감정보 없이 일회 관찰해
components의 필수 필드와 경기 구분 가능성을 확인하는 것이다. 개발자 허용과
Discord 정책 gate도 통과한 경우에만 아래 Proposed ADR을 승인한다.
