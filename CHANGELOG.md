# 변경 이력

- PLAN-0008 production rollout을 위해 summary quota enforcement와 dashboard
  quota API/UI를 별도 exact-`1` feature gate로 분리하고 systemd 기본값을
  모두 `0`으로 고정. 비활성 상태에서는 quota API route를 등록하지 않고
  browser가 quota를 조회하거나 표시하지 않음

사용자에게 의미 있는 변경사항을 기록합니다.

## Unreleased

- Align the active dashboard with the accepted rolling-hour summary policy by
  removing the superseded daily quota DTO, API, persistence mutation, React UI,
  session feature advertisement and web feature flag while preserving the
  redacted command log and historical migration evidence.
- Record the owner's successful real-content production `/요약` smoke as the
  completion of the user-facing summary activation gate without storing the
  selected range, Discord message content, or returned summary body. Keep the
  private help read-back and redaction recheck in final operational acceptance.
- Define one shared synthetic summary marker contract for the adapter prompt and
  evaluator: preserve each marker verbatim exactly once, keep it in its assigned
  section, and reject unmarked output items. Add response-free aggregate fake
  regressions that distinguish omission, duplication, wrong-section placement,
  and unmarked items; production provider and quota flags remain off.
- Record the single credentialed synthetic OpenAI production spike as FAIL
  without retry: the call completed in 2.613 seconds, but the runner required a
  marker-preservation contract absent from the adapter prompt and schema. The
  dedicated key, transient state and failed staged release were removed; all
  production feature flags remain off.
- Add a default-off OpenAI Responses summary adapter using the pinned
  `gpt-5.4-mini-2026-03-17` snapshot, `store:false`, strict structured output,
  a 120-second provider deadline, conditional bot-only credential loading, and
  deferred Discord `/요약` replies; no provider or quota activation.
- Replace the configurable daily `/요약` quota with one reservation per
  registered user per rolling hour. Migration `0008` removes the daily default,
  override, counter, and reset model while preserving idempotent reservations;
  production quota and game-observation flags remain off.
- Production migration resume 실패가 `0003`/`0004` CRLF가 아니라 migration
  `0005` ledger에 SHA-256 두 글자가 빠진 historical 기록 오기임을 확인하고,
  exact version 5와 canonical SQL에만 묶인 compatibility 검증과 disposable
  PostgreSQL/Linux exact-archive 회귀를 추가; candidate `1d9a1fa`의 동일
  archive를 CloudShell Amazon Linux 2023에서 재검증해 Gate A 통과
- KBO를 현재 제품 명세, dashboard 설정, 구현·완료·배포 범위에서 제외하고
  추후 새 제품 정책으로 재검토하도록 변경
- Candidate `f126ce3` CloudShell Linux 검증에서 exact archive와 Node
  `24.18.0`은 확인했지만 release-manager fixture의 read-only cleanup이 exit
  `1`로 실패해 stage를 중단; temporary artifact와 production mutation 0,
  Gate A 미통과 유지
- Linux fixture cleanup을 최소 수정한 candidate `1785255`의 exact archive를
  CloudShell에서 재검증해 release-manager test, production stage, migration
  asset 7개, default-off quota flags와 cleanup을 통과; production mutation 0
- PLAN-0008 Gate B production archive의 wrong-identity 거부, exact hash/byte
  검증과 disposable PostgreSQL 17 empty-target restore를 완료하고 schema
  version 6, expected row count 97, invalid constraint/FK 0 및 cleanup을 확인
- PLAN-0008 Tasks 2–7: additive daily-summary quota schema, atomic PostgreSQL
  reservations, redacted command-log and quota APIs, administrator quota
  mutations, and the responsive Pretendard Direction A dashboard
- Riot approval success is retained even if its follow-up list refresh fails,
  and recent-auth denial now gives explicit Korean reauthentication guidance

### Added

