# 구현 계획: 대화 요약, Riot 계정 연결 및 게임 관측

- Status: Local/Disposable Complete — Tasks 1-8 GREEN; Task 9 production gate
- Related requirements: FUN-004, FUN-005, FUN-010 through FUN-015, PRI-001 through PRI-003, OWN-007, OWN-008, OWN-010 through OWN-012, OWN-015
- Related ADRs: ADR-0001, ADR-0004, ADR-0006, ADR-0007, ADR-0014, ADR-0015, ADR-0016
- Owner: Product owner

## 목표

현재 단일 서버 web·bot·PostgreSQL 경계에 ADR-0016의 도메인 모델과 명령
처리를 추가한다. 외부 요약 공급자, Riot RSO와 production Riot API 자격 증명
없이도 데이터 무결성, 완전 조회 계약, 한국어 명령 응답, 관측 상태기계와
관리자 감사 경로를 결정적으로 검증한다.

## 범위

- `/health`의 `degraded` 원인을 증거로 진단하고 기존 health 계약 안에서 수정
- 호환 가능한 PostgreSQL 마이그레이션과 저장소 port
- Discord slash command 정의, 권한 확인과 한국어 응답
- 현재 채널/스레드의 명시적 최대 24시간 범위 완전 조회
- 원문 비영구 요약 pipeline과 공급자 독립 port
- Discord 사용자 1명당 여러 Riot 계정 연결 및 활성 PUUID 전역 유일성
- Riot spectator와 Discord `self_stream`의 독립 관측 및 비교 상태기계
- 관리자 전용 사건 정정·취소와 원자적 감사 기록
- 배포·롤백·운영 문서와 변경 이력

## 범위 제외

- 외부 요약 모델 공급자 선택, 결제, API 호출 또는 credential 주입
- Riot Production/RSO 신청·승인, API key 발급·주입 또는 실제 API 호출
- 관리자 승인 링크를 RSO 검증 링크로 자동 승격
- 실제 사용자 대상 자동 위반 판정 활성화
- Discord Developer Portal, AWS, Supabase 또는 Riot Portal 변경
- KBO 기능

## 선행 조건

- ADR-0016 Accepted
- production 변경 전 현재 backup과 rollback release 확인
- 마이그레이션은 기존 release가 읽을 수 있는 additive 변경이어야 함
- 실제 Go Live·Spectator 자동 판정은 별도 동의된 production spike와 외부
  credential 승인을 통과할 때까지 비활성

## 작업

### Task 1: ADR, 계획 및 health 진단

- 목적: 승인 결정을 기록하고 현재 `degraded`를 web/storage/bot/Gateway 증거로 분해한다.
- 변경 예상 파일: `docs/adr/ADR-0016-summary-riot-link-and-game-observation.md`, 이 계획, health·bot entrypoint 관련 파일과 테스트, 운영 문서
- 테스트: health snapshot freshness·권한·경로 회귀 테스트, 관련 단위 테스트
- 완료 기준: 원인이 재현되며 수정 뒤 네 component가 정상일 때만 `healthy`
- 위험: 실행 중 bot을 정상으로 오인
- 롤백: health 수정만 되돌리고 기존 보수적 `degraded` 유지

### Task 2: 데이터베이스 마이그레이션과 도메인 모델

- 목적: 링크, 게임, 관측, 사건, 정정·취소 감사에 필요한 최소 schema와 순수 도메인 타입을 추가한다.
- 변경 예상 파일: `migrations/0005_summary_riot_game.sql`, `src/domain/*`, `src/persistence/*`
- 테스트: migration 재실행, FK/check/partial unique, transaction rollback, domain 단위 테스트
- 완료 기준: 한 Discord 사용자에 여러 PUUID가 가능하고 활성 PUUID 중복 귀속과 게임 중복이 DB에서 거부됨
- 위험: 긴 lock 또는 기존 release 비호환
- 롤백: scheduler/command 비활성화 후 additive table 미사용; 데이터 삭제 rollback은 하지 않음

