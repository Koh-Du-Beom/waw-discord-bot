# PLAN-0012: 대시보드 Riot 계정 단건 연결 해제

- Status: In Progress — Task 8 migrations `0009`/`0010` applied; release staged without activation
- Date: 2026-07-29
- Owner: 프로젝트 소유자
- Related requirements: `FUN-005`, `FUN-015`, `FUN-018`, `OWN-015`, `SEC-001`~`SEC-010`
- Related ADRs: [`ADR-0016`](../adr/ADR-0016-summary-riot-link-and-game-observation.md), [`ADR-0017`](../adr/ADR-0017-dashboard-bot-admin-command-ipc.md), [`ADR-0025`](../adr/ADR-0025-dashboard-riot-link-removal-ipc.md)
- Depends on: PLAN-0005의 Riot link persistence·observation target source,
  PLAN-0006의 production 관리자 IPC·operation result·감사 경계

## 목표

Accepted ADR-0025에 따라 관리자가 canonical dashboard에서 활성 Riot 계정
연결 하나를 안전하게 해제하도록 한다. 기존 Discord 본인 연결 해제 경로와
과거 관측·사건·감사 기록을 유지하면서, dashboard mutation은 web recent-auth
경계와 bot current-role 재확인, optimistic version, operation result 재조정 및
원자 감사를 통과해야 한다.

Local/disposable 구현과 production rollout을 분리한다. 이 Draft 계획의 작성은
제품 코드, migration, 외부 계정, production DB·host·service와 command 등록을
변경하도록 승인하지 않는다.

## 범위

- `riot_account_link.version` additive migration과 workload grant/RLS 보존
- 활성 link read DTO의 `expectedVersion` 추가와 identifier 최소화
- 관리자 IPC version 1의 exact `riot_link_remove` command/result 확장
- Bot-side current administrator 선검사와 단건 soft-delete application service
- Link row lock, stale/duplicate/not-found, terminal result와 감사 원자 transaction
- 해제와 in-flight observation 경합 시 해제 뒤 늦은 결과 저장 방지
- Dashboard administrator-only HTTP mutation, recent OAuth·Origin/CSRF·confirmation
- 단건 확인 dialog, double-submit 방지, stale/unknown 결과와 accessibility
- Local/disposable PostgreSQL·Unix socket·browser 회귀와 redaction 검증
- 별도 owner gate의 migration, immutable release와 production smoke/rollback

## 범위 제외

- Discord 사용자의 기존 `/라이엇계정 연결해제` 동작 재설계
- Batch·wildcard 해제 또는 여러 link를 한 요청에서 처리
- Link row hard delete, 과거 observation/incident/revision/audit 삭제·수정
- PUUID 자동 재할당, pending request 자동 승인, primary account 자동 승격
- Riot RSO 도입, verification method 변경 또는 credential 변경
- Web DB role의 feature-table mutation 권한 확대
- 기존 member-role IPC 또는 admin socket path/group/deadline/frame 상한 변경
- Production migration·배포·실제 계정 해제의 자동 실행

## 선행 조건과 전역 안전 규칙

1. ADR-0025 Accepted와 PLAN-0006 production admin IPC 경계를 authority로 사용한다.
2. Web에는 bot token/feature mutation credential을, bot에는 browser
   session/OAuth/CSRF credential을 추가하지 않는다.
3. Bot current administrator 검사는 link/PUUID 조회보다 먼저 수행한다.
4. PUUID, Riot ID, link ID, raw Discord ID와 browser/session/OAuth/CSRF 값을
   operational log와 public 오류에 기록하지 않는다.
5. 해제는 `removed_at`, `is_primary=false`, `version+1`만 갱신하며 다른 link,
   pending request와 과거 사건을 변경하지 않는다.
6. Timeout은 실패나 성공으로 추정하지 않고 같은 operation ID의 영구 결과만
   조회한다. 새 operation ID 자동 재실행은 금지한다.
7. Audit 또는 terminal result 실패 시 operation claim과 link mutation을 모두
   rollback한다.
8. 각 task는 RED test, 최소 GREEN 구현, targeted test, 관련 회귀와 문서 갱신
   순서로 한 번에 하나씩 수행한다.
9. Protocol version 1, 32 KiB frame, 15초 TTL, 3초 client deadline 또는 최대
   8 connection을 바꿔야 하는 증거가 나오면 구현을 중단하고 owner에게 보고한다.
10. Task 1~7은 production credential 없이 수행하며 Task 8은 별도 exact owner
    승인을 받아야 한다.

## 작업

### Task 1 — Additive link version migration과 read model

- 목적: Active link의 stale-safe dashboard snapshot을 위한 canonical version과
  최소 read DTO를 고정한다.
