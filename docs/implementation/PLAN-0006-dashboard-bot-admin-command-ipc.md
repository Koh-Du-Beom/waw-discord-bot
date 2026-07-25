# PLAN-0006: 대시보드-봇 관리자 명령 로컬 IPC

- Status: Local/Disposable Complete — approved Tasks 1~7 GREEN; Task 8 owner gate
- Date: 2026-07-26
- Owner: Project owner
- Related requirements: `FUN-005`, `FUN-015`, `OWN-028`, `OWN-031`~`OWN-034`, `SEC-001`~`SEC-010`, `INT-001`~`INT-003`
- Related ADRs: [`ADR-0015`](../adr/ADR-0015-local-member-role-ipc.md), [`ADR-0016`](../adr/ADR-0016-summary-riot-link-and-game-observation.md), [`ADR-0017`](../adr/ADR-0017-dashboard-bot-admin-command-ipc.md)
- Depends on: PLAN-0005의 Riot 관리자 executor·PostgreSQL store·dashboard HTTP 경계

## 목표

Accepted ADR-0017의 별도 Unix socket 관리자 명령 protocol을 web과 bot 사이에
구현한다. 기존 member-role lookup, process credential과 PostgreSQL workload
권한을 보존하면서 Riot 연결 요청 목록·승인·거절을 dashboard에서 안전하게
실행하고 timeout 뒤 동일 operation의 영구 결과를 재조정한다.

각 Task는 외부 계정이나 production을 변경하지 않는 local/disposable 검증부터
수행한다. Production migration, system user/group 변경과 application 배포는 이
Draft 계획의 작성이나 이후 local 구현 승인에 포함되지 않는다.

## 범위

- 관리자 IPC version 1 exact request/response 계약과 bounded pagination
- 별도 Unix socket client/server, frame·deadline·connection 제한과 안전한 path
- Bot-side current Discord administrator 재확인과 allowlisted command dispatch
- 안정된 operation ID, terminal result 조회와 mutation·audit 원자성
- Dashboard production ports와 HTTP 오류/unknown 결과 매핑
- Web pre-dispatch 권한 거부 감사와 bot mutation 감사의 상관관계
- 별도 systemd runtime directory/group과 credential isolation assets
- Windows fake/named-pipe 호환 test와 disposable Ubuntu Unix 권한 검증
- 기본 503 fail-closed rollout, rollback과 운영 문서

## 범위 제외

- 기존 member-role IPC protocol 또는 socket의 범용화
- Public/loopback TCP API, queue/broker 또는 web direct feature-table mutation
- Discord bot token, browser cookie/session, OAuth code/token 또는 CSRF token 전달
- Riot API/RSO adapter, PUUID provider 선택·credential 주입
- Discord command 등록
- Production Supabase migration, system user/group, unit 또는 release 변경
- Dashboard의 백업·복구 실행 command

## 전역 안전 규칙과 선행 조건

1. 기존 `/run/waw-member-role/member-role.sock`과 `waw-member-role` group을
   변경하지 않는다.
2. Web에는 bot token과 bot DB mutation credential을, bot에는 browser session과
   OAuth credential을 주입하지 않는다.
3. PUUID, Riot ID, session/OAuth/CSRF 값과 provider body를 log·audit·문서에
   기록하지 않는다.
4. Bot은 request가 주장하는 역할을 받거나 신뢰하지 않고 allowed guild의 현재
   Discord member를 다시 확인한다.
5. Mutation timeout은 실패로 확정하지 않는다. 동일 operation ID 결과 조회 전
   새 operation ID로 재실행하지 않는다.
6. Audit 또는 terminal result 저장 실패 시 domain mutation 전체가 rollback되어야
   한다.
7. 각 bounded Task는 RED test, 최소 GREEN 구현, targeted test, 전체 회귀와 문서
   갱신 순서로 수행한다.
8. Accepted ADR과 충돌하거나 32 KiB·8 connection 상한을 바꿔야 하는 증거가
   나오면 구현을 멈추고 owner에게 보고한다.

## 작업

### Task 1 — Version 1 protocol 계약과 parser

- 목적: Transport 없이 exact request/response DTO, command별 payload,
  timestamp/TTL, cursor와 allowlisted result를 고정한다.
- 변경 예상 파일: `src/contracts/admin-command-ipc.ts`, 관련 parser·contract tests
- 테스트: 네 command, exact keys, ID/snowflake/date/TTL, string length,
  page limit, malformed JSON/UTF-8, unknown field, multi-frame와 32 KiB boundary