### Task 3: slash command 정의와 한국어 응답

- 목적: 예정 명령의 안정된 영문 식별자, 입력 검증, 권한 경계와 한국어 결과 계약을 구현한다.
- 변경 예상 파일: `src/bot/*`, `src/commands/*`, 관련 테스트
- 테스트: command JSON, 잘못된 채널·입력, caller/admin 권한, timeout·취소, 민감정보 비반사
- 완료 기준: 일곱 명령이 등록 가능한 정의를 가지며 모든 시도 결과가 원자적으로 감사됨
- 위험: global command 즉시 변경
- 롤백: 등록 adapter/feature gate 비활성화

### Task 4: 완전 조회와 비영구 요약 pipeline

- 목적: `[start,end)` 최대 24시간 범위를 cursor로 완전 조회하고 공급자 port에 전체 계보를 전달한다.
- 변경 예상 파일: `src/summary/*`, `src/adapters/discord/*`, 관련 테스트
- 테스트: 100개 초과 pagination, timestamp/ID 경계, 중복, 삭제·편집 감지, 429, 권한 상실, timeout, cancellation, manifest 공백·중복
- 완료 기준: 검증된 전체 범위만 네 개 한국어 section으로 성공하고 그 외에는 부분 결과 없이 명시적으로 실패하며 원문·중간물은 요청 종료 뒤 폐기됨
- 위험: Discord API는 원자 snapshot을 제공하지 않음
- 롤백: `/summary` feature gate 비활성화; 영구 원문이 없어 데이터 rollback 불필요

### Task 5: Riot 계정 1:N 등록·조회·해제

- 목적: 관리자 승인 기반 `admin_approved_unverified` 링크의 lifecycle과 향후 `rso_verified` port를 구현한다.
- 변경 예상 파일: `src/riot/*`, `src/persistence/*`, `src/commands/*`, 관련 테스트
- 테스트: 1:N, PUUID conflict, 재승인, soft unlink, primary 이동, caller/admin visibility
- 완료 기준: password/token/code를 받지 않고 활성 PUUID를 단일 Discord 사용자에게만 귀속
- 위험: 관리자 승인이 소유권 증명이 아님
- 롤백: 명령 비활성화, 링크는 `removed_at`으로 종료

### Task 6: Riot·Discord 관측과 비교 상태기계

- 목적: 외부 adapter port, normalized evidence와 결정적 시간 기반 비교를 구현한다.
- 변경 예상 파일: `src/game/*`, `src/riot/*`, `src/gateway/*`, `src/persistence/*`
- 테스트: queue 420, `(platform,game_id)` 중복, reconnect reconciliation, stale response, 404/429/5xx/timeout, 5분 grace, 2분 interruption, unknown
- 완료 기준: Riot와 Go Live 증거가 분리 저장되고 부족한 증거가 위반/정상으로 승격되지 않음
- 위험: 실제 propagation과 rate limit 미검증
- 롤백: scheduler와 자동 판정 feature gate 비활성화, 관측 이력 보존

### Task 7: 관리자 정정·취소와 감사

- 목적: 사건 원본을 덮어쓰지 않는 관리자 전용 변경 이력을 구현한다.
- 변경 예상 파일: `src/game/*`, `src/commands/*`, `src/persistence/*`
- 테스트: non-admin deny, stale version conflict, reason required, correction/cancel idempotency, incident·audit atomicity
- 완료 기준: 전후 상태·actor·reason·시간이 남고 모든 실패 시도가 원문 없이 감사됨
- 위험: 정정과 점수 정책 결합
- 롤백: mutation command 비활성화, 이력 보존

### Task 8: 통합 검증과 문서

