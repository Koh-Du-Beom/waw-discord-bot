# D-04 언어·런타임·Discord SDK 후보 조사

- 상태: Research — 기술 선택 또는 Spike 승인 아님
- 조사일·문서 확인일: 2026-07-21
- 결정 질문: 첫 MVP의 단일 지속 server 경계에서 Discord Gateway bot과 web을 운영할 때 어떤 언어·런타임·커뮤니티 Discord SDK 조합을 후속 검증 후보로 남길 것인가?
- 범위 밖: 언어·런타임·SDK·host·저장소·인증 기술 선택, 소유자 질문, ADR, Spike 작성·실행, 구현 계획과 제품 코드

## 1. 입력과 요구사항

이 조사는 D-02 Discord 공식 기능 조사, D-03 데이터 흐름·위협 모델, D-07 인증 경계, D-08 배포 경계, `OWN-001`~`OWN-035`를 입력으로 사용한다. 특히 `OWN-034`에 따라 첫 MVP의 web과 bot은 하나의 지속 server 배포 경계에 있지만, 같은 process인지 별도 local process인지는 결정하지 않는다.

| 요구사항·결정 | D-04의 판정 기준 |
|---|---|
| `FUN-001`~`FUN-006` | 명령·요약 요청을 안전하게 처리하고 Discord 원문을 영구 저장하거나 로그에 남기지 않아야 한다. |
| `FUN-010`~`FUN-015` | Go Live는 Presence activity가 아니라 Voice State `self_stream`으로 관측하고 중복·재연결 공백을 안전하게 처리해야 한다. KBO는 제외한다. |
| `SEC-001`~`SEC-010`, `PRI-001` | 단일 guild·role 기본 거부, bot token 격리, 민감정보 비기록과 입력 검증을 언어 편의성보다 우선한다. |
| `OPS-001`~`OPS-003` | 지속 Gateway, heartbeat, Resume/Identify, 재시작, 상태 확인과 민감정보 없는 관측이 필요하다. |
| `QUA-001`~`QUA-003` | 핵심 정책을 외부 API 없이 단위 시험할 수 있고 통합·장애 시험과 요구사항 추적이 가능해야 한다. |
| `OWN-001`~`OWN-035` | 친구 몇 명·단일 guild·월 명령 10,000회 상한, 월 3만 원, web·bot 단일 server와 Windows 대체 host 가능성을 유지한다. TypeScript와 Python은 모두 유지보수 가능한 범위로 본다. |

## 2. 공통 사실과 배제 기준

### 확인된 사실

