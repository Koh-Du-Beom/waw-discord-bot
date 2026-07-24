# PLAN-0004: application production 구현과 단계적 rollout

- Status: In Progress — Tasks 1~2 local/disposable and G1 production migration complete; G2/G3 and production migration `0003` pending
- Date: 2026-07-23
- Owner: Project owner
- Related requirements: `FUN-001`~`FUN-020`, `DAT-001`~`DAT-004`, `OPS-001`~`OPS-008`, `SEC-001`~`SEC-010`, `DEP-001`~`DEP-002`, `QUA-001`~`QUA-002`, `OWN-022`~`OWN-034`
- Related ADRs: [`ADR-0001`](../adr/ADR-0001-single-persistent-server-boundary.md), [`ADR-0004`](../adr/ADR-0004-typescript-node-discordjs.md), [`ADR-0006`](../adr/ADR-0006-supabase-free-postgresql-storage.md), [`ADR-0007`](../adr/ADR-0007-discord-oauth-opaque-session.md), [`ADR-0010`](../adr/ADR-0010-fastify-react-dashboard.md), [`ADR-0011`](../adr/ADR-0011-systemd-direct-application-deployment.md), [`ADR-0012`](../adr/ADR-0012-caddy-https-ingress.md), [`ADR-0013`](../adr/ADR-0013-systemd-application-credentials.md), [`ADR-0014`](../adr/ADR-0014-journald-retention-redaction-alerting.md)
- Depends on: Completed [`PLAN-0001`](./PLAN-0001-single-server-boundary-foundation.md), [`PLAN-0002`](./PLAN-0002-s3-encrypted-backup-restore.md), [`PLAN-0003`](./PLAN-0003-journald-retention-redaction-alerting.md)

## 목표

이미 승인된 application, authentication, persistence, deployment, ingress, credential과 monitoring 결정을 실제 product vertical slice와 production 운영 경계로 연결한다. 각 Task는 먼저 실패하는 local 또는 disposable test로 계약을 고정하고, credential이나 외부 resource가 필요한 단계는 별도 owner 승인 뒤에만 실행한다.

이 계획은 승인된 구현 순서와 독립 승인 경계를 기록한다. PLAN 승인 자체는 production Supabase migration, Discord credential 사용, AWS resource 변경, application 배포, DNS·firewall·certificate 변경 또는 최초 journald vacuum을 승인하지 않는다.

## 현재 상태와 구현 공백

### 구현되어 있고 fresh test로 재검증할 계약

- `src/contracts/local-command.ts`: operation ID validation, expiry와 in-memory duplicate 판정
- `migrations/0001_auth_and_operations.sql` + `0002_application_persistence.sql`: production legacy v1 baseline과 forward application persistence upgrade
- `src/persistence/session-store.ts`: session hash, idle/absolute expiry, revoke와 in-memory store
- `src/auth/authorization.ts`: OAuth state single-use/expiry, 5분 read cache, mutation default-deny와 15분 high-risk recent-auth
- `src/runtime/capabilities.ts`: web/bot capability shape의 합성 분리
- `src/runtime/health.ts`: storage/Gateway health 집계와 in-memory singleton lease
- `src/backup/`와 production backup assets: encrypted publication/restore 계약과 이미 운영 중인 daily backup
- `src/operations/`, journald/monitor assets: allowlist logging, alert evaluation과 backup-only production monitoring

### 아직 구현되지 않았거나 production 증거가 없는 경계

- Production에는 historical v1 baseline만 존재하고 `0002` workload role/grant/RLS policy는 아직 적용되지 않았다.
- PostgreSQL adapter와 migration transaction은 구현됐지만 production connection lifecycle, retry와 cleanup job은 아직 없다.
- Discord OAuth framework-neutral authorize/callback, code exchange, exact redirect,
  browser-bound state, secure cookie rotation/logout, CSRF/Origin과 provider failure
  mapping은 local/disposable에서 구현했다. Actual OAuth round trip은 G2 pending이다.
- Discord current member/role port와 local authorization composition은 구현했지만
  actual bot-side adapter와 credential/intents integration은 G3 pending이다.
- Product `package.json`에는 Fastify, React, React Router, Vite와 discord.js가 없다. Fastify server/routes/schema/DTO, static SPA serving, React dashboard와 browser accessibility test가 없다. 기존 dashboard 코드는 폐기 가능한 research Spike다.
- discord.js Gateway client, Ready/Resume/reconnect/reconciliation, process singleton lease, graceful shutdown과 health heartbeat adapter가 없다.
- `waw-web.service`, `waw-bot.service`, application installer/release switch, production Caddyfile과 application rollback runbook이 없다.
- Production monitor는 backup-only 범위다. Web/bot unit, loopback health와 canonical certificate monitoring은 의도적으로 비활성화되어 있다.
- Production application operator의 최소 AWS 권한과 root 비상 접근 절차는 아직 실행 가능한 policy/runbook으로 고정되지 않았다.

현재 local test double과 disposable Spike는 실제 adapter, route, Gateway 또는 production rollout 완료 증거로 취급하지 않는다.

## 범위

- Supabase migration과 최소 PostgreSQL persistence adapter
- Discord OAuth callback, opaque session lifecycle, guild/role authorization
- Fastify API와 React SPA의 최소 운영 dashboard vertical slice
- discord.js Gateway runtime, singleton, reconciliation과 health 연결
- systemd credential 격리 및 disposable Ubuntu 24.04 통합 Spike
- owner-approved 서울 Lightsail application/Caddy 배포
- `waw.dubeom.com` DNS, HTTPS, OAuth redirect와 monitoring 확장
- 최소 권한 production operator, DB 용량/backup freshness 경보와 restore rehearsal

