# 프로젝트 상태

마지막 갱신일: 2026-07-27

## 현재 단계

`/도움말`을 네 번째 최상위 Discord 명령으로 추가했다. 응답은 ephemeral이며
`/요약`, `/라이엇계정`, `/몰랭검거`의 목적과 입력 예시, 관리자 전용
정정·취소, 관리자 승인 Riot 연결이 공식 소유권 인증은 아니라는 경계를
안내한다. 명령은 기존 command audit 경로를 사용하며 등록 payload·interaction
handler·bot listener 계약 테스트와 typecheck가 통과했다. Production 배포와
길드 command 등록 readback은 immutable release 검증 뒤 수행한다.

2026-07-27 `dashboard-design-refresh`를 main에 병합하고 문서 번호 충돌을
ADR-0019/PLAN-0008로 정리했다. 승인된 dashboard 후속 계획은 Riot
ADR-0018/PLAN-0007 production Gate C/D와 Gateway 장애 해소 뒤에 시작하도록
선행 조건을 명시했다.

Production 후보 `d6b2e7a`의 식별자 없는 고정 상태·단계 카운트만 관찰한 결과,
Discord login과 lifecycle ready까지는 성공했지만 초기 guild/member
reconciliation이 pending 상태로 무기한 머물렀다. 후보는 이전 immutable
release로 rollback했으며 rollback 조건 외 production mutation은 수행하지
않았다. 근본 원인은 외부 reconciliation 경계에 deadline과 bounded retry가
없던 것이다. PLAN-0004의 승인된 provider timeout·정규화 실패 계약에 따라
각 시도 15초 deadline, 2초 뒤 1회 retry, 식별자 없는
`gateway_member_reconciliation_timed_out` 및
`gateway_member_reconciliation_retry_exhausted` 진단을 구현했다. 로컬 전체
검증은 `218 tests / 211 pass / 7 PostgreSQL tool skips / 0 fail`,
typecheck·server/web build·diff check 통과다. 새 immutable release 후보를
만들어 Gate C에서 최소 45초 동안 connected/current 또는 고정 실패 code를
확인한 다음, 통과한 경우에만 같은 Orca Dashboard 세션에서 Gate D를 재개한다.

첫 후보 `d4f166b`의 Gate C는 systemd bot unit에 세 번째 bot-only Riot
credential 전달 선언이 설치되지 않은 운영 결함을 수정한 뒤 통과했다. Gate D
list는 socket request accepted 뒤 DB execute 단계에서 실패했다. Production
schema version 6, admin result table과 최소 권한은 정상이었고 `waw_bot`의
operation ledger SELECT 거부도 정책대로였다. 원인은 insert-only ledger
claim이 `ON CONFLICT (operation_id) DO NOTHING`으로 arbiter를 명시해
PostgreSQL SELECT 권한을 추가 요구한 것이다. 권한을 넓히는 대신 conflict
target을 생략하는 최소 코드 수정으로 중복 claim 의미와 insert-only 경계를
보존하고 새 후보로 Gate C/D를 재시도한다.

최종 production release `90611ee`는 Gate C의 45초 Gateway
connected/current 관찰과 canonical health HTTP 200을 통과했다. 같은 Orca
Dashboard 세션의 Gate D pending list도 HTTP 200으로 복구됐다. 현재 pending
요청은 0건이므로 owner-approved 승인 mutation, stale 409와 duplicate
reconciliation은 대상을 다시 만든 뒤 완료해야 한다.

PLAN-0008 Task 1의 첫 bounded 계약을 시작했다. Command-log와 사용자 quota의
식별자 비노출 DTO, same-origin endpoint path, 기본 50/허용 1–100 pagination,
opaque cursor 형식, quota reservation port와 `Asia/Seoul` 날짜 경계를
고정했다. 관련 계약 테스트 5개와 typecheck가 통과했으며 persistence/API
구현과 migration은 아직 시작하지 않았다.

2026-07-26 dashboard design refresh의 승인 전 1단계를 시작했다. 기존 React
화면, 정보 구조, 접근성, 반응형과 인증·권한·API 계약을 감사하고 관찰 가능한
성공 기준을 `docs/design/dashboard-refresh-audit.md`에 기록했다. Production
코드는 변경하지 않았으며, 합성 데이터만 쓰는 세 정적 방향(작전 상황판, 수사
기록부, 친구 서버 콘솔)을 `docs/design/dashboard-directions/`에 만들었다.
권고안은 작전 상황판을 구조 기반으로 하고 증거 타임라인과 절제된 slash-command
모티프를 결합하는 것이다. 방향 승인 전 production UI 구현은 시작하지 않는다.
Orca 앱이 `stale_bootstrap`으로 내장 브라우저 runtime을 열지 못해 실제 browser
및 accessibility 검증은 차단 상태이며, production 배포와 main 병합은 수행하지
않았다.

Owner 피드백으로 선택 방향을 Pretendard 기반 현대적 대시보드, 주 콘텐츠인
명령어 사용 로그 테이블, 요약 명령어 일 10회 한도 관리 화면으로 좁혔다.
정적 Direction A를 이 명세로 갱신했다. 조사 결과 bot `command_audit` 쓰기는
존재하지만 현재 dashboard `/api/audit`는 설정 변경만 조회하며,
`LowRiskSettingsDto`에도 enable/version 외 일일 한도·사용량·초기화 계약은 없다.
따라서 프로토타입은 합성 데이터만 사용하고 production 계약을 추가하지 않았다.
실제 구현 전 read model, 한국 날짜 경계, 원자적 사용량 증가, 관리자 mutation,
감사·보존·pagination을 별도 bounded plan으로 승인해야 한다.

후속 architecture를 `ADR-0019-command-log-and-summary-daily-quota.md`
로, bounded sequence를
`PLAN-0008-dashboard-command-log-and-summary-daily-quota.md`로 작성했다.
2026-07-26 owner가 등록 사용자별 quota 모델을 승인해 ADR-0019는 Accepted,
PLAN-0008은 Approved로 전환했다. 각 사용자는 기본 10회를 상속하며 관리자가
1–100 개인 override 또는 사용 중지를 설정한다. `(guild, registered user,
Asia/Seoul date)`별 provider invocation 직전 원자 reservation, 실패·timeout
포함 시도 차감, version 1 수동 reset 제외, redacted cursor command log와
browser DTO의 Discord ID 비노출을 유지한다. 정적 prototype의 `요약 한도
관리`도 등록 사용자 table과 설정 dialog로 갱신했다. Production code와
migration은 아직 구현하지 않았고 PLAN-0008 Tasks 1–7은 후속 bounded 작업,
Task 8 production은 별도 approval gate다. ADR-0018/PLAN-0007의 Riot
PUUID validator Gateway 수정과 production Gate C/D 완료가 PLAN-0008의
선행 조건이다. 처리 시간 열 추가 계약과
command/quota retention은 미해결이다.

PLAN-0005는 2026-07-26 기준 Local/Disposable Complete다. Tasks 1~8의
summary·Riot link·game observation port, domain, PostgreSQL과 fake Discord
통합이 완료됐다. Exact-source PostgreSQL 17 전체 실행은
`215 pass / 6 explicit external-URL integration skips / 0 fail`이며, bot은
감사 INSERT만 가능하고 감사 SELECT·UPDATE는 거부됨을 실제 workload role로
검증했다. 외부 summary provider, Riot API/RSO, Discord command 등록과
production Task 9는 별도 승인 gate를 유지한다.

