# D-03 데이터 흐름과 위협 모델

- 상태: Research
- 작성일: 2026-07-20
- 결정 질문: 기술과 배포 형태를 선택하기 전에 명령, 메시지 원문, 인증·권한, Riot/Discord 이벤트, 설정, 감사와 백업의 논리 경계 및 안전한 실패 조건을 어떻게 정의해야 하는가?
- 입력: `OWN-001`~`OWN-015`, D-02 외부 플랫폼 조사와 통합 검토
- 범위: 논리 도메인 경계, 신뢰 경계, 데이터 분류·수명, 데이터 흐름, 위협·완화 조건, 멱등성·실패 계약
- 비범위: 언어·런타임·SDK·프레임워크·DB·호스트·AI 공급자 선택, 물리 배포 구조 확정, ADR, Spike, 구현 계획, 제품 코드

## 1. 연결 요구사항과 소유자 결정

| 영역 | 요구사항과 결정 | D-03에서 고정할 경계 |
|---|---|---|
| 명령·감사 | `FUN-001`, `FUN-002`, `FUN-017`, `OPS-003`, `OPS-004`, `OWN-004` | 모든 명령 시도를 민감정보 없이 기록하고 감사와 운영 로그의 목적·보존을 분리한다. |
| 대화 요약 | `FUN-003`~`FUN-006`, `PRI-001`, `OWN-003`, `OWN-010`~`OWN-012` | 현재 channel 또는 thread의 지정 기간 전체를 처리하고 원문·중간물을 영구 저장하지 않으며 불완전하면 전체 실패한다. |
| 인증·인가 | `SEC-001`~`SEC-006`, `DEP-001`, `DEP-002`, `OWN-002`, `OWN-013` | 단일 guild, 서버 측 기본 거부, 운영자/관리자 2단계와 고위험 작업의 현재 역할 재검증을 적용한다. |
| 대시보드·운영 | `FUN-016`~`FUN-020`, `OWN-009`, `OWN-013` | 역할별 조회 범위, 설정 변경 감사, 서비스·백업 상태와 수동 복구 안내의 흐름을 분리한다. |
| 몰랭 | `FUN-010`~`FUN-015`, `DAT-003`, `PRI-002`, `PRI-003`, `OWN-004`, `OWN-007`, `OWN-008`, `OWN-015` | Riot 게임 상태와 Discord Go Live 관측을 별도 증거로 보존하고 미확인·후보·확정 상태를 구분한다. |
| 데이터·복구 | `DAT-001`~`DAT-005`, `OPS-005`~`OPS-008`, `OWN-004`, `OWN-005`, `OWN-009` | 영구 데이터와 백업의 무결성·버전·보존·복구 경계를 표시하되 저장소 제품은 선택하지 않는다. |
| 비밀·외부 경계 | `SEC-007`~`SEC-010`, `PRI-001`~`PRI-003` | 비밀과 원문을 로그·저장소에서 제외하고 외부 입력·출력, 환경 분리와 후속 공급망 검토 경계를 표시한다. |
| 내부 통신 | `INT-001`~`INT-003`, `OPS-001`, `OPS-002` | 웹과 봇이 분리될 가능성을 전제로 상호 인증, 멱등성, timeout과 최소 공개 면적을 요구한다. |
| 시험성·설정 | `QUA-001`~`QUA-003` | 시간·네트워크·중복·부분 실패를 결정적으로 검증하고 정책 값을 코드에 고정하지 않는 논리 경계를 유지한다. |
| 연기 기능 | `FUN-007`~`FUN-009`, `OWN-006`, `OWN-014` | KBO 데이터 흐름은 활성 시스템 경계에 넣지 않고 재개 조건만 기록한다. |

## 2. 확인 사실, 결정된 제약과 추론

### 확인 사실

- Discord Gateway 이벤트는 유실되거나 중복될 수 있으며 API는 eventually consistent하다. 현재 상태를 HTTP로 다시 확인할 수 있는 영역에는 reconciliation이 필요하다.
- Discord 메시지 조회는 channel 단위 cursor pagination이고 message content와 history 접근에는 필요한 intent와 권한이 있다.
- Discord Voice State의 `self_stream`은 Go Live 관측 필드지만 5분 감지와 2분 중단 허용을 보장하는 SLA는 없다.
- Riot Spectator는 현재 게임 후보를 조회할 수 있지만 404만으로 게임 종료를 확정할 수 없고 시작·종료 반영 시간도 보장하지 않는다.
- 요약 API 후보의 rate limit은 처리시간 SLA가 아니며 timeout·429·부분 실패는 비용과 deadline을 함께 소모할 수 있다.

이 사실의 근거와 확인일은 각각 `discord-platform.md`, `riot-platform.md`, `summary-api-constraints.md`에 기록되어 있다.

### 결정된 제약

- 첫 MVP는 운영 기반, 인증·권한, 감사, 기본 대시보드와 대화 요약이 우선이며 몰랭은 후속이다 (`OWN-001`).
- 요약은 명령을 실행한 현재 channel 또는 thread 하나의 최대 24시간 범위만 처리한다. 일반 channel에서 하위 thread를 암묵적으로 포함하지 않는다 (`OWN-003`, `OWN-010`, `OWN-011`).
- 프로젝트 DB·파일·로그에는 원문을 영구 저장하지 않는다. 학습에 사용되지 않는 유료 API 설정만 허용하고 공급자 상태 저장은 끈다 (`OWN-012`).
- guild owner는 관리자이며, 그 외 사용자는 설정된 운영자·관리자 role만 인정한다. Discord `ADMINISTRATOR` bit만으로 자동 승인하지 않는다 (`OWN-013`).
- KBO는 허가된 공급 경로를 확보할 때까지 연기하며 무허가 웹 크롤링이나 소비자 앱 내부 API를 사용하지 않는다 (`OWN-014`).
- Riot RSO 실패 시 관리자 승인 연결을 허용하되 공식 검증과 구분한다. 5분 감지를 검증하지 못하면 수동 확인을 유지한다 (`OWN-015`).

### 검토에서 확정한 D-03 기준

