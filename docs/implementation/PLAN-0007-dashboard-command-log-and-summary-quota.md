# 구현 계획: 대시보드 명령 로그와 요약 일일 한도

- Status: Approved
- Related requirements: FUN-004, FUN-005, PRI-001 through PRI-003
- Related ADRs: ADR-0007, ADR-0010, ADR-0014, ADR-0016, ADR-0018
- Owner: Product owner

## 목표

승인된 대시보드 디자인에 명령어 사용 로그 테이블과 요약 명령어의 일일
사용량·한도 관리 화면을 추가한다. 한도는 bot의 summary provider 호출 직전에
PostgreSQL에서 원자적으로 강제하며, dashboard는 민감 식별자 없이 상태를
조회하고 관리자만 optimistic concurrency로 한도를 변경한다.

## 범위

- 명령 감사의 redacted cursor pagination read model과 dashboard API
- 한국시간 날짜, 허용 guild·등록 사용자별 quota default·override·counter·reservation
- 기본/초기 일일 한도 10, 설정 가능 범위 1–100
- 기본 한도 상속, 등록 사용자별 1–100 override 또는 사용 중지
- operator/administrator의 사용자별 quota 상태 조회
- administrator-only 기본값·사용자 설정 변경과 원자적 운영·감사 기록
- bot summary 실행 경로의 disabled/exhausted/reserved 결정
- Pretendard 기반 선택 대시보드의 명령 로그 테이블과 quota 관리 UI
- desktop/mobile, keyboard, WCAG AA, 실패·빈 상태 검증
- additive migration, feature gate, rollback 및 운영 문서

## 범위 제외

- Production 배포, `main` 병합 또는 외부 summary provider 활성화
- 명령 메시지 원문, option 값, Discord/guild/channel ID의 dashboard 표시
- PUUID, Riot ID, OAuth code/token, session ID, secret 또는 내부 operation/
  correlation ID 표시
- 명령 감사 event마다 사용자 표시명을 중복 영구 저장
- 요약 사용량 수동 초기화·차감·credit
- rolling 24시간 quota 또는 timezone 선택
- 기존 audit event 내용의 backfill·재작성
- 명령별 비용 계산, provider billing reconciliation 또는 결제 UI

## 선행 조건

- ADR-0018 Accepted
- 등록 사용자별 기본 10회 상속과 개인 override/사용 중지 owner 승인
- 실제 구현 전 현재 migration ledger와 workload role 권한을 disposable
  PostgreSQL에서 재확인할 것
- Production task는 별도 owner gate와 backup/restore 증거 없이는 시작하지 않을 것

## 성공 기준

- 한도 10에서 20개 동시 요청을 실행해 reservation이 정확히 10개만 commit된다.
- 같은 operation 재시도는 사용량을 추가하지 않고 같은 결정을 반환한다.
- 한국시간 자정 전후 요청이 각 날짜의 정확한 counter에 기록된다.
- dashboard에서 등록 사용자별 사용량, 유효 한도, 남은 횟수, 기본/개인 설정과
  다음 초기화 시각을 한국어로 확인할 수 있다.
- administrator는 기본값과 개인 override/사용 중지를 변경할 수 있다.
- 로그 table을 cursor로 끝까지 순회해 중복·누락이 없으며 남은 page를 숨기지 않는다.
- 360 px에서 page horizontal overflow 없이 각 로그 행이 labelled stack으로
  변환되고 모든 action target이 최소 44×44 px다.
- 색상 외 텍스트·아이콘으로 결과를 구분하고 Orca 내장 browser accessibility
  검사에서 serious/critical 위반이 없다.
- API, 로그, fixture와 test output에 금지 식별자·비밀 canary가 없다.

## 작업

### Task 1: 계약 및 실패 테스트 고정

- 목적: ADR 승인 내용을 공개 DTO, quota port, command-log cursor와 오류 의미로
  먼저 고정한다.
- 변경 예상 파일: `src/contracts/dashboard.ts`,
  `src/contracts/dashboard.test.ts`, 신규 quota/command-log domain 파일과 테스트
- 테스트: exact DTO keys, page-size 1–100, malformed cursor, invalid limit
  0/101, Korean-date derivation, redaction canary
- 완료 기준: 구현 전 테스트가 새 endpoint·quota port 부재로 예상대로 실패하고
  raw audit row를 DTO로 직접 반환할 수 없음이 타입과 테스트로 고정됨
- 위험: 내부 audit schema를 public contract로 노출
- 롤백: production code 변경 전 계약 커밋만 되돌림

### Task 2: additive migration과 workload 권한