최소 vertical slice는 로그인, session 확인, 현재 권한 확인, overall health·Gateway·storage·last backup 조회와 하나의 낮은 위험 설정 mutation 및 audit 확인까지만 포함한다. Product policy의 전체 Dashboard, Logs, 몰랭, Settings와 Operations 화면을 한 번에 구현하지 않는다.

## 범위 제외와 후속 gate

- GPT 기반 대화 요약과 AI provider credential·비용·원문 처리
- Riot API, RSO, Riot 계정 연결과 몰랭 자동 감지
- KBO 공급자 연동
- Dashboard의 수동 restore 실행
- Multi-host, queue, public web→bot API, Docker와 managed load balancer
- 최초 production journald vacuum

GPT 기능은 공급자·모델·비용·보존 경계의 별도 research/Proposed ADR/owner 승인 뒤에만 시작한다. Riot/RSO는 production key/RSO 승인과 5분 감지 가능성의 별도 gate 뒤에만 시작한다. 두 기능 모두 PLAN-0004 success criterion에 포함하지 않고 placeholder route, dependency 또는 credential도 미리 추가하지 않는다. KBO도 기존 공급 권리 gate를 유지한다.

## 전역 안전 규칙과 선행 조건

1. Task는 번호 순서대로 진행하며 한 세션에는 owner가 승인한 bounded Task 하나만 구현한다.
2. 각 Task는 RED 증거를 기록한 뒤 최소 GREEN 구현, targeted test, 전체 test/typecheck와 문서 갱신 순서로 진행한다.
3. 실제 secret 값, OAuth code/token, raw session ID/cookie, Discord message 원문, database password/URL, AWS key와 webhook URL은 chat, Git, shell trace, process argument, journal과 test output에 남기지 않는다.
4. Existing production backup timer/job, S3 bucket/writer/lifecycle, journald config, monitor timer/webhook, Lightsail alarm을 inventory하고 각 Task 전후 active/enabled 및 last-known-good 상태를 확인한다. Application 작업 때문에 이들을 변경·중단하지 않는다.
5. Production Supabase migration, Discord OAuth credential, Discord bot token, AWS production mutation, application/Caddy 배포, DNS, firewall와 public certificate는 각각 별도 owner 승인 없이는 실행하지 않는다. 앞 Task 승인이나 PLAN-0004 승인은 뒤 gate를 승인하지 않는다.
6. 최초 journald vacuum은 이 계획 전체에서 실행하지 않는다. 필요 시 별도 maintenance plan과 owner 승인을 요구한다.
7. 새 material architecture decision, Accepted ADR과 불일치, provider 제약으로 인한 contract 변경이 발견되면 해당 Task를 중단하고 Proposed ADR로 분리한다.
8. Production migration 전에 최신 verified encrypted backup이 24시간 이내인지 확인하고, migration과 호환되는 새 pre-migration archive를 publish/verify한다. 원본 Supabase로 restore하지 않는다.
9. 모든 clock, random, provider와 network dependency는 test adapter로 격리하고 browser·HTTP·DB·Gateway 경계에서 입력과 output allowlist를 검증한다.

## Credential 및 외부 변경 gate

| Gate | 별도 owner 승인이 필요한 입력/변경 | 허용 전 가능한 작업 | 성공 뒤 즉시 확인할 항목 |
|---|---|---|---|
| G1 | Production Supabase migration credential과 schema 변경 | local PostgreSQL migration/adapter test, SQL review | schema version, grants/RLS, backup freshness, secret/log absence |
| G2 | Discord OAuth app secret과 redirect 등록/변경 | fake provider HTTP contract, synthetic callback tests | exact redirect, token 미보존, cookie flags, revoke/rotation |
| G3 | Discord bot token 또는 별도 integration bot/app | fake Gateway tests와 synthetic credential isolation | one Gateway owner, intents, role lookup, token/log absence |
| G4 | Disposable AWS Ubuntu resource와 integration credential | local systemd asset review | cleanup counts `0`, cross-read deny, rollback, no production impact |
| G5 | Production operator IAM 생성/변경과 Lightsail application/Caddy 배포 | policy simulation/read-only inventory | caller identity non-root, exact release, units/ports, backup/monitor survival |
| G6 | DNS, firewall, public ACME, production OAuth redirect | local Caddy/canonical-origin test | DNS/TLS/redirect/cookie, port inventory, rollback readiness |
| G7 | Monitoring config의 web/bot/health/certificate 범위 변경과 actual alert test | synthetic evaluator/test fixture | firing/recovery, existing backup/host alarm 유지, no vacuum |

## Task 1 — 실제 Supabase migration과 최소 persistence adapter

### 목적과 범위

- Existing SQL 초안을 forward-only, transactional migration으로 검토하고 production workload별 role/grant/RLS policy를 명시한다.
- Session, OAuth state, role cache, operation dedupe와 audit append의 최소 PostgreSQL adapter를 구현한다.
- Web runtime role은 필요한 session/query/mutation/audit 권한만, bot role은 필요한 current-role 관련 data만, migration/backup role은 기존 분리를 유지한다. Browser에는 Supabase credential을 제공하지 않는다.
- Session ID는 hash만, audit에는 allowlisted metadata만 저장하며 OAuth token과 Discord 원문은 schema와 query parameter에 포함하지 않는다.
- Supabase DB 크기와 quota 관측 query, migration/backup freshness marker를 non-secret operational snapshot에 연결한다.

### 예상 변경 파일

