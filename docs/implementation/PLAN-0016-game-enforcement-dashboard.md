# 구현 계획: 검거 대시보드

- Status: Complete — Tasks 1-7 complete; production gates prepared, not approved
- Related requirements: FUN-016, FUN-018, FUN-019, SEC-001, SEC-002
- Related ADRs: ADR-0007, ADR-0010, ADR-0015, ADR-0016, ADR-0017, ADR-0027, ADR-0028, ADR-0030 (Accepted)
- Owner: Product owner

## 목표

승인될 경우 canonical dashboard에서 스택, 진행 중 관측과 사건 이력을 안전하게
조회하고 관리자가 기존 사건 transaction으로 정정·취소할 수 있게 한다.

## 범위

- 스택·진행 중 상태·사건 이력의 bounded read model과 API
- operator/administrator 조회와 administrator-only 정정·취소
- existing admin IPC의 exact command 확장과 terminal result 재조정
- desktop/mobile, keyboard와 axe 접근성
- 관측 freshness와 `unknown`의 명시적 표시
- effective 감지 정책의 read-only 표시

## 범위 제외

- 감지 정책의 web 변경
- Web DB write grant 또는 bot token 공유
- SSE/WebSocket과 public bot API
- 과거에 덮어써진 사건 복원, 사건 hard delete와 stack 수동 가감
- production migration, 배포, restart와 실제 사건 mutation

## 선행 조건

- Owner가 ADR-0030을 Accepted로 전환한다.
- 정정과 취소를 high-risk로 취급하는 제안과 첫 slice의 정책 read-only 제한을
  명시적으로 승인한다.
- production 작업은 local/disposable 완료 뒤 별도 exact gate로 분리한다.

## 작업

### Task 1: Read DTO와 query contract

- 목적: 스택, 진행 중 관측과 사건 이력의 최소 allowlisted DTO와 stable cursor를 정의한다.
- 변경 예상 파일: `src/contracts/dashboard.ts`, `src/persistence/dashboard-store.ts`, 관련 test
- 테스트: pagination tie-break, filter, empty page, PUUID/raw evidence 비노출
- 완료 기준: page 최대 100과 결정적 정렬이 보장되고 기존 Discord 집계와 스택이 일치함
- 위험: join fan-out과 오래된 표시명
- 롤백: 신규 query와 DTO만 제거
- 결과: 2026-08-01 완료. allowlisted stack/active/history DTO, 분리된 Riot·Go
  Live 관측시각, single-active-link Riot ID, `(updated_at, incident_id)` cursor와
  1~100 page validation을 구현했다. Targeted `15/15`, 전체
  `290 pass / 8 external PostgreSQL skips / 0 fail`, typecheck와 build가 PASS했다.

### Task 2: Read HTTP authorization

- 목적: 기존 protected read 경계에 세 query를 추가한다.
- 변경 예상 파일: `src/http/dashboard-server.ts`, `src/web/production-dashboard-ports.ts`, 관련 test
- 테스트: operator/admin 허용, unauthenticated/member/revoked/cache-expired/unavailable 거부
- 완료 기준: 인증 실패에서 port를 호출하지 않고 schema 밖 field를 직렬화하지 않음
- 위험: route별 권한 drift
- 롤백: 신규 route 등록 제거
- 결과: 2026-08-01 완료. `/api/game/stacks`, `/api/game/active`,
  `/api/game/incidents`를 production dashboard port에 연결하고 response allowlist,
  history filter·1~100 limit validation을 추가했다. Operator와 administrator read를
  허용하고 unauthenticated, unauthorized, expired/unavailable role evidence를 port
  호출 전에 거부한다. Targeted `28/28`, 전체
  `293 pass / 8 external PostgreSQL skips / 0 fail`, typecheck와 build가 PASS했다.

### Task 3: 몰랭 UI read slice

- 목적: 스택, 진행 중 상태, 사건 이력과 freshness를 반응형 UI로 표시한다.
- 변경 예상 파일: `web/app.tsx`, `web/api.ts`, `web/styles.css`, browser/unit test
- 테스트: loading/empty/error, unknown/stale, pagination/filter, keyboard와 axe
- 완료 기준: mobile/desktop에서 Riot·Go Live 증거를 구분하고 stale 상태를 현재로 표현하지 않음
- 위험: 색상만으로 판정을 전달하거나 자동 refresh가 audit query를 유발함
- 롤백: tab과 client query 제거
- 결과: 2026-08-01 완료. Lazy-loaded 몰랭 tab에 스택, 진행 관측, 사건 이력,
  상태·표시명 filter와 cursor 이전/다음을 추가했다. Riot/Go Live는 별도 상태와
  시각으로 표시하고 unknown·시각 없음·3분 초과 오래됨을 텍스트로 구분한다.
  Loading/empty/error/retry, filter/pagination과 identifier-free URL을 검증했다.
  Targeted `22/22`, 전체 `297 pass / 8 external PostgreSQL skips / 0 fail`,
  browser axe/keyboard `2/2`, typecheck와 build가 PASS했다. Effective freshness를
  API로 제공하기 전에는 현재 accepted production 값 3분을 UI 표시 기준으로 쓴다.

### Task 4: 사건 mutation IPC contract