- 메시지 완전성은 고정된 `[start,end)`와 cutoff에서 Discord API가 정상 반환한 전체 집합을 기준으로 검증한다. 이미 삭제됐거나 API로 감지할 수 없는 동시 변경까지 포함한 절대적 스냅샷은 보장하지 않고 이 한계를 사용자에게 안내한다.
- 요약은 사용자별·channel 또는 thread별로 각각 30분에 한 번만 허용하며 두 cooldown을 모두 통과해야 한다. AI 호출 전 거부는 cooldown을 소비하지 않고, AI 호출을 시작한 뒤 실패한 요청은 비용 보호를 위해 소비한다.
- Discord 구성원에게 서버 정책 안내와 명령 실행 시 재고지를 함께 제공한다. 안내에는 처리 목적, 외부 AI 전송·안전성 보존 가능성, 프로젝트 원문 비저장을 포함한다.
- 운영자는 비민감 서비스 상태와 명령 결과 목록만 보고, 관리자는 식별정보가 필요한 감사 상세를 볼 수 있다. OAuth·세션 비밀, 원문, 요약문과 외부 응답 본문은 누구에게도 표시하지 않는다.
- 같은 브라우저의 로그인은 마지막 활동 후 1일, 최초 로그인 후 최대 7일까지 유지한다. 일반 read-only 요청은 최대 5분의 유효한 역할 cache만 허용하며, 변경과 고위험 작업은 정해진 강도로 다시 검증한다.
- 보안 감사 기록과 비용 원장은 1년 보존한다. 일반 페이지 접근은 운영 로그로 30일 보존하고 IP·User-Agent·query·요청 본문은 기본 저장하지 않는다.

### D-03 추론

- 논리 도메인 경계는 물리 프로세스 수와 독립적이어야 한다. 같은 프로세스에 있더라도 원문 처리, 인증, 감사, 몰랭 상태와 운영 작업은 서로 다른 권한·데이터 계약을 가져야 한다.
- 외부 응답의 timeout, 429, 5xx, 권한 상실 또는 불완전성은 도메인상 `unknown` 또는 실패다. 이를 “게임 종료”, “스트림 꺼짐”, “최신 데이터”, “요약 성공”으로 바꾸면 안 된다.
- 사용자 입력과 Discord 메시지는 신뢰할 수 없는 데이터다. 요약 모델의 출력도 권한 있는 명령이나 관리자 결정으로 사용하지 않고 표시 전 구조·출력 안전성을 검증해야 한다.
- 요약 결과는 Discord로 반환한 뒤 프로젝트 DB에 본문을 저장하지 않고 감사 메타데이터만 남긴다. 완료된 중복 interaction에도 본문을 재전송하지 않는다. 이 기준을 바꾸려면 별도 제품 결정이 필요하다.
- Discord에는 원자적 과거 스냅샷이나 모든 삭제·편집을 증명하는 수단이 없으므로, “전체”는 API가 정상 반환한 검증 가능 집합으로 제한한다. 감지 불가능한 변경을 보장한다고 표현하지 않는다.

## 3. 논리 구성요소와 신뢰 경계

```text
[Discord 사용자]
      │ 명령·OAuth 시작·Go Live
      ▼
┌──────────── 외부 경계: Discord ────────────┐
│ HTTP API / Gateway / OAuth / Discord 저장 메시지 │
└───────────────┬────────────────────────────┘
                │ 검증되지 않은 이벤트·원문·identity
                ▼
┌──────────── 프로젝트 처리 경계 ────────────┐
│ 명령·인가 │ 요약 조정 │ 몰랭 정책 │ 운영·감사 │
│          원문은 요청 수명 안에서만 존재          │
└──────┬──────────┬───────────┬──────────────┘
       │          │           │
       │          │ 원문      │ 최소 상태·감사 이벤트
       │          ▼           ▼
       │   [외부 AI 공급자]  [영구 데이터 경계]
       │                       │
       │                       ▼
       │                  [분리 백업 경계]
       ▼
[Riot API/RSO]

[관리자 브라우저] ── HTTPS ── [waw.dubeom.com 대시보드]
                                  │
                                  └─ 프로젝트 처리 경계와의 통신 방식은 D-08에서 결정
```

이 그림은 논리 관계다. 대시보드, 봇 처리와 영구 데이터가 같은 호스트 또는 서로 다른 호스트에 있는지는 정하지 않는다.

### 경계별 신뢰 규칙

| 경계 | 들어오는 데이터 | 기본 신뢰 | 필수 통제 |
|---|---|---|---|
| 사용자 → Discord 명령 | 기간, 명령 옵션, interaction 식별자 | 불신 | 형식·최대 24시간·현재 channel/thread·권한 검증, 중복 명령 방지 |
| Discord → 프로젝트 | OAuth identity, role, 메시지, Gateway event, HTTP 상태 | 인증된 외부 데이터이나 불완전·중복 가능 | 허용 guild 고정, 현재 권한 검사, schema 검증, cutoff·cursor, event reconciliation |
| 프로젝트 → AI 공급자 | 메시지 원문, 구조화 지시, 요청 ID | 가장 민감한 일시 데이터 | 학습 비사용 유료 설정, 상태 저장 비활성, TLS, 최소 전송, deadline·비용 사전 승인, 자동 공급자 fallback 금지 |
| AI 공급자 → 프로젝트 | 요약문, usage, finish 상태 | 불신 | 필수 섹션·manifest·usage·완료 상태 검증, 출력 인코딩, 명령 실행 금지 |
| 브라우저 → 대시보드 | OAuth callback, 쿠키, 설정 변경·조회 | 불신 | state·CSRF·세션 고정 방지, 서버 측 인가, 1일 비활동·7일 절대 만료, 5분 역할 cache와 고위험 재인증, 감사 |
| 프로젝트 ↔ Riot | 계정 identity, 게임 상태, 오류·rate limit | 승인 조건부 외부 데이터 | RSO/관리자 승인 구분, 최소 필드, 라우팅 검증, 404/429/5xx 분리, 재시도 제한 |
| 처리 → 영구 데이터 | 설정, 권한 매핑, 감사, 상태, 비용 원장 | 프로젝트가 검증한 데이터만 | 트랜잭션, 참조 무결성, 조건부 상태 전이, schema version, 최소 권한 |
| 영구 데이터 → 백업 | 복구에 필요한 영구 데이터 | 민감 | 암호화, 운영과 분리, 접근 분리, 보존·삭제 전파, 실제 복구 검증 |
| 웹 ↔ 봇 경계 | 관리 조회·명령·상태 | 배포 결정 전 미확정 | 분리 시 상호 인증, 최소 API, timeout, replay 방지, 멱등 key, 네트워크 실패의 안전한 결과 |

## 4. 데이터 분류, 저장과 보존