- `migrations/0001_auth_and_operations.sql` 및 필요한 후속 versioned migration
- `src/persistence/`의 PostgreSQL adapter와 co-located tests
- product dependency/lockfile
- migration/connection credential loader
- persistence contract 및 migration runbook

### RED

- Empty disposable/local PostgreSQL에서 migration 순서·두 번 적용 거부/안전성, FK/check/RLS/grant와 schema version 기대 test를 먼저 실패시킨다.
- Concurrent duplicate operation, session rotation/revoke, idle touch upper bound, absolute expiry, expired OAuth state, role cache expiry와 transaction rollback integration test를 실패시킨다.
- Web/bot/migration role별 허용 query와 forbidden table/action deny test를 실패시킨다.
- DB URL/password, raw session/OAuth canary가 error/log/backup manifest에 없다는 failure-path test를 실패시킨다.

### GREEN

- 최소 driver와 parameterized query만 추가하고 adapter를 기존 domain contract 뒤에 둔다.
- Production-free PostgreSQL fixture에서 migration→adapter contract→rollback/failure test를 통과시킨다.
- G1 승인 뒤 production preflight에서 current schema, active connections, latest verified backup과 size를 read-only 확인하고 pre-migration verified archive를 만든다.
- 승인된 migration identity로 한 번 적용하고 schema version, grants/RLS, application-role smoke와 backup timer/monitor 생존을 read-back한다.

### 성공 기준

- Local/disposable PostgreSQL integration test와 전체 test/typecheck가 통과한다.
- Production 실행이 승인된 경우 schema version과 role deny matrix가 기대와 일치하고 previous verified backup 및 새 pre-migration verified backup이 존재한다.
- DB 크기 snapshot이 수집되고 Free quota 대비 warning 기준이 계산 가능하다.
- Credential, OAuth token, raw session과 Discord 원문이 DB/log/test artifact에 없다.

### Rollback

- 기본 전략은 backward-compatible expand migration이다. Application은 아직 production traffic을 받지 않으므로 새 table/policy 사용을 중단하고 adapter/release를 되돌릴 수 있어야 한다.
- Applied migration을 임의 `down` SQL로 파괴하지 않는다. 잘못된 production schema는 application credential을 revoke/disable하고 owner-approved empty-target restore 또는 reviewed corrective forward migration으로 복구한다.
- Production restore는 별도 owner 승인 없이는 실행하지 않으며 original Supabase project에 덮어쓰지 않는다.

### Credential gate

- Local/disposable DB는 synthetic credential만 사용한다.
- Production migration은 G1의 정확한 project, role, backup freshness, SQL hash/diff와 maintenance window를 owner가 승인한 뒤 실행한다.
- Existing backup role/S3 writer credential을 application migration에 재사용하지 않는다.

### 2026-07-23 local/disposable 실행 결과

- RED: PostgreSQL adapter 부재로 integration test가 `ERR_MODULE_NOT_FOUND`로 실패하는 것을 먼저 확인했다.
- GREEN: Exact `pg@8.22.0`과 `@types/pg@8.20.0`을 lock하고 transactional migration runner, parameterized PostgreSQL adapter와 systemd file-credential loader를 추가했다.
- Disposable Homebrew PostgreSQL 17.10 cluster에서 migration checksum/version, 재적용 거부, broken migration rollback, RLS·foreign key와 실제 web/bot role allow/deny를 검증했다.
- Session rotation/revoke·idle absolute clamp, OAuth state single-use/expiry, 5분 role cache, 16개 concurrent operation 중 단일 winner와 audit failure transaction rollback을 검증했다.
- DB size/quota snapshot은 numeric/fixed status만 반환하고 invalid provider path의 database password, raw session과 OAuth canary가 serialized failure에 없음을 확인했다.
- 첫 GREEN 과정에서 Node strip-only parameter property, `pg_ctl` log descriptor 대기와 idle-expired touch fixture 결함을 발견해 production code 범위를 넓히지 않고 수정했다. 중단된 두 temporary cluster/process/directory도 명시적으로 정리했다.
- Exact-lock clean install 뒤 targeted persistence tests `7/7`, 전체 tests `46/46`, typecheck, audit `0`, diff check와 disposable process/directory count `0`을 fresh run으로 확인했다.
- 승인된 read-only production preflight에서 PostgreSQL 17.6, DB `10,661,011` bytes, 다른 active connection 5개, role-create 가능/non-superuser identity와 legacy schema version 1을 확인했다. Application row count는 모두 0이고 workload role/policy/migration ledger는 없었다.
- 기존 production v1과 expanded `0001` 충돌을 발견해 historical `0001`을 보존하고 forward `0002`로 분리했다. Exact legacy fingerprint adoption, mismatch 거부, interrupted sequence resume와 checksum mismatch test를 추가해 전체 `49/49`를 통과했다.
- SQL editor 첫 시도에서 stale `alter role waw_backup bypassrls`가 함께 실행됐으나 bootstrap contract와 동일한 기존 상태였고 privilege read-back상 effective change는 없었다. 이후 새 empty snippet만 사용했다.
- Lightsail alarm은 read-only로 확인했다. `2026-07-23T06:03:30Z` host read-back에서 backup/monitor timer active/enabled, 두 service Result `success`, journald active, latest publication age 10,398초·status `published`·schema version 1·row count 0, marker/monitor credential mode `0600`, journal 35.9MB와 free disk 37,456,715,776 bytes를 확인했다.
- Production schema migration, 새 backup, credential materialization, timer/journald/monitoring 변경과 최초 vacuum은 실행하지 않았다. G1 mutation은 별도 owner 승인 전까지 pending이며 Task 2로 진행하지 않는다.
- G1 승인 뒤 새 encrypted pre-migration archive를 `2026-07-23T06:22:56Z`에 publish했다. Schema version 1, row count 0, encrypted bytes 7,084, invariant `constraints_valid`, backup service result `success`를 확인했다.
- `2026-07-24` exact-object reader로 archive/manifest만 download하고 다른 object Get, Put, Delete가 거부됨을 확인했다. Ciphertext SHA-256/7,084 bytes와 manifest가 일치했고 wrong identity는 실패했다.
- Disposable PostgreSQL 17 empty target restore에서 schema version 1, row count 0, invalid constraint 0을 확인한 뒤 temporary IAM user/key/policy, archive/manifest/dump, SSH key와 container를 제거했다.
- Production legacy v1 fingerprint를 재확인하고 approved hashes의 baseline ledger adoption과 `0002`를 단일 transaction으로 적용했다. Read-back은 versions `[1,2]`, checksum 2개 일치, RLS table 5개, policy 6개, expected role/grant/deny matrix, row count 0와 invalid constraint 0이었다.
- Backup/monitor timers와 journald는 active, timers는 enabled, 두 service Result는 `success`, Lightsail alarm은 `OK`였다. 최초 vacuum과 Task 2는 실행하지 않았다.
- 별도 운영 결함: 실제 suppression 0건에서 `journalctl --grep` no-match exit `1`을 invalid로 처리해 `journal.dropped` false critical이 유지됐다. Empty stdout/stderr를 동반한 exit `1`만 suppression 0으로 처리하고 다른 실패는 invalid로 유지하는 fix를 production에 atomic 배포했다. 10회 clear 뒤 resolved 전달, installed hash, monitor/backup timers와 service results, journald, Lightsail alarm `OK`와 temporary artifact cleanup을 확인했다.