Clean commit `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b`의 immutable source
archive SHA-256은
`7a72e9fe5bc2c9b3ed87ca86e60efae7b1033ac47b62c3f33c39b63b65c7d27b`이며,
격리 release stage·clean install·typecheck·build·production asset 검증을
통과했다. 이 archive는 preflight 증거일 뿐 production에 배포하지 않았다.

Production `/health`는
2026-07-25 재확인 시 HTTP 200 `healthy`로 회복됐으며 이전 transient
`degraded`의 정확한 component는 미확정. 외부 provider/RSO/API key, Discord
등록, production migration·배포는 승인 gate 유지.

Dashboard의 Riot 관리자 기능을 bot executor에 연결하는 경계는
`ADR-0017-dashboard-bot-admin-command-ipc.md` Accepted 상태다. 결정은 기존
4 KiB member-role lookup socket을 범용화하지 않고 별도 권한 제한 Unix socket,
bot-side current-role 재확인, 안정된 operation ID와 timeout 후 영구 결과 조회,
mutation·terminal result·감사 원자 transaction을 사용한다. PLAN-0006 승인과
구현 전까지 production dashboard port는 계속 503 fail-closed다.
후속 `PLAN-0006-dashboard-bot-admin-command-ipc.md`는 owner 승인 뒤
In Progress 상태다.

2026-07-26 owner가 PLAN-0006 bounded sequence를 승인했고 Tasks 1~7은
local/disposable 완료다. Version 1은 네 관리자 command만 허용하고 32KiB
frame, 최대 15초 TTL, exact keys, request/operation ID 분리와 allowlisted
response를 강제한다. `0006_admin_command_result`와 bot application service는
current administrator 선검사, bounded cursor pagination, durable duplicate
readback, stale·active PUUID conflict·validator unavailable을 처리한다.
Disposable PostgreSQL 17에서 강제 audit 실패 시 domain mutation·operation·
terminal result 전체 rollback을 확인했다. 별도 socket transport는 기본 3초
deadline, 한 request/reply, 최대 8 connection과 안전한 owned-stale-path 검사를
구현했고 mutation timeout은 `outcome_unknown`이다. Bot/web assembly, systemd와
production 연결은 아직 구현하지 않아 기본 dashboard port는 계속 503
fail-closed다. 주입형 dashboard IPC ports는 HTTP current admin·CSRF·recent
OAuth·confirmation 뒤 영구 web 감사를 먼저 저장하고, 감사 실패 시 IPC를
호출하지 않는다. Unavailable/stale/unknown은 각각 503/409/504이며 duplicate는
원 operation 결과를 조회해 mutation 재실행 없이 재조정한다.
Bot/web main assembly와 repository systemd assets에는 관리자 IPC가 기본
비활성 feature gate로 조립됐다. Duplicate bot은 socket listen 전에 종료하고
shutdown은 admin socket→member-role socket→Gateway→DB 순서다. 전용 runtime
path/group과 web supplementary group을 선언했으며 web의 bot token, bot의 OAuth
secret·CSRF key 비주입을 asset test로 확인했다. Production host의 unit, group,
directory와 실행 서비스는 변경하지 않았다.
Disposable Ubuntu 24.04/PostgreSQL 17 process 검증에서 실제
`waw-bot:waw-admin-command` socket `0660`, directory `0750`, `waw-web` 허용,
unrelated user 거부, SIGKILL stale restart, malformed flood와 8 connection
상한 후 회복을 통과했다. Concurrent 승인은 link 하나만 만들었고 50ms timeout
뒤 terminal success를 조회했으며 audit trigger 실패는 request·operation·result
전체를 rollback했다. Harness 종료 뒤 container/network/image는 모두 0개다.
Task 7 최종 증거는 local `198 pass / 1 intentional Windows Unix-path skip`,
typecheck/build, production·integration asset dry-run, Ubuntu 24.04/PostgreSQL
17 migration 1~6 process 재검증과 forbidden canary 부재다. PLAN-0006은
Local/Disposable Complete이며 production Task 8은 별도 owner approval,
read-only AWS/Supabase preflight, 새 backup/restore와 provider 결정 전에는
시작하지 않는다.
PLAN-0006 Task 8 Gate A는 2026-07-26 owner 승인 뒤 metadata-only로
완료했다. Canonical `/`와 `/health`는 각각 HTTPS 200이고 health body는
`healthy`였다. Production release, unit, identity, group/socket 부재,
backup/monitor, schema ledger 0001–0004, RLS/grant와 workload role을
read-only로 확인했다. Owner가 제공한 인증된 Chrome AWS session에서는
Lightsail `StatusCheckFailed` alarm이 enabled/`OK`, threshold `1`, 5분 period,
evaluation/datapoints `2/2`, missing data 미평가임을 확인했다. 알림 대상
상세는 기록하지 않았다. Production 변경은 0이며 Gate B는 별도 owner 승인을
기다린다.

Gate A 보완에서 migration checksum을 LF canonical form으로 전환하고, 내용이
동일한 CRLF rendering만 legacy 대안으로 인정하도록 제한했다. Production
0001-0004의 실제 mixed-line-ending ledger 회귀와 disposable PostgreSQL resume,
고정 SHA-256 source archive의 격리 stage/typecheck/build가 GREEN이다. 따라서
checksum portability blocker는 해소됐으며 production 변경은 없었다.
고정 rollout candidate `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b`와
archive SHA-256도 격리 preflight를 통과했다.

PLAN-0006 Task 8 Gate B는 owner가 exact change set을 승인해 시작했다.
Fresh encrypted backup과 valid `published` marker는 확인했으나 offline
recovery identity가 별도 Mac에 있어 empty-target restore는 실행하지 못했다.
Owner는 이 recovery risk를 명시적으로 수용하고 rehearsal을 2026-07-27로
유예했다. 이는 이번 실행에 한정된 prerequisite 예외이며 archive를
`verified`로 만들거나 backup policy를 변경하지 않는다. Git archive branch는
DB 복구 수단이 아니며 mutable하므로, 현재 full commit/archive hash와 release
directory를 rollback evidence로 유지하고 추가 원격 landmark가 필요하면 성공
후 별도 승인된 immutable release tag를 우선한다.

2026-07-25 PLAN-0005 bounded slice에서 owner-approved 한국어 명령 명칭,
`/몰랭검거` 체계, interaction normalization, PostgreSQL command audit,
한국어 summary handler와 cache 없는 Discord history pagination/failure
adapter를 local 구현했다. Discord listener 조립·명령 등록과 외부 provider
연결은 아직 수행하지 않았다.

후속 bounded slice에서 Discord listener 조립을 완료했다. Listener는 singleton
bot에만 부착되고 shutdown 전에 해제되며, 일곱 한국어 명령 dispatch와 command
audit DB 실패의 fixed-code·무응답 경로가 fake client 통합 테스트를 통과했다.
외부 command 등록·Portal 변경과 production bot DB credential 주입은 미실행이다.

PLAN-0005 Task 5 request slice에서 Riot command executor를 bot main에
조립했다. 연결 요청은 PUUID 없이 `pending_admin_approval`로 저장되고,
관리자 승인 adapter가 PUUID를 제공한 뒤에만 활성화된다. Disposable
PostgreSQL에서 활성 PUUID 충돌·감사 보존과 감사 실패 전체 rollback을
검증했다. 외부 Riot API/RSO와 production migration은 미실행이다.

관리자 요청 목록·승인·거절 executor와 주입형 PUUID validation port를
추가했다. Non-admin 선거부, request version 기반 stale·중복 결정 거부,
승인/거절/권한 감사와 transaction rollback이 local/disposable PostgreSQL에서
GREEN이다. 실제 validator adapter와 관리자 UI는 아직 미연결이다.