- 목적: 전체 관련 test/typecheck/build와 redaction 검사를 수행하고 운영 계약을 갱신한다.
- 변경 예상 파일: `PROJECT_STATUS.md`, `CHANGELOG.md`, 운영·인증·application persistence·배포 문서
- 테스트: `npm test`, `npm run typecheck`, `npm run build`, shell contract tests, migration integration tests, secret/message canary scan
- 완료 기준: 실패와 skip이 명시되고 문서·migration·rollback·feature gate가 일치
- 위험: production credential 없는 integration 범위 제한
- 롤백: 문서에서 미검증 항목과 gate 유지

### Task 9: production release

- 목적: 승인된 immutable release 절차로 backup·migration·배포·외부 확인을 수행한다.
- 변경 예상 파일: deployment evidence, `PROJECT_STATUS.md`, `CHANGELOG.md`
- 테스트: preflight, backup marker/restore evidence, migration version, singleton, `/`, assets, `/health`, command registration readback, post-deploy logs
- 완료 기준: 별도 외부 변경 승인 뒤 canonical domain이 정상이며 rollback target이 확인됨
- 위험: AWS/Supabase/Discord/Riot 외부 상태 변경
- 롤백: 이전 immutable release 활성화; additive schema 유지; command registration과 schedulers 비활성화

## 검증 계획

- 시간과 외부 경계는 fake clock·adapter로 결정적으로 검증한다.
- PostgreSQL 통합 테스트는 별도 test schema에서 constraint와 transaction을 검증한다.
- command 감사 데이터와 구조화 로그에 message content, Riot ID, PUUID, token,
  OAuth code, session ID와 API key canary가 없는지 검사한다.
- 실제 외부 검증은 각각의 계정·credential 변경 승인을 받은 뒤 수행한다.

## 배포 및 마이그레이션

1. 현재 production release와 backup marker를 읽기 전용으로 확인한다.
2. additive migration을 backup 뒤 별도 migration credential로 실행한다.
3. 새 command와 scheduler는 기본 비활성 feature gate로 배포한다.
4. web·bot singleton과 health를 확인한다.
5. Discord command registration, Riot adapter와 summary provider는 각각 별도
   승인·credential 준비 뒤 활성화한다.
6. 회귀 시 이전 immutable release로 복귀하고 새 table은 보존한다.

## 문서 갱신

- ADR 승인 기록
- `PROJECT_STATUS.md`, `CHANGELOG.md`
- application persistence, authentication, deployment와 monitoring runbook
- 외부 공급자와 production spike의 미해결 gate

## 승인

- Owner decision: 2026-07-25 요청에서 ADR-0016의 핵심 결정을 승인하고 위
  1~11 순서로 계획 작성 후 단계별 구현·검증·배포를 진행하도록 지시함.
- Approved date: 2026-07-25

## 진행 기록

- 2026-07-27 production observer candidate slice: Accepted ADR-0016의 기존
  `RiotGameObserver` port에 KR Spectator v5 adapter를 구현하고 production bot의
  target source, Discord `VoiceState.streaming` reconciliation, scheduler,
  comparison executor와 PostgreSQL observation store를 조립했다. 404는
  inactive, 429는 `Retry-After` 동안 unknown, provider·형식 오류는 식별자 없는
  unknown으로 정규화한다. Feature flag와 quota flags는 계속 `0`이다. Fake
  adapter/lifecycle 회귀와 migration 0001–0007을 적용한 분리 disposable
  PostgreSQL observation tests를 통과했다. 실제 external propagation은
  별도 승인된 consented spike 전까지 미검증이며 자동 confirmed/stack 전이는
  아직 구현하지 않았다.

- 2026-07-26 Task 8: 기본 local runner가 PostgreSQL toolchain 부재를
  명시적으로 skip하고 강제 검증 모드에서는 fail-closed하도록 보완했다.
  Exact-source PostgreSQL 17 harness에서 전체 `215 pass / 6 explicit external-URL
  integration skips / 0 fail`을 확인했다. Bot의 명령 감사 계약에 맞춰
  `audit_event` INSERT는 허용하되 SELECT·UPDATE는 거부되는 실제 role 검증으로
  오래된 기대를 수정했다. Typecheck/build와 문서 일관성 검증 뒤 Tasks 1~8을
  Local/Disposable Complete로 전환했다. 외부 summary provider, Riot API/RSO,
  Discord command 등록과 production Task 9는 별도 승인 gate를 유지한다.