| 데이터 | 최소 필드 또는 내용 | 프로젝트 저장 | 보존·삭제 | 금지·주의 |
|---|---|---|---|---|
| Discord 메시지 원문 | 현재 위치의 지정 기간 message content와 처리에 필요한 안정 ID·시각 | 영구 저장 금지; 요청 수명의 메모리 또는 통제된 임시 영역만 | 성공·실패·취소 직후 원문, chunk, 중간 요약과 임시 manifest 폐기 | 로그, 오류, trace, fixture, backup 금지 |
| 요약 결과 본문 | 핵심 논의·결정·할 일·미해결 질문 | 프로젝트 DB에 저장하지 않음; Discord 응답으로만 반환 | 요청 종료 후 프로젝트 처리 영역에서 폐기 | 감사 로그와 완료 중복 응답에 본문 금지; 보존이 필요해지면 새 정책 결정 |
| 요약 감사 메타데이터 | request/correlation ID, actor/guild/channel ID, `[start,end)`, count, token·비용, duration, outcome/reason | 감사 저장 | 명령 감사로 1년 | 원문, prompt, 요약문, 공급자 raw body 금지 |
| 운영 로그 | service version, 외부 서비스 상태, 오류 분류, duration, correlation ID | 운영 로그 저장 | 30일 | token, cookie, header 전체, 원문, 불필요한 개인정보 금지 |
| 인증·보안 감사 | 로그인·로그아웃·실패·권한 거부·감사 상세 조회의 actor, 시각, 경로, 결과, correlation ID | 감사 저장 | 1년 | IP·User-Agent·query·요청 본문·OAuth code·cookie 기본 저장 금지 |
| 일반 웹 접근 | actor 내부 참조, 시각, 정규화된 경로, 결과, correlation ID | 운영 로그 저장 | 30일 | query·요청 본문·IP·User-Agent 기본 저장 금지 |
| 설정 변경 감사 | actor, 이전/새 설정의 비민감 구조, 대상, 시각, 결과 | 감사 저장 | 1년 | secret 값은 이전/새 값 모두 금지 |
| OAuth·세션 비밀 | 일시적인 Discord access token, session ID·서명 material | Discord user token은 identity 확인 중에만 사용하고 지속 저장하지 않음; 브라우저에는 임의 세션 식별자만 저장 | session은 1일 비활동 또는 7일 절대 만료; 로그아웃·guild 탈퇴·role 상실 시 폐기 | refresh token 보존과 로그·감사·URL·웹 화면 노출·평문 backup 금지 |
| 역할·guild 설정 | 허용 guild ID, 운영자/관리자 role ID, owner 확인 결과·검증 시각 | 영구 저장 | 설정 유지 기간; 변경 감사 1년 | role 이름을 보안 식별자로 사용하지 않음 |
| Riot 계정 연결 | Discord user 내부 참조, PUUID, platform, 표시용 Riot ID, 검증 방식·시각 | 등록 중 저장 | 해제·guild 탈퇴 즉시 감지 제외, 30일 유예 후 연결 식별자 삭제 | 비밀번호·Riot 세션·OAuth 코드 수집 금지 |
| Riot 관측·게임 상태 | `(platformId, gameId)`, queue, 최소 participant 연결, 관측·발생 시각, 상태 근거 | 사건 판정에 필요한 최소 상태 | 활성 상태는 종료·정리 정책까지; 확정 몰랭 이력은 1년 | 룬·밴·관전 암호화 키 등 불필요한 Spectator 필드 금지 |
| 몰랭 이력 | 사건 ID, 자동/수동, 함께한 사람, 신고자, stack, 정정·취소와 감사 | 영구 저장 | 1년; 연결 삭제 시 식별정보 삭제 또는 익명화 | 원본 외부 응답 전체 저장 금지 |
| 비용 원장 | 공급자 범주, 내부 요청 ID, 예약·실제 token/비용, 상태 | 영구 운영 데이터 | 1년 후 삭제; 필요하면 사용자·channel과 연결되지 않는 월별 합계만 유지 | 직접 actor/channel 식별자, prompt·원문·요약문·공급자 raw body·secret 금지 |
| 내보내기 파일 | schema version, 생성 시각, 데이터 범위, 허용된 영구 데이터, 무결성 검증값 | 관리자 수동 절차로 생성; 별도 보호 위치 | 목적 달성 뒤 안전하게 삭제; 구체 기간은 D-12에서 확정 | OAuth token, 세션, API key, Discord 원문 제외 |
| 백업 | 위 영구 데이터의 복구본과 schema version | 운영 데이터와 분리 | RPO 24시간을 만족하는 보존안과 개인정보 삭제 전파 방식은 D-12에서 비교 | 원문 메시지와 runtime secret을 새로 포함하지 않음 |
| KBO 데이터 | 없음 | 활성 저장·수집 없음 | 기능 재개 전까지 해당 없음 | 허가 없는 크롤링·소비자 앱 내부 API·Discord 재표시 금지 |

모든 영구 시각은 UTC 기준의 명확한 형식으로 저장하고, Discord snowflake 발생 시각, Riot `gameStartTime`, 외부 응답 관측 시각, 처리 시각을 서로 다른 필드로 취급한다. 사용자 표시는 KST로 변환할 수 있으나 저장 원본의 의미를 덮어쓰지 않는다 (`DAT-005`).

## 5. 핵심 데이터 흐름

### 5.1 공통 명령과 감사

1. Discord에서 interaction과 actor, guild, channel/thread, 명령 입력을 받는다.
2. interaction ID, actor ID, guild/channel ID, 명령명과 시각만으로 명령 시도 식별자와 correlation ID를 만들고 시작 감사 이벤트를 기록한다. 입력값, 원문 메시지와 secret은 포함하지 않는다.
3. schema, 허용 guild, 명령 위치와 현재 actor 권한을 서버 측에서 검증한다. 입력 거부, 잘못된 guild/channel과 권한 거부도 2단계의 같은 감사 건에 연결한다.
4. 도메인 작업을 실행하고 외부 호출마다 같은 correlation ID와 별도 attempt ID를 연결한다.
5. 성공, 입력 거부, 권한 거부, timeout, 외부 실패, 취소를 terminal outcome과 reason code로 기록한다.
6. 중복 interaction이 진행 중이면 `already_processing`, 이미 완료됐으면 본문 재사용 없이 `already_completed`를 반환하고 도메인 부작용을 다시 실행하지 않는다. 다시 요약하려면 새 명령을 사용한다.

명령 감사의 후보 멱등 key는 Discord가 제공하는 안정 interaction ID와 허용 guild ID의 조합이다. 정확한 저장 형식은 D-05에서 정하지만 안정 ID 없는 임의 시간·사용자 조합으로 중복을 판정해서는 안 된다.