- 변경 예상 파일: `migrations/0009_riot_link_version.sql`,
  `src/contracts/dashboard.ts`, `src/persistence/dashboard-store.ts`,
  migration/dashboard store tests, migration copy/asset tests
- 테스트: 기존 link의 version `0` backfill, non-null/default/nonnegative
  constraint, 재현 가능한 checksum, RLS/policy/grant 보존, web SELECT-only와
  bot UPDATE capability, DTO exact keys와 PUUID/raw Discord ID 비노출
- 완료 기준: 기존 active/removed link 의미를 바꾸지 않고 모든 row가 유효한
  version을 가지며 dashboard는 `linkId`와 `expectedVersion`만 mutation 식별자로
  받음
- 위험: 현재 migration version과 production historical checksum 충돌
- 롤백: application이 version을 읽지 않도록 되돌리고 additive column은
  삭제하지 않은 채 보존

### Task 2 — IPC command와 terminal result 계약

- 목적: Transport 동작을 바꾸지 않고 protocol version 1에 exact
  `riot_link_remove` request/result를 추가한다.
- 변경 예상 파일: `src/contracts/admin-command-ipc.ts`,
  `src/ipc/admin-command-application.ts`, parser/application contract tests
- 테스트: exact `{linkId,expectedVersion,confirmation:true}`, missing/unknown
  field, false confirmation, malformed/multiple IDs, TTL, 32 KiB/multi-frame,
  allowlisted success/not-found/stale/denied/expired/duplicate/unknown result,
  parser 오류 identifier 비반사
- 완료 기준: generic mutation·batch·SQL·PUUID/Riot ID/raw Discord ID payload를
  거부하고 기존 네 command와 operation status wire contract가 회귀하지 않음
- 위험: Version 1 caller/server의 schema divergence
- 롤백: remove command dispatch만 allowlist에서 제거; 기존 관리자 command 유지

### Task 3 — Bot-side 단건 해제 transaction

- 목적: 권한 선검사, row lock, optimistic version, soft delete와 영구 결과·감사를
  한 application transaction으로 구현한다.
- 변경 예상 파일: `src/ipc/admin-command-application.ts`,
  `src/persistence/postgres-riot-command-store.ts`, 관련 unit/PostgreSQL
  integration tests
- 테스트: administrator success, wrong guild/operator/removed member/
  Discord timeout·429·unavailable 선거부, active/not-found/already-removed/stale,
  두 관리자 동시 해제, duplicate operation, audit/result 강제 실패 rollback,
  다른 link/pending/primary 불변
- 완료 기준: 정확히 한 active link만 `removed_at`, `is_primary=false`,
  `version+1`로 commit되고 terminal result와 audit가 같은 transaction에 있음
- 위험: 기존 Discord 본인 해제 store와 관리자 해제 transaction의 중복 구현
- 롤백: 관리자 dispatch 제거; 기존 Discord caller-scoped 해제 유지

### Task 4 — Observation 경합과 해제 후 제외

- 목적: 해제 이전에 시작된 poll의 늦은 결과가 해제 이후 새 관측으로 저장되지
  않게 하고 다음 target read에서 즉시 제외한다.
- 변경 예상 파일: `src/game/observation-scheduler.ts`,
  `src/persistence/postgres-observation-target-source.ts`,
  `src/persistence/postgres-game-observation-store.ts` 또는 최소 적합한 generation
  guard, 관련 unit/PostgreSQL integration tests
- 테스트: in-flight success/timeout/late result와 동시 해제, 다음 target read
  제외, removed link 결과 미저장, 다른 active link 유지, reconnect reconciliation,
  feature-disabled 경로
- 완료 기준: 해제 commit 이후 해당 link에서 새 evidence/incident가 생기지 않고
  이미 저장된 과거 기록은 byte/row 의미상 유지됨
- 위험: Observation row에 link identity가 없어 race guard를 위해 추가 schema나
  query가 필요할 수 있음
- 롤백: 관리자 해제 UI/dispatch를 비활성화하고 race-safe 설계가 검증되기 전
  production activation 금지; 새로운 material schema 결정이 필요하면 owner에게
  재상신

### Task 5 — Dashboard HTTP port와 accessible 단건 UI

- 목적: 활성 계정 표에 administrator-only 해제 action을 제공하고 web
  pre-dispatch 경계를 기존 관리자 mutation과 동일하게 적용한다.
- 변경 예상 파일: `src/contracts/dashboard.ts`,
  `src/http/dashboard-server.ts`, `src/web/admin-command-dashboard-ports.ts`,
  `src/web/production-dashboard-ports.ts`, `web/api.ts`, `web/app.tsx`,
  관련 HTTP/browser tests와 CSS