- 완료 기준: 유효 frame만 typed command가 되고 PUUID·Riot ID를 포함한 입력이
  parse error나 serialization error에 반사되지 않음
- 위험: Dashboard DTO와 IPC DTO를 과도하게 결합
- 롤백: 새 contract 파일만 제거; production port는 503 유지

### Task 2 — 영구 operation 결과와 bot command application service

- 목적: IPC와 독립적으로 list·approve·reject·operation-status dispatch,
  bot-side current-role과 영구 terminal result 계약을 구현한다.
- 변경 예상 파일: `migrations/0006_admin_command_result.sql`,
  `src/riot/*`, `src/persistence/*`, 관련 단위·PostgreSQL 통합 테스트
- 테스트: administrator 선확인, wrong guild/operator/removed member/
  Discord timeout·429 거부, pagination, duplicate operation, stale version,
  PUUID conflict, validator unavailable, terminal result readback
- 완료 기준: 권한 실패는 target/PUUID 전에 감사되고 mutation·terminal result·
  audit가 한 transaction에서 commit 또는 rollback됨
- 위험: 기존 operation ledger/audit와 terminal result 중복 또는 migration
  비호환
- 롤백: dispatcher feature gate 비활성화, additive 결과 table 미사용·보존

### Task 3 — 별도 Unix socket server/client

- 목적: ADR-0017의 한 connection·한 frame request/reply transport와 안전한
  socket lifecycle을 구현한다.
- 변경 예상 파일: `src/ipc/admin-command-ipc.ts`, transport tests
- 테스트: request ID binding, 3초 deadline, EOF/late response, oversized/
  multi-frame, 8 connection bound, graceful close, stale owned socket,
  symlink·regular file·other-owner refusal
- 완료 기준: malformed 또는 unavailable transport가 command를 실행하지 않고
  mutation timeout이 `outcome_unknown`으로 반환됨
- 위험: Gateway event loop starvation과 crash 뒤 stale path
- 롤백: server/client를 조립하지 않고 503 port 유지

### Task 4 — Dashboard ports와 pre-dispatch 감사

- 목적: 현재 fail-closed production ports를 IPC client로 교체하고 web에서
  거부된 attempt도 영구 감사한다.
- 변경 예상 파일: `src/web/production-dashboard-ports.ts`,
  `src/http/dashboard-server.ts`, web audit persistence와 관련 테스트
- 테스트: current admin, CSRF, recent OAuth, confirmation, IPC 503,
  stale 409, timeout unknown, duplicate/result reconciliation, web audit 실패 시
  미전달, PUUID·Riot ID 비로그
- 완료 기준: HTTP 성공은 bot terminal success에만 대응하고 timeout·unknown은
  성공을 주장하지 않으며 pre-dispatch audit 실패 시 socket에 쓰지 않음
- 위험: Web attempt audit와 bot terminal audit 사이 orphan
- 롤백: 세 production port를 `riot_admin_ipc_unavailable` 503으로 복원

### Task 5 — Bot/web assembly와 systemd capability 경계

- 목적: Singleton bot만 server를 열고 web만 client path에 접근하도록 local
  runtime과 deployment assets를 조립한다.
- 변경 예상 파일: `src/bot/main.ts`, `src/web/main.ts`,
  `deploy/systemd/waw-bot.service`, `deploy/systemd/waw-web.service`,
  installer·asset tests
- 테스트: duplicate bot은 listen 전 종료, shutdown 순서, socket path/mode,
  runtime directory, unit user/group, web에 bot credential 없음, bot에 web
  session credential 없음
- 완료 기준: 기존 member-role socket과 독립된
  `/run/waw-admin-command/admin-command.sock`만 allowlisted group에 노출됨
- 위험: supplementary group 확대와 unit restart ordering
- 롤백: 새 socket/group/unit 설정 제거, 기존 IPC와 services 유지

### Task 6 — Cross-boundary 통합과 disposable Ubuntu 검증

- 목적: 실제 Unix 권한, timeout 재조정과 DB 원자성을 process 경계에서
  검증한다.
- 변경 예상 파일: `deploy/integration/*`, 관련 runbook과 fixture
- 테스트: `waw-web` 허용, unrelated user 거부, owner/group/mode, restart,
  malformed flood bound, concurrent decision, response 유실 뒤 operation-status,
  audit 강제 실패 rollback
- 완료 기준: disposable Ubuntu와 PostgreSQL에서 허용·거부·rollback·cleanup이
  모두 재현되고 잔여 resource 수가 0
- 위험: Windows local 결과를 Linux 권한 증거로 오인
- 롤백: disposable resource만 제거; production 영향 없음