- Dashboard 승인에서 PUUID 입력을 제거하고 bot-only Riot Account API가 pending
  KR Riot ID를 PUUID로 자동 해석한 뒤 승인하는 흐름
- 서버 세션을 폐기하고 재인증 화면으로 돌아가는 Dashboard 로그아웃 버튼
- Riot 연결 입력을 화면에 표시되는 단일 `이름#태그` 값으로 통합
- Discord interaction 변환기도 단일 `계정` option을 읽도록 맞춰 응답 전
  dispatch 실패를 수정
- 관리자 Dashboard에 KR Riot 연결 승인 대기 목록과 PUUID existence 검증 후
  승인 UI를 추가하고, 세션 DTO의 누락된 CSRF 토큰 전달을 복구
- `/라이엇계정 연결` 입력을 `닉네임`과 `아이디`로 단순화하고 platform을
  서버에서 `KR`로 고정
- 호출자에게만 한국어로 전체 명령의 목적·입력 예시·관리자 전용 범위와
  Riot 관리자 승인 연결의 한계를 안내하는 `/도움말` Discord 명령
- PLAN-0008 Task 1 command-log/quota public DTO, same-origin endpoint paths,
  bounded opaque pagination input, reservation port contract, and deterministic
  `Asia/Seoul` quota-date tests
- Discord Gateway 초기 멤버 reconciliation의 15초 deadline과 1회 bounded
  retry, 그리고 식별자를 포함하지 않는 고정 timeout·retry-exhausted reason
  code 진단
- `waw_bot`의 insert-only operation ledger 권한을 보존하면서 PostgreSQL
  `ON CONFLICT DO NOTHING` 중복 claim이 동작하도록 불필요한 conflict
  target을 제거
- Riot Account API PUUID existence validation with a bot-only systemd
  credential, fail-closed provider handling, and identifier-free tests.
- Identifier-free administrator IPC server stage diagnostics for production
  503 isolation, with explicit tests excluding request, actor, and guild IDs.
- Repeatable exact-source PostgreSQL 17 full-test harness and fail-closed
  `WAW_REQUIRE_POSTGRES_INTEGRATION` mode. Toolchain-less local runs now report
  their PostgreSQL scope as an explicit skip instead of false test failures.
- Platform-independent migration checksums and an exact production 0001-0004
  mixed-line-ending ledger regression. New ledger rows use canonical LF hashes;
  resume accepts only LF/CRLF renderings of otherwise identical migration text.
- Accepted ADR-0017과 approved PLAN-0006: 기존 역할 조회 IPC와 분리된
  dashboard→bot 관리자 명령 Unix socket, operation 결과 재조정과 bot-side
  current-role·원자 감사 계약 및 단계별 구현 계획
- PLAN-0006 Task 1 관리자 IPC version 1 exact request/response parser,
  32KiB frame·15초 TTL·command payload·비반사 검증
- PLAN-0006 Task 2 bot 관리자 command application service와 additive
  `0006_admin_command_result` migration: current-role 선검사, bounded cursor
  pagination, durable duplicate/status readback, stale·PUUID conflict·validator
  unavailable 처리, mutation·감사·terminal result 원자 transaction 검증
- PLAN-0006 Task 3 별도 관리자 Unix socket transport: 기본 3초 deadline,
  one-frame request/reply, 최대 8 connection, malformed·oversized·multi-frame
  선거부, mutation timeout `outcome_unknown`, owned stale socket 안전 검사
- PLAN-0006 Task 4 dashboard 관리자 IPC ports와 영구 pre-dispatch 감사:
  current admin·CSRF·recent OAuth·confirmation 이후에만 전달, bounded cursor
  pagination, unavailable 503·stale 409·unknown 504 매핑과 duplicate result
  재조정
- PLAN-0006 Task 5 bot/web main의 기본 비활성 관리자 IPC assembly, duplicate
  bot listen 선거부, admin→member-role→Gateway→DB shutdown 순서와 전용
  runtime socket/group·credential 비혼합 systemd asset 계약