## Task 2 — Discord OAuth callback, opaque session, guild/role authorization

### 목적과 범위

- Authorization Code `identify` login 시작/callback, exact state consume, code exchange, identity fetch와 token 즉시 폐기를 구현한다.
- Callback 성공 시 high-entropy opaque session을 rotation 발급하고 `__Host-` Secure/HttpOnly/Path `/`/Domain 없음 cookie로 보낸다.
- 1일 idle, 7일 absolute, logout/revoke, CSRF와 exact production Origin contract를 HTTP adapter까지 연결한다.
- Allowed guild와 role mapping은 server-side config로 읽고 Discord bot-side member reader를 통해 현재 authorization tier를 판정한다.
- Read-only는 성공한 5분 cache만 허용하고 mutation은 current role, high-risk는 15분 recent OAuth와 명시적 확인을 요구한다.

### 예상 변경 파일

- `src/auth/` provider/session service와 tests
- `src/adapters/discord/` OAuth identity 및 member-role port
- Task 3에서 조립할 route handler 또는 framework-neutral callback handler
- secure configuration schema와 auth runbook

### RED

- State mismatch/reuse/expiry, redirect mismatch, provider timeout/401/403/429/5xx, malformed identity와 wrong guild/role deny test를 실패시킨다.
- Callback replay, session fixation, revoked/idle/absolute expired session, logout rotation과 concurrent callback test를 실패시킨다.
- Read cache 5분 경계, mutation cache 거부, current role loss, CSRF/Origin 실패와 high-risk recent-auth/confirmation test를 실패시킨다.
- Fake provider가 반환한 code/access/refresh token과 raw session/cookie canary가 persistence, response body, audit/operational log와 thrown error에 없다는 test를 실패시킨다.

### GREEN

- Network provider와 member lookup을 narrow adapter로 구현하고 bounded timeout/429 handling 및 normalized reason code만 반환한다.
- Token은 callback stack의 최소 수명 동안만 memory에서 사용하고 persistence adapter에는 identity와 authorization evidence만 전달한다.
- Session rotation을 transaction으로 처리하고 authorization failure는 default-deny한다.
- Actual OAuth round trip은 G2 승인과 exact redirect가 준비된 환경에서만 수행한다. Actual role lookup은 G3의 bot-side adapter가 준비될 때 integration completion으로 승격한다.

### 성공 기준

- Synthetic provider/session/role integration tests가 모든 allow/deny/failure path에서 통과한다.
- Actual credential gate가 승인된 경우 허용 operator login, wrong guild/role deny, logout/revoke와 token 미보존 scan이 통과한다.
- Cookie, redirect와 Origin은 environment allowlist에 따라 exact match하며 arbitrary preview login은 비활성화된다.

### Rollback

- OAuth callback과 login entry를 비활성화하고 모든 새 session을 revoke한다. Provider credential/redirect를 직전 상태로 복구하거나 새 credential을 revoke한다.
- Existing database/audit records는 파괴하지 않고 versioned cleanup policy로 만료시킨다.

### Credential gate

- G2 전에는 fake provider만 사용한다.
- Actual OAuth app secret, redirect 등록과 callback 실행은 별도 owner 승인을 받는다.
- Discord user token은 어떤 환경에서도 저장하지 않는다. Bot token은 web process에 주입하지 않는다.

### Local/disposable result — 2026-07-24

- Browser-bound single-use state, callback length limits, opaque callback/session
  rotation, 1일 idle/7일 absolute expiry, logout/revoke, current role, 5분 read
  cache, CSRF/Origin과 high-risk recent-auth/confirmation contract를 구현했다.
- Privilege tier change는 기존 absolute expiry를 연장하지 않고 session을
  rotation한다. 이를 위해 아직 production에 적용되지 않은 `0003` candidate에서
  잘못된 `last_oauth_completed_at >= created_at` 하한을 제거하고
  `last_oauth_completed_at <= last_seen_at` 검증은 유지했다.