요약 명령은 사용자별 cooldown key와 channel/thread별 cooldown key를 먼저 조회하고, 모든 입력·권한·비용·처리량 사전 검증을 통과한 뒤 AI 호출 직전에 두 key를 한 원자적 판정으로 다시 확인·소비한다. 둘 중 하나라도 최근 AI 호출 시작 뒤 30분이 지나지 않았으면 외부 호출 전 거부한다. 입력·권한·비용의 사전 검증 실패는 cooldown을 소비하지 않지만, AI 호출을 시작한 요청은 timeout이나 외부 실패여도 비용 보호를 위해 두 cooldown을 소비한다.

### 5.2 대화 요약

```text
명령 수신
  → 허용 guild·actor·현재 channel/thread 검증
  → 사용자·channel/thread 30분 cooldown 사전 확인
  → `[start,end)` 및 request cutoff 고정
  → deadline·최악 비용·처리량 사전 판정
  → Discord cursor pagination
  → 페이지 연속성·권한·삭제/편집·중복 검증
  → 요청 내 ordinal/manifest 생성
  → AI 호출 직전 두 cooldown 원자 재확인·소비
  → AI 처리(단일/계층 방식은 D-06에서 결정)
  → 모든 구간·필수 네 섹션·usage·완료 상태 검증
  → Discord 결과 반환
  → 원문·chunk·중간물·manifest 폐기
  → 비민감 감사 메타데이터 확정
```

안전 조건:

- 범위는 명령 위치 하나뿐이며 일반 channel과 그 하위 thread를 합치지 않는다.
- cutoff 뒤 신규 메시지는 현재 요청에 포함하지 않는다. `[start,end)`와 cutoff의 정확한 관계는 수집 계약에 기록한다.
- Discord API가 고정 range/cutoff에서 정상 반환한 전체 메시지를 검증 가능한 입력 집합으로 삼는다. 이미 삭제됐거나 API로 감지할 수 없는 동시 변경까지 포함한 절대적 스냅샷은 보장하지 않으며 이 한계를 사용자에게 안내한다.
- 권한 상실, 페이지 불연속, 감지된 삭제·편집, 429/timeout으로 deadline 내 완전성 검증 실패, AI chunk 일부 실패, manifest 불일치 또는 필수 출력 누락은 전체 실패다.
- 부분 요약, 늦게 도착한 결과 또는 이전 시도의 결과를 성공으로 승격하지 않는다.
- 모델에 포함된 메시지가 “명령을 실행하라”, “정책을 무시하라”고 말해도 데이터로만 취급한다. 요약 출력은 설정 변경, 외부 호출 또는 권한 판단을 유발하지 않는다.
- 공급자 장애 시 다른 AI 공급자로 원문을 자동 전송하지 않는다. 새 처리자 사용은 데이터 정책과 비용 검토가 필요한 별도 결정이다.
- 서버의 고정 AI·개인정보 처리 안내와 명령 실행 시 짧은 재고지에 처리 목적, 외부 AI 전송·안전성 보존 가능성, 프로젝트 원문 비저장을 포함한다.

### 5.3 대시보드 인증·인가와 설정 변경

1. 사용자를 Discord OAuth로 보낼 때 state와 정확한 운영/미리보기 redirect URI를 묶는다.
2. callback에서 state와 token 응답을 검증하고 Discord user ID를 얻은 뒤 user access token을 프로젝트 저장소에 보존하지 않는다.
3. 허용된 단일 guild의 현재 member/roles는 bot-side 조회로 확인한다.
4. guild owner이면 관리자, 아니면 설정된 관리자 role 또는 운영자 role만 부여한다. `ADMINISTRATOR` bit만으로 승격하지 않는다.
5. 안전한 서버 측 세션을 발급하고 로그인·로그아웃·폐기 이벤트를 민감정보 없이 기록한다.
6. 브라우저에는 임의 세션 식별자만 두고, 마지막 활동 후 1일 또는 최초 로그인 후 7일 중 먼저 도달한 시점에 세션을 만료한다. 로그아웃과 확인된 guild 탈퇴·role 상실 시 폐기한다.
7. 보호 요청마다 서버 측 권한을 검사한다. 자가 bot host 장애 중에도 최대 5분의 유효한 역할 cache에서는 read-only만 허용한다. cache가 만료되면 인증된 조회도 `unavailable`이며 변경·고위험 작업은 즉시 거부한다.
8. 권한·복구 관련 고위험 작업은 마지막 Discord OAuth 완료가 15분 이내여야 한다. 넘으면 OAuth를 다시 완료하고 현재 guild member/roles 강제 재조회, CSRF 검사와 명시적 사용자 확인을 모두 통과해야 한다. 단순 session 활동은 OAuth 완료 시각을 갱신하지 않으며 하나라도 실패하면 거부한다.
9. 설정 변경은 입력 검증과 권한 검사를 거쳐 원자적으로 적용하고 변경 전후의 비민감 값과 결과를 감사한다.
10. 운영자는 비민감 서비스 상태와 명령 결과 목록만 조회한다. 관리자는 필요한 Discord 사용자 ID·표시 이름이 포함된 감사 상세를 볼 수 있지만 OAuth·세션 비밀, 원문, 요약문과 raw 외부 응답은 누구에게도 표시하지 않는다.
11. 감사 상세 조회 자체를 보안 감사로 기록한다. 로그인·로그아웃·실패·권한 거부·감사 조회는 1년, 일반 페이지 접근은 30일 보존한다.

일반 운영 화면은 서버 이름을 표시하고 guild ID는 숨긴다. 진단상 필요한 guild ID는 관리자 상세에서도 기본 숨김 또는 마스킹하며, 노출이 필요한 별도 진단 행위는 감사한다.

초기 범위에서 대시보드는 복구 상태와 수동 절차만 표시한다. 브라우저에서 실제 복구를 실행하는 흐름은 만들지 않는다 (`OWN-009`).

### 5.4 Riot 계정 연결과 몰랭 판정 — 후속 기능

계정 연결:

1. RSO가 승인되면 Riot 공식 로그인 결과와 같은 사용자 세션의 Discord identity를 연결한다.
2. RSO가 불가능하면 관리자 승인 절차를 사용하고 `admin_approved`로 표시한다. 공식 Riot 검증으로 표기하지 않는다.
3. Discord user와 PUUID의 활성 연결 유일성, 승인 actor·시각·근거 유형을 검증·감사한다.
4. 비밀번호, Riot 세션, OAuth code/token을 승인 증거로 수집하지 않는다.
5. 연결 해제 또는 guild 탈퇴 즉시 폴링 대상에서 제외하고, 30일 유예 뒤 연결 식별자를 삭제한다.