- 2026-07-25 Task 1: ADR 승인 기록과 계획 작성을 완료했다. 공개
  `https://waw.dubeom.com/health`는 재검증 시 HTTP 200
  `{"status":"healthy"}`로 회복되어 보수적인 health 계약은 변경하지 않았다.
  과거 `degraded`의 정확한 component와 시점은 host evidence 없이 확정하지
  않았다.
- 2026-07-25 Task 2: additive `0005` schema, 1:N link domain과 PostgreSQL
  adapter를 구현했다. 일회용 PostgreSQL 17에서 migration 1~5 적용, 활성
  PUUID unique와 `(platform_id, game_id)` unique 계약을 검증했다.
- 2026-07-25 Tasks 3~7 진행 중: command registration payload·한국어 문구,
  summary range/pagination/provider port, Riot link lifecycle, Go Live
  normalization, 비교 상태기계와 관리자 mutation port를 구현했다. 실제
  Discord interaction dispatch, Riot ID→PUUID adapter, 외부 summary provider,
  production scheduler와 command registration은 아직 연결하지 않았다.
- 2026-07-25 Task 3 및 Task 4 bounded slice: owner amendment에 따라 실제
  Discord command·subcommand·option 명칭을 한국어로 바꾸고
  `/몰랭검거 현황|정정|취소`를 채택했다. Discord interaction normalization,
  원문·option 값을 제외한 PostgreSQL command audit, 한국어 summary handler,
  cache 없는 100-message history adapter와 permission/429/timeout/incomplete
  실패 매핑을 구현했다. Discord event listener 조립과 외부 command
  registration은 수행하지 않았다.
- 2026-07-25 Task 3 listener slice: singleton claim 성공 뒤에만
  `InteractionCreate` listener를 부착하고 shutdown 시 먼저 해제하도록 bot
  assembly와 production entrypoint를 조립했다. 일곱 한국어 명령의 fake
  Discord dispatch·감사와 감사 DB 실패 시 무응답/fixed failure code를
  통합 검증했다. Production bot DB credential source, Discord command
  registration과 Portal은 변경하지 않았다.
- 2026-07-25 Task 5 request slice: `/라이엇계정 연결|목록|연결해제`
  executor를 production bot main과 PostgreSQL store에 조립했다. 외부 PUUID
  조회 없이 연결은 `pending_admin_approval` 요청만 만들며, 승인 경로가
  PUUID를 받은 뒤에만 `admin_approved_unverified` 활성 링크를 생성한다.
  요청·해제·승인과 command audit는 transaction으로 결합했다. Disposable
  PostgreSQL 17에서 대기·중복·승인, 활성 PUUID 충돌 시 대기 유지와 실패
  감사, 감사 강제 실패 시 operation/request 전체 rollback을 통과했다.
  Riot API와 RSO는 호출하지 않았다.
- 2026-07-25 Task 5 administrator slice: 관리자 전용 pending request
  목록·승인·거절 executor, request version과 PUUID validation port를
  구현했다. Non-admin은 request/PUUID 조회 전에 감사 후 거부되고, 승인·거절은
  row lock과 expected version으로 stale·중복 결정을 거부한다. Disposable
  PostgreSQL에서 stale 유지, 거절 version 증가, 중복 결정, 권한 거부 감사와
  감사 실패 전체 rollback을 검증했다. Validator는 fake만 사용했고 Riot
  API/RSO는 호출하지 않았다.
- 2026-07-25 Task 5 dashboard boundary slice: pending 목록·승인·거절 Fastify
  DTO/route/port를 추가했다. 목록은 current-role mutation auth, 승인·거절은
  CSRF·15분 recent OAuth·`confirmation: true`를 포함한 high-risk auth와
  administrator tier를 요구하며 expected version conflict는 HTTP 409다.
  Web runtime에 `waw_bot` DB mutation 권한을 추가하지 않았고 production
  ports는 `riot_admin_ipc_unavailable` 503으로 fail closed한다. Production
  연결에는 accepted architecture에 맞는 bot local-command IPC 확장 결정이
  필요하다.