- 테스트: operator/read-only 표시, administrator action, exact Origin/CSRF,
  current role, recent OAuth, confirmation, audit-before-dispatch,
  audit failure 미전달, double click/in-flight guard, success/stale/not-found/
  unavailable/outcome-unknown mapping, refresh, focus/keyboard/axe와 360 px overflow
- 완료 기준: 성공은 terminal success일 때만 표시하고 stale/unknown은 목록을
  갱신하며 새 operation ID로 자동 재실행하지 않음
- 위험: Browser confirmation 표시값을 authorization 또는 target identity로
  오인
- 롤백: 해제 route/button만 비활성화하고 active link read table 유지

### Task 6 — Cross-boundary disposable 통합

- 목적: 실제 PostgreSQL 17 transaction과 Unix socket process 경계에서
  authorization·동시성·timeout 재조정·관측 제외를 함께 검증한다.
- 변경 예상 파일: 기존 `src/integration/*`, `deploy/integration/*` fixture와
  관련 runbook
- 테스트: `waw-web` socket 허용/unrelated user 거부, malformed flood와
  8 connection 회복, concurrent remove, response 유실 뒤 operation status,
  audit failure rollback, in-flight observer race, service restart와 cleanup
- 완료 기준: Ubuntu/PostgreSQL fixture에서 mutation·result·audit·observation
  postcondition이 재현되고 container/network/image/temp resource가 0개
- 위험: 단위 fake 결과를 Linux filesystem/real transaction 증거로 오인
- 롤백: disposable resource만 제거; production 영향 없음

### Task 7 — 전체 회귀, redaction, 문서와 immutable candidate 준비

- 목적: Local/disposable 범위를 마감하고 production gate에 필요한 exact
  source/archive/rollback 증거를 준비한다.
- 변경 예상 파일: `PROJECT_STATUS.md`, `CHANGELOG.md`,
  `docs/operations/admin-command-ipc-production-rollout.md`,
  persistence/deployment/security runbook과 release checklist
- 테스트: `TMPDIR=/tmp npm test`, typecheck, build, browser accessibility,
  migration PostgreSQL integration, production asset tests, dependency audit,
  diff check와 PUUID/Riot ID/link/Discord/session/OAuth/CSRF canary scan
- 완료 기준: 실패·skip·환경 경계가 명시되고 ADR/PLAN/code/migration/systemd/
  runbook 계약이 일치하며 exact immutable candidate와 이전 rollback target이
  고정됨
- 위험: 기존 작업의 unrelated dirty changes를 release candidate에 혼입
- 롤백: candidate를 production에 승격하지 않고 local feature path 비활성

### Task 8 — Owner-approved production migration과 staged rollout

- 목적: 별도 exact 승인 뒤 backup, migration, immutable release, bot/web
  activation과 실제 단건 smoke를 단계적으로 수행한다.
- 변경 예상 파일: production approval/checklist/result 문서,
  `PROJECT_STATUS.md`, `CHANGELOG.md`
- 테스트: canonical health, exact current/previous release, migration ledger와
  checksum, 24시간 이내 encrypted backup 및 restore applicability, feature
  capability/credential 경계, active link read, owner-approved synthetic 또는
  명시적으로 승인된 test link 단건 해제, operation/audit/관측 제외, log
  redaction, final health와 rollback
- 완료 기준: 승인된 test target 하나만 종료되고 다른 link/pending/과거 사건은
  불변이며 socket/services/health가 정상이고 rollback target이 유지됨
- 위험: 실제 계정 관측 중단, production schema/service mutation과 복구 불가한
  잘못된 대상 선택
- 롤백: 해제 route/dispatch 비활성, 이전 immutable release 활성화, additive
  version column과 감사/result 보존; 성공한 실제 해제는 자동 복원하지 않고 새
  연결 요청·승인으로 복구

## 검증 계획

- Unit: exact DTO/parser, authorization order, reason mapping, UI state와 가짜 시간
- PostgreSQL 17: migration, row lock/concurrency, operation/result/audit atomicity,
  RLS/grant, observation race와 과거 기록 보존
- HTTP/browser: session/current role/recent OAuth/Origin/CSRF/confirmation,
  double-submit, response reconciliation, keyboard/focus/axe/mobile overflow
- Unix process: existing socket owner/group/mode, unrelated user denial,
  deadline/frame/concurrency bounds와 restart
- Security/redaction: secret 및 identifier canary를 parser error, Fastify error,
  audit DTO, operational log와 journald allowlist에서 검사
- Release: exact source/archive hash, build/prune/audit, migration asset identity,
  current/previous distinct rollback과 canonical `https://waw.dubeom.com/health`