- 목적: quota default, 등록 사용자, 개인 override, daily counter와 idempotent
  reservation ledger를 다음 additive migration으로 추가한다.
- 변경 예상 파일: 신규 `migrations/0007_*.sql`,
  `src/persistence/migration-checksum.test.ts`, persistence integration tests
- 테스트: migration 1→7 fresh/resume, check/FK/unique constraints, RLS,
  `waw_bot` reserve-only와 `waw_web` aggregate-read/settings-mutation 최소 권한,
  public revoke, previous release read compatibility
- 완료 기준: default 10과 1–100 check, override/disable,
  `(guild, user, date)` counter와 operation reservation unique, unauthorized
  read/update 거부가 실제 PostgreSQL workload role에서 확인됨
- 위험: web role이 raw Discord identifiers를 직접 읽음
- 롤백: 새 feature gate 비활성, additive table/column 미사용·보존

### Task 3: 원자 quota reservation application service

- 목적: summary provider dispatch 전 사용 가능 여부를 한 transaction에서
  결정하고 감사한다.
- 변경 예상 파일: `src/summary/*`, `src/persistence/*`,
  `src/commands/*`, 관련 단위·통합 테스트
- 테스트: 동일 사용자 20-way concurrency/limit 10, 다른 사용자 독립성,
  inheritance, override, user disabled, duplicate operation, exhausted, limit
  lowered below usage, midnight, audit failure, restart, provider timeout/failure
- 완료 기준: accepted reservation만 provider port로 진행하며 quota/audit 중
  하나라도 실패하면 호출하지 않고 fail closed; committed provider attempt는
  결과와 무관하게 1회 유지
- 위험: reservation commit 뒤 provider 호출 전 crash가 1회를 소비
- 롤백: summary provider feature gate 비활성; counter/reservation 보존

### Task 4: redacted command-log read model

- 목적: 기존 `discord.command` audit를 별도 cursor endpoint로 안전하게
  조회한다.
- 변경 예상 파일: `src/persistence/dashboard-store.ts`,
  `src/web/*`, `src/http/dashboard-server.ts`,
  `src/contracts/dashboard.ts`, 관련 테스트
- 테스트: operator/admin read, unauthorized deny, default 50/max 100,
  same-timestamp stable cursor, multi-page full traversal, filters, invalid cursor,
  query plan/index, secret·ID canary
- 완료 기준: table에 필요한 허용 field만 반환하고 actor/guild/channel/event/
  correlation/operation ID와 원문·option은 반환하지 않음
- 위험: 큰 audit table scan 또는 opaque cursor에서 ID 유출
- 롤백: endpoint feature gate 비활성; 기존 `/api/audit` 유지

### Task 5: 사용자별 quota 상태와 administrator setting API

- 목적: 등록 사용자별 사용량·유효 한도·override 상태를 redacted aggregate로
  조회하고 기본값·개인 설정을 안전하게 변경한다.
- 변경 예상 파일: `src/contracts/dashboard.ts`,
  `src/persistence/dashboard-store.ts`, `src/http/dashboard-server.ts`,
  auth/route/store tests
- 테스트: operator/admin read, display label과 opaque UI key, inheritance,
  override/disable/remove override, admin-only mutation, non-admin 선거부,
  CSRF, current role, stale 409, invalid 1–100, audit rollback, unavailable 503
- 완료 기준: global/default와 user mutation이 각 expected version을 사용하고
  audit·operation ledger와 원자 commit되며 browser DTO에 Discord ID가 없음
- 위험: 서로 다른 setting form의 stale version 충돌 UX
- 롤백: quota mutation UI/route 비활성; 저장된 limit 10 유지

### Task 6: 선택된 Pretendard dashboard UI

- 목적: 승인된 Direction A를 현재 React SPA 패턴으로 구현한다.
- 변경 예상 파일: `web/app.tsx`, `web/styles.css`, `web/api.ts`,
  `web/fixtures.ts`, 관련 UI/API/browser tests
- 테스트: loading/empty/error/full pages, log next page, filters, 사용자 검색,
  inheritance/override/disabled/exhausted/conflict/save 결과, focus, keyboard,
  360/768/1280 px, reduced motion, text/icon status cues
- 완료 기준: 명령 로그는 mobile labelled rows로 변환되고, 등록 사용자별
  `used / effective limit`, remaining, 기본/개인 설정, Korean reset time과
  admin controls가 명확함
- 위험: synthetic prototype field를 실제 DTO보다 먼저 구현
- 롤백: 새 UI route/feature gate 비활성, 기존 dashboard shell 유지