Riot 관리자 dashboard API의 DTO·route·port와 high-risk 인증 경계를 local
구현했다. Web runtime의 DB 권한은 확대하지 않았으며 production port는
bot local-command IPC가 승인·구현될 때까지 503 fail-closed다.

PLAN-0005 Task 6 persistence slice에서 외부 API를 호출하지 않는 게임 관측
executor와 PostgreSQL store를 추가했다. Riot과 Go Live 증거는 별도 행으로,
비교 결과는 incident에 저장된다. Queue 420 allowlist, `(platform, game ID)`
중복 재사용, stale 거부, 명시적 `unknown`, 5분 시작 유예·2분 중단 허용과
부분 generation 충돌의 transaction rollback이 local/disposable PostgreSQL에서
GREEN이다. Scheduler와 실제 Riot/Discord 관측 adapter 조립은 아직 미실행이다.

Task 7 command slice에서 `/몰랭검거 현황|정정|취소` executor를 bot main에
조립했다. 현황은 Riot·Go Live·비교 상태를 분리해 한국어로 표시한다.
정정·취소는 Discord current-role을 incident 조회 전에 재확인하고, 현재
incident version을 읽어 mutation에 전달한다. Disposable PostgreSQL에서
stale 거부, revision·operation·감사 동시 commit과 감사 실패 전체 rollback을
검증했다. 외부 등록과 production 변경은 수행하지 않았다.

Task 6 scheduler slice에서 주입형 Riot observer와 Discord voice source를
결합하는 scheduler를 구현했다. Link별 동시 poll을 하나로 제한하고,
rate-limit·timeout·adapter 장애를 `unknown`으로 정규화하며 timeout 뒤 늦게
도착한 응답은 저장하지 않는다. Gateway disconnect는 기존 Go Live 증거를
`unknown`으로 바꾸고 reconnect 전체 조회가 끝난 뒤에만 reconciled 상태로
복구한다. Fake source와 실제 비교 executor 통합 테스트는 GREEN이며 외부
Riot/Discord 호출과 production timer 조립은 수행하지 않았다.

후속 scheduler assembly slice에서 활성 PostgreSQL Riot 링크만 조회하는 target
source와 Discord `VoiceStateUpdate`·Ready/Resume·Disconnect adapter를
추가했다. Bot assembly는 singleton claim 성공 뒤 listener·timer를 붙이고
shutdown 전에 timer와 listener를 제거한다. systemd feature gate는 명시적으로
`0`이며 실제 Riot observer가 없는 상태에서 `1`은 fail-fast한다. Fake
discord.js client와 disposable PostgreSQL 검증은 GREEN이고 외부 API·Portal과
production 상태는 변경하지 않았다.

PLAN-0001 Task 1~5 local foundation 완료; PLAN-0002 Task 1~3 production backup/restore 완료; PLAN-0003 Tasks 1~4 production monitoring rollout 완료; PLAN-0004 Approved·Tasks 1~5 및 G1/G4 완료; G5 host preflight 중 발견한 malformed backup marker 수정·재발행 완료; `ADR-0015` Accepted와 production entrypoint/release assembly local GREEN; G2/G3, production migrations `0003`~`0004`, G5 배포·G6~G7와 최초 vacuum은 별도 gate 유지

## 완료

