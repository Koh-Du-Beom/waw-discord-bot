# Discord 플랫폼 공식 기능 가능성 조사

- 상태: Research
- 작성일·문서 확인일: 2026-07-20
- 범위: Discord 공식 개발자 문서와 공식 개발자 정책으로 확인할 수 있는 플랫폼 기능과 제약
- 비범위: SDK·언어·배포 방식의 선택, ADR, 구현 계획, Spike 실행

## 1. 조사 질문과 잠정 결론

1. Gateway 봇은 지속 WebSocket, heartbeat/ACK, sequence 저장, Resume 우선 재연결, 실패 시 Identify와 세션 시작 한도를 처리해야 한다. Discord는 애플리케이션의 단일 활성 실행을 보장하지 않으므로 중복 실행 방지는 배포 계층의 별도 책임이다.
2. 최대 24시간 메시지 조회는 채널별 `Get Channel Messages`를 `limit=100`과 snowflake 커서로 반복하면 공식 API 범위 안에서 가능하다. 각 대상 채널·스레드에 `VIEW_CHANNEL`과 `READ_MESSAGE_HISTORY`가 필요하고, 실제 내용에는 `MESSAGE_CONTENT` privileged intent가 필요하다. Discord에서 이미 삭제됐거나 권한상 보이지 않는 메시지까지 포함하는 절대적 무누락은 보장할 수 없다.
3. 등록 사용자의 Discord Go Live 여부는 공식 Voice State의 `self_stream`으로 관측할 수 있다. Gateway의 `VOICE_STATE_UPDATE`와 HTTP `Get User Voice State`가 공식 경로다. 다만 이벤트 지연·중복·유실과 재연결 후 상태 복구가 5분 감지 및 2분 중단 허용을 만족하는지는 Spike가 필요하다.
4. Discord OAuth의 `identify`와 `guilds.members.read`로 정확한 단일 guild의 현재 사용자 멤버십과 역할 ID를 서버에서 확인할 수 있다. 권한 변경은 새 API 조회 또는 Gateway 이벤트를 이용해 재검증할 수 있지만, Discord는 재검증 주기를 정해 주지 않는다.
5. Discord가 공식 제공하는 SDK는 Activities용 Embedded App SDK와 게임 통합용 Social SDK 범위다. 일반 봇의 HTTP/Gateway SDK는 공식 유지보수 제품이 없고 Discord가 열거한 커뮤니티 라이브러리를 검토해야 한다.

이 결론은 기능 가능성의 경계이며 기술 또는 배포 방식의 선택이 아니다.

## 2. 연결 요구사항

| 요구사항 | 이 조사와의 연결 |
|---|---|
| FUN-001, FUN-002 | Gateway·HTTP 실패, 권한 거부, rate limit, 재연결 결과를 원문·토큰 없이 감사할 수 있어야 한다. |
| FUN-003, FUN-004, FUN-005, FUN-006 | 사용자가 지정한 최대 24시간 범위의 모든 접근 가능한 메시지를 조회하고, 불완전하면 조용히 진행하지 않아야 한다. |
| FUN-010, FUN-011 | 등록 사용자의 Riot 게임 상태와 공식 Discord Go Live 상태를 결합할 수 있어야 한다. Twitch Presence는 Go Live 판정 근거가 아니다. |
| SEC-001, SEC-002 | 단일 guild 멤버십과 운영자/관리자 2단계 역할을 서버 측에서 확인해야 한다. |
| SEC-003, SEC-004, SEC-005 | OAuth state·redirect·세션 보호와 함께 짧은 수명의 사용자 토큰 및 권한 변경 재검증을 다뤄야 한다. |
| PRI-001 | 조회한 메시지 원문은 영구 저장하거나 로그에 남기지 않는다. |
| OPS-001, OPS-002 | 지속 Gateway, 재시작·재연결·상태 확인과 중복 활성 실행 방지가 필요하다. |
| OWN-001 | 운영 기반·인증·감사·요약의 공식 가능성을 먼저 검증한다. |
| OWN-002 | 하나의 허용 guild와 운영자/관리자 역할 ID를 기본 거부 방식으로 검사한다. |
| OWN-003 | 조회 범위는 최대 24시간이고 2분 완료 및 요청별 비용 상한은 후속 처리 조사에서 검증한다. |
| OWN-007, OWN-008 | Go Live와 게임 시작·종료는 5분 이내 감지, 5분 유예, 2분 중단 허용을 목표로 한다. |

