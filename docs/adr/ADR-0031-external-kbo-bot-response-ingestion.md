# ADR-0031: 외부 KBO 봇 공개 응답의 제한적 수집

- Status: Accepted
- Date: 2026-08-07
- Owners: 프로젝트 소유자
- Related requirements: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`
- Related research: `docs/research/technology-options/kbo-external-discord-bot-ingestion.md`
- Supersedes: `ADR-0028`
- Superseded by: 없음

## Context

Owner가 2026-08-07 제품 의도를 명확히 했다. WAW가 계약형 KBO API를 직접
호출하는 것보다, 사용자가 기존 KBO Discord 봇을 호출하고 WAW가 그 공개
응답을 읽어 경기 정보와 베팅 정산 입력으로 쓰는 흐름이 목표다.

이는 외부 봇 응답을 금지한 Accepted `ADR-0028`과 충돌한다. Discord 기술
경로는 존재하지만 ephemeral 응답, Message Content Intent, 응답 schema와
Discord의 scraping 금지 정책을 먼저 검증해야 한다.

## Decision drivers

1. 사용자 계정 자동화 없이 Discord의 bot Gateway만 사용한다.
2. 모든 메시지를 수집하지 않고 승인된 봇·서버·채널·schema만 처리한다.
3. 외부 응답의 오류·변경·stale이 잘못된 베팅이나 정산을 만들지 않는다.
4. 원문과 불필요한 Discord 데이터를 저장·로그하지 않는다.
5. 실제 후보 하나가 검증되기 전 범용 abstraction을 만들지 않는다.

## Considered options

### Option A: 사람 호출 뒤 allowlist된 공개 응답만 관측

사람이 외부 봇의 slash command를 실행하고 WAW는 같은 채널에 생성된 공개
메시지만 관측한다. 기술적으로 가장 작지만 외부 봇 허용과 Discord 정책 확인이
필요하다.

### Option B: WAW가 다른 봇 명령을 자동 실행

다른 application의 interaction을 WAW가 대신 생성하는 지원 API가 없다.
사용자 token 자동화는 self-bot이므로 제외한다.

### Option C: 계약형 API 직접 연동

`ADR-0028`의 선택이다. 정정된 제품 의도와 다르지만 Option A가 정책·정확성
gate를 통과하지 못할 때의 안전한 대안으로 남긴다.

## Decision

Option A를 조건부 선택한다. 정확한 첫 후보는 설윤 application
`1390247647293603881`이다.

Owner는 2026-08-10 이 기술 선택을 승인했다. 다만 다음 gate는 설계 승인과
별개인 production 활성화 조건이며, 모두 통과하기 전에는 ingestion과 베팅을
default-off로 유지한다.

1. 별도 시험 서버에서 owner가 직접 `/야구 오늘`을 호출한다.
2. 응답이 WAW가 관측할 수 있는 public message이고 활성화할 schema의 필수
   필드가 확인된다.
3. 설윤 개발자가 자동 파싱·최소 저장·정산 입력 사용을 허용한다.
4. Discord scraping 정책과의 충돌이 해소된다.
5. 안정적인 경기 구분, 예외 상태, stale과 정정 처리 기준이 검증된다.

통과 뒤 첫 구현도 정확한 guild/channel/source bot ID와 관측된 schema 하나만
허용한다. WAW는 외부 명령을 실행하지 않으며 사용자 호출을 기다린다. 외부 봇
응답은 trust boundary 입력으로 검증하고, 불일치·누락·unknown은 fail closed한다.

원본 content/embed는 영구 저장하거나 log에 남기지 않는다. 최소 정규화 경기
필드, source bot/message ID, 관측 시각과 parser version만 저장한다. Source
message ID는 중복 방지와 운영 추적에만 사용하고 public DTO에 노출하지 않는다.

## Rationale

사람 호출과 단일 allowlist parser가 정정된 제품 의도를 만족하는 가장 작은
경로다. 자동 호출, 범용 parser와 다중 봇 fallback은 필요하지 않다. 다만 정책과
정확성 gate가 실패하면 작은 구현도 허용하지 않는 것이 더 안전하다.

## Consequences

### Positive

- 별도 KBO API integration 없이 기존 Discord 경험을 재사용한다.
- 한 후보와 한 schema만 지원해 구현 범위를 줄인다.
- 외부 형식 변경을 명시적 실패로 격리할 수 있다.

### Negative

- 사용자가 외부 명령을 실행해야 데이터가 갱신된다.
- ephemeral 응답이면 설계 자체가 동작하지 않는다.
- 외부 봇 변경·중단과 Message Content Intent에 종속된다.

### Risks

- Discord가 자동 파싱을 금지된 scraping으로 판단할 수 있다.
- 외부 봇이 데이터 재사용 권한을 주지 못할 수 있다.
- 출력에 안정적인 ID·정정 상태가 없어 자동 정산이 안전하지 않을 수 있다.
- Administrator 권한을 요구하는 외부 봇이 서버 보안 범위를 넓힌다.

## Validation

- 2026-08-07과 2026-08-10 시험 서버에서 owner가 설윤 `/야구 오늘`을 직접 실행했다. 응답은
  새 public channel message였고 새로고침 뒤에도 유지됐다.
- UI 관찰상 데이터는 legacy embed가 아니라 Components V2 container/markdown에
  있었다. 취소일과 월요일 휴식일 응답만 확인해 정상 경기 schema, 안정적 경기
  ID, revision, 공급자 시각과 messageUpdate 동작은 미검증이다.
- 다음 Spike에서 Gateway payload의 author/application ID, interaction metadata와
  components schema를 확인한다.
- sanitized fixture 하나로 정상, 누락, unknown, 형식 변경과 중복 message ID를
  검증한다.
- 실제 사용자·guild/channel ID와 응답 원문은 저장소와 log에 남기지 않는다.

## Rollback or migration

이 Accepted ADR 자체는 production을 바꾸지 않는다. 별도 feature flag를
default-off로 두고, 실패 시 listener를
끄되 이미 정산된 불변 원장은 삭제하지 않는다.

## Conditions for reconsideration

- 외부 봇이 API/webhook 또는 명시적인 machine-readable integration을 제공함
- Discord가 해당 자동 파싱을 허용하지 않음
- 응답이 ephemeral이거나 안정적인 schema·경기 ID·정정을 제공하지 않음
- 외부 봇 권한·유료 조건·중단 위험을 수용할 수 없음

## Approval

- Owner decision: 승인 — 외부 봇 공개 응답의 제한적 수집 설계 승인; production 활성화 gate는 별도 유지
- Approved date: 2026-08-10