- Candidate `0003` SHA-256은
  `7c807c9113524103eed0314565ac6263facc49098e1d0c5eedf13038ddb97a5f`다.
- Targeted auth `21/21`, disposable PostgreSQL `10/10`, 전체 `90/90`,
  typecheck와 diff check가 통과했다. G2/G3, Supabase와 production migration
  `0003`은 실행하지 않았다.
- 운영 계약과 gate는
  [`authentication-runbook`](../operations/authentication-runbook.md)에 기록했다.

## Task 3 — 최소 Fastify API와 React dashboard vertical slice

### 목적과 범위

- Exact versions의 Fastify, Vite, React와 React Router를 clean install/audit/license/provenance 검토 후 lockfile에 고정한다.
- Fastify가 login/callback/session/logout, protected health/backup read와 하나의 낮은 위험 설정 mutation/audit query를 제공한다.
- 모든 request schema는 추가 field 제거/coercion 없이 거부하고 response DTO는 allowlist로 직렬화한다.
- React SPA는 login, loading, denied, unavailable, degraded와 success를 구분하고 keyboard/label/focus/error 접근성을 갖춘 최소 화면을 제공한다.
- Vite production artifact를 Fastify same-origin에서 제공하며 `vite preview`를 production에 사용하지 않는다.

### 예상 변경 파일

- `src/web/`, `src/http/`, `web/` 또는 동등한 product workspace
- `package.json`, lockfile, TypeScript/Vite config
- HTTP inject tests, component/browser accessibility tests
- security header, request-size와 static asset configuration

### RED

- Unauthenticated/expired/revoked session, wrong role, Origin/CSRF, additional field, oversized body와 malformed input의 Fastify inject test를 실패시킨다.
- Response extra field, cookie/header/query/body log canary와 untrusted error reflection test를 실패시킨다.
- Storage/Gateway unavailable/degraded mapping과 mutation audit atomicity test를 실패시킨다.
- UI의 keyboard navigation, accessible name, focus on error, denied/unavailable distinction와 network/JavaScript failure fallback test를 실패시킨다.
- Clean install, production build와 static deep-link fallback test를 먼저 고정한다.

### GREEN

- Shared authorization/persistence service를 route 가까이서 재확인하고 UI route guard를 권한 근거로 사용하지 않는다.
- Normalized operational log와 canonical audit event만 기록한다.
- Minimal query/mutation vertical slice와 same-origin SPA build를 구현한다.
- Exact dependency audit 결과와 production artifact size를 기록한다.

### 성공 기준

- Targeted HTTP/UI tests, full test/typecheck, clean install와 production build가 통과한다.
- Protected API는 session·role·Origin/CSRF contract를 우회할 entry point가 없다.
- UI는 health/backup의 실제 unavailable/degraded 상태를 healthy로 표시하지 않는다.
- No credential/external resource is used in this Task.

### Rollback

- Product web workspace, routes와 dependencies를 직전 lockfile로 되돌린다. DB migration은 backward-compatible 상태로 남긴다.
- 이 Task에서는 production route나 DNS를 활성화하지 않는다.

### Credential gate

- 없음. Synthetic provider, role reader와 database fixture만 사용한다.
- Actual OAuth/Supabase credential smoke는 Task 5/6의 별도 gate로 이동한다.

## Task 4 — Discord bot Gateway, singleton과 health 연결

### 목적과 범위

- Exact discord.js version을 lock하고 필요한 최소 Gateway intents만 선언한다.
- Ready, disconnect, Resume/reconnect, invalid session, rate limit과 graceful shutdown을 runtime state machine에 연결한다.
- Ready/Resume 뒤 allowed guild membership/role 상태를 reconciliation하고 current member/role reader를 local process boundary로 제공한다.
- Bot은 process-level singleton을 먼저 claim한 뒤에만 Gateway login을 시작하고 duplicate process는 exit `73`으로 실패한다.
- `/health`는 web, storage, bot process와 actual Gateway heartbeat/state를 합쳐 `healthy`/`degraded`/`unavailable`을 반환한다.

### 예상 변경 파일

- `src/bot/`, `src/adapters/discord/`, `src/runtime/`
- process singleton/state directory adapter와 tests
- health adapter/HTTP integration test
- bot lifecycle/runbook

### RED

- Duplicate start가 Gateway login을 호출하지 않는 process test를 실패시킨다.
- Ready 전 healthy 금지, disconnect/unknown degraded, bot process/storage/web failure unavailable 계약을 실패시킨다.
- Disconnect→Resume, invalid session→bounded reconnect, rate limit, stale heartbeat와 shutdown test를 fake timers/client로 실패시킨다.
- Ready/Resume reconciliation, guild missing, member missing, role loss와 provider failure에서 default-deny test를 실패시킨다.
- Bot token/Discord payload/message content가 state, error, audit와 journal adapter에 없다는 test를 실패시킨다.

### GREEN

- Discord client를 injectable adapter로 감싸고 domain health와 role reader에는 normalized state만 전달한다.
- OS-backed singleton lease와 stale owner handling을 구현하되 active owner를 강제 탈취하지 않는다.
- `SIGTERM`에서 new work를 중단하고 bounded Gateway destroy 후 lease를 해제한다.
- G3 승인 뒤 별도 integration bot/app 또는 명시적으로 승인된 안전 window에서 actual Ready/disconnect/Resume과 role lookup을 검증한다.

### 성공 기준

- Fake Gateway lifecycle tests와 full suite/typecheck가 통과한다.
- Actual credential test가 승인된 경우 one active Gateway owner, role lookup, reconnect/Resume와 cleanup/revoke/read-back 증거가 있다.
- Web runtime은 bot token을 읽지 못하고 bot runtime은 browser cookie/session ID를 읽지 못한다.