## 3. 제약과 평가 기준

- 공식 지원: 문서화된 HTTP/Gateway/Voice/OAuth 기능만 사실로 인정한다.
- 완전성: 시간 경계, 모든 대상 채널·스레드, pagination 종료, 권한 상실, 삭제와 rate limit을 드러낼 수 있어야 한다.
- 신뢰성: disconnect, Resume 실패, 중복·누락 이벤트와 재시작을 안전하게 처리할 수 있어야 한다.
- 최소 권한·개인정보: 필요한 privileged intent와 권한만 요청하고 원문·토큰을 로그나 영구 저장소에 남기지 않는다.
- 운영성: 공식 rate-limit 신호와 세션 시작 한도를 따르고 단일 실행은 Discord 외부에서 검증한다.
- 유지보수·공급망: 일반 봇용 커뮤니티 SDK의 프로토콜 완전성, 유지보수와 보안 대응을 별도로 검증한다.
- 비용·마이그레이션·롤백: Discord API 자체 가격은 이번 공식 문서 범위에서 확인되지 않았다. 외부 처리·호스트 비용과 SDK 교체성은 후속 조사 대상이다.

## 4. 확인된 사실

### 4.1 Gateway 장시간 연결과 재연결

- Gateway는 지속적이고 상태를 가진 WebSocket API다. `Hello`의 `heartbeat_interval`마다 마지막 sequence를 담은 Heartbeat를 보내고, Heartbeat ACK가 오지 않으면 연결을 닫고 재연결해야 한다. [Gateway](https://docs.discord.com/developers/events/gateway)
- `Ready`의 `resume_gateway_url`, `session_id`와 마지막 Dispatch sequence를 보존해야 한다. 복구 가능한 종료, opcode 7, close code 없는 종료, resumable Invalid Session에서는 Resume를 시도하고, 성공하면 끊긴 동안의 이벤트를 순서대로 재생한다. Resume가 불가능하면 새 연결에서 Identify한다. [Gateway](https://docs.discord.com/developers/events/gateway), [Gateway events](https://docs.discord.com/developers/events/gateway-events)
- `Get Gateway Bot`은 권장 shard 수와 `session_start_limit`의 `total`, `remaining`, `reset_after`, `max_concurrency`를 제공한다. Identify의 최대 동시성은 5초 단위이며 Resume는 Identify와 다르다. 또한 클라이언트는 전체 shard 합계로 24시간에 Identify 1,000회 제한을 받으며 초과 시 활성 세션 종료와 bot token 재설정이 발생한다. [Gateway](https://docs.discord.com/developers/events/gateway)
- Gateway 송신은 연결당 60초에 120 events 제한이다. 잘못된 또는 승인되지 않은 privileged intent를 Identify에 넣으면 각각 close code 4013/4014로 닫힌다. [Gateway](https://docs.discord.com/developers/events/gateway)
- Discord API는 eventually consistent하며 이벤트가 전혀 오지 않거나 한 번 또는 여러 번 올 수 있다고 명시한다. 클라이언트는 가능한 멱등적으로 처리해야 한다. [API Reference — Consistency](https://docs.discord.com/developers/reference#consistency)
- 공식 문서는 shard·세션 시작 동시성을 정의하지만 애플리케이션당 하나의 프로세스만 실행되도록 하는 리더 선출이나 lock을 제공하지 않는다.

### 4.2 최대 24시간 메시지 조회

- `Get Channel Messages`는 최신순 message 배열을 반환한다. guild channel에는 `VIEW_CHANNEL`이 필요하고 `READ_MESSAGE_HISTORY`가 없으면 메시지를 하나도 반환하지 않는다. voice channel이면 `CONNECT`도 필요하다. `before`, `after`, `around`는 상호 배타적이며 `limit`은 요청당 1~100이다. [Message Resource — Get Channel Messages](https://docs.discord.com/developers/resources/message#get-channel-messages)
- message `content`, `embeds`, `attachments`, `components`, `poll`은 `MESSAGE_CONTENT` privileged intent의 영향을 받는다. intent가 없으면 bot이 작성한 메시지, bot DM, bot mention, message context command 대상을 제외하고 사용자 입력 필드가 비어 온다. 단일 서버의 unverified app도 Developer Portal에서 intent를 활성화해야 하며, verification 대상 app은 승인이 필요하다. [Gateway — Message Content Intent](https://docs.discord.com/developers/events/gateway#message-content-intent), [Message Content Intent FAQ](https://support-dev.discord.com/hc/en-us/articles/4404772028055-Message-Content-Intent-FAQ-Redirecting)
- snowflake는 생성 시각을 포함하고, 공식 문서는 특정 시각의 snowflake를 `(timestamp_ms - 1420070400000) << 22`로 만들어 `before`/`after` pagination 경계에 사용할 수 있다고 설명한다. [API Reference — Snowflakes in Pagination](https://docs.discord.com/developers/reference#snowflakes-in-pagination)
- HTTP rate limit은 route/bucket과 전역 제한이 함께 적용된다. 수치는 변경될 수 있으므로 하드코딩하지 말고 `X-RateLimit-*`, `Retry-After`, 응답의 `retry_after`를 따라야 한다. 일반 bot 전역 한도는 초당 50 requests이고, 401/403/429를 포함한 invalid request가 10분에 10,000회를 넘으면 IP가 일시 제한될 수 있다. [Rate Limits](https://docs.discord.com/developers/topics/rate-limits)
- thread는 독립 channel ID를 가지며, Gateway 시작 상태는 접근 가능한 active thread만 동기화한다. archived thread는 별도 공식 열거 endpoint로 찾아야 한다. public/private 접근성도 서로 다르다. [Threads — Enumerating threads](https://docs.discord.com/developers/topics/threads#enumerating-threads)
- Discord 정책은 API Data를 명시된 기능에 필요한 범위에서만 사용하도록 하고 scraping/mining을 금지한다. API로 얻은 메시지 내용을 Discord의 명시적 허가 없이 AI/ML 모델의 **훈련**에 사용하는 것도 금지한다. [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)

### 4.3 등록 사용자의 Go Live 관측

- Voice State의 선택 필드 `self_stream`은 해당 사용자가 “Go Live”로 스트리밍 중인지 나타낸다고 공식 명시되어 있다. `self_video`와 별도이므로 카메라 켜짐과 Go Live를 구분할 수 있다. [Voice Resource — Voice State Object](https://docs.discord.com/developers/resources/voice#voice-state-object)
- Gateway의 `VOICE_STATE_UPDATE`는 누군가 voice channel에 입장·퇴장·이동하거나 voice state가 변경될 때 Voice State object를 전달한다. 이 이벤트는 standard `GUILD_VOICE_STATES` intent 범주다. [Gateway Events — Voice State Update](https://docs.discord.com/developers/events/gateway-events#voice-state-update), [Gateway — Intents](https://docs.discord.com/developers/events/gateway#list-of-intents)
- HTTP `Get User Voice State`는 지정 guild의 지정 사용자 현재 Voice State를 반환한다. 사용자가 voice channel에 연결돼 있으면 요청 주체가 그 channel에 연결할 권한이 있어야 한다. [Voice Resource — Get User Voice State](https://docs.discord.com/developers/resources/voice#get-user-voice-state)
- Presence Activity type 1의 “Streaming”은 Twitch와 YouTube URL만 지원한다. 따라서 Presence의 streaming activity는 Discord Go Live의 공식 판정 필드가 아니며, 이 프로젝트의 Twitch 비사용 정책과도 맞지 않는다. [Gateway Events — Activity Types](https://docs.discord.com/developers/events/gateway-events#activity-types)

### 4.4 OAuth, 단일 guild와 역할 재검증

- OAuth2 user token은 사용자가 허용한 scope 안에서 사용자를 대신하며 짧은 수명이고 refresh가 필요하다. token과 refresh token은 비밀로 취급해야 하며 공식 revoke endpoint가 있다. [OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions), [OAuth2 — Token Revocation](https://docs.discord.com/developers/topics/oauth2#token-revocation)
- `identify` scope의 `Get Current User`는 안정적인 Discord user ID를 제공한다. `guilds.members.read` scope의 `Get Current User Guild Member`는 경로에 지정한 guild에서 현재 사용자의 Guild Member object를 반환하며, 그 object에는 현재 role ID 배열이 있다. [User Resource](https://docs.discord.com/developers/resources/user#get-current-user), [User Resource — Get Current User Guild Member](https://docs.discord.com/developers/resources/user#get-current-user-guild-member), [Guild Member Object](https://docs.discord.com/developers/resources/guild#guild-member-object)
- 권한 bitfield에서 `ADMINISTRATOR`는 모든 권한을 주고 channel overwrite를 우회한다. 역할 ID 기반 운영자/관리자 분류와 Discord의 `ADMINISTRATOR` 권한 해석은 서로 다른 정책 선택이므로 동일시하면 안 된다. [Permissions](https://docs.discord.com/developers/topics/permissions)
- `GUILD_MEMBERS` privileged intent를 사용하면 대상 사용자의 Guild Member Update/Remove를 실시간으로 받을 수 있다. 반대로 대시보드 요청 시 OAuth `Get Current User Guild Member`를 다시 호출하면 이벤트 캐시와 독립적으로 현재 멤버십·roles를 조회할 수 있다. [Gateway — Privileged Intents](https://docs.discord.com/developers/events/gateway#privileged-intents), [Gateway Events — Guild Members](https://docs.discord.com/developers/events/gateway-events#guild-members)

### 4.5 공식 SDK와 커뮤니티 SDK

- Discord 공식 SDK Reference가 제공하는 제품은 Discord 안의 Activities를 위한 JavaScript `@discord/embedded-app-sdk`와 게임에 소셜 기능을 넣는 Discord Social SDK다. 둘은 일반 서버 bot의 Gateway/HTTP client SDK가 아니다. [Embedded App SDK](https://docs.discord.com/developers/developer-tools/embedded-app-sdk), [Discord Social SDK](https://docs.discord.com/developers/discord-social-sdk/overview)
- Discord의 Community Resources는 “Discord does not maintain official SDKs”라고 명시하고 일반 bot API용 제3자 라이브러리 목록을 제공한다. 그 목록의 포함 기준으로 유효한 rate-limit 구현, 최근 유지보수, 큰 active-bot community를 든다. 목록은 비포괄적이다. [Community Resources — Libraries](https://docs.discord.com/developers/developer-tools/community-resources#libraries)
- Discord는 Gateway의 복잡성과 rate limit 처리를 위해 developer library 사용을 권하지만 특정 일반 bot SDK를 공식 보증하거나 프로젝트에 적합하다고 결정하지 않는다. [Overview of Events](https://docs.discord.com/developers/events/overview)

## 5. 추론

아래는 공식 사실에서 도출한 프로젝트 수준의 해석이며 Discord의 보장 문구가 아니다.

### 5.1 Gateway와 단일 실행

- Resume가 재생할 수 있는 이벤트에는 한계가 있고 Invalid Session이 가능하므로, Gateway 이벤트만을 영구 사실 저장소처럼 취급할 수 없다. 현재 상태를 HTTP로 재조회할 수 있는 도메인은 재연결 후 reconciliation이 필요하다.
- 동일 shard를 두 프로세스가 동시에 Identify하지 못하게 한다는 공식 보장이 없으므로 OPS-002는 host/process manager, 배포 lock 또는 저장소 기반 lease 같은 후속 배포 비교 항목이다. 이번 조사에서 방식을 선택하지 않는다.
- health는 단순 프로세스 생존보다 최근 Heartbeat ACK, Ready/Resumed 상태, 마지막 event 시각과 Identify 잔여량을 구분해야 OPS-001을 관측할 수 있다.

### 5.2 메시지 무누락의 가능한 계약

- 요청 시작 시각을 상한 snowflake로 고정하고, 각 대상 channel/thread에서 `limit=100`으로 오래된 방향으로 내려가며 가장 오래된 message ID를 다음 `before` cursor로 사용하는 방식이 동시 신규 메시지 때문에 페이지가 흔들리는 문제를 줄인다. 하한보다 오래된 메시지를 만날 때 종료하고 `[시작, 종료)` 포함 규칙을 명시해야 한다.
- 빈 응답은 “범위에 메시지가 없음”과 `READ_MESSAGE_HISTORY` 상실이 동일하게 보일 수 있으므로 조회 전에 계산된 channel 권한을 검사하고, 403·429·timeout·pagination 중 권한 변경은 전체 요청을 명시적으로 실패 처리해야 FUN-004~005와 맞는다.
- 대상 범위가 text channel 하나인지, category/guild 전체인지, active/archived/private thread를 포함하는지 정책에 정의돼야 “전체”를 검증할 수 있다. guild 전체라면 접근 가능한 모든 message-bearing channel과 포함 대상 thread를 먼저 고정해야 한다.
- 이미 삭제된 메시지, 조회 도중 삭제된 메시지, bot에게 애초에 보이지 않는 channel·private thread는 API로 복원할 수 없다. 따라서 FUN-004의 검증 가능한 의미는 “요청 시점에 bot이 접근할 수 있고 Discord API가 반환한 범위”로 제한하거나 제품 정책 충돌을 소유자가 해결해야 한다.
- Gateway 이벤트 캐시만으로 24시간 조회하면 disconnect/Invalid Session과 배포 전 메시지를 놓칠 수 있다. 반대로 Discord Search endpoint는 index 지연, 실제보다 적은 page, 부정확할 수 있는 total을 공식 경고하므로 완전성 기준의 기본 pagination 수단으로 보기 어렵다.
- PRI-001을 위해 page 단위 원문은 요청 처리 중에만 보유하고, 감사 로그에는 channel/range/page·message 수, 결과 코드와 상관관계 ID만 남기는 데이터 흐름이 필요하다. 이는 후속 D-03/D-06 조사 대상이다.

### 5.3 Go Live 판정

- 등록 Discord user ID의 `VOICE_STATE_UPDATE.self_stream` 전환을 추적하고 재연결·시작 시 `Get User Voice State`로 현재 상태를 대조하면 공식 기능만으로 Go Live 여부 관측 경로를 구성할 수 있다.
- `self_stream`이 optional이므로 누락을 `false`로 해석해도 되는지, HTTP 조회가 비접속 사용자에게 어떤 정확한 status/body를 주는지, Go Live의 빠른 on/off가 모든 이벤트로 관측되는지는 문서만으로 충분하지 않다.
- 이벤트는 유실·중복 가능하므로 5분 감지와 2분 중단 허용은 event time, observation time, reconciliation 결과를 구분하고 멱등적으로 판정해야 한다.

### 5.4 OAuth와 권한 변경

- 대시보드의 서버 측 인가는 OAuth callback 때 한 번만 role을 복사하는 방식으로는 SEC-005를 충족하지 못한다. 보호 요청 시 현재 member/roles를 조회하거나, 짧은 cache TTL과 Guild Member/Role 이벤트 무효화를 결합하고 고위험 작업에서 강제 재조회하는 후보를 후속 위협 모델에서 비교해야 한다.
- 단일 허용 guild ID를 서버 설정으로 고정하고, 그 guild의 Member 조회 실패·탈퇴·role 미일치를 기본 거부하면 SEC-001과 OWN-002의 경계를 단순하게 유지할 수 있다.
- Discord role ID 두 개를 제품의 운영자/관리자 tier로 직접 매핑할지, `ADMINISTRATOR` 보유자를 자동 관리자 취급할지는 공식 API 문제가 아니라 미확정 제품 인가 정책이다.

### 5.5 SDK 검증 조건

커뮤니티 SDK 후보는 최소 다음을 실제 버전 기준으로 검증해야 한다.

- Gateway v10 heartbeat/ACK, close code, Resume, sequence, Identify concurrency/session limit, reconnect backoff 처리
- `GUILD_VOICE_STATES`, `MESSAGE_CONTENT`, 필요 시 `GUILD_MEMBERS` intent와 `self_stream`/Voice State HTTP endpoint 지원
- `Get Channel Messages`의 100개 cursor pagination, snowflake 64-bit 안전성, thread 열거, per-route/global 429 및 `Retry-After` 준수
- OAuth authorization code, state/PKCE 적용 가능 범위, refresh/revoke, `guilds.members.read` endpoint와 token 비밀 취급
- 최신 Discord API 버전과 변경 대응 주기, 최근 release/commit, supported runtime, security advisory와 취약점 대응, transitive dependencies
- cancellation/timeout, idempotency, raw response 접근, 테스트 대역과 관측 hook, 교체 시 도메인 코드 영향
- 라이선스와 배포 호환성, 유지보수 중단 시 직접 HTTP/Gateway 또는 다른 SDK로 이동 가능한 경계

## 6. 대안 비교

| 질문 | 공식 기능 중심 기준안 | 가장 강한 대안 | 비교 결과 |
|---|---|---|---|
| 24시간 메시지 | HTTP `Get Channel Messages` cursor pagination | Gateway 수신 cache 또는 Search endpoint | HTTP history가 과거 범위와 명시적 pagination을 공식 지원한다. Gateway-only는 공백이 있고 Search는 완전성 경고가 있다. 삭제·비가시 메시지는 어느 쪽도 복원하지 못한다. |
| Go Live | `VOICE_STATE_UPDATE.self_stream` + 현재 Voice State HTTP 대조 | Presence Activity type 1 추정 | Voice State가 Go Live를 직접 명명한다. Presence streaming은 Twitch/YouTube용이므로 대안에서 제외한다. |
| 대시보드 인가 | OAuth `guilds.members.read`로 요청 시 현재 member/roles 확인 | bot token의 `Get Guild Member` + Gateway cache | 둘 다 공식 경로다. 전자는 로그인 사용자 동의·token 수명, 후자는 bot 권한·서비스 경계를 가진다. 재검증 주기와 고위험 작업 정책은 별도 결정이다. |
| 일반 bot SDK | 검증된 커뮤니티 SDK | Discord HTTP/Gateway 직접 구현 | SDK는 연결/rate-limit 복잡도를 줄일 수 있으나 공급망과 기능 지연을 검증해야 한다. 직접 구현은 의존성 대신 프로토콜·운영 책임이 커진다. 선택하지 않는다. |
| 단일 활성 실행 | 배포 계층에서 하나의 Gateway owner 보장 | 중복 인스턴스를 허용하고 downstream 멱등성만 적용 | Discord가 단일 owner를 제공하지 않으며 중복 명령·스케줄 실행을 막아야 하므로 OPS-002에는 외부 조정 검증이 필요하다. 구체 방식은 D-09 범위다. |

## 7. 가정과 미확인 사항

### 가정

- bot은 OWN-002의 단일 guild에 설치되고 필요한 channel/voice 접근 권한을 부여받는다.
- “등록 사용자”는 검증된 Discord user ID로 식별하며 사용자명은 권한·Go Live 판정 키로 사용하지 않는다.
- 요약은 모델 훈련이 아니라 요청별 inference라는 전제다. Discord 공식 정책은 메시지 내용의 AI/ML **훈련**을 명시적으로 금지하지만, 외부 모델에 전송하는 inference의 허용 조건·동의·보존을 이 문서만으로 확정하지 않았다.

### 미확인 사항

- 요약 대상이 command channel 하나인지, 선택 channel 집합인지, guild 전체인지와 thread 포함 규칙
- 삭제·편집·권한 변경이 동시 발생할 때 FUN-004가 요구하는 “누락 없음”의 제품 계약
- Discord의 현재 Voice State HTTP endpoint가 비접속 사용자와 권한 부족에 반환하는 정확한 status/body, `self_stream` 누락 의미
- Gateway Resume 가능 시간 창과 장시간 단절 뒤 Go Live 전환 복구 가능성
- 운영자/관리자 role ID 매핑과 guild owner/`ADMINISTRATOR` 자동 승인 여부
- OAuth member 재조회 주기, token 보관·refresh 범위와 고위험 작업의 강제 재검증 조건
- `MESSAGE_CONTENT` 사용이 단일 개인 guild에서 계속 허용되는 조건과 향후 verification/app review 영향
- Discord 메시지를 외부 요약 API inference로 전송할 때 필요한 사용자 고지·동의, 공급자 보존과 Discord 정책 적합성
- 예상 channel/thread/message 수에서 24시간 수집이 OWN-003의 2분 목표와 HTTP rate limit을 만족하는지

## 8. 필요한 Spike 후보 — 실행하지 않음

1. **Go Live 관측 신뢰성**: test guild의 동의한 test account에서 Go Live on/off, 2분 미만 중단, voice 이동, bot 재연결을 수행해 Gateway `self_stream` 전환과 HTTP 현재 상태가 5분 이내 일치하는지 확인한다.
2. **메시지 범위 완전성**: 실제 메시지 원문 대신 폐기 가능한 합성 메시지와 threads를 생성하고, 시간 경계·100개 초과·동시 신규/삭제·429에서 ID 집합의 누락/중복 및 명시적 실패를 확인한다.
3. **OAuth 권한 변경**: test operator의 role 부여·제거·guild 탈퇴 후 OAuth member 재조회와 Gateway invalidation이 보호 요청을 즉시 또는 정의된 시간 안에 거부하는지 확인한다.
4. **Gateway 단일 실행·복구**: 승인된 SDK 후보가 강제 종료, missed ACK, resumable/non-resumable close와 동시 배포에서 session limit을 지키고 하나의 command/schedule owner만 유지하는지 확인한다.

각 Spike는 `docs/prompts/spike.md`에 따른 별도 승인 작업이어야 하며 실제 사용자 메시지나 운영 token을 사용하지 않는다.

## 9. 잠정 권고, 위험과 반전 조건

### 잠정 권고

후속 연구의 가능성 기준선은 문서화된 Gateway/HTTP/OAuth/Voice State만 사용한다. 메시지는 HTTP history pagination, Go Live는 Voice State `self_stream`, 대시보드 인가는 현재 guild member/roles의 서버 측 재확인을 기준으로 삼되, SDK·배포·재검증 방식은 선택하지 않는다.

### 가장 강한 대안

일반 bot API를 직접 구현하는 대신 Discord가 열거한 커뮤니티 SDK를 사용하면 Gateway 수명주기와 rate limit의 반복 구현을 줄일 수 있다. 다만 위 검증 조건과 Spike를 통과한 후보만 후속 D-04 비교에 남긴다.

### 주요 위험

- Discord의 eventual consistency와 삭제·권한 상실 때문에 “Discord에 존재했던 모든 메시지”의 절대 무누락은 불가능하다.
- Go Live 필드는 공식이지만 5분/2분 운영 목표의 측정 증거는 없다.
- privileged intent와 OAuth token은 개인정보·검토·비밀 관리 부담을 만든다.
- 커뮤니티 SDK의 API 변화 지연이나 유지보수 중단은 Gateway 안정성에 직접 영향을 준다.
- Discord 정책상 메시지 내용의 모델 훈련은 명시적으로 금지되며 외부 inference 데이터 흐름은 별도 정책 검토가 필요하다.

### 결론을 뒤집거나 정책 변경을 요구할 조건

- `self_stream`이 bot Gateway/HTTP 응답에서 안정적으로 제공되지 않거나 5분 목표를 Spike에서 반복적으로 넘김
- 필요한 channel/thread의 `MESSAGE_CONTENT`, `VIEW_CHANNEL`, `READ_MESSAGE_HISTORY`를 허용할 수 없음
- Discord 정책 또는 App Review가 요청별 요약을 위한 메시지 내용 처리를 허용하지 않음
- 실제 24시간 사용량이 rate limit과 2분 목표 안에서 수집되지 않음
- OAuth member/role 재조회가 요구된 권한 변경 반영 시간 또는 token 최소화 정책을 충족하지 못함

## 10. 공식 출처

모든 링크는 2026-07-20에 확인했다.

- [Discord API Reference](https://docs.discord.com/developers/reference)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
- [Discord Gateway Events](https://docs.discord.com/developers/events/gateway-events)
- [Discord Message Resource](https://docs.discord.com/developers/resources/message)
- [Discord Threads](https://docs.discord.com/developers/topics/threads)
- [Discord Voice Resource](https://docs.discord.com/developers/resources/voice)
- [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits)
- [Discord OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Discord OAuth2 API](https://docs.discord.com/developers/topics/oauth2)
- [Discord User Resource](https://docs.discord.com/developers/resources/user)
- [Discord Guild Resource](https://docs.discord.com/developers/resources/guild)
- [Discord Permissions](https://docs.discord.com/developers/topics/permissions)
- [Discord Community Resources](https://docs.discord.com/developers/developer-tools/community-resources)
- [Discord Embedded App SDK](https://docs.discord.com/developers/developer-tools/embedded-app-sdk)
- [Discord Social SDK](https://docs.discord.com/developers/discord-social-sdk/overview)
- [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)
- [Discord Message Content Intent FAQ](https://support-dev.discord.com/hc/en-us/articles/4404772028055-Message-Content-Intent-FAQ-Redirecting)

## 11. 다음 프롬프트

```text
AGENTS.md의 필수 문서를 순서대로 읽고 docs/prompts/research.md 절차를 따라
Discord 메시지 요약의 데이터 흐름과 정책 적합성만 조사해.

docs/research/technology-options/discord-platform.md의 공식 기능 경계를 입력으로 사용하고,
메시지 원문 비영구 처리, 외부 모델 inference 전송의 Discord 정책 적합성,
최대 24시간·2분 목표·요청별 비용 상한, 삭제·권한 변경 시 명시적 실패 계약을 비교해.
Discord와 모델 공급자의 공식 문서·정책만 사실 근거로 사용하고 기술을 선택하거나
Spike를 실행하거나 ADR을 작성하지 마.
```