- Discord Gateway는 상태를 가진 WebSocket이며 heartbeat/ACK, sequence, Resume, 실패 시 Identify와 session start limit 처리가 필요하다. Discord는 복잡한 연결 처리를 줄이기 위해 커뮤니티 라이브러리 사용을 권하지만 일반 bot용 공식 SDK는 유지보수하지 않는다. [Discord Gateway](https://docs.discord.com/developers/events/gateway), [Community Resources](https://docs.discord.com/developers/developer-tools/community-resources#libraries)
- Go Live의 공식 판정 필드는 Voice State의 `self_stream`이다. 세 후보 SDK 모두 이를 모델 또는 event로 노출한다. discord.js는 `VoiceState.streaming`, discord.py는 `VoiceState.self_stream`, JDA는 `GuildVoiceState.isStream()`과 `GuildVoiceStreamEvent`를 제공한다. [Discord Voice State](https://docs.discord.com/developers/resources/voice#voice-state-object), [discord.js VoiceState](https://discord.js.org/docs/packages/discord.js/14.25.0/VoiceState%3AClass), [discord.py VoiceState](https://discordpy.readthedocs.io/en/latest/genindex.html), [JDA GuildVoiceState](https://docs.jda.wiki/net/dv8tion/jda/api/entities/GuildVoiceState.html)
- Gateway reconnect/resume는 세 SDK가 모두 추상화한다. discord.py는 기본 재연결과 `on_resumed`를 문서화하고, JDA는 자동 재연결 설정과 reconnect session 제어를 제공하며, discord.js는 Gateway용 WebSocket manager와 shard 상태를 제공한다. [discord.py Client](https://discordpy.readthedocs.io/en/stable/api.html#discord.Client), [JDA API](https://docs.jda.wiki/net/dv8tion/jda/api/JDA.html), [discord.js WebSocketManager](https://discord.js.org/docs/packages/ws/main/WebSocketManager%3Aclass)
- 어느 SDK도 둘 이상의 배포 process가 같은 bot token으로 동시에 실행되는 것을 막아 주는 host-wide singleton을 보장하지 않는다. SDK의 shard 관리와 reconnect는 배포 중 중복 활성 실행 방지와 다른 문제다.

### 공통 배제 기준

다음 중 하나라도 충족하지 못하면 친숙도·비용과 무관하게 제외한다.

1. Discord가 문서화한 Gateway/HTTP/Voice State만 사용하고 Go Live를 Presence의 Streaming activity로 대신하지 않는다.
2. heartbeat·Resume·Identify·rate limit을 직접 재구현하지 않고 유지보수 중인 SDK 경로를 사용한다.
3. bot token, OAuth code/token, session ID와 Discord 원문을 로그에 남기지 않는 경계를 만들 수 있다.
4. domain policy와 Discord adapter를 분리해 합성 event로 중복·재연결·unknown 상태를 시험할 수 있다.
5. Windows, macOS와 Linux에서 지원되는 runtime 배포 경로가 있다.

## 3. 현실적인 후보

Discord Community Resources에 포함되고, 현재 프로젝트 규모에서 직접 Gateway 구현보다 운영 책임을 줄이는 세 조합만 비교한다.

### A. TypeScript + Node.js LTS + discord.js

- **Gateway·Go Live:** discord.js는 Gateway manager, voice-state event/model과 Go Live에 대응하는 `streaming` 필드를 제공한다. [discord.js WebSocket](https://discord.js.org/docs/packages/ws/2.0.4), [discord.js VoiceState](https://discord.js.org/docs/packages/discord.js/14.27.0/VoiceState%3AClass)
- **시험성:** Node의 `node:test`는 stable이고 async test와 process 격리를 지원한다. TypeScript는 adapter payload와 정책 상태를 compile-time에 좁히는 데 유리하다. [Node test runner](https://nodejs.org/api/test.html)
- **지속 server·web 경계:** bot과 web이 같은 언어·runtime을 쓸 수 있어 model·validation 계약을 공유할 여지가 있다. 이는 단순화 가능성이지 같은 process나 web framework 선택을 뜻하지 않는다.
- **호환성:** 2026-07-21 기준 Node 24는 Active LTS이고 2028-04-30 EOL 예정이며, 이번 VM 합성 측정에 사용한 Node 22는 Maintenance LTS이고 2027-04-30 EOL 예정이다. Node 26은 Current이므로 측정 편의만으로 production major를 고정하지 않는다. 정확한 major는 채택 시점의 지원 단계와 고정한 discord.js artifact의 실제 호환성을 함께 검증해야 한다. [Node releases](https://nodejs.org/en/about/previous-releases), [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
- **유지보수·공급망:** npm의 현재 stable artifact는 2026-07-15 게시된 discord.js 14.27.0이고 package metadata는 Node `>=18` 및 `@discordjs/ws ^1.2.3`을 선언한다. 반면 동일 14.27.0의 버전별 공식 문서와 별도 `@discordjs/ws` 2.0.4 문서는 Node 24.17.0 이상을 요구한다. 따라서 문서의 더 높은 요구사항을 무시하거나 Node 22 합성 측정을 SDK 호환성 증거로 간주하지 않고, ADR 전에 정확한 artifact·lockfile을 고정한 빈 환경 install/import/start Spike로 이 불일치를 해소한다. npm lockfile은 동일 dependency tree 재현을 돕고 `npm audit`은 알려진 취약점을 보고하지만, audit가 공급망 신뢰 전체를 보장하지는 않는다. transitive dependency와 install script는 lock·review·최소 dependency로 별도 통제해야 한다. [discord.js npm artifact](https://www.npmjs.com/package/discord.js/v/14.27.0), [discord.js 14.27.0 documentation](https://discord.js.org/docs/packages/discord.js/14.27.0), [`@discordjs/ws` 2.0.4 documentation](https://discord.js.org/docs/packages/ws/2.0.4), [package-lock](https://docs.npmjs.com/files/package-lock.json), [npm audit](https://docs.npmjs.com/cli/v9/commands/npm-audit/)
- **주요 위험:** event loop를 CPU 집약 요약·대량 변환이 막으면 heartbeat와 web 응답이 함께 영향받을 수 있다. 같은 server라는 이유만으로 같은 process에 합치면 token과 web 침해 blast radius가 커진다.

### B. Python + CPython + discord.py

- **Gateway·Go Live:** discord.py는 기본 자동 재연결, Resume event, `on_voice_state_update`와 `VoiceState.self_stream`을 제공한다. rate-limit 처리를 핵심 기능으로 문서화한다. [discord.py Client](https://discordpy.readthedocs.io/en/stable/api.html#discord.Client), [discord.py](https://discordpy.readthedocs.io/en/stable/)
- **시험성:** 표준 `unittest`는 async test case를 지원하고 `asyncio`는 I/O 중심의 Gateway·HTTP workload에 맞는다. type annotation은 쓸 수 있지만 TypeScript/Java와 같은 기본 compile-time 강제는 별도 type checker 정책 없이는 얻지 못한다. [unittest](https://docs.python.org/3/library/unittest.html), [asyncio](https://docs.python.org/3/library/asyncio.html)
- **지속 server·web 경계:** async I/O 모델과 짧은 adapter code는 작은 bot에 단순하다. web도 Python으로 둘 수 있지만 web framework와 process 구조는 별도 결정이며, 이를 위해 dependency를 미리 추가하지 않는다.
- **호환성:** CPython은 Windows, macOS, Linux에서 제공된다. 2026-07-21 기준 3.14와 3.13은 bugfix 상태이고 3.12·3.11·3.10은 security 상태인 반면 3.9와 3.8은 EOL이다. 최신 discord.py 2.7.1 artifact는 여전히 Python `>=3.8`을 선언하지만 이 하한은 CPython upstream 지원을 뜻하지 않는다. 따라서 EOL 하한을 production 후보로 해석하지 않고 지원 중인 modern CPython 한 버전에서 실제 호환성을 검증해야 한다. [Python version status](https://devguide.python.org/versions/), [discord.py 2.7.1 artifact](https://pypi.org/project/discord.py/2.7.1/)
- **유지보수·공급망:** PyPI의 현재 release는 2026-03-03 게시된 discord.py 2.7.1이다. 공식 저장소는 async API, rate limit 처리와 platform별 설치법을 제공한다. ADR 전 선택한 modern CPython의 빈 환경에서 version을 고정해 install/import/start를 확인하고, runtime dependency는 lock/hash와 vulnerability scanning으로 별도 통제해야 한다. optional voice/native package는 Go Live **관측**에는 필요하지 않으므로 초기 의존성에서 제외할 수 있다. [discord.py 2.7.1 artifact](https://pypi.org/project/discord.py/2.7.1/), [discord.py repository](https://github.com/Rapptz/discord.py)
- **주요 위험:** runtime type 오류가 integration path까지 늦게 드러날 수 있고, event-loop blocking 위험은 Node와 동일하다. SDK release 페이지가 일관된 GitHub Release 목록을 제공하지 않아 package index version·tag·commit과 보안 대응을 채택 직전에 다시 확인해야 한다.

### C. Java + OpenJDK + JDA

- **Gateway·Go Live:** JDA는 Gateway event, REST rate-limit, cache 설정, 자동 재연결과 `GuildVoiceStreamEvent`/`isStream()`을 제공한다. voice-state 관측에는 standard `GUILD_VOICE_STATES` intent와 필요한 cache만 남길 수 있다. [JDA repository](https://github.com/DV8FromTheWorld/JDA), [JDA event index](https://docs.jda.wiki/allclasses-index.html)
- **시험성:** Java의 compile-time type과 interface 기반 adapter는 정책과 SDK 경계를 명시하기 쉽다. 다만 JDK 자체에 프로젝트 test framework가 포함되는 조합은 아니므로 JUnit·build tool 등 추가 개발 dependency가 일반적으로 필요하다.
- **지속 server·web 경계:** 장기 실행과 명시적인 concurrency 도구가 강점이지만 작은 단일 bot에는 build/runtime 설정과 web 구성의 운영면이 A·B보다 커질 수 있다.
- **호환성:** OpenJDK는 6개월 release cadence를 가지며 Windows x86_64, macOS x86_64/aarch64, Linux x86_64/aarch64 등의 build platform을 문서화한다. 배포판별 장기 지원 기간은 OpenJDK 자체가 아닌 실제 JDK vendor 정책까지 채택 시 확인해야 한다. [OpenJDK release process](https://openjdk.org/guide/), [supported platforms](https://wiki.openjdk.org/display/Build/Supported%2BBuild%2BPlatforms)
- **유지보수·공급망:** JDA는 2026-04-02에 v6.4.1 release를 게시했고 Maven Central 설치 좌표를 제공한다. Gradle은 checksum/signature dependency verification을 제공하지만 알려진 취약점 탐지와는 별도다. [JDA releases](https://github.com/DV8FromTheWorld/JDA/releases), [Gradle dependency verification](https://docs.gradle.org/current/userguide/dependency_verification.html)
- **주요 위험:** JVM·cache의 실제 idle memory와 cold start는 문서만으로 이 프로젝트 host 비용에 환산할 수 없다. 작은 팀에서 build tool·web stack까지 더하면 단순성 우위가 약해질 수 있다.

## 4. 비교

| 기준 | A. TypeScript·Node·discord.js | B. Python·discord.py | C. Java·OpenJDK·JDA |
|---|---|---|---|
| Gateway 지속·재연결 | SDK가 manager/reconnect를 제공; 실제 장애 복구는 미검증 | SDK가 기본 reconnect·resume event 제공; 실제 장애 복구는 미검증 | SDK가 reconnect/session 제어 제공; 실제 장애 복구는 미검증 |
| Go Live 관측 | `VoiceState.streaming` | `VoiceState.self_stream` | `isStream()`·전용 event |
| 단일 bot 실행 | host/process 제어 필요 | host/process 제어 필요 | host/process 제어 필요 |
| 시험성·타입 | 강한 정적 타입 + 표준 test runner | 간결한 async + 표준 unittest; type 강제는 추가 정책 필요 | 가장 강한 compile-time 경계; test/build dependency 추가 |
| web과 한 server 경계 | 같은 runtime·type 공유 가능성이 가장 큼 | 같은 runtime 가능, framework 별도 | 가능하나 작은 규모에서는 운영면이 커질 수 있음 |
| Windows·macOS·Linux | 지원 | 지원 | 지원; JDK vendor 지원 주기 별도 확인 |
| 유지보수 증거 | 14.27.0 artifact 확인; artifact와 버전별 문서의 Node 요구 불일치 검증 필요 | PyPI 2.7.1 확인; SDK 하한과 CPython upstream 지원 범위 분리 필요 | 최근 signed GitHub release 확인 |
| 공급망 면적 | npm transitive tree·install script 검토 필요 | pip dependency/hash·index provenance 검토 필요 | Maven/Gradle dependency·plugin 검증 필요 |
| 예상 운영 부담 | 낮음~중간 | 낮음 | 중간 |
| 자원·비용 | host 실측 전 미확인 | host 실측 전 미확인 | host 실측 전 미확인; JVM baseline이 결정에 중요 |
| SDK 종속 | adapter로 Discord payload를 격리해야 함 | 동일 | 동일 |

세 후보 모두 무료 오픈소스이므로 license fee 차이는 없다. 월 3만 원 통과 여부는 runtime 자체가 아니라 선택할 host의 고정비, idle/peak memory, backup·domain·GPT 비용을 합쳐야 판단할 수 있다. 문서 근거 없이 메모리 수치를 만들어 순위를 정하지 않는다.

## 5. 보안·데이터·운영과 변경 비용

- **보안:** SDK object를 domain model로 그대로 퍼뜨리지 않고 allowlist한 ID·상태·시각만 adapter에서 변환해야 한다. web과 bot이 같은 host여도 bot token 접근 주체를 최소화해야 하며, 같은 process 여부는 아직 열어 둔다.
- **데이터:** Discord 원문은 memory에서만 처리하고 error object/raw payload dump를 금지한다. 세 언어 모두 가능하므로 차별점이 아니라 필수 구현 계약이다.
- **운영:** SDK reconnect 성공을 service health와 동일시하지 않는다. 마지막 Gateway ACK/Ready·Resume, 마지막 event 처리, command ownership을 민감정보 없이 관측해야 한다.
- **단일 실행:** supervisor, 배포 절차 또는 저장소 lease 중 무엇을 쓸지는 D-09/후속 설계 사항이다. D-04에서 특정 mechanism을 선택하지 않는다.
- **마이그레이션·lock-in:** command·policy·state transition을 SDK type에서 분리하면 SDK major upgrade나 언어 교체 범위를 adapter와 bootstrap 경계로 제한할 수 있다. 언어 자체 교체는 여전히 전면 재작성에 가깝다.
- **롤백:** runtime/SDK와 lockfile을 artifact 단위로 함께 고정하고 이전 artifact로 되돌리는 방식이 공통 후보지만, schema·host·배포 도구가 미정이므로 절차를 확정하지 않는다.

## 6. 사실·추론·가정·미확인 사항

### 추론

- A는 bot과 web의 언어·type·test toolchain을 하나로 줄일 가능성이 가장 커서 `OWN-034`의 단일 server 경계에 가장 단순하게 맞을 **첫 검증 후보**다. 이는 Node, TypeScript 또는 discord.js 선택이 아니다.
- B는 작은 async bot의 코드·운영면이 작고 optional voice dependency 없이 Go Live를 관측할 수 있어 가장 강한 대안이다.
- C는 compile-time 경계와 JDA의 cache/intents 제어가 강하지만 현재의 친구 몇 명·단일 guild 범위에서는 추가 build/runtime 부담을 상쇄할 증거가 아직 없다.

### 가정

- 첫 MVP는 shard가 필요 없는 단일 guild·단일 bot 규모다.
- 요약의 CPU 집약 전처리는 Gateway heartbeat를 막지 않도록 bounded하거나 격리할 수 있다.
- web과 bot이 같은 server에 있어도 SDK adapter와 domain policy는 분리한다.

### 미확인 사항과 증거 공백

| ID | 공백 | 결정 영향 | 후속 검증 필요성 |
|---|---|---|---|
| `GAP-D04-01` | 강제 network 단절, missed ACK, resumable/non-resumable close에서 각 SDK가 이 프로젝트 상태 계약을 지키는지 | Gateway 신뢰성 | 문서만으로 충분하지 않지만 shortlist 전 Spike는 과도함 |
| `GAP-D04-02` | 실제 Go Live 시작·중단 event 지연·누락과 재연결 뒤 reconciliation | `FUN-010`~`FUN-012` | SDK 공통 Discord platform 공백; 언어 선택 근거로 오용 금지 |
| `GAP-D04-03` | 후보 host에서 bot+최소 web의 idle/peak memory와 event-loop pause | 비용·heartbeat 안정성 | host shortlist와 결합된 후속 측정 필요 |
| `GAP-D04-04` | 배포 중 중복 process를 막고 command/schedule owner 하나만 유지하는 방법 | `OPS-002` | D-09 host/process 결정 뒤 한 가설로 검증 |
| `GAP-D04-05` | discord.js 14.27.0 artifact와 버전별 문서의 Node 요구 불일치, discord.py 2.7.1의 EOL Python 포함 하한, 세 SDK의 advisory 대응 절차 | 공급망·유지보수 | ADR 전 정확한 artifact·lock을 고정하고 지원 중인 runtime의 빈 환경 install/import/start 검증 |

현재는 Spike를 작성하거나 실행하지 않는다. `GAP-D04-01`과 `GAP-D04-04`는 언어 후보를 둘 이하로 좁히고 host/process 경계를 정한 뒤 하나의 장애 Spike로 합칠 수 있다. `GAP-D04-02`는 SDK와 무관한 D-02 Go Live 관측 Spike로 분리해야 한다.

## 7. 확정된 소유자 입력

| ID | 결정 | 영향 |
|---|---|---|
| `D04-Q01` / `OWN-035` | TypeScript와 Python 모두 장기 유지보수 가능한 범위이며 친숙도만으로 선택하지 않는다. | A와 B를 공동 최종 후보로 유지하고 객관적 검증으로 결정한다. C는 두 후보가 기준을 충족하지 못할 때 재평가한다. |

이 입력은 언어·런타임·SDK 선택이 아니다. 같은 언어로 web과 bot을 구성할지, 같은 process를 사용할지와 host는 별도 결정으로 남긴다.

## 8. 잠정 결론

- **잠정 첫 검증 후보:** TypeScript + 채택 시점의 Node.js LTS + discord.js. web·bot 단일 server에서 언어·type·test toolchain을 하나로 줄일 가능성이 있고 Gateway·Voice State 요구를 직접 지원한다.
- **가장 강한 대안:** Python + 지원 중인 CPython + discord.py. 작은 async bot의 단순성과 충분한 Gateway·Go Live API가 강점이며, web과 type enforcement의 실제 구성에 따라 A보다 단순해질 수 있다.
- **유지 후보:** Java + 지원 JDK + JDA. compile-time 안전성과 JDA 운영 기능이 실제 자원·복잡성 비용을 상쇄할 때 선택지가 된다.
- **주요 위험:** 세 SDK 모두 커뮤니티 유지보수이며 Go Live 정확성·singleton·host 자원은 해결하지 않는다. 같은 server를 같은 process로 오해하면 web 장애와 Gateway/token 경계가 결합될 수 있다.
- **필요 검증:** 후보 축소 후 정확한 SDK artifact·dependency lock을 사용한 지원 runtime 빈 환경 install/import/start, 합성 Gateway event 단위 시험, 실제 bot의 disconnect/resume와 Go Live reconciliation, 선택 host에서 bot+web 자원 측정, 중복 실행 장애 주입이 필요하다. Node 22와 SDK 없는 합성 workload 측정은 runtime 수용량 근거일 뿐 discord.js production 호환성 근거가 아니다.
- **뒤집는 조건:** A의 current LTS/discord.js 호환성 또는 reconnect 안정성이 실패하거나 npm 공급망·event-loop 격리 비용이 B보다 커지면 B를 우선한다. B의 release/support 또는 type/runtime 오류 통제가 기준을 못 맞추면 A를 유지한다. C가 같은 host에서 비용 상한을 만족하면서 장애·관측·유지보수에서 명확한 우위를 실측하면 C를 재평가한다.

KBO는 허가된 공급 경로와 재표시 권리가 확인될 때까지 연기하며 이 후보 비교의 활성 기능·dependency·시험 범위에 포함하지 않는다.

## 9. 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고 docs/prompts/research.md 절차에 따라
D-09 단일 지속 server 호스팅 후보를 조사해.
OWN-005, OWN-016~OWN-021, OWN-034~OWN-035와 D-04·D-08 연구를 입력으로 사용하고
외부 임대 server와 소유 Mac·대체 Windows를 비용·상시성·보안·복구,
TypeScript·Python runtime 호환성으로 비교해.
아직 host·언어·런타임·SDK·저장소·인증 기술을 선택하거나 소유자 질문,
ADR, Spike 작성·실행, 구현 계획 또는 제품 코드를 작성하지 마.
KBO는 연기 상태로 유지해.
```