자동 관측과 사건 판정:

1. 등록 계정의 Riot 현재 게임을 관측하고 queue `420`만 솔로 랭크 시작 후보로 둔다.
2. `(platformId, gameId)`를 게임의 중복 방지 후보 key로 사용하고 여러 등록 참여자의 관측을 하나의 게임 상태에 합친다.
3. Discord `VOICE_STATE_UPDATE.self_stream`과 필요 시 HTTP 현재 상태 reconciliation을 별도 관측으로 기록한다.
4. Riot 발생 시각, Riot 관측 시각, Discord event 시각, Discord 관측 시각을 구분한다.
5. 게임을 처음 감지할 때 적용할 유예시간·중단 허용시간·점수 정책과 정책 버전을 사건 속성으로 snapshot한다. 게임 도중 설정 변경은 다음 게임부터 적용한다.
6. 5분 유예와 2분 중단 허용을 snapshot된 설정값으로 적용하되 외부 데이터가 미확인이면 timer만으로 위반을 확정하지 않는다.
7. 게임 key와 대상 Riot 연결로 사건 identity를 고정하고 정책 버전은 identity에서 제외한다. 동일 identity에는 하나의 활성 사건만 허용해 중복 stack을 막는다.
8. 관리자의 정정·취소는 새 사건을 만들거나 기존 사건을 덮어쓰지 않고 이전 상태, 새 상태, actor, 이유와 시각을 감사한다.

최소 상태 의미:

| 상태 | 의미 | 허용되는 다음 동작 |
|---|---|---|
| `unknown` | timeout, 429, 5xx, 권한 상실, 재연결 공백 등으로 사실을 판단할 수 없음 | 재시도·reconciliation; 위반·종료 확정 금지 |
| `inactive_observed` | 정상 응답에서 현재 솔로 랭크가 관측되지 않음 | 다음 관측 대기; 이전 active가 있으면 종료 후보일 뿐 |
| `game_candidate` | queue 420 게임이 정상 관측됨 | 같은 game key로 관측 병합, Go Live 대조 |
| `stream_observed` | 해당 Discord user의 `self_stream=true`가 관측됨 | 중단 timer 또는 게임 종료까지 상태 갱신 |
| `violation_candidate` | 유예·중단 정책상 위반 가능성이 있으나 외부 상태 확정이 부족함 | 후속 관측·수동 확인 |
| `confirmed` | 정책이 요구한 증거와 중복 방지 조건을 충족한 사건 | 1 stack, 감사, 관리자 정정 가능 |
| `corrected` / `cancelled` | 관리자 조치로 확정 사건을 변경 | 원본 사건·감사 보존, 중복 재확정 방지 |

Riot 404, Discord `self_stream` 누락 또는 Gateway 단절을 곧바로 `inactive_observed`로 바꾸지 않는다. 정확한 상태 전이와 관측 횟수는 문서 증거로 확정할 수 없으며 향후 별도 검증 대상이다.

모든 Voice State 관측에는 `observed_at`과 단조 증가하는 관측 세대를 부여한다. HTTP reconciliation은 요청 시작 시의 세대를 함께 보존하고, 응답 전에 더 최신 Gateway 관측이 반영됐으면 현재 상태를 덮어쓰지 않는다. 재연결 reconciliation은 새 세대에서 시작한다. 순서를 판단할 수 없는 결과는 `unknown`으로 유지하고 위반 판정에 사용하지 않는다. 오래된 결과를 진단 메타데이터로 남기더라도 현재 상태 변경 권한은 주지 않는다.

### 5.5 운영 상태, 백업과 복구

- 대시보드는 프로세스 생존과 외부 서비스 상태를 구분한다. 예: 최근 Gateway ACK, Ready/Resumed, 마지막 정상 Discord HTTP, AI 요청 성공·rate-limit·degraded, Riot 마지막 정상 관측.
- `unknown`, `degraded`, `unavailable`, `healthy`의 근거와 관측 시각을 함께 표시하고 오래된 성공을 현재 정상으로 표시하지 않는다.
- 백업 작업은 고유 run ID, 대상 schema version, 시작·종료, 검증 결과와 암호화·분리 위치 확인을 기록한다.
- 백업 성공 로그만으로 복구 가능성을 표시하지 않는다. 마지막 실제 복구 검증 시각과 결과를 별도로 둔다.
- 대시보드는 마지막 백업과 복구 점검 상태 및 수동 절차만 제공하며 복구 명령이나 backup credential을 받지 않는다.
- 복구 후 재실행되는 명령·외부 이벤트가 기존 사건을 중복 생성하지 않도록 멱등 key와 terminal 상태를 함께 복원해야 한다.

### 5.6 KBO — 연기 상태

KBO는 활성 수집, cache, 명령 응답, 운영 상태 또는 backup 흐름을 만들지 않는다. 다음 조건이 모두 충족된 뒤 새 연구에서 이 문서를 확장한다.

1. KBO·스포츠투아이 또는 권한 있는 공급자의 서면 자동 접근 허가
2. Discord 재표시 권리
3. 현재 시즌 10개 구단 coverage와 원천 갱신 시각
4. 결과·순위 지연 기준과 비용이 `OWN-005`에 부합
5. 저장·cache·삭제·출처 표시 조건

기능 재개 전 장애 fallback으로 네이버·KBO 웹 크롤링이나 소비자 앱 내부 API를 사용하지 않는다.

### 5.7 내보내기·가져오기와 마이그레이션

- 내보내기, 가져오기와 migration은 관리자만 승인된 수동 운영 절차로 수행하며 초기 대시보드에서 직접 실행하지 않는다.
- 내보내기 파일에는 schema version, 생성 시각, 데이터 범위와 무결성 검증값을 포함한다. OAuth token, 세션, API key, Discord 원문은 제외한다.
- 가져오기는 반영 전에 파일 형식, 지원 schema version, 무결성, 참조 관계, 중복 key와 보존·삭제 정책을 검증한다.
- 과거 내보내기 파일이 이미 삭제·익명화된 개인정보를 되살리지 않도록 삭제·익명화 이력 또는 동등한 차단 근거와 대조한다.
- 가져오기와 migration 전에 자동 backup을 만들고, 실제 변경은 전체 성공 또는 전체 rollback이 가능한 원자적 경계에서 수행한다. 사전 검증이나 일부 단계가 실패하면 사용자 데이터는 변경하지 않는다.
- 모든 내보내기·가져오기·migration 시도, actor, 대상 version, 시작·종료, 결과와 rollback 여부를 원문·secret 없이 감사한다.