## 배포 및 마이그레이션

1. Task 1~7은 local/disposable이며 production credential과 외부 provider를
   사용하지 않는다.
2. Migration은 additive `0009`(link version)와 `0010`(terminal result
   allowlist)로 작성하고 checksum·RLS·grant 및 기존 row backfill을 disposable
   PostgreSQL 17에서 검증한다.
3. Task 8 전 exact immutable candidate, migration checksum, rollback release,
   read-only production inventory와 fresh encrypted backup/restore applicability를
   고정한다.
4. 별도 migration credential로 pending `0009`, `0010`만 정상 runner 경로에서
   순서대로 적용한다.
5. Bot의 새 command dispatch를 먼저 배포하고 socket/health를 확인한 다음 web
   route/UI를 같은 compatible release에서 노출한다.
6. Smoke target은 owner가 명시적으로 승인한 active test link 하나로 제한하며
   Riot ID, PUUID와 Discord ID를 운영 문서나 log에 기록하지 않는다.
7. 실패 시 web remove route를 차단하고 이전 release로 복귀한다. Additive
   column과 operation/audit 결과는 보존한다.

## 문서 갱신

- ADR-0025 approval과 PLAN-0012 진행 상태
- `PROJECT_STATUS.md`, `CHANGELOG.md`
- Admin IPC production rollout, application persistence, authentication,
  deployment/security와 observation 운영 문서
- Production migration/activation approval request, result와 rollback evidence

## 승인

- Owner decision: Approved — Tasks 1~7의 local/disposable 구현 순서를 승인함.
  한 번에 bounded task 하나만 구현하며 Task 8 production migration·배포·실제
  계정 해제는 별도 exact 승인을 유지함.
- Approved date: 2026-07-29

## 진행 기록

- 2026-07-29 Task 1: Additive migration `0009`로
  `riot_account_link.version bigint not null default 0 check (version >= 0)`을
  추가하고 production migration runner에 version 9를 등록했다. Dashboard
  active-link DTO/query/schema는 PUUID와 raw Discord ID 없이
  `expectedVersion`을 반환한다. Production data-reset guard와 disposable
  fixture도 exact schema versions `1..9`로 갱신했다. RED test는 active-link
  결과의 version 누락을 재현했고, targeted contract/store/HTTP/UI 및 disposable
  PostgreSQL 17 migration suite `49/49`가 PASS했다. Existing row backfill,
  default/non-null/nonnegative constraint, migration ledger, RLS/grant 회귀를
  검증했다. 전체 회귀는 `278 tests / 271 pass / 7 explicit external skips /
  0 fail`이고 typecheck, server/web build, migration asset count `9`, Bash
  syntax와 diff check가 PASS했다. IPC, bot 해제 transaction, observation, UI 해제 action,
  production DB·host·service mutation은 `0`이다.

- 2026-07-29 Tasks 2~7: IPC v1 exact `riot_link_remove` 계약과 terminal
  allowlist migration `0010`, bot current-administrator 선검사, link row lock,
  optimistic version soft delete, operation/result/audit 원자 transaction을
  구현했다. 기존 Discord 본인 해제도 version을 증가시킨다. Observation target과
  evidence write에 link version guard를 전달해 해제 뒤 늦은 poll 결과를
  `stale`로 거부한다. Dashboard에는 administrator-only high-risk route와
  2단계 확인, in-flight 중복 제출 방지 UI를 추가했다. 독립 disposable
  PostgreSQL 17 DB에서 admin transaction, observation late-result guard,
  removed-target 제외 통합 시험을 통과했다. Production credential, migration,
  service, 배포와 실제 계정 mutation은 `0`이며 다음 단계는 Task 8 owner gate다.

- 2026-07-29 Task 8 migration stage: Owner가 exact candidate
  `c7c5ad6a80788e9c756f9bdcc96998551a6622c2`, archive SHA-256
  `717d0bd3f1cbca0861f0406098bff102e8db1db49496b8651e9eccec2025eaf6`,
  migration `0009`/`0010` checksum을 승인했다. Candidate를
  `/opt/waw/releases/c7c5ad6`에 activation 없이 stage하고 정상 runner로
  pending version `9`, `10`만 순서대로 적용했다. Ledger의 이름/checksum,
  `app_schema_version=10`, `riot_account_link.version` bigint/default
  `0`/not-null, public invalid constraint `0`을 read-back했다. One-shot
  credential, SSH/CloudShell/local 임시 자료는 제거했다. Current
  `a2271329230b`, previous `930c22cb669d`, web/bot와 health는 그대로이며
  activation, restart, 배포와 실제 Riot link mutation은 `0`이다.