- Discord 운영 경보를 서비스·백업·인증서·저장 공간·시스템 로그별 한국어 임베드로 표시하는 전송 포맷과 안전한 미등록 코드 fallback 구현 및 local test 완료
- 한국어 Discord embed 전환의 exact candidate/predecessor hash, read-only production preflight, one-file rollout acceptance와 state·credential 보존 rollback 절차 확정
- 제품 정책 초안 작성
- 배포 및 보안 요구사항 초안 작성
- Codex 작업 흐름 정의
- 연구, ADR, 구현, 검토용 프롬프트 작성
- 대시보드 운영 도메인을 `waw.dubeom.com`으로 확정
- 로컬 `codex-settings`의 공통 에이전트 규칙을 프로젝트 전용 절차와 충돌 없이 병합
- `codex-settings` 플러그인 설치 스크립트의 명령과 영향 범위 검토
- 초기 기술 제약사항과 안정적인 요구사항 ID 추출
- 요구사항 추적표, 기술 결정 지도와 증거 기반 조사 순서 작성
- `OWN-001`~`OWN-009` 제품·운영 조사 입력 확정
- Discord Gateway·메시지 조회·Go Live·OAuth 공식 가능성과 제약 조사
- Riot 계정 연결과 솔로 랭크 시작·종료 감지 가능성 조사
- KBO 데이터 공급·재표시 권리·갱신 SLA 가능성 조사
- 대화 요약 API의 컨텍스트·지연·비용·보존 제약 조사
- 네 외부 플랫폼 조사의 중복, 요구사항 공백, 가정 경계와 사용자 결정 항목 통합 검토
- `ODR-001`~`ODR-005`, `ODR-007` 소유자 결정 확정 및 `OWN-010`~`OWN-015`로 추적
- KBO 기능을 허가된 공급 경로 확보 전까지 연기
- `OWN-001`~`OWN-015`를 반영한 D-03 데이터 흐름·위협 모델 작성
- 정책의 네 배포 형태와 API·queue·공유 저장소·이벤트 방식의 웹-봇 통신 경계 조사
- MacBook 우선 시나리오를 `waw.dubeom.com`, 월 3만 원, RPO 24시간과 RTO 8시간에 연결
- `D08-Q01`~`D08-Q06`을 확정하고 `OWN-016`~`OWN-021`로 추적
- 외부 임대 단일 서버와 OS 비종속 자가 단일 서버의 경계, Vercel Hobby 비용 기준과 Windows 대체 host 후보 확정
- RPO/RTO 판정 범위, 일반 변경의 제한된 비동기 처리와 heartbeat 기반 상태 요구 확정
- SQLite, 자가 PostgreSQL과 관리형 PostgreSQL의 무결성·접근 경계·백업·복구·비용·이식성 비교
- 초기 분리 배포 가정에서는 관리형 PostgreSQL을 첫 검증 후보로 두었고, `OWN-034` 이후 단일 server 경계에서는 자가 SQLite를 첫 검증 후보로 재정렬하되 저장소 선택은 보류
- `D05-Q01`~`D05-Q04`를 확정하고 `OWN-022`~`OWN-025`로 추적
- 장애 중 dashboard 허용 범위, 월 명령 10,000회, PITR 비필수와 조건부 관리형 무료 tier 허용 확정
- Discord OAuth identity, 현재 guild/role 검증, server-side session과 workload 인증 경계 후보 비교
- Discord `identify` + bot-side member 조회 + opaque session을 첫 검증 조합으로 정리하되 인증 기술 선택은 보류
- `D07-Q01`~`D07-Q06`을 확정하고 `OWN-026`~`OWN-031`로 추적
- Discord OAuth 전용 로그인, 1일 유휴·7일 절대 세션, 5분 read-only 역할 cache와 user token 비보존 확정
- 임의 preview 인증 비활성화와 고위험 작업의 15분 recent-auth·현재 역할·명시적 확인 확정
- D-05·D-07·D-08을 통합해 저장소·session·bot-side 역할 조회·내부 통신의 결합 제약과 후보 조합별 남는 경계 검토
- `GAP-INT-01`~`GAP-INT-07`, `INT-Q01`~`INT-Q02`와 실행하지 않은 최소 Spike 후보 4개 정리
- `INT-Q01`~`INT-Q02`를 확정하고 `OWN-032`~`OWN-033`으로 추적
- host 장애 중 5분 read-only cache와 고위험 작업의 Discord OAuth 재완료 기준 확정
- 경계 왕복·기본 거부 Spike에서 로컬 서명·replay·key rotation·5분 cache와 기본 거부 계약 검증
- 별도 Vercel preview→자가 host 임시 outbound tunnel 왕복이 function timeout으로 5초 기준을 충족하지 못해 Spike 실패 판정
- 임시 Vercel project·deployment, tunnel, server, credential과 project metadata 정리 완료
- 첫 Spike 실패는 Vercel→익명 임시 `ssh -R` tunnel→자가 host 조합만 탈락시키며 직접 API·분리 배포 전체를 탈락시키지 않는 것으로 범위 확정
- 동일 익명 tunnel 반복 검증은 보류하고, D-05 결과에서 공유 저장소가 남을 때만 outbound-pull 경계 Spike를 검토
- 월 10,000회 × 1년 합성 감사·dedupe·session 데이터의 SQLite·PostgreSQL database와 export가 모두 40MB 미만임을 측정
- 두 local engine에서 동일 `operation_id` 32회 동시 제출, transaction 중단·재시도와 foreign key 검증 통과
- 공유 저장소 outbound-pull Spike에서 local DB query와 worker request/result 처리는 확인했지만 Vercel 함수가 pooled·unpooled 모두 timeout되어 실패 판정
- 임시 Vercel project·deployment, Neon resource·integration, DB role·credential과 local metadata 정리 완료
- named ngrok endpoint는 local 이중 인증 요청을 463ms에 처리했지만 Vercel preview가 function timeout되어 세 번째 경계 Spike도 실패 판정
- ngrok·Vercel 시험 endpoint, project·deployment, agent·server와 모든 local credential·metadata 정리 완료
- `INT-Q03`을 확정하고 `OWN-034`로 추적
- 첫 MVP의 web·bot을 단일 지속 server 경계에 두고 public web→bot network 경계를 제거하기로 확정
- Vercel Hobby 필수 배포 의도는 철회하되 개인·비상업·저비용 조건은 유지하고 임대 server와 소유 Mac·Windows 선택은 D-09로 이관
- TypeScript·Node.js·discord.js, Python·CPython·discord.py, Java·OpenJDK·JDA를 D-04 현실 후보로 공식 문서와 공식 저장소 기준 비교
- 세 후보의 Gateway 재연결·Go Live Voice State 지원, 단일 bot 실행의 host 책임, 시험성, Windows·macOS·Linux 호환성과 공급망 통제를 대조
- TypeScript·Node.js·discord.js를 잠정 첫 검증 후보, Python·discord.py를 가장 강한 대안으로 두되 언어·런타임·SDK 선택은 보류
- `D04-Q01`을 확정하고 `OWN-035`로 추적
- TypeScript와 Python을 모두 유지보수 가능한 공동 최종 후보로 유지하고 Java·JDA는 두 후보가 기준을 충족하지 못할 때 재평가하기로 확정
- 저가 외부 임대 Linux VM, 보유 Mac과 대체 Windows 노트북을 D-09 단일 지속 server 후보로 비교
- 임대 VM을 문서상 초기 검증 후보, 보유 Mac을 가장 강한 대안, Windows를 복구·조건부 primary 후보로 비교했으며 host·OS 선택은 보류
- 자가 장비·전원·가정망 ingress, 실제 runtime 자원, 단일 실행과 빈 환경 복구를 `GAP-D09-01`~`GAP-D09-06`으로 추적
- `D09-Q01`~`D09-Q02`를 확정하고 `OWN-036`~`OWN-037`로 추적
- 신규 host 비용 0원을 우선해 보유 장비 자가 hosting을 먼저 검증하고 필수 기준 실패 시 저가 임대 VM으로 돌아가기로 확정
- 장비 한 대의 전용 운용과 필요한 전원·자동 시작·공유기·DNS·tunnel 설정을 허용하되 구체 host·ingress 기술 선택은 보류
- Mac 읽기 전용 확인에서 M5·16GB·충분한 disk와 정상 battery·FileVault·Discord outbound를 확인
- Mac의 AC sleep 활성, firewall 비활성, 보안 update 지연과 정전 후 자동 부팅 미지원 및 교육장 회선 미승인을 확인하되 실제 공인 IP는 비기록
- `OWN-038`로 `OWN-036`의 우선순위를 대체하고 저가 외부 임대 VM을 첫 검증 범주, Mac과 LG Gram 16을 fallback으로 확정
- 서울 Lightsail 1GB, 도쿄 Akamai Shared CPU 1GB와 싱가포르 DigitalOcean Basic 1GiB를 D-09 현실 shortlist로 공식 가격·region·network·backup 자료에 따라 비교
- VM 기준 월 USD 5~7, Akamai·DigitalOcean의 고정 native backup 포함 월 USD 7~7.80과 Lightsail의 사용량 기반 snapshot 비용을 확인하고 provider backup과 독립 backup의 경계를 구분
- 서울 Lightsail을 잠정 첫 검증 후보, 도쿄 Akamai를 가장 강한 외부 대안으로 두되 공급자·region·OS·plan 선택은 보류
- 세 공급자 동시 비교를 생략하고 서울 1GB fixture에서 TypeScript·Python을 순차 비교하는 최소 runtime 수용량 Spike 제안 작성; VM 생성·실행은 미승인
- 서울 Lightsail 1GB Spike의 읽기 전용 사전 확인, 비운영 SSH key, 생성·firewall·측정·HTTPS 확인·삭제와 잔존 과금 resource 검사 runbook 작성; 실행은 미승인
- D-09 TypeScript·Python 폐기 가능 harness의 문법과 3초 local 합성 self-check 통과; VM system metric과 60분 안정성은 미검증
- Linux `/proc` 기반 CPU p95·available memory 연속 저하·swap-out·process exit·실행 시간 측정기와 failure-path verifier local 검증 완료
- AWS 공식 IAM 자료 기준 서울 region·필요 action·Spike tag로 제한한 임시 최소 권한 정책과 IAM으로 제한되지 않는 key pair·bundle·blueprint·CIDR 경계 문서화
- 첫 `aws login` 검증에서 `waw-spike` profile이 IAM 사용자가 아닌 root console session으로 연결된 것을 감지해 resource 생성 없이 즉시 logout·cache 무효화
- 재인증 뒤 최소 권한 `waw-spike-operator` identity 확인; 서울 Ubuntu 24.04 LTS와 public IPv4 `micro_3_0` 2 vCPU·1GB·40GB·월 USD 7 fixture 사전 확인 통과
- 첫 두 생성 시도는 Lightsail `publicKeyBase64`에 bytes와 이중 base64 text를 각각 전달해 key import 단계에서 실패; OpenSSH public key 원문 `file://` import→delete probe 통과 및 VM·key·local private key 잔존 없음 확인
- 후속 생성 시도에서 Lightsail의 교차 resource type 이름 namespace 때문에 동일 timestamp의 key·instance 이름이 충돌함을 확인; 활성 VM·key 잔존 없음 확인 후 UTC timestamp와 `-key`·`-vm` suffix로 분리
- 첫 VM 생성은 성공했으나 API state `running`을 `Running`과 비교한 wait 결함으로 90초 뒤 자동 삭제; instance·key 잔존 없음 확인 후 lowercase 비교로 수정
- 실행 VM 생성·관리 단말 `/32` SSH 제한 성공; `gateway.discord.gg` root의 정상 404를 실패로 본 outbound probe를 credential 없는 `discord.com/api/v10/gateway` 200 경로로 수정
- VM 10초 smoke에서 TypeScript·Python의 application·Linux system 기준 전체 통과; Python Linux RSS를 누적 peak가 아닌 실제 `VmRSS` p95로 보정하고 임시 self-signed HTTPS health fixture local 검증 완료
- Ubuntu 기본 Node 18의 D-04 후보 부적합을 발견해 진행 중 장기 측정을 참고 폐기; 공식 SHA-256으로 검증한 Node 22.23.1과 보정 Python fixture의 VM 10초 smoke 전체 통과
- Supabase Free 검증용 별도 disposable project `waw-storage-spike-20260721` 생성·삭제 완료; 기존 production project는 사용하지 않음. Orca 내장 브라우저에서 RLS 활성화 합성 SQL 10,000행 검증(10,000 unique operation, 1,864 kB) 완료. DB password는 채팅·문서에 기록하지 않음. 삭제 성공 toast 확인
- `ADR-0006`으로 Supabase Free PostgreSQL를 첫 MVP canonical storage로 Accepted; Lightsail은 application runtime만 실행하고 24시간 표준 export·빈 host restore 검증을 후속 구현 계획의 필수 조건으로 확정
- `ADR-0007` Discord OAuth `identify`·bot-side current member 조회·opaque server-side session 인증 경계를 Accepted; token 미보존, 1일 idle/7일 absolute session, 5분 read-only role cache와 고위험 recent-auth 계약 확정
- `ADR-0015`를 owner 승인으로 Accepted 전환하고 versioned JSON Lines Unix
  socket client/server, 4KiB allowlist frame, 3초 fail-closed deadline,
  request-ID binding, unsafe stale path 거부와 AuthService의 tier-only reader
  composition을 구현