- 2026-07-25 Task 6 persistence slice: 정규화된 Riot Spectator·Discord
  Go Live 증거를 별도 행으로, accepted policy 비교 결과를 incident로 한
  transaction에 저장하는 executor와 PostgreSQL store를 구현했다. Queue 420
  allowlist, `(platform, game_id)` 재사용, generation 중복, 오래된 관측 거부,
  `unknown`, 5분 시작 유예·2분 중단 허용과 부분 충돌 rollback을
  disposable PostgreSQL 17에서 검증했다. 외부 Riot API, Discord Portal,
  scheduler와 production 상태는 변경하지 않았다.
- 2026-07-25 Task 7 command slice: `/몰랭검거 현황|정정|취소` executor를
  production bot assembly와 PostgreSQL feature store에 조립했다. 현황은
  두 증거와 비교 상태를 분리해 표시하고, mutation은 Discord current-role을
  incident 조회 전에 재확인한 다음 DB에서 읽은 최신 version으로
  optimistic locking을 수행한다. Operator 선거부와 command 감사, stale
  conflict, revision·operation·감사 원자 commit 및 감사 강제 실패 rollback을
  단위/disposable PostgreSQL 17에서 검증했다. 외부 command 등록은 하지 않았다.
- 2026-07-25 Task 6 scheduler slice: active Riot link source, Riot observer,
  Discord voice reconciliation source와 기존 observation executor를 연결하는
  scheduler를 구현했다. Link별 in-flight deduplication, rate-limit·timeout·
  adapter 장애의 명시적 `unknown`, timeout 뒤 늦은 응답 무시, disconnect
  `unknown` 전환과 reconnect 전체 reconciliation, 종료 게임 문맥 제거를
  fake source와 실제 comparison executor로 통합 검증했다. 최초 활성 게임을
  확인하기 전에는 장애 응답에 허위 game ID를 만들지 않고 `no_active_game`으로
  보고한다. 외부 API와 production timer는 연결하지 않았다.
- 2026-07-25 Task 6 scheduler assembly slice: `removed_at is null`인 링크의
  최소 polling 필드만 반환하는 PostgreSQL target source와 Discord
  `VoiceStateUpdate`, Ready/Resume reconciliation, disconnect `unknown`
  adapter를 구현했다. Optional bot assembly lifecycle은 singleton 성공
  뒤에만 listener와 poll timer를 시작하고 shutdown 시 먼저 제거한다.
  `WAW_GAME_OBSERVATION_ENABLED`는 systemd에서 `0`으로 고정했으며, 외부
  Riot observer가 없는 현재 release에서 `1`은 fail-fast한다. Fake client와
  disposable PostgreSQL 17에서 검증했고 외부 API·Portal은 변경하지 않았다.
- 2026-07-25 architecture gate: dashboard→bot Riot 관리자 기능 연결을 위해
  ADR-0015의 역할 조회 IPC와 별개인 관리자 명령 Unix socket, bot-side
  current-role 재확인, operation 결과 조회와 원자 감사 계약을
  `ADR-0017` Proposed로 작성했다. Owner 승인 전 구현·production 변경은 하지
  않으며 dashboard production port는 503 fail-closed를 유지한다.
- 2026-07-26 architecture approval: Owner가 ADR-0017의 별도 권한 제한 Unix
  socket 관리자 명령 protocol을 승인했다. ADR을 Accepted로 전환하고 후속
  bounded sequence를 `PLAN-0006` Draft로 작성했다. PLAN-0006 구현 승인 전까지
  production port는 503 fail-closed를 유지한다.
- production migration·배포 또는 외부 계정 변경은 수행하지 않았다.