### Rollback

- Bot service/client를 중지하고 token을 revoke/rotate한다. Lease owner가 없는 것을 확인한 뒤에만 previous bot release를 시작한다.
- Health는 bot absence를 healthy로 과장하지 않고 degraded/unavailable로 유지한다.

### Credential gate

- G3 전에는 fake client와 synthetic token file만 사용한다.
- Actual bot token 사용, Discord application/intents 변경 또는 test guild mutation은 별도 owner 승인 후 실행한다.

## Task 5 — systemd credential 격리와 disposable Ubuntu 통합 Spike

### 목적과 범위

- Production과 같은 Ubuntu 24.04/1GB에서 built web/bot release, PostgreSQL adapter, OAuth fake/approved integration adapter, Gateway fake/approved integration adapter와 local Caddy fixture를 함께 검증한다.
- `waw-web`과 `waw-bot` 별도 user/unit, `LoadCredential=`, immutable release symlink, localhost-only Fastify, Caddy-only ingress, singleton, cgroup, crash/reboot와 failed-release rollback을 실제 systemd에서 확인한다.
- Existing completed systemd/Caddy Spike runner를 재사용하되 product artifact 통합에 필요한 최소 변경만 한다.

### 예상 변경 파일

- `deploy/systemd/waw-web.service`, `deploy/systemd/waw-bot.service`
- application installer/release switch와 rollback verifier
- Caddy template
- `docs/research/spikes/application-integration/` runbook/result

### RED

- `systemd-analyze verify`, wrong/missing credential, cross-user/source/runtime read, process environment/argument/journal canary와 stop cleanup test를 실패시킨다.
- Web crash restart, bot duplicate exit `73`, Gateway degraded health, storage unavailable, graceful stop, failed release와 reboot recovery test를 실패시킨다.
- Port inventory에서 Fastify public bind, unexpected 80/443/22 scope 또는 application user의 backup/monitor credential read를 실패시킨다.
- Existing backup/monitor assets를 fixture에서 덮어쓰거나 disable하려는 installer test를 실패시킨다.

### GREEN

- Production-free artifact와 synthetic credentials로 disposable host integration을 먼저 통과시킨다.
- Actual integration credentials가 필요하면 G2/G3와 분리된 non-production credential만 사용하고 owner가 exact scope를 승인한다.
- Every run은 trap cleanup, create-response 뒤 inventory-before-retry와 final AWS resource count `0`을 요구한다.

### 성공 기준

- Cross-secret deny, no-secret process/journal, one bot owner, loopback web, Caddy proxy, crash/reboot recovery, failed release rollback과 1GB resource limits가 통과한다.
- Instance/key/static IP/disk/snapshot/CloudShell/local artifact final count가 `0`이다.
- Production host, backup, journald, monitor, DNS와 production credential은 변경되지 않는다.

### Rollback

- Disposable unit/user/release/Caddy/credential/source/state를 제거하고 AWS resource를 same-run 삭제한다.
- Cleanup이 완전하지 않으면 다음 Task로 가지 않고 exact residual resource를 owner에게 보고한다.

### Credential gate

- G4 owner approval 전 AWS resource를 만들지 않는다.
- Production OAuth/bot/Supabase credential을 disposable host에 복사하지 않는다. 별도 integration credential이 없으면 provider calls는 fake adapter로 유지하고 실제 provider validation을 미검증으로 보고한다.

## Task 6 — owner-approved Lightsail application/Caddy 배포

### 목적과 범위

- Root 일상 운영을 금지하고 최소 권한 production operator를 먼저 준비한다.
- Exact release를 production host에 stage하고 web/bot credentials를 service별 `LoadCredential=` source로 입력한다.
- Schema compatibility와 backup freshness gate 뒤 `waw-web`/`waw-bot`을 활성화하고 Caddy config를 stage하되 Task 7 전에는 DNS/public certificate authority를 넘기지 않는다.
- Existing `waw-backup.timer`, monitoring/journald와 Lightsail alarm을 계속 유지한다.

### AWS root 대신 사용할 최소 권한 production operator 계획

1. Root는 account recovery, billing/contact, MFA와 operator bootstrap/break-glass에만 사용하고 일상 배포 session에는 사용하지 않는다.
2. Dedicated named production operator에 MFA를 강제하고 short-lived console/CLI session만 사용한다. Long-lived access key는 기본 생성하지 않는다.
3. Policy는 서울 region의 정확한 tagged Lightsail instance에 필요한 read, instance state, firewall read/change와 deployment access만 허용한다. DNS, IAM, S3 backup, billing과 unrelated Lightsail resource는 기본 거부한다.
4. DNS 변경이 필요한 Task 7 권한과 temporary IAM/policy management는 별도 time-bound elevation으로 분리한다. Backup writer/reader policy를 operator에 붙이지 않는다.
5. Policy simulator와 actual deny test로 unrelated instance create/delete, snapshot, domain, IAM/S3와 다른 region action을 거부한다. Required action이 resource-level restriction을 지원하지 않으면 condition/explicit deny와 runbook scope를 기록한다.
6. Operator identity, MFA, policy version/hash, session 시작/종료와 performed action 이름만 audit하고 account ID, token과 credential은 기록하지 않는다.
7. Break-glass root 사용 시 이유, 시작/종료, 수행 action과 operator 권한 공백을 metadata-only incident로 기록하고 즉시 logout한다.

이 policy에서 provider가 요구하는 새 broad action이나 root-only workflow가 발견되면 production 배포를 멈추고 materiality를 검토한다. 장기 broad 권한이 필요하면 Proposed ADR 또는 별도 owner decision 없이 추가하지 않는다.