- 실제 `dist/server/web/main.js`·`bot/main.js` production assembly, Discord
  live member fetch/role mapping, loopback `/health`, bot health snapshot,
  PostgreSQL `0004` low-risk setting과 operation/audit atomic persistence를 구현
- Production unit과 G4 fixture unit을 분리하고 staged loopback Caddy,
  conflict-safe asset installer, immutable source stage·activate·previous
  rollback manager를 추가; local 136 tests(Windows Unix-path test 1 skip),
  typecheck, server/web build와 shell contract 3종 통과
- TypeScript Node 24 workspace와 local command contract를 추가해 valid/expired/malformed/duplicate operation의 합성 단위 시험 4개를 통과; 외부 credential·network·Supabase 연결 없이 Task 1 완료
- versioned Supabase PostgreSQL migration 초안과 session hash·revocation·idle/absolute expiry persistence contract를 추가해 합성 단위 시험 4개를 통과; remote database에는 연결·변경하지 않아 Task 2 완료
- OAuth state hash·single-use/expiry, 5분 read-only role cache, mutation default-deny, high-risk recent-auth·CSRF·explicit confirmation contract를 추가해 합성 단위 시험 6개를 통과; Discord OAuth credential·network 호출 없이 Task 3 완료
- web·bot·migration/backup의 capability 표와 TypeScript capability injection contract를 추가해 web의 bot token/role reader 접근과 bot의 browser command 접근을 합성 시험 3개로 차단; Task 4 완료
- health/singleton contract를 추가해 Gateway disconnected 시 `degraded`, storage failure 시 `unavailable`, duplicate bot lease claim 거부를 합성 시험 4개로 검증; 실제 Gateway/host 없이 Task 5 완료
- Orca 앱 설치·CLI 연결과 active worktree comment 갱신 완료
- 최신 fixture의 중복 실행을 process inventory로 폐기하고 30초 Node·Python smoke 및 4개 verifier unit test 통과
- 서울 Lightsail 임시 VM에서 Node 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- 서울 Lightsail 임시 VM에서 Python 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- D-09 host 결정 Accepted: 서울 Lightsail을 primary로 사용하고 Windows를 복구·비용 절감 fallback으로 유지하며 MacBook은 운영 후보에서 제외
- 임시 HTTPS `/health` 다섯 회 HTTP 200 확인 후 포트·server·certificate 제거; VM·SSH key·static IP·disk·snapshot 잔존 없음 확인
- AWS session logout과 local 임시 state 정리 완료; capacity Spike 결과는 합성 workload 한계와 함께 문서화
- D-04 공식 runtime·SDK 지원 현황 갱신, D-08 단일 지속 server ADR Proposed 작성 후 owner 승인으로 Accepted 전환
- D-08 Accepted ADR을 기준으로 bounded 구현 계획 Draft 작성
- D-12 backup/restore 후보를 공식 Supabase·R2·S3 자료로 비교하고, Supabase Free의 24시간 logical export·off-site encryption·empty Windows restore 요구를 Proposed `ADR-0008`로 정리
- `ADR-0008` Accepted: 기존 AWS S3에 30일 rolling client-side encrypted PostgreSQL archive를 보관하고 backup 전용 IAM·budget monitoring·empty Windows restore 검증을 필수로 확정
- D-13 backup encryption 도구를 `age`, OpenSSL passphrase, S3 SSE-KMS-only로 비교하고 public recipient/offline identity 기반 Proposed `ADR-0009`를 작성
- `ADR-0009` Accepted: `age` public-recipient encryption을 사용하고 runtime에는 public recipient만, private identity는 owner offline custody에 보관
- synthetic `age` recipient encryption contract에서 temporary key·SQL의 gzip encrypt/decrypt byte round trip과 archive secret marker 부재를 확인하고 temporary directory 자동 정리
- `PLAN-0002` S3 encrypted backup/restore 계획 작성: local manifest verifier, disposable S3 restore Spike, production job·rehearsal을 credential gate별 bounded task로 분리
- PLAN-0002 Task 1의 archive manifest verifier를 추가해 non-secret metadata만으로 hash·schema version·retention·row count·invariant 검증을 수행하고 valid/invalid 합성 unit test 4개 통과
- PLAN-0002 Task 2의 disposable S3 transport Spike에서 client-side encrypted synthetic archive 1개 생성·upload·object 목록 확인·object/bucket 삭제와 최종 bucket count 0을 확인; local Docker PostgreSQL 16 empty-target companion에서 encrypted dump byte round trip·row count·invariant restore를 확인하고 containers/temp artifacts를 삭제. Orca download hook 한계로 S3 downloaded-byte checksum 및 Windows/new-host restore와 least-privilege IAM/lifecycle 검증은 미완료로 기록
- S3 CLI byte-checksum 보완을 위해 temporary self-managed access key를 생성했으나 Orca의 CSV download hook이 expected local path에 파일을 전달하지 못해 실행하지 않음; secret 비저장 상태로 key를 비활성화·삭제하고 final access-key count 0을 확인. owner가 temporary self access-key IAM policy attachment를 제거했고 새 console session의 IAM deny로 확인
- `OPS-005`~`OPS-007` recovery evidence를 위한 Windows/new-host encrypted PostgreSQL restore runbook 작성; S3 download checksum, wrong-identity failure, empty target restore, non-secret verifier와 same-run cleanup 순서를 고정
- 서울 Lightsail Ubuntu 24.04 disposable new host에서 wrong-identity failure, encrypted archive byte/hash equality, empty PostgreSQL 16 restore, schema version `1`, row count `2`, foreign-key orphan `0`, invariant를 통과; containers/temp script와 tagged instance를 제거하고 final instance count `0` 확인
- Lightsail console read 권한 부재로 성공한 제출이 오류 화면 뒤에 가려져 생성된 중복 instance 4대를 발견 즉시 삭제; capacity/restore 정책의 목적 tag 분리를 유지하면서 console inventory/browser SSH용 regional read와 global distribution/domain read를 템플릿에 반영
- PLAN-0002 Task 2 S3/IAM transport 보완에서 uniquely named disposable bucket과 tagged writer/reader로 client-side encrypted object의 실제 upload→download byte count·SHA-256 및 decrypt 비교를 통과; writer Put-only와 read/delete/IAM·bucket-policy 변경 deny, reader Get-only와 put/delete deny, `backups/` 한정 30일 lifecycle read-back을 확인
- transport 결과를 서울 disposable new-host의 wrong `age` identity failure 및 valid PostgreSQL 16 empty-target restore 결과와 연결; access key·inline policy·IAM user·object·bucket·temporary plaintext/ciphertext/passphrase·CloudShell runner를 same-run 제거하고 bootstrap inline policy와 이전 S3 full-access attachment까지 제거. `cleanup_complete`, matching resource/policy count `0`, S3 console bucket count `0` 확인 후 PLAN-0002 Task 2 완료
- PLAN-0002 Task 3의 production-free 준비로 backup publication 계약을 추가; dump/encrypt/upload 성공, uploaded byte/hash manifest 일치와 local plaintext/ciphertext cleanup 전부를 요구하고 부분 실패는 `unverified`로 유지. production credential·Supabase/network·scheduler에는 접근하지 않음
- owner-approved PLAN-0002 Task 3 production 실행에서 backup-only PostgreSQL role, prefix Put-only S3 writer와 서울 Lightsail 일일 scheduler를 배포하고 실제 encrypted logical dump 2회를 게시; 최신 7,084-byte object의 upload→download byte/SHA-256 연속성과 `backups/` 한정 30일 lifecycle 확인
- production writer의 Get/Delete/bucket-policy/IAM deny와 temporary exact-object restore reader의 put/delete/other-get/IAM deny를 확인; wrong identity 실패 뒤 disposable PostgreSQL 17 valid restore에서 schema version `1`, row count `0`, invalid constraint `0`, elapsed `30`초를 확인하고 verified marker 게시
- temporary reader/key/policy, staged archive/dump, restore container/image, deploy key와 CloudShell artifact를 제거하고 expected recurring bucket/writer/access key/host만 유지; timer active/enabled와 secret file mode `0640` 확인 후 PLAN-0002 Task 3 완료
- D-10 dashboard web framework/self-host 연구에서 Fastify API+Vite/React Router SPA, Next.js standalone과 React Router SSR/BFF를 공식 문서로 비교; 명시적인 server authorization·schema/DTO·log 경계 때문에 Fastify+SPA를 잠정 첫 Spike 후보, Next.js를 strongest alternative로 정리하고 실제 선택은 보류
- D-10 Fastify+React Router SPA credential-free vertical slice에서 exact lock clean install/audit `0`, authorization test `4/4`와 Vite production build 통과; 첫 실행의 AJV additional-field silent removal을 발견해 explicit reject로 보정하고 generated dependency/build artifacts 삭제
- D-10 증거를 바탕으로 `ADR-0010` Fastify API+Vite/React Router SPA dashboard 구조를 Proposed로 작성; owner 승인 전 Accepted나 production dependency로 승격하지 않음
- owner 승인으로 `ADR-0010`을 Accepted 전환; Fastify API를 browser command/query 경계로, Vite/React Router SPA를 untrusted same-origin client로 선택
- D-15 서울 Lightsail application 배포에서 systemd 직접 실행과 rootful/rootless Docker Compose를 공식 자료와 현재 1GB/backup 경계로 비교; 추가 daemon·image 관리면 없이 Linux user/cgroup/journald를 재사용하는 systemd를 잠정 추천
- `ADR-0011` systemd 직접 application 배포를 Proposed로 작성; Docker Compose는 host 이전/native dependency/registry 요구가 생길 때의 strongest alternative로 유지하고 production host에는 아직 설치하지 않음
- owner 승인으로 `ADR-0011`을 Accepted 전환; first MVP application은 Docker 없이 별도 Linux user의 systemd web/bot service와 immutable release symlink로 배포
- 서울 disposable Ubuntu 24.04 1GB systemd 배포 Spike에서 web/bot cross-secret deny, web crash 재시작, bot singleton exit `73`, failed-release rollback, service별 `MemoryMax=128M`, localhost-only web bind와 실제 `boot_id` 변경 뒤 reboot recovery를 통과; 실패 실행마다 정리를 확인하고 최종 instance/key 및 CloudShell artifact count `0` 확인
- D-10/D-11 HTTPS ingress에서 Caddy, Nginx+Certbot과 Lightsail load balancer를 공식 자료로 비교; 단일 systemd component로 automatic HTTPS와 loopback proxy를 제공하는 Caddy를 잠정 추천하고 `ADR-0012`를 Proposed로 작성
- Owner 승인으로 `ADR-0012`를 Accepted 전환; Caddy만 public 80/443을 소유하고 Fastify는 loopback-only로 유지하며 production DNS/ACME/firewall은 별도 승인 전 변경하지 않음
- Credential-free Caddy 2.11.4 local CA Spike에서 config validation/invalid deny, HTTP `308`, HTTPS proxy·forwarded header, wrong-host deny, Authorization/Cookie/OAuth query log redaction과 same-PID reload를 통과하고 RSS `52,572 KiB` 측정; container/listener/temp CA·config·log/image 최종 부재 확인
- D-11 application secret 주입에서 systemd credential, EnvironmentFile과 AWS Parameter Store/Secrets Manager를 공식 자료로 비교; Lightsail service role 부재로 AWS bootstrap credential을 추가하지 않고 root-owned source + `LoadCredential=`를 잠정 추천해 `ADR-0013`을 Proposed로 작성
- Owner 승인으로 `ADR-0013`을 Accepted 전환하고 synthetic-only disposable Ubuntu 24.04 credential 격리·rotation·rollback runner를 작성·정적 검증; CloudShell launch 권한 부족을 instance 생성 전에 확인해 최소 임시 managed policy JSON을 저장소 루트에 Git 비추적 상태로 준비
- Owner 지시에 따른 root CloudShell의 서울 disposable Ubuntu 24.04 systemd credential Spike에서 source/runtime·cross-service 격리, process/environment/journal 부재, stop cleanup, atomic rotation, failed rotation rollback과 singleton 복구를 통과; 검증 runner의 sudo redirection·root-only compare 결함과 singleton lock race를 보정하고 최종 `runner_exit=0` 확인
- Matching Lightsail instance·key pair·static IP·disk·snapshot, CloudShell runner/result와 local transfer artifact를 모두 `0`으로 확인; eu-north-1/us-east-1 CloudShell environment와 임시 customer-managed IAM policy를 삭제하고 exact policy 검색 `0`건 및 `temporary-cloudshell-policy.json` 부재 확인. 최종 root 실행으로 `waw-spike-operator` CloudShell 경계는 미검증
- D-11 journald 보존·redaction·경보에서 local persistent journal, WAW namespace와 CloudWatch/remote 수집을 Ubuntu/systemd·AWS·Fastify·Caddy·Discord 공식 자료로 비교; 운영 로그 30일/1GiB/4GiB-free, source allowlist redaction, 별도 Discord webhook과 Lightsail status-check email 조합을 잠정 추천
- `ADR-0014`를 Proposed로 작성하고 `PLAN-0003`을 local 계약, disposable Ubuntu Spike, production-free asset, owner-approved rollout의 네 bounded Task로 분리; repository workflow에 따라 ADR 승인 전에는 계획을 실행하지 않음
- Owner 승인으로 `ADR-0014`를 Accepted 전환; local persistent journald 30일/1GiB, source allowlist redaction, 별도 Discord webhook과 Lightsail status-check 경보 계약을 확정
- PLAN-0003 Task 1에서 새 dependency 없이 operational field allowlist와 alert evaluator를 구현; synthetic forbidden field/redaction, unit·health debounce/recovery, backup·certificate·journal threshold, suppression, 6시간 reminder와 stale input을 targeted `7/7`, 전체 `37/37` test 및 typecheck로 검증
- PLAN-0003 Task 2의 서울 disposable Ubuntu 24.04 systemd 255 Spike에서 persistent journald reboot 보존, invalid config rollback, 축소 30초 retention·16MiB capacity, synthetic web/bot/Caddy/backup allowlist와 credential/journal cross-read deny를 통과
- Loopback fake webhook의 firing/dedupe/6시간 reminder/recovery, 429 `Retry-After`, timeout 2회 제한과 강제 monitor failure rollback을 통과하고 final secret/forbidden-field scan, `journald_alerting_spike_passed`, `runner_exit=0` 확인
- 첫 harness 실행의 root-only request log 검증 권한 오류도 remote/AWS cleanup 각 6개 항목 `0`을 확인한 뒤 보정; 최종 실행과 별도 inventory에서 instance/key/static IP/disk/two snapshot 유형, CloudShell uploaded file과 local temp artifact를 모두 `0`으로 확인하고 서울 CloudShell environment 삭제 후 `No active tabs` 확인
- PLAN-0003 Task 3에서 exact 30일/1GiB/4GiB-free journald drop-in, root monitor service/timer, file-credential Discord sender, non-secret config, reversible default-deny installer와 운영 runbook을 추가
- Loopback fake webhook에서 file credential, 429 one-retry, no mentions, 1,800-byte ceiling, fixed delivery failure와 state 미승격을 targeted `1/1` 및 typecheck로 검증; 새 dependency와 package-lock 변경 없음
- Ubuntu 24.04/systemd 255 clean root에서 idempotent install, exact effective config, unit/timer verify, unrelated config 보존, rollback과 conflicting target deny를 통과해 `monitoring_assets_dry_run_passed`, `ubuntu_24_04_monitoring_assets_passed`, `runner_exit=0` 확인
- 첫 Task 3 disposable 실행의 missing `sysinit.target` test fixture 실패도 AWS 여섯 유형 cleanup `0` 뒤 보정; 최종 별도 inventory, CloudShell/local artifact가 모두 `0`이고 CloudShell environment 삭제 후 `No active tabs` 확인. Production host·실제 webhook·alarm·credential은 변경하지 않음
- PLAN-0003 Task 4 backup-only production preflight에서 Ubuntu 24.04, active/enabled backup timer, 16MiB journal과 36GiB free를 확인하고 runtime health/certificate를 비활성화한 최소 monitoring config를 확정
- Node 24.18.0 공식 checksum, asset SHA-256과 systemd verify 후 persistent 30일/1GiB/4GiB-free journald 설정을 restart/read-back하고 monitor timer/service를 활성화
- 승인된 `waw-discord-bot` channel에서 synthetic backup-timer critical firing과 resolved recovery를 확인; 잘못 연결되거나 노출된 webhook 두 개는 즉시 삭제하고 최종 credential을 no-echo root input과 mode `0600`으로 회전
- Verified recovery email과 Lightsail `StatusCheckFailed` threshold `1`, 5분 period, evaluation/datapoints `2/2`, `ALARM`·`OK` notification read-back 완료
- Monitoring asset/credential 제거와 unit 부재·backup 생존을 확인한 rollback rehearsal 뒤 desired state를 재적용하고 production reboot persistence, monitor/backup active+enabled, journald active, monitor exit `0`, host/CloudShell temporary artifact `0` 확인; 최초 vacuum은 실행하지 않음
- Accepted ADR-0006·0007·0010~0014와 완료 PLAN-0001~0003을 실제 저장소와 대조하고, contract-only 구현과 미구현 Supabase adapter·OAuth/Fastify route·React/Gateway/runtime·production deployment 경계를 명시한 `PLAN-0004` Draft 작성
- PLAN-0004를 Supabase persistence, OAuth authorization, dashboard vertical slice, Gateway runtime, disposable systemd integration, owner-approved Lightsail rollout, canonical DNS/HTTPS/monitoring 확장의 7개 bounded Task와 독립 credential gate로 분리
- PLAN-0004 owner 승인 뒤 Task 1 RED에서 PostgreSQL adapter 부재를 확인하고 exact `pg@8.22.0`·`@types/pg@8.20.0`, transactional migration runner, RLS/grant migration, 최소 persistence adapter와 systemd file-credential loader 구현
- Disposable PostgreSQL 17.10에서 migration/reapply/rollback, FK·RLS와 web/bot deny, session/OAuth/5분 cache, 16-way dedupe·audit rollback, DB size snapshot·failure redaction integration 계약 통과; production Supabase/credential 미사용
- PLAN-0004 Task 2에서 browser-bound single-use OAuth state, bounded callback
  input, exact redirect/Origin, token 미보존, opaque session callback·privilege
  rotation, logout/revoke, 5분 read cache와 mutation/high-risk default-deny를
  framework-neutral service로 연결; targeted `21/21`, disposable PostgreSQL
  `10/10`, 전체 `90/90`과 typecheck 통과