## 6. 공통 멱등성, 재시도와 실패 분류

| 작업 | 중복 식별 후보 | 재시도 원칙 | terminal 성공 금지 조건 |
|---|---|---|---|
| Discord 명령 | `(guild_id, interaction_id)` | 같은 명령 부작용은 한 번만; 진행·완료 상태 조회 | actor/guild/입력 검증 불일치 |
| 요약 요청 | interaction ID + 고정 range/cutoff | 진행 중 중복은 `already_processing`, 완료 중복은 본문 없이 `already_completed`; 전체 deadline·비용 예약 안에서만 | 페이지·manifest·필수 섹션 불완전, deadline·비용 초과 |
| 요약 cooldown | actor ID와 channel/thread ID의 독립 key | 두 key를 원자 확인·갱신; AI 호출 시작 뒤 각각 30분 | 어느 key든 cooldown 중이거나 동시 갱신 충돌 |
| 설정 변경 | 서버가 발급하거나 검증한 mutation ID + 대상 version | 낙관적 version 또는 동등한 조건부 갱신 필요 | stale role, CSRF/state 실패, version 충돌 |
| Riot 게임 | `(platformId, gameId)` | 429 `Retry-After`, 5xx/timeout backoff; 관측 상태 유지 | 404 하나, timeout 또는 잘못된 route만으로 종료 확정 |
| 몰랭 사건 | game key + 대상 Riot 연결; 정책 version은 snapshot 속성 | 조건부 상태 전이; 확정·정정·취소 이력 보존 | 외부 상태 `unknown`, 중복 활성 사건, 정책 변경으로 새 사건 생성 |
| Voice State | guild/user + 관측 세대 + Gateway session/sequence 또는 HTTP request generation | 중복 이벤트는 같은 상태 전이로 흡수; 최신 세대만 현재 상태 갱신 | 누락 field·disconnect·오래된 HTTP 결과로 스트림 종료 확정 |
| 외부 호출 | correlation ID + attempt ID | method의 안전성과 공급자 지침을 확인한 호출만 제한 재시도 | 이전 attempt의 늦은 성공을 최신 상태로 무조건 승격 |
| 백업·복구 점검 | backup/run ID + schema version | 같은 실행의 재개와 새 실행을 구분 | 파일 존재 또는 성공 로그만으로 복구 가능 판정 |
| 가져오기·migration | operation ID + source/target schema version | 사전 검증·backup 뒤 원자 반영; 실패 시 전체 rollback | 부분 반영, 무결성 실패, 삭제 개인정보 복원 |

공통 결과 범주 후보:

- `success`: 모든 도메인 불변식과 외부 완료 조건이 검증됨
- `denied`: guild/channel/role 또는 정책 권한 거부
- `invalid`: 입력·schema·시간 범위 검증 실패
- `conflict`: 중복, stale version 또는 조건부 상태 전이 충돌
- `rate_limited`: 외부 429 또는 내부 예산 제한
- `timeout`: 전체 또는 경계별 deadline 초과
- `external_failure`: 인증된 외부 오류·5xx·비정상 응답
- `incomplete`: 일부 단계·페이지·chunk·증거가 불완전
- `cancelled`: 사용자 또는 시스템 취소
- `unknown`: 관측 사실을 확정할 수 없으며 도메인 상태를 바꾸지 않음

정확한 reason code 목록은 로그 스키마 연구 대상이지만, HTTP 상태 하나를 곧바로 도메인 결과로 사용하지 않는 원칙은 유지한다.

## 7. 위협 모델