### Task 7 — 전체 검증과 운영 문서

- 목적: test/typecheck/build, redaction과 배포·장애·rollback 계약을 마감한다.
- 변경 예상 파일: `PROJECT_STATUS.md`, `CHANGELOG.md`,
  authentication/application persistence/deployment/monitoring runbook
- 테스트: 전체 `npm test`, typecheck, build, shell asset tests, migration
  integration, secret·PUUID·Riot ID·session canary scan
- 완료 기준: 모든 실패와 skip이 명시되고 code·ADR·systemd·runbook의 path,
  group, deadline, frame와 결과 상태가 일치
- 위험: 실제 production user/group과 socket 권한은 아직 미검증
- 롤백: local feature gate와 503 fallback 유지

### Task 8 — Production migration과 rollout

- 목적: 별도 owner 승인 뒤 backup·migration·systemd group·release를 단계적으로
  적용하고 외부에서 검증한다.
- 변경 예상 파일: deployment evidence, `PROJECT_STATUS.md`, `CHANGELOG.md`
- 테스트: read-only preflight, 새 encrypted backup/restore evidence, migration
  checksum, unit credential/group, socket owner/mode, 503→기능 전환, duplicate/
  timeout reconciliation, `/health`, logs, rollback release
- 완료 기준: 승인된 identity로만 실행되고 dashboard 관리자 작업과 감사가
  canonical domain에서 검증되며 이전 immutable release가 rollback target으로
  남음
- 위험: Supabase schema, system group과 running service 변경
- 롤백: 이전 release 활성화, admin IPC ports 503, socket/group 제거; additive
  schema와 감사 결과 보존

## 검증 계획

- Parser와 domain은 network·clock·random을 주입해 결정적으로 검증한다.
- Transport는 fake socket과 실제 local Unix socket을 모두 사용한다.
- PostgreSQL은 disposable version 17에서 migration 1~6, row lock,
  operation/result/audit transaction과 RLS/grants를 검증한다.
- Linux owner/group/mode와 unrelated-user 거부는 disposable Ubuntu에서만
  완료로 판정한다.
- Log/audit DTO와 오류 serialization에 PUUID, Riot ID, cookie, session ID,
  OAuth code/token, CSRF token과 provider body canary가 없는지 검사한다.

## 배포 및 마이그레이션

1. Task 1~7은 production credential 없이 local/disposable로 완료한다.
2. Task 8 전에 production read-only inventory와 24시간 이내 새 encrypted
   backup·empty-target restore evidence를 확보한다.
3. 별도 migration credential로 additive migration만 실행한다.
4. 전용 group/runtime directory를 만든 뒤 bot server를 먼저 배포하고 socket
   owner/group/mode를 확인한다.
5. Web client는 server 확인 뒤 별도 release로 활성화한다.
6. 장애 시 web port를 즉시 503으로 되돌리고 기존 member-role IPC와 bot command를
   유지한다.

## 문서 갱신

- ADR-0017 approval과 PLAN-0006 진행 기록
- `PROJECT_STATUS.md`, `CHANGELOG.md`
- application persistence, authentication, deployment, monitoring runbook
- production preflight, rollout evidence와 rollback 명령

## 진행 기록

- 2026-07-26 Task 1: 관리자 IPC version 1 request/response DTO, exact-key
  parser와 serializer를 구현했다. 네 allowlisted command, request ID와
  operation ID 분리, 양수·최대 15초 TTL, 최대 50개 page, allowlisted terminal
  result를 고정했다. UTF-8 byte 기준 정확히 32 KiB까지 허용하고 초과 frame,
  literal multi-frame, invalid UTF-8, unknown/missing field와 command별 잘못된
  payload를 거부한다. Parser 실패와 serializer validation 오류가 PUUID, Riot
  ID 또는 provider input을 반사하지 않는 테스트를 포함했다. Transport, DB와
  production은 변경하지 않았다.
- 2026-07-26 Task 2: additive `admin_command_result` migration과 bot-side
  application service를 구현했다. 모든 명령은 현재 administrator 역할을
  target/validator 조회보다 먼저 확인하며, pending 요청 목록은 안정적인
  `(requested_at, request_id)` 순서와 불투명 cursor로 bounded pagination한다.
  mutation·감사·terminal result는 한 PostgreSQL transaction에서 기록된다.
  Disposable PostgreSQL 17에서 pagination, duplicate result readback, stale
  version, active PUUID conflict, validator unavailable, current-role 거부와
  강제 audit 실패 전체 rollback을 통과했다. Unix socket transport와 production
  migration은 변경하지 않았다.