- Production 미적용 `0003` candidate의 privilege rotation과 충돌하던
  `last_oauth_completed_at >= created_at` 하한을 제거하고
  `last_oauth_completed_at <= last_seen_at`는 유지; candidate SHA-256
  `7c807c9113524103eed0314565ac6263facc49098e1d0c5eedf13038ddb97a5f`
- PLAN-0004 Task 3/4 local 구현을 통합해 strict Fastify dashboard API,
  React 접근성 상태 UI, CSRF-bound mutation, fake Gateway lifecycle,
  singleton lease, discord.js signal adapter와 loopback web entrypoint를 추가
- Windows shell glob에 의존하지 않는 TypeScript test discovery runner를 추가;
  non-PostgreSQL test `123/124` 통과, 기존 monitor delivery test 1건은 Node
  20 환경에서 실패했고 PostgreSQL integration은 Windows toolchain 부재로 미실행
- Node 24.18.0 재검증에서 monitor child entrypoint의 Windows path 판정과
  PostgreSQL fixture의 Unix-only `mkdir`를 수정하고 non-PostgreSQL `124/124`,
  browser accessibility `1/1`, typecheck와 build를 통과
- React Router CSRF advisory 범위였던 `8.2.0`을 fixed `8.3.0`으로 갱신해
  `npm audit` high/critical finding `0` 확인