- PLAN-0006 Task 6 disposable Ubuntu 24.04/PostgreSQL 17 process-boundary
  harness: 실제 Unix owner/group/mode와 web/unrelated 접근, crash restart,
  malformed flood·8 connection bound, concurrent decision, timeout result
  reconciliation과 audit-failure rollback 검증
- PLAN-0006 Task 7 전체 회귀·타입·빌드·migration 1~6·asset·Ubuntu process
  재검증, forbidden canary와 ADR/code/unit 일관성 검사 및 production
  preflight·migration·단계적 rollout·503 rollback 실행 checklist
- PLAN-0006 Task 8 Gate A metadata-only 시도: canonical root/health 200 확인,
  invalid AWS CLI token과 Orca guide timeout·Supabase/host session 부재를
  명시해 Gate A incomplete 및 Gate B 미승인으로 기록
- ADR-0016에 따른 최대 24시간 대화 완전 조회·비영구 요약 port, Riot 계정
  1:N 연결, 분리된 Riot/Go Live 증거 상태기계, 관리자 정정·취소 계약과
  additive PostgreSQL `0005` schema
- `/요약`, `/라이엇계정 연결|목록|연결해제`,
  `/몰랭검거 현황|정정|취소`의 Discord 등록 payload, 한국어 interaction
  handler, 원문 비포함 command audit와 완전 조회 history adapter
- Singleton bot lifecycle에 결합된 한국어 `InteractionCreate` listener와
  일곱 명령 fake-client dispatch·감사 실패 통합 계약
- 외부 Riot API 없이 관리자 승인 대기 요청을 생성하는
  `/라이엇계정 연결|목록|연결해제` executor, PostgreSQL request lifecycle과
  요청·승인·해제/감사 원자성
- 관리자 전용 Riot 연결 요청 목록·승인·거절 executor, PUUID 검증 port와
  request version 기반 stale·중복 결정 방지
- Current administrator role·CSRF·recent OAuth·명시적 확인·expected
  version을 강제하는 Riot 관리자 Fastify API 경계
- 정규화된 Riot Spectator·Discord Go Live 증거와 비교 결과를 원자적으로
  저장하고 queue 420, 중복 게임, stale 관측, `unknown`, 5분·2분 정책을
  강제하는 게임 관측 executor와 PostgreSQL store
- Discord current-role을 실행 시점에 재조회하는 `/몰랭검거 현황|정정|취소`
  executor, 최신 incident version 기반 stale 방지와 정정·취소 revision·감사
  원자성
- 주입형 Riot observer·Discord voice source를 사용하는 게임 관측 scheduler,
  계정별 중복 poll 차단, timeout·rate-limit `unknown`, 늦은 응답 무시,
  disconnect/reconciliation 및 게임 종료 문맥 정리
- 활성 Riot 링크만 읽는 PostgreSQL 관측 target source, Discord
  `VoiceStateUpdate`·Ready/Resume/Disconnect adapter와 기본 비활성 scheduler
  bot lifecycle
- 프로젝트 정책 및 AI 개발 워크플로우
- 연구, Spike, ADR, 구현, 버그 수정, 검토와 배포 프롬프트
- 코딩, 테스트, 로그, 데이터와 보안 기준
- 관리자 대시보드 운영 도메인 `waw.dubeom.com`
- backup-only PostgreSQL credential, `age` encrypted S3 publication scripts, Put-only writer/exact-object restore reader policies와 일일 systemd scheduler
- production logical dump의 byte/hash continuity와 disposable PostgreSQL 17 restore 검증 절차
- 30일/1GiB journald drop-in, file-credential Discord monitor service/timer, reversible installer와 alerting runbook
- Supabase/OAuth/Fastify·React/Gateway/systemd·Caddy production 구현을 7개 owner-gated Task로 나눈 `PLAN-0004` Draft
- Transactional PostgreSQL migration runner, workload RLS/grants, session·OAuth·role-cache·operation/audit persistence adapter와 systemd database credential loader
- Production legacy version 1 fingerprint adoption과 forward `0002` application persistence migration
- PLAN-0004의 production 중단점, offline identity handoff와 단일 재개 프롬프트
- Strict Fastify dashboard API, accessible React dashboard states, fake
  Gateway lifecycle, singleton lease와 discord.js signal adapter