| 위협 | 공격·실패 경로 | 영향 | 필수 완화·검증 조건 | 잔여 위험·후속 |
|---|---|---|---|---|
| 다른 guild 또는 비승인 사용자 접근 | 위조·오래된 세션, callback 조작, guild 탈퇴 뒤 기존 권한 사용 | 대시보드·설정 무단 접근 | 허용 guild 고정, OAuth state, 서버 측 role 검사, 5분 cache 만료 뒤 조회 중단, 변경·고위험 작업 재조회와 기본 거부 | Discord event와 cache 무효화의 실제 지연은 검증 필요 |
| Discord `ADMINISTRATOR` 과승격 | broad permission을 프로젝트 관리자 role로 오해 | 고위험 작업 권한 상승 | owner 또는 설정된 role만 매핑; `ADMINISTRATOR` bit 무시 | role 설정 자체 변경은 관리자·감사 필요 |
| CSRF·세션 고정·쿠키 유출 | 공격자가 설정 변경 요청 또는 세션을 주입 | 설정·권한 변조 | state, CSRF, 세션 재발급·폐기, Secure/HttpOnly/SameSite, 정확한 domain | 세션 방식은 D-07 |
| 웹-봇 요청 위조·재전송 | 분리 배포 API가 공개되거나 요청이 replay됨 | 명령 중복·정보 노출 | 상호 인증, 최소 공개 면적, nonce/만료·멱등 key, timeout, 권한 분리 | 통신 형태는 D-08 |
| 원문 메시지 유출 | 로그·trace·오류·임시 파일·backup·AI 상태 저장 | 개인정보 및 정책 위반 | 구조화 allowlist 로그, 원문 영구 저장 금지, 임시물 finally 폐기, provider state off, secret/PII redaction test | 공급자 안전성 보존은 고지 후 허용; ZDR 우선 검토 |
| Prompt injection | Discord 메시지가 모델·후처리기에 정책 무시나 명령 실행을 지시 | 잘못된 요약, 외부 작업·권한 오용 | 메시지를 비신뢰 데이터로 구분, 모델에 도구·관리 권한 부여 금지, 구조 검증·출력 인코딩 | 의미론적 오요약은 합성 품질 검증 필요 |
| 요약 조용한 누락 | pagination 흔들림, 삭제·편집, 권한 상실, chunk 실패 | 불완전 결과를 사실로 신뢰 | range/cutoff, 권한 선검사, manifest, 전체 실패, 부분 결과 금지 | Discord가 이미 삭제한 메시지는 복구 불가 |
| 완전성 과장 | Discord가 제공하지 않는 원자적 snapshot과 감지 불가능한 변경까지 보장한다고 안내 | 사용자가 결과 범위를 오해 | 검증 가능 집합으로 계약 제한, 감지된 오류만 전체 실패, 사용자 한계 고지 | API 밖에서 이미 삭제된 메시지는 알 수 없음 |
| 비용·처리량 고갈 | 반복 명령, 거대 24시간 범위, retry 폭증 | 월 예산 초과·서비스 거부 | 권한별 rate limit, 요청 전 최악 비용 예약, 월 원자적 원장, 전체 deadline, retry budget | 실제 사용량·동시성 미확정 |
| cooldown 경합·우회 | 같은 사용자가 여러 channel에서, 여러 사용자가 같은 channel에서 동시에 요청 | 중복 비용·부하 | actor와 channel/thread 두 key의 원자적 확인·갱신, AI 시작 뒤 실패도 cooldown 소비 | 분산 배포의 원자성 방식은 D-05/D-08 |
| 늦은 외부 응답의 상태 오염 | timeout 뒤 이전 attempt가 성공 도착 | 실패 요청 성공 승격, 비용·상태 중복 | attempt generation, terminal 상태 조건부 갱신, 늦은 결과 폐기하되 비용 반영 | 공급자 취소가 과금 취소를 보장하지 않음 |
| Gateway 유실·중복·재연결 공백 | Resume 실패, 중복 dispatch, 단일 실행 실패 | Go Live 오탐·누락, 명령 중복 | sequence/session 추적, idempotent handler, HTTP reconciliation, 단일 active owner 요구 | 실제 복구 창·지연은 미검증 |
| Riot 404·장애 오판 | 404/429/5xx를 게임 종료로 취급 | 잘못된 사건·stack | `unknown`/종료 후보 분리, route 검증, 후속 정상 관측·Match 근거 | 확정 관측 횟수와 5분 목표 미검증 |
| 관리자 승인 계정 사칭 | 공개 Riot ID·조작 증거로 제3자 연결 | 개인정보 침해·평판 피해 | 검증 방식 표시, PUUID/Discord 활성 연결 유일성, 승인 감사, 재승인·이의제기·즉시 해제 | RSO와 동등한 소유권 증거가 아님 |
| 몰랭 중복·경합 | 여러 등록 참여자·worker·재시도가 같은 game을 처리 | 여러 사건·stack | game/incident 안정 key, 트랜잭션·조건부 전이, 정책 version | 저장소 동시성은 D-05 검증 |
| 정정·취소 흔적 삭제 | 관리자가 사건을 overwrite 또는 삭제 | 감사 불능·점수 불일치 | append-only에 준하는 변경 감사, 원상태·신상태·이유, 점수 원자 갱신 | 구체적 모델은 후속 몰랭 설계 |
| 시간 혼동 | event time, observation time, KST/UTC 혼합 | 유예·중단·보존 오류 | UTC 저장, 의미별 timestamp 분리, KST는 표시만, 결정적 가짜 시간 시험 | 외부 시계 지연은 관측 필요 |
| secret 노출·환경 혼용 | token이 저장소·로그·preview에 공유 | 외부 계정 탈취 | 환경별 secret 분리, 최소 권한, rotation/revoke, 로그 금지, preview 분리 | 비밀 도구·주기는 D-11 |
| 백업 유출·복구 불능 | 운영과 같은 권한, 암호화 부재, 복구 미시험 | 전체 데이터 유출·손실 | 분리·암호화, schema version, 최소 접근, 정기 실제 복구, RPO/RTO 측정 | 저장소·백업 제품은 D-05/D-12 |
| 보존·삭제 불일치 | primary에서 삭제했지만 backup·감사에 식별자 잔존 | 개인정보 정책 위반 | 데이터별 보존표, 익명화, backup 만료·복구 후 재삭제 절차 | Riot 삭제 요청 기한은 별도 조사 필요 |
| 가져오기로 삭제 데이터 부활 | 오래된 export/backup이 익명화 전 식별자를 다시 반영 | 개인정보 정책 위반 | 삭제 이력 대조, schema·무결성 검증, 사전 backup, 원자 반영·rollback | 삭제 이력 표현은 D-05/D-12 |
| 대시보드 출력 주입 | 외부 이름·요약·오류를 HTML로 신뢰 | XSS·관리자 세션 탈취 | 출력 인코딩, 구조화 오류, raw 외부 body 표시 금지, CSP 후보 검토 | 웹 보안 세부는 D-07/D-10 |
| KBO 비허가 수집 재도입 | 장애 fallback이나 편의상 크롤러 추가 | 약관·권리·운영 위험 | 기능 비활성, 허가 조건을 release gate로 기록, 자동 fallback 금지 | 허가 공급 경로 확보 시 새 연구 필요 |

## 8. 경계 대안 비교

D-03은 물리 구조를 선택하지 않지만 후속 D-08이 같은 논리 계약을 비교할 수 있도록 세 범주를 평가한다.

| 대안 | 데이터 흐름 특성 | 장점 | 주요 위험 | D-03 통과 조건 |
|---|---|---|---|---|
| A. 한 배포 단위 안의 명확한 모듈 경계 | 명령·요약·인가·감사·몰랭이 한 runtime 안에서 내부 계약으로 통신 | 네트워크 경계와 운영 구성요소가 적음 | 권한·원문·실패가 한 프로세스에 섞이고 장기 작업이 서로 영향을 줄 수 있음 | 모듈별 입력 계약, 원문 수명, 트랜잭션, timeout·취소와 테스트 대역이 물리 분리 없이도 유지돼야 함 |
| B. 웹과 지속 봇 경계 분리 | 브라우저/웹과 Gateway·작업 처리가 인증된 내부 경계를 통과 | 웹·Gateway 수명주기와 장애를 분리 가능 | 공개 관리 API, 상호 인증, replay, 네트워크 부분 실패가 추가됨 | 최소 API, 상호 인증, 멱등 key, safe timeout과 웹이 봇 secret을 갖지 않는 권한 분리가 필요 |
| C. 작업·이벤트 경계 추가 분리 | 요약·감지·감사를 queue/event로 전달 | 긴 작업·burst·재시도 격리에 유리할 수 있음 | 구성요소·중복 전달·순서·원문 임시 보존이 복잡해지고 2분 목표에 불리할 수 있음 | at-least-once를 전제로 한 멱등성, 원문 비영구 queue 보장, deadline 전파와 운영 비용 근거가 필요 |

### 잠정 권고

기술 또는 배포 선택이 아니라 **논리 경계 기준안**으로, A처럼 최소한의 도메인 모듈 경계를 먼저 유지하되 웹과 봇의 물리 분리 가능성을 B의 계약으로 열어 둔다. C는 실제 부하·장애 격리 증거 없이 기본 전제로 두지 않는다. 이 기준은 구성요소를 줄이면서도 D-08에서 네 배포 형태를 공정하게 비교할 수 있게 한다.