- PLAN-0004 Task 5 production-free 준비로 web/bot 분리 unit, synthetic-only
  integration entrypoint, Caddy fixture, conflict-safe installer와 Ubuntu host
  verifier를 추가; local asset test와 `systemd-analyze verify` 통과
- G4 owner-approved 서울 disposable Ubuntu 24.04/1GB 실행에서 Node 24.18.0,
  PostgreSQL 17, tests `124/124`, web/storage loopback, cross-credential와
  process/journal 격리, duplicate bot exit `73`, crash restart, storage failure,
  failed-release rollback, cgroup와 reboot recovery를 통과
- Fresh Caddy default conflict, release traversal, PostgreSQL peer role,
  runtime credential introspection과 listener readiness race를 실제 host에서
  발견해 runner를 보정; 각 실패와 최종 실행 뒤 prefix resource를 정리하고
  별도 AWS inventory의 instance/key/static IP/disk/snapshot count `0` 및
  CloudShell artifact 제거를 확인

## 진행 중

- 예상 사용량과 고정비가 미확정인 항목의 복수 시나리오 유지
- D-09 세 region의 공개 latency·plan 재고, 1GB 자원과 VM·GPT·domain·backup 총비용 검증 대기
- 서울 VM capacity 결과·HTTPS 확인·resource cleanup 결과를 D-09 문서와 PROJECT_STATUS에 반영 완료
- 선택된 TypeScript·Node.js·discord.js product runtime의 실제 Gateway·Go Live·자원·시험성·공급망 검증 대기
- Accepted 저장소 구조의 local PostgreSQL adapter와 G1 production Supabase migration 완료; 뒤 OAuth/배포 통합은 별도 gate 대기
- G1 exact archive의 SHA-256/7,084 bytes와 manifest를 확인하고 wrong identity 거부 뒤 disposable PostgreSQL 17 restore에서 schema version 1, row count 0, invalid constraint 0을 확인
- Approved hashes의 production baseline ledger adoption과 `0002`를 단일 transaction으로 적용; versions `[1,2]`, checksum/RLS/policy/grant/role deny matrix read-back 완료
- Temporary IAM user/key/policy, archive/manifest/dump, SSH key와 restore container 제거; backup/monitor timers·journald active, timers enabled, services success, Lightsail alarm `OK` 확인
- `journalctl --grep` no-match exit `1`과 empty stdout/stderr만 suppression 0으로 처리하고 다른 실패는 invalid로 유지하는 `journal.dropped` false-critical fix를 production에 배포; 10회 clear 뒤 resolved 전달, timer/service/backup/journald/alarm과 cleanup 확인
- Application web/bot/Caddy와 canonical certificate 배포 뒤 monitor expected unit·health·certificate 범위 확장 대기
- 최초 production journal vacuum은 oldest/newest UTC와 usage를 재확인한 별도 owner-approved maintenance window 대기