### 예상 변경 파일

- Production operator least-privilege policy template/runbook
- application install/release/rollback assets
- web/bot systemd units와 Caddy production template
- deployment inventory/evidence와 operations runbook

### RED

- IAM policy simulation과 actual operator identity/non-root check, forbidden action deny test를 먼저 실패시킨다.
- Temp root에서 idempotent install, conflicting target default-deny, unit verify, release health gate와 previous symlink rollback test를 실패시킨다.
- Production preflight에서 backup/monitor/journald inactive, stale backup, schema mismatch, insufficient disk/memory, unexpected ports/unit/config 또는 credential path conflict가 있으면 deploy를 실패시킨다.
- Cross-service credential, process environment/argument/journal canary와 Fastify non-loopback bind를 실패시킨다.

### GREEN

- G5 승인 뒤 read-only inventory→operator verification→release stage→credential source install→unit verify→web start/storage smoke→bot singleton start/Gateway smoke→Caddy validate 순으로 진행한다.
- Each step 후 backup timer, monitor timer, journald와 host alarm 상태를 확인한다.
- Previous release와 source credential version을 rollback 가능하게 유지하고 new provider credential revoke는 health 확인 뒤에만 수행한다.

### 성공 기준

- Active caller가 root가 아니고 exact least-privilege operator이며 forbidden actions가 거부된다.
- Exact release hash, Node/lockfile, units, users, credentials, cgroup과 loopback port가 read-back된다.
- Web/storage/bot/Gateway health가 expected state이고 only one bot owns Gateway.
- Backup timer/last verified marker, monitor timer, journald config와 Lightsail alarm은 변경 전과 동일하게 살아 있다.
- Rollback rehearsal 뒤 desired release를 재적용할 수 있다.

### Rollback

- Caddy application route를 비활성화하고 web/bot을 stop/disable한 뒤 previous `/opt/waw/current` symlink와 credential source를 atomic restore한다.
- Schema는 Task 1의 backward-compatible version을 유지한다. Data corruption 의심 시 writes를 막고 restore gate를 연다.
- Existing backup, journald, monitor와 host alarm은 rollback 대상에 포함하지 않는다.

### Credential gate

- G5에서 exact host, release, operator policy, credential 종류, maintenance window와 rollback owner를 승인한다.
- Secret은 root-only no-echo staging에서 provider별로 입력하고 값/hash/prefix를 deployment evidence에 남기지 않는다.

## Task 7 — `waw.dubeom.com` DNS, HTTPS, OAuth redirect와 monitoring 확장

### 목적과 범위

- Canonical DNS를 승인된 Lightsail ingress에 연결하고 public 80/443만 허용한다.
- Caddy public certificate issuance, HTTP→HTTPS, wrong host deny, loopback proxy와 secure cookie를 검증한다.
- Discord OAuth redirect를 exact `https://waw.dubeom.com/...` callback으로 등록하고 production login/role/session round trip을 검증한다.
- Existing monitoring을 web/bot unit, loopback application health와 canonical certificate expiry까지 확장한다.
- Supabase DB size/Free quota와 backup freshness를 alert input에 추가하고 non-zero production restore rehearsal cadence를 고정한다.

### Supabase 용량, backup freshness와 restore 운영

- DB size는 최소 daily로 읽되 credential/error에 connection detail을 노출하지 않는다. Free quota 대비 70% warning, 85% critical을 초기 기준으로 두고 quota 자체는 provider 공식/current setting에서 read-back한다. Provider quota 변경이나 실제 growth가 기준 변경을 요구하면 owner review를 거친다.
- Backup은 기존 기준대로 last published 20시간 warning, 24시간 critical을 유지하고 last verified restore도 별도 age로 표시한다. Missing/invalid marker는 critical이다.
- Production data row count가 `0`이어도 restore rehearsal은 schema-only success로 끝내지 않는다. Owner-approved non-sensitive synthetic canary row를 정상 application/persistence path로 생성하고 다음 encrypted archive에 포함시킨 뒤 disposable empty PostgreSQL target에서 schema version, total/non-zero canary row count, FK/core invariant를 검증한다.
- Canary는 Discord message 원문, OAuth/session/token, 개인 식별값을 포함하지 않고 restore 검증 후 production에서 정책에 맞게 제거한다. Canary 도입이 audit/data policy의 material 변경으로 판정되면 실행 전 Proposed ADR로 분리한다.
- 첫 non-zero rehearsal은 Task 7 rollout 전후 24시간 내 latest archive로 실행하고, 이후 최소 분기 1회 및 migration 전 수행한다. RTO 8시간, wrong-identity failure, ciphertext byte/hash, cleanup과 previous verified archive 보존을 요구한다.

### 예상 변경 파일

- Caddy production config/runbook
- DNS/firewall/OAuth redirect checklist
- monitoring config/evaluator의 DB size, application unit/health/certificate inputs와 tests
- backup/restore runbook과 production evidence
- `PROJECT_STATUS.md`, `CHANGELOG.md`

### RED

- Canonical host/Origin/forwarded header, HTTP redirect, wrong host, security header, request size와 secure cookie test를 실패시킨다.
- DNS mismatch, public Fastify port, certificate absent/expiry, OAuth redirect mismatch와 arbitrary preview login test를 실패시킨다.
- Web/bot unit failure, Gateway degraded, application unavailable, DB size 70%/85%, backup 20h/24h, invalid marker, certificate 21d/14d와 alert firing/recovery test를 실패시킨다.
- Non-zero canary archive restore에서 row count/FK/invariant mismatch와 cleanup failure test를 실패시킨다.