### Task 7: 전체 local/disposable 검증과 문서

- 목적: production gate 전 전체 증거와 rollback 문서를 고정한다.
- 변경 예상 파일: `PROJECT_STATUS.md`, `CHANGELOG.md`,
  application persistence/authentication/deployment runbook, test assets
- 테스트: `npm test`, `npm run typecheck`, `npm run build`,
  `npm run test:browser`에 상응하는 Orca 내장 browser 접근성 검증,
  disposable PostgreSQL concurrency/process tests, migration resume,
  `git diff --check`, secret/identifier canary scan
- 완료 기준: 명령·결과·skip이 기록되고 local/disposable 전체 GREEN,
  production credential·host·DB·Portal 변경 0
- 위험: Windows에서 Unix socket 또는 PostgreSQL 검증이 skip됨
- 롤백: 문서에 미검증 범위와 gate 유지

### Task 8: production rollout

- 목적: 별도 owner 승인 뒤 immutable release 절차로 quota enforcement와
  dashboard를 단계적으로 활성화한다.
- 변경 예상 파일: deployment evidence, `PROJECT_STATUS.md`, `CHANGELOG.md`
- 테스트: read-only preflight, fresh encrypted backup와 restore evidence,
  migration 0007 checksum/schema/role, default-off deploy, single bot,
  quota dry run, canonical `/`와 `/health`, logs, rollback rehearsal
- 완료 기준: owner가 exact change set을 승인하고 production에서 limit 10,
  counter/audit, redacted dashboard와 alerting이 검증됨
- 위험: summary 명령 차단, migration/role 오류, quota 날짜 오류
- 롤백: provider/quota/dashboard feature gates 비활성, 이전 immutable release
  활성화, additive data 보존

## 검증 계획

- 시간은 injectable clock과 `Asia/Seoul` formatter 한 구현으로 고정한다.
- 동시성 invariant는 mock가 아니라 disposable PostgreSQL 17 process에서
  검증한다.
- Cursor 전체 순회 결과를 source query와 비교해 누락·중복·silent truncation이
  없음을 확인한다.
- 모든 mutation은 current authorization, CSRF, expected version, operation와
  audit transaction을 포함한다.
- Browser 검증은 Orca 내장 browser만 사용한다. Orca runtime이 사용할 수 없으면
  검증을 완료로 처리하지 않고 blocked evidence로 기록한다.
- 금지 canary는 DTO JSON, operational logs, fixture output, screenshots와
  browser accessibility 결과 전체를 검사한다.

## 배포 및 마이그레이션

1. ADR-0018과 이 계획의 owner 승인을 기록한다.
2. Local unit/UI tests와 disposable PostgreSQL migration/concurrency를 완료한다.
3. Source를 고정하고 clean install/typecheck/build/test evidence를 만든다.
4. 별도 production Gate A에서 metadata-only preflight를 수행한다.
5. 별도 Gate B에서 fresh encrypted backup/restore evidence와 exact change set을
   승인받는다.
6. Additive migration을 적용하고 quota enforcement를 default-off로 배포한다.
7. Counter/read API를 확인한 뒤 bot enforcement, dashboard read, administrator
   mutation UI 순으로 활성화한다.
8. Canonical domain, `/health`, command behavior, audit/redaction과 rollback
   target을 확인한다.

## 문서 갱신

- ADR-0018 승인 기록
- `PROJECT_STATUS.md`, `CHANGELOG.md`
- application persistence, authentication, deployment/security runbook
- dashboard UI 감사와 browser evidence
- migration ledger, workload permission과 rollback evidence

## 가정 및 미해결 사항

- 결정: 한도는 provider invocation 시도 상한이며 날짜 경계는
  `Asia/Seoul` 00:00이다.
- 결정: `(guild, registered user)`별 기본 10회 상속, 개인 override/사용 중지,
  version 1 수동 사용량 reset 제외.
- 결정: 등록 사용자 record의 현재 display label은 private dashboard에
  표시하되 Discord identity key는 browser DTO에 반환하지 않는다.
- 미해결: 현재 audit event에 처리 시간이 없어 prototype의 `처리 시간` 열은
  version 1에서 제외하거나 별도 allowlisted duration 계약 승인이 필요하다.
- 미해결: command audit retention과 quota reservation retention 기간을 제품
  정책/운영 문서에서 확정해야 한다.

## 승인

- Owner decision: Approved registered-user quota design and integration
  preparation on 2026-07-26. Tasks 1–7 remain bounded local/disposable work.
  Task 8 production remains a separate approval gate.
- Approved date: 2026-07-26