- 목적: exact versioned `game_incident_correct|cancel`과 operation status 결과를 추가한다.
- 변경 예상 파일: `src/contracts/admin-command-ipc.ts`, `src/ipc/*`, `src/game/incident-service.ts`, 관련 test
- 테스트: schema/size, unknown command, current-admin deny, stale version, duplicate/timeout reconciliation
- 완료 기준: bot이 current administrator를 재확인하고 기존 사건 불변식을 재사용함
- 위험: Discord 명령과 dashboard transaction drift
- 롤백: 두 allowlist command 제거, 기존 사건 데이터 불변
- 결과: 2026-08-01 완료. Exact `game_incident_correct|cancel` payload에 사건 ID,
  expected version, 1~500자 단일행 reason과 explicit confirmation을 요구한다. Bot은
  target 접근 전에 current administrator를 재확인하고 기존 incident 상태 전이,
  revision과 audit transaction에 terminal `admin_command_result`를 함께 기록한다.
  Duplicate operation과 timeout 뒤 `operation_status` 재조정을 지원한다. Production
  migration·socket·실제 사건 변경은 수행하지 않았다.

### Task 5: High-risk HTTP와 UI 확인

- 목적: recent OAuth·CSRF·명시적 확인 뒤 정정·취소를 실행한다.
- 변경 예상 파일: `src/http/dashboard-server.ts`, `src/web/admin-command-dashboard-ports.ts`, `web/*`, 관련 test
- 테스트: operator deny, stale auth, CSRF/Origin, confirmation, reason bounds, double click와 stale snapshot
- 완료 기준: 관리자만 한 사건을 exact version으로 변경하고 terminal result를 사용자에게 표시함
- 위험: timeout 후 새 operation ID로 중복 실행
- 롤백: mutation route/control 제거, read-only 유지
- 결과: 2026-08-01 완료. `/api/game/incidents/correct|cancel`은 administrator,
  current-role, exact Origin·session-bound CSRF, 15분 이내 OAuth와 explicit
  confirmation을 요구한다. 1~500자 단일행 reason과 expected version만 기존 admin
  IPC port에 전달한다. UI는 관리자에게만 정정·취소를 표시하고 사유와 별도 확인
  checkbox를 요구하며 double submit을 차단한다. Conflict는 최신 history를 다시
  읽고 timeout은 새 mutation을 보내지 않도록 불명확한 결과로 안내한다. Production
  route activation, migration, service restart와 실제 사건 변경은 수행하지 않았다.
  Targeted HTTP/port/API `26/26`, UI `21/21`, browser keyboard·axe `2/2`, 전체
  `308 pass / 8 external PostgreSQL skips / 0 fail`, typecheck와 build가 PASS했다.

### Task 6: Disposable PostgreSQL와 browser 통합

- 목적: query와 mutation의 실제 schema/RLS/transaction/accessibility 경계를 검증한다.
- 변경 예상 파일: PostgreSQL integration test, browser test, 필요 시 additive index migration
- 테스트: operator read role, web write deny, revision/result/audit atomicity, 100건 page, axe
- 완료 기준: PostgreSQL 17 fixture와 Chromium에서 전체 slice가 통과함
- 위험: query plan 또는 index migration 비용
- 롤백: application 변경 복귀; additive index는 안전성 확인 후 유지 가능
- 결과: 2026-08-01 완료. PostgreSQL 17 disposable container에서 migration 0012를
  포함한 실제 schema와 workload role을 검증했다. `waw_web` 상속 role은 game read
  model의 100+1 cursor page와 stack을 읽지만 incident update와 revision insert는
  permission denied다. `waw_bot` 상속 role의 dashboard mutation은 operation claim,
  incident version/status, revision, terminal result와 audit를 한 transaction에
  commit하며 terminal-result trigger 실패 시 여섯 상태가 모두 rollback된다. 같은
  operation은 revision/result를 중복하지 않고 기존 Discord mutation은 terminal
  admin result 없이 기존 revision/audit 불변식을 유지한다. PostgreSQL container
  전체 `325 pass / 7 external-fixture skips / 0 fail`, 실제 PostgreSQL file `16/16`,
  Chromium keyboard·axe `2/2`, local `308 pass / 8 host-tool skips / 0 fail`,
  typecheck/build/diff가 PASS했다. 101건 경계에서 추가 index migration 근거가 없어
  schema를 늘리지 않았다. Production 변경은 수행하지 않았다.

### Task 7: 문서와 별도 production gate

- 목적: 운영·보안·복구 문서와 exact production 승인 절차를 준비한다.
- 변경 예상 파일: `README.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`, operations handoff
- 테스트: build artifact, migration checksum, credential/capability diff, rollback fixture
- 완료 기준: local/disposable 증거와 별도 owner-approved production gate가 분리됨
- 위험: 계획 승인을 production 실행 승인으로 오인
- 롤백: production 작업을 실행하지 않고 문서만 보존
- 결과: 2026-08-01 완료. 운영·보안·health·장애·rollback runbook과 production
  handoff를 작성하고 Gate A read-only preflight, Gate B backup/restore와 migration
  0012, Gate C IPC-off immutable release, Gate D administrator IPC activation을 서로
  독립된 승인으로 분리했다. 현재 dirty commit은 release candidate가 아니며 모든 gate는
  `Not approved`다. 문서 contract `3/3`이 migration checksum, default-off capability,
  rollback 및 금지사항을 검증했다. Production 변경은 수행하지 않았다.

## 검증 계획

- Task별 targeted unit/HTTP/browser test
- `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser`
- PostgreSQL 17 disposable integration과 `git diff --check`
- identifier·reason·credential canary가 운영 로그에 없는지 확인

## 배포 및 마이그레이션

이 계획의 완료는 production 변경을 승인하지 않는다. Migration 0012, exact release,
backup/restore, rollback과 administrator IPC activation은 준비된 Gate A–D에서 각각
별도 owner 승인을 받아야 한다.

## 문서 갱신

- README 기능·검증 명령
- PROJECT_STATUS 실시간 상태
- CHANGELOG 사용자 가시 변경
- 운영 runbook의 health, rollback과 권한 확인

## 승인

- Owner decision: Approved — Task 1부터 bounded 순차 구현, production 변경 제외
- Approved date: 2026-08-01