### GREEN

- G6 승인 뒤 pre-change DNS TTL/records, firewall, Caddy config와 OAuth redirect inventory를 기록하고 DNS→firewall→Caddy issuance→public health→OAuth round trip 순으로 적용한다.
- G7 승인 뒤 monitoring config를 확장하고 synthetic firing/recovery를 approved channel에서 한 번씩 확인한다.
- Latest encrypted archive를 exact-object temporary reader와 offline identity로 disposable empty target에 restore하고 non-zero invariant를 검증한 뒤 reader/key/archive copy/dump/target/canary cleanup을 확인한다.

### 성공 기준

- `https://waw.dubeom.com`만 canonical dashboard이며 valid public certificate, HTTP redirect, secure cookie와 exact OAuth redirect가 확인된다.
- Public port inventory는 expected SSH management scope와 80/443만 포함하고 Fastify는 loopback-only다.
- Allowed operator login, wrong guild/role deny, session logout/revoke와 mutation authorization이 actual round trip에서 통과한다.
- Monitoring이 web/bot/health/certificate/DB size/backup freshness를 포함하고 firing/recovery가 검증된다. Existing Lightsail host alarm은 유지된다.
- Non-zero encrypted restore rehearsal이 8시간 안에 통과하며 temporary credential/data/resource가 남지 않는다.
- 최초 journald vacuum은 실행하지 않는다.

### Rollback

- OAuth login/mutation을 먼저 disable하고 redirect를 직전 값으로 복구한다.
- DNS를 pre-change record로 되돌리고 propagation 동안 maintenance/unavailable 상태를 명확히 표시한다.
- Caddy를 previous validated config로 reload하고 application은 loopback에서 유지하거나 stop한다.
- Monitoring 확장만 previous backup-only config로 되돌리되 existing backup alert와 Lightsail host alarm을 중단하지 않는다.
- Firewall rollback에서도 Fastify public port를 열지 않는다. Certificate state를 application release와 함께 삭제하지 않는다.

### Credential gate

- G6은 exact DNS record, TTL, firewall diff, OAuth redirect diff, maintenance window와 rollback record를 owner가 승인해야 한다.
- G7은 monitor config diff, approved alert channel, non-zero canary 내용, restore target/reader scope와 cleanup checklist를 owner가 별도로 승인해야 한다.
- DNS, firewall, OAuth credential, certificate와 monitoring provider mutation은 한 승인으로 묶지 않고 단계별 중단점을 둔다.

## 전체 검증 계획

각 Task에서 다음 증거를 새로 만든다.

1. RED test 이름과 실패 이유
2. Minimal GREEN diff와 targeted test
3. `npm test`, `npm run typecheck`, clean build/audit와 `git diff --check`
4. Secret/forbidden canary scan 및 외부 resource pre/post inventory
5. Rollback rehearsal 또는 production에서 안전하지 않다면 disposable equivalent와 남은 미검증 범위
6. Existing backup, journald, monitoring과 host alarm 생존 read-back
7. 관련 runbook, `PROJECT_STATUS.md`와 `CHANGELOG.md` 갱신

성공한 local test는 actual Supabase, Discord, systemd, DNS/TLS 또는 production evidence로 승격하지 않는다. Actual provider/host test가 승인되지 않으면 Task 결과에 그 부분을 명시적으로 미검증으로 남긴다.

## 전체 완료 기준

- Tasks 1~7이 각자의 별도 owner gate와 fresh evidence로 완료되었다.
- Supabase adapter/migration, OAuth/session/role authorization, Fastify/React vertical slice와 Gateway runtime이 production에서 승인된 최소 기능으로 동작한다.
- One active bot, canonical HTTPS, exact OAuth redirect, workload별 credential deny와 safe rollback이 검증되었다.
- Backup RPO 24시간, DB size alert와 non-zero restore rehearsal/RTO 8시간 증거가 있다.
- Existing backup·journald·monitoring과 host alarm이 유지되며 최초 vacuum은 실행되지 않았다.
- GPT, Riot/RSO와 KBO가 배포물/dependency/credential에 포함되지 않고 후속 gate로 남아 있다.
- Known issue, residual resource, failed test와 unverified path가 문서에 숨김없이 기록되었다.

## 아키텍처 충돌과 Proposed ADR gate

현재 조사에서는 Accepted ADR 간 충돌이나 새 architecture 선택이 발견되지 않았다. 다음 중 하나가 구현 중 발생하면 PLAN-0004를 임의 변경하지 않고 Proposed ADR을 먼저 작성한다.

- Supabase workload 최소 권한/RLS가 선택한 connection mode에서 성립하지 않음
- Discord OAuth/token 미보존 상태에서 required identity/role UX가 성립하지 않음
- Web/bot process separation이 bot-side role lookup 또는 secret deny를 만족하지 못함
- Fastify/React, systemd/Caddy 또는 1GB host가 measured acceptance를 충족하지 못함
- Provider가 root 또는 장기 broad AWS credential을 production 운영에 요구함
- Non-zero restore canary가 product data/audit policy를 material하게 바꿈

## 승인 및 다음 단계

- Owner decision: Approved — execute Task 1 local/disposable RED→GREEN only; do not use production Supabase or credentials
- Approved date: 2026-07-23

검토 시 Task 범위, RED→GREEN, rollback, credential gate, operator 권한, DB/backup alert와 non-zero restore cadence를 승인하거나 수정한다. 승인 뒤에도 다음 세션은 **Task 1만** 진행하며, G1 production migration은 Task 1의 local/disposable GREEN과 별도 owner 승인 전에는 실행하지 않는다.