- 2026-07-26 Task 3: 별도 관리자 command IPC server/client를 구현했다.
  한 connection에서 한 JSON Lines request/reply만 허용하고 client 전체
  deadline 기본값을 3초로 고정했다. Malformed·oversized·multi-frame은
  application dispatch 전에 연결을 종료하며 최대 동시 connection은 8개다.
  Connect/EOF/request-ID mismatch/malformed response는 `unavailable`, 승인·거절
  deadline은 성공이나 실패를 추정하지 않고 `outcome_unknown`으로 반환한다.
  Startup path는 현재 UID가 소유한 실제 socket만 stale path로 제거하고 symlink,
  regular file과 다른 owner는 거부한다. Targeted transport tests 6/6과 전체
  회귀를 통과했으며 bot/web assembly, systemd와 production은 변경하지 않았다.
- 2026-07-26 Task 4: dashboard 관리자 ports를 주입된 IPC transport에 연결하고
  영구 pre-dispatch 감사를 추가했다. 기존 HTTP 경계가 current administrator,
  exact Origin/CSRF, recent OAuth와 confirmation을 통과한 뒤 web 감사가 먼저
  저장되어야 IPC를 호출한다. 목록은 최대 50개와 opaque next cursor를 노출한다.
  IPC unavailable은 503, stale은 409, mutation `outcome_unknown`은 504로
  매핑하며 duplicate 응답은 같은 원 operation ID의 `operation_status`로
  재조정하고 mutation을 반복하지 않는다. Fake transport와 HTTP targeted tests
  14/14를 통과했다. Web/bot main assembly와 production은 변경하지 않았다.
- 2026-07-26 Task 5: bot main의 singleton 승인 뒤 관리자 IPC server를,
  web main의 dashboard ports에 IPC client를 조립했다. 양쪽 feature gate는
  `WAW_ADMIN_COMMAND_IPC_ENABLED=0`이 기본이며 exact `0|1`만 허용한다.
  Duplicate bot은 socket factory/listen 전에 종료하고 정상 shutdown은 admin
  socket, member-role socket, Gateway, DB 순서다. Repository systemd assets는
  전용 `/run/waw-admin-command/admin-command.sock`, mode `0660`, runtime
  directory group `waw-admin-command`와 web supplementary group을 선언하되
  feature는 비활성이다. Asset tests는 web에 bot token이 없고 bot에 OAuth
  secret·CSRF key가 없음을 확인한다. Targeted assembly/capability tests 9/9와
  production asset dry-run을 통과했다. Host unit·group·service는 변경하지 않았다.
- 2026-07-26 Task 6: disposable Ubuntu 24.04와 PostgreSQL 17을 별도 Docker
  network에서 실행하는 process-boundary harness를 추가했다. 실제 `waw-bot`,
  `waw-web`, `unrelated`, `waw-admin-command` identity로 directory `0750`,
  socket `0660`, web 허용과 unrelated 거부를 검증했다. SIGKILL 뒤 owned stale
  socket restart, 64 malformed connection flood, 8 active connection 상한 뒤
  회복, 같은 pending request의 concurrent 승인에서 link 1개만 생성, 50ms
  client timeout 뒤 영구 `operation_status=success`, 강제 audit trigger 실패 시
  request pending 유지와 operation/result 0개를 확인했다. 최종 clean run은
  `admin_command_process_boundary_test_passed`였고 trap 이후 Task 6 container,
  network, image는 각각 0개였다. Production은 변경하지 않았다.
- 2026-07-26 Task 7: 전체 비-PostgreSQL 회귀 `198 pass / 1 intentional
  Windows Unix-path skip`, typecheck, server/web build, production·integration
  asset dry-run과 shell syntax를 통과했다. 새 Ubuntu 24.04/PostgreSQL 17
  harness에서 migration 1~6과 process boundary를 다시 통과했고 종료 뒤
  container/network/image가 각각 0개였다. Runtime/log 경로의 secret·PUUID·
  Riot ID·session/OAuth/CSRF canary 부재와 ADR·PLAN·code·unit의 path, group,
  mode, 32KiB, 15초 TTL, 3초 deadline, 8 connection, 503/409/504 일치를
  확인했다. Production Task 8용 preflight·migration·rollout·rollback
  checklist를 별도 runbook으로 작성했으며 외부 접근·변경은 수행하지 않았다.

## 승인

- Owner decision: Approved — PLAN-0006 bounded implementation sequence를
  Task 순서대로 구현·검증하도록 승인함
- Approved date: 2026-07-26