- Separate web/bot systemd units, `LoadCredential=` isolation, immutable release
  fixture, conflict-safe Caddy assets와 disposable AWS integration runner
- MFA·서울 region·exact instance ARN으로 제한한 production operator IAM
  policy template, deterministic renderer/test와 Task 6 deployment runbook
- Separate systemd users 사이의 current-role 강제 재조회를 credential 공유나
  TCP listener 없이 제공하는 Unix socket IPC Proposed ADR
- Production web/bot entrypoints, dashboard setting/audit migration, staged
  loopback health/Caddy assets and immutable release stage/activate/rollback
  tooling

### Changed

- Authentication can now use a fail-closed, versioned local current-role reader
  without receiving Discord member or role payloads in the web process.
- Dashboard setting mutations now carry the authenticated actor and operation
  correlation into one PostgreSQL setting/operation/audit transaction.
- Discord 운영 경보를 한 줄 영문 메타데이터 대신 이벤트별 한국어 제목·원인·상태와 Discord 시간 표기를 갖춘 색상 임베드로 표시
- Production backup publication now selects and validates one latest migration
  version before serializing JSON; the malformed multi-row marker discovered
  during G5 preflight was replaced by a valid schema-version-2 encrypted
  publication.
- `PLAN-0002` Tasks 1~3을 실제 production publication·restore rehearsal 증거로 완료
- `PLAN-0003` Tasks 1~4를 local contract, disposable Spike, production-free assets와 backup-only production monitoring rollout 증거로 완료
- 현재 계약 구현과 실제 미구현 adapter/route/runtime 경계를 명시하고 production operator, DB size·backup freshness 경보와 non-zero restore rehearsal gate를 계획에 추가
- `PLAN-0004`를 승인하고 Task 1 local/disposable PostgreSQL RED→GREEN을 완료하되 G1 production migration은 별도 owner gate로 유지
- Production read-only preflight에서 legacy version 1 schema를 확인하고 migration을 baseline `0001` + forward `0002`로 교정
- Owner-approved G1에서 새 encrypted pre-migration archive를 publish하고, offline owner identity가 필요한 empty-target restore 전 migration을 정지
- Dashboard API, UI와 bot runtime 병렬 결과를 단일 local integration으로 통합
- G4 owner-approved Ubuntu 24.04/1GB integration에서 PostgreSQL health,
  credential/process isolation, singleton, crash/storage failure, rollback과
  reboot recovery를 검증하고 AWS/CloudShell artifact를 전부 정리
- G5 전 단계에서 production operator allowlist를 inventory와 temporary SSH
  access로만 제한하고 IAM/S3/DNS/snapshot/firewall/lifecycle 권한을 제외
- Owner-approved production console read-only inventory에서 exact host의
  state/capacity/network/firewall/alarm baseline을 기록하고 변경 없이 종료
- Root CloudShell read-only 조회로 exact Lightsail UUID를 확정하고 production
  operator policy의 exact-target rendering/hash/allowlist를 로컬 검증

### Fixed

- Updated the workload-role regression to match the approved atomic command
  audit contract: bot may insert audit events but cannot read or update them.
- Current-role IPC rejects unknown/oversized frames, request mismatches,
  unavailable sockets, and unsafe stale regular-file or symlink targets.
- Production systemd units no longer start disposable integration fixtures;
  the G4 installer uses separate fixture-only units.
- Fresh Caddy package default takeover, service-readable immutable release mode,
  PostgreSQL peer role, runtime credential inspection과 crash health readiness
  경합을 disposable host evidence에 맞게 보정