## 다음 작업

Task 5와 G4는 완료됐다. G5 전 production operator 최소 권한 policy
template·renderer·local deny contract와 Task 6 runbook도 준비됐다. Exact instance
inventory, named operator, browser SSH와 host preflight까지 완료했으며 preflight에서
발견한 malformed backup marker도 별도 승인 후 수정·재발행했다. 다음 bounded
local task는 현재 integration fixture를 가리키는 units를 배포 가능한 production
web/bot assembly와 immutable release installer로 교체하는 것이다. Actual OAuth G2,
bot-side member lookup G3, production migration `0003`, application production 배포,
DNS/TLS G6, monitoring G7과 최초 production vacuum은 각각 별도 gate를 유지한다.

2026-07-25 owner-approved AWS console read-only inventory에서 production host가
Running, 서울 1GB/2vCPU/40GB dual-stack이고 public firewall은 IPv4/IPv6 SSH
22만 열려 있으며 status-check alarm은 enabled/OK임을 확인했다. Console UI에
instance UUID/ARN이 노출되지 않았지만 별도 승인된 root CloudShell read-only
조회로 exact UUID와 running state를 확정했다. Exact-target operator policy를
로컬 렌더링하고 SHA-256과 allowlist contract를 검증했으며 IAM 생성/연결과
host SSH preflight는 당시 아직 실행하지 않았다. 그 inventory 단계에서는
AWS/IAM/network/host 변경이 없었다.

이후 owner-approved named-operator SSH preflight에서 Ubuntu 24.04.4, capacity,
SSH-only listener, backup/monitor timers, journald와 protected path를 확인했다.
Backup marker의 migration rows `1`/`2` 직렬화 결함을 발견해 rollout을 중단하고
single latest version validation을 구현·production 적용했으며 새 marker는 valid
JSON, schema version 2, published, row count 0이다. Lightsail alarm은 root
read-only CloudShell에서 다시 `OK`로 확인했다. Production operator의 instance
detail UI는 unrelated distribution/certificate/domain reads를 요구해 aggregate
403을 반환하므로 broad read 권한은 추가하지 않았다.

## 차단 요소

- Homebrew AWS CLI API 경로는 기존 Python 3.14·system `libexpat` 충돌로 사용할 수 없어 공식 AWS CLI container 경로를 사용함; 임시 profile 인증과 서울 VM 실행은 완료
- `codex-settings/scripts/install.sh`는 Codex 사용자 환경에 Ponytail과 Superpowers 플러그인을 설치하므로 프로젝트 외부 변경 승인 전에는 실행하지 않음
- KBO 기능은 자동 접근·Discord 재표시 권리와 공급자 갱신 정보를 서면으로 확인할 때까지 연기하며, 30분 측정 기준도 함께 보류
- Riot Production/RSO 승인 가능성과 시작·종료 5분 감지는 미확정
- 예상 사용자 수, 메시지량, 월 요약 요청 수와 동시 게임 수가 미확정이므로 외부 API 비용·처리량은 복수 사용량 시나리오로 유지
- 단일 server host, GPT API, 도메인과 외부 백업을 합친 원화 비용이 월 3만 원을 충족하는지 미확정
- 서울 Lightsail·도쿄 Akamai·싱가포르 DigitalOcean의 실제 plan 재고·지연과 1GB bot+web 자원 여유가 미확정
- 자가 Mac은 hardware가 충분하지만 정전 후 자동 부팅 미지원이며 교육장 회선은 서면 승인 전 운영 경로에서 제외
- 월 명령 10,000회의 실제 저장·backup 크기와 무료 관리형 DB 한도 충족 여부가 미확정
- Discord OAuth의 PKCE 지원 범위와 D-05·D-08 경계에 맞는 workload 인증·credential rotation 방식이 미확정
- 익명 임시 outbound tunnel의 Vercel→자가 host 호출이 function timeout으로 실패했으며 원인이 Vercel egress, tunnel 공급자 경로, 지역 또는 연결 정책 중 어디인지는 분리하지 못함
- 공유 PostgreSQL request/result도 worker 처리와 별개로 Vercel function timeout이 발생해 고위험 현재 역할 조회의 5초 동기 경계가 아직 없음
- 계정 고정 managed tunnel도 local 왕복은 성공했지만 Vercel function timeout으로 실패해 공급자 교체만으로 추가 검증할 근거가 낮음

## 현재 확정되지 않은 사항

- Riot 및 KBO 데이터 공급 방식
- 요약 모델 공급자
- 실제 product dependency exact version과 lockfile audit 결과
- Supabase workload role·RLS·connection mode의 production 최소 권한
- Discord OAuth PKCE 실제 지원 범위와 고정 production redirect 검증
- 같은 host의 실제 web·bot local role-query 구현과 production credential read deny
- 선택 host에서 실제 product bot+web+Caddy의 idle/peak memory와 event-loop pause
- 실제 Gateway 단절·Resume, Go Live reconciliation과 배포 중 단일 bot 실행 검증
- Production web/bot main assembly, immutable release installer와 fixture가 아닌
  production systemd ExecStart/rollback contract
- 저가 VM의 1GB급 bot+web 자원 여유와 VM·backup·domain·GPT 원화 총액
- KBO 기능 재개 시 30분 지연 측정 시작점
- Riot 5분 감지 실패 시 완화할 목표 또는 수동 경로의 장기 정책