### 가장 강한 대안

B는 `waw.dubeom.com` 웹과 지속 Gateway bot의 수명주기가 다를 때 가장 강한 대안이다. 다만 인터넷에 공개되는 관리 API를 최소화하고 상호 인증·replay 방지·부분 실패를 입증하지 못하면 A보다 안전하다고 볼 수 없다.

## 9. 검증 공백과 후속 연구 입력

| 공백 | 현재 안전한 처리 | 필요한 후속 단계 |
|---|---|---|
| 웹과 봇의 물리 경계·통신 방식 | 분리 가능 계약만 요구하고 endpoint를 정하지 않음 | D-08 배포 경계·내부 통신 연구 |
| D-07 계약의 실제 동작 | 1일 비활동·7일 절대 만료, 5분 read-only 역할 cache, 고위험 15분 recent-auth·현재 역할·명시적 확인 | D-05·D-07·D-08 통합 검토 뒤 승인된 최소 Spike 후보 |
| 영구 저장소의 트랜잭션·조건부 갱신·backup | 필요한 불변식만 정의 | D-05 저장소·데이터 모델, D-12 백업·복구 연구 |
| 로그 reason code와 redaction 검증 | 접근 등급, 1년 보안 감사·비용 원장과 30일 일반 접근·운영 로그, 금지 데이터 정의 | D-11 비밀·로그·모니터링 연구 |
| 요약 단일/계층 처리, 실제 완전성·비용·지연 | 부분 성공 금지와 원문 수명만 고정 | D-06 요약 처리 연구; Spike는 별도 승인 전 실행 금지 |
| Gateway/Go Live 지연·재연결, Riot 시작·종료 지연 | `unknown` 유지와 수동 확인 | 후속 몰랭 연구 및 별도 승인된 검증 후보 |
| 사용자 고지·국외 처리·삭제 요청의 법적 적합성 | 공급자 보존을 고지하고 최소 데이터만 처리 | 별도 정책·법률 적합성 검토 |
| 사용량·동시성·고정비 | 단일 수치로 가정하지 않고 복수 시나리오 | 배포·요약·운영 비용 연구 |
| KBO 권리·SLA·30분 시작점 | 기능 연기 및 수집 금지 | 허가된 공급 경로가 생긴 뒤 새 연구와 소유자 결정 |

이번 문서는 어떤 Spike도 실행하거나 승인하지 않는다. 위 표의 검증 공백은 후속 연구가 질문을 구체화하기 위한 입력일 뿐이다.

## 10. 위험과 반전 조건

주요 위험:

- 논리 모듈 경계가 물리 코드에서 무시되면 원문·secret·관리 권한이 불필요하게 확산될 수 있다.
- 2분 deadline과 원문 비영구 처리 때문에 queue나 재시도 방식에 따라 조용한 누락 또는 늦은 결과 오염이 생길 수 있다.
- 외부 이벤트를 `unknown`으로 유지하면 자동화 가용성은 낮아질 수 있지만, 이를 억지로 정상/위반으로 바꾸면 오탐과 데이터 손상이 발생한다.
- 감사 1년, 운영 로그 30일, 계정 연결 30일 유예와 backup 보존이 서로 다른 수명을 가져 삭제·복구 설계가 복잡해진다.

잠정 권고를 뒤집거나 정책 재검토가 필요한 조건:

- 한 배포 단위에서 2분 요약과 Gateway 지속 연결이 서로의 가용성을 반복적으로 침해한다는 측정 증거가 생김
- 웹과 봇의 독립 배포·권한 분리가 필수라는 위협 분석 결과가 생김
- 원문을 담지 않는 방식으로는 작업 격리·재시도 요구를 충족할 수 없거나, 반대로 queue가 원문 비영구 정책을 위반함
- 외부 공급자 보존·국외 처리 또는 Discord 정책이 현재 요약 흐름을 허용하지 않음
- Riot 승인·지연·rate limit 때문에 자동 감지의 안전한 `unknown` 비율이 제품 목적을 훼손함
- 사용량·비용·RPO/RTO가 `OWN-005`를 만족하지 못해 범위나 운영 목표 변경이 필요함

## 11. 증거 출처

이 문서는 새 외부 사실을 추가하지 않고 2026-07-20에 확인한 D-02 조사 결과를 통합했다. 세부 사실, 인용 위치와 전체 출처 목록은 연결된 연구 문서를 따른다.

- Discord Gateway 일관성·재연결·message·voice·OAuth: [Discord API Reference](https://docs.discord.com/developers/reference), [Gateway](https://docs.discord.com/developers/events/gateway), [Message Resource](https://docs.discord.com/developers/resources/message), [Voice Resource](https://docs.discord.com/developers/resources/voice), [OAuth2](https://docs.discord.com/developers/topics/oauth2), [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)
- Riot RSO·Spectator·Match·정책: [League of Legends 개발자 문서](https://developer.riotgames.com/docs/lol), [Riot Developer Portal 안내](https://developer.riotgames.com/docs/portal), [SPECTATOR-V5](https://developer.riotgames.com/apis#spectator-v5/GET_getCurrentGameInfoByPuuid), [Riot API Terms](https://developer.riotgames.com/terms)
- 요약 API의 보존·한도·실패 조건: `docs/research/technology-options/summary-api-constraints.md`에 연결된 각 공급자의 공식 모델·가격·rate limit·데이터 정책
- KBO 연기 근거: `docs/research/technology-options/kbo-data-sources.md`에 연결된 KBO·스포츠투아이의 공식 서비스·약관과 계약형 공급자 1차 자료

## 12. 정확한 다음 프롬프트

```text
AGENTS.md의 필수 문서를 순서대로 읽고 docs/prompts/research.md 절차를 따라
정책에 명시된 네 배포 형태와 웹-봇 내부 통신 경계만 조사해.

docs/research/technology-options/data-flow-and-threat-model.md의 논리 경계,
OWN-001~OWN-015, DEP-001~003, INT-001~003, OPS-001~002를 입력으로 사용하고
MacBook 우선 조사 시나리오, waw.dubeom.com, 월 3만 원, RPO 24시간과 RTO 8시간을 연결해.
API·queue·공유 저장소·이벤트 방식의 공개 면적, 상호 인증, 멱등성, timeout,
장애 격리와 운영 비용을 공식 자료로 비교해.
KBO는 연기 상태로 유지하고 기술을 선택하거나 ADR·Spike·제품 코드를 작성하지 마.
```
