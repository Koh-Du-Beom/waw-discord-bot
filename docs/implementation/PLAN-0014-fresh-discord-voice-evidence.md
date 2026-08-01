# 구현 계획: 신선한 Discord Voice 증거와 주기 재조정

- Status: Complete — Tasks 1-7 production activated
- Related requirements: FUN-010, FUN-013, FUN-015, DAT-005
- Related ADRs: ADR-0016, ADR-0027, ADR-0028
- Owner: Product owner

## 목표

Discord Voice State가 실제로 관측된 시각과 Riot scheduler가 비교한 시각을
분리하고, 3분이 지난 cached 상태를 `unknown`으로 낮춘다. Gateway가 정상이어도
관측 대상 사용자만 2분마다 single-flight로 재조정하여 놓친 이벤트를 복구한다.

구현과 local/disposable 검증은 production gate 직전까지 독립적으로 완료한다.
Production migration 적용, 배포, credential과 외부 서비스 변경은 마지막
Owner gate로 남긴다.

## 주기 후보와 결정

| 후보 | Reconciliation | Freshness | 평가 |
|---|---:|---:|---|
| A | 30초 | 1분 | Riot poll마다 외부 Voice 조회가 발생해 불필요한 부하와 rate-limit 위험이 큼 |
| B | 2분 | 3분 | 한 번의 지연 여유를 두면서 cached 상태가 5분 grace 전체를 단독으로 덮지 못함 |
| C | 5분 | 6분 | 요청량은 작지만 stale `active`가 start grace를 넘어 compliance로 남을 수 있음 |

ADR-0028에 따라 후보 B를 사용한다.

- 기본 reconciliation interval: `120000ms`
- 기본 evidence freshness: `180000ms`
- freshness는 reconciliation보다 크고 accepted start grace `300000ms`
  이하여야 한다.
- 잘못된 runtime 값은 provider attach 전에 bot 시작을 fail-closed한다.

Discord는 전체 guild member 요청을 guild/bot당 30초에 한 번으로 제한하며,
Voice State에는 사용자별 현재 상태 조회 경계를 제공한다. 따라서 기존
`guild.members.fetch()` 전체 조회를 주기 경로로 반복하지 않고 현재 관측 대상의
Discord 사용자 ID를 중복 제거해 current Voice State만 조회한다.

## 범위

- Discord source observation timestamp와 scheduler poll timestamp 분리
- normalized evidence와 persistence에 source timestamp 추가
- 3분 freshness 판정과 stale `unknown`
- 현재 target user의 2분 periodic reconciliation
- guild별 single-flight와 target user 중복 제거
- Gateway event generation과 reconciliation request generation 비교
- late result, timeout, rate limit과 provider 실패의 `unknown`
- runtime 설정 parsing과 fail-closed 검증
- 기존 세 failing regression을 GREEN으로 전환
- additive migration의 local/disposable 작성·검증
- 관련 운영·설정·상태 문서 갱신

## 범위 제외

- Match-V5 호출, 과거 경기 복구와 최근 전적·티어 표시
- grace-only incident의 자동 위반 확정
- 기존 `observed_at` 값을 source event time으로 역사적 재작성
- Discord 전체 member polling
- production DB migration 적용
- production 배포, restart, feature flag 변경
- Discord Portal, credential 또는 외부 서비스 변경

## 선행 조건

- ADR-0016, ADR-0027, ADR-0028 Accepted
- 기존 세 failing regression이 현재 결함을 각각 재현
- migration은 기존 release와 호환되는 additive 변경이어야 함
- production 동작은 별도 exact release, backup/restore와 rollback gate 필요

## 작업

### Task 1: Timestamp와 freshness 도메인 계약

- 목적: Discord source 시각을 poll 시각과 분리하고 stale 상태를 `unknown`으로
  정규화한다.
- 변경 예상 파일: `src/game/discord-stream-observer.ts`,
  `src/game/game-observation-executor.ts`, `src/game/observation-scheduler.ts`,
  관련 단위 테스트
- 테스트: source/poll 시각 분리, 정확히 3분 경계 전후, active/inactive/unknown,
  미래·invalid timestamp 거부, fresh event 복구
- 완료 기준: source timestamp가 normalized evidence에 보존되고 3분 이상 지난
  cached active/inactive가 comparison에서 `unknown`
- 위험: freshness 경계의 off-by-one과 잘못된 clock 사용
- 롤백: source timestamp 전달과 freshness 판정 변경만 되돌림

### Task 2: Targeted periodic reconciliation과 순서 보호

- 목적: Gateway 정상 상태에서도 현재 관측 대상의 Voice State를 2분마다
  bounded하게 갱신한다.
- 변경 예상 파일: `src/game/observation-scheduler.ts`,
  `src/adapters/discord/voice-observation-adapter.ts`, `src/bot/main.ts`,
  관련 fake adapter와 scheduler 테스트
- 테스트: distinct target deduplication, 2분 경계, interval 이전 무호출,
  guild별 single-flight, 진행 중 tick의 중복 요청 없음, target 해제 제외
- 완료 기준: 전체 guild member fetch 없이 target별 current Voice State를
  조회하고 한 guild에 reconciliation 하나만 실행
- 위험: target 수에 비례한 Discord REST 요청과 provider rate limit
- 롤백: periodic path를 비활성화하고 Gateway event/reconnect reconciliation만
  유지

### Task 3: Late result와 실패의 fail-closed 처리

- 목적: reconciliation 시작 뒤 더 최신 Gateway event가 도착하면 늦은 응답이
  이를 덮어쓰지 못하게 한다.
- 변경 예상 파일: `src/game/discord-stream-observer.ts`,
  `src/game/observation-scheduler.ts`,
  `src/adapters/discord/voice-observation-adapter.ts`, 관련 테스트
- 테스트: request generation 뒤 새 event, out-of-order user response,
  timeout, 404/not-in-voice, 429, 5xx, disconnect/resume와 retry-after
- 완료 기준: 최신 generation만 current state 갱신; 불명확한 실패는 source
  timestamp를 refresh하지 않고 `unknown`; 정상적인 not-in-voice만 inactive
- 위험: 정상 inactive와 provider failure를 같은 값으로 합치는 회귀
- 롤백: generation guard 변경을 되돌리고 observation feature default-off

### Task 4: 설정 경계와 production assembly

- 목적: 두 interval을 명시적으로 검증해 scheduler에 주입한다.
- 변경 예상 파일: `src/bot/observation-feature.ts`,
  `src/bot/observation-feature.test.ts`, `src/bot/main.ts`,
  `deploy/systemd/waw-bot.service`, production asset fixture와 설정 문서
- 테스트: absent default, 정수 parsing, 최소/최대, freshness≤reconciliation
  거부, freshness>5분 거부, feature disabled 시 external read 없음
- 완료 기준: 기본 `120000/180000`, invalid config에서 provider attach 전
  startup 실패
- 위험: 기존 release asset과 effective environment 불일치
- 롤백: 새 설정 선언 제거와 이전 assembly 복구

### Task 5: Additive evidence timestamp migration

- 목적: 기존 poll `observed_at` 의미를 보존하면서 Discord source 시각을 별도
  저장한다.
- 변경 예상 파일: `migrations/0011_game_observation_source_time.sql`,
  `src/persistence/postgres-game-observation-store.ts`, migration/integration test
- 테스트: migrations 0001–0011 순차 적용, 기존 행 null 보존, 신규 Discord
  source timestamp 저장, Riot 행 계약, RLS/grant, duplicate와 rollback
- 완료 기준: 기존 `observed_at`을 재작성하지 않고 신규 행만 검증된 source
  timestamp를 보존
- 위험: 이전 release가 새 column을 무시하는 호환성, migration checksum
- 롤백: forward-only additive column을 남기고 이전 release가 미사용

### Task 6: 전체 회귀와 문서

- 목적: 신규 세 failing regression을 포함한 관련 경계를 GREEN으로 만들고
  production 전 상태를 문서화한다.
- 변경 예상 파일: `README.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`,
  ADR/계획과 관련 운영 문서
- 테스트: targeted tests, `TMPDIR=/tmp npm test`, PostgreSQL 17 integration,
  `npm run typecheck`, `npm run build`, `git diff --check`, credential/identifier
  log canary
- 완료 기준: 신규 source-time, stale-unknown, periodic-reconciliation 테스트가
  GREEN이고 기존 grace/interruption/dedup/one-stack/one-alert 회귀 유지
- 위험: PostgreSQL tool 부재 또는 macOS socket path skip을 PASS로 오인
- 롤백: 실제 test 결과와 미검증 범위를 문서에 유지

### Task 7: Production final gate

- 목적: local/disposable 완료 뒤 exact candidate의 migration·배포·활성화를
  별도로 승인받는다.
- 변경 예상 파일: production approval/runbook/result 문서
- 테스트: exact release와 migration checksum, fresh encrypted backup/restore,
  current/previous release, service/Gateway health, 설정 read-back, sanitized
  live observation
- 완료 기준: Owner가 exact 범위를 승인하고 migration `0011`, 배포, effective
  interval과 fresh evidence를 read-back
- 위험: DB migration, bot restart, Discord rate limit과 실제 사용자 판정
- 롤백: 이전 compatible release 활성화, observation feature disable,
  additive column 보존

## 검증 계획

- Fake clock으로 `119999/120000ms`, `179999/180000ms` 경계를 검증한다.
- Reconciliation promise를 수동 제어해 single-flight와 late-result ordering을
  결정적으로 재현한다.
- Discord adapter fixture는 fresh active, fresh inactive, not-in-voice, 429,
  timeout, 5xx와 malformed response를 구분한다.
- PostgreSQL 17 disposable fixture에서 source/poll timestamp가 서로 다른
  값으로 저장되는지 확인한다.
- 네 경기 형태의 fixture에는 실제 Discord/Riot 식별자와 사용자 데이터를
  포함하지 않는다.

## 배포 및 마이그레이션

Task 1~6은 production-free로 수행한다. Migration `0011`은 작성하고 disposable
PostgreSQL에서만 적용한다. Production 적용은 Task 7에서 exact candidate,
fresh backup/restore, rollback release와 Owner 승인을 다시 확인한 뒤 진행한다.

애플리케이션 rollback은 이전 release로 복귀하고 관측 feature를 비활성화한다.
Additive source timestamp column은 삭제하지 않으며 historical `observed_at`을
변환하거나 채우지 않는다.

## 문서 갱신

- ADR-0028 승인과 interval 근거
- 이 계획의 Task별 진행 상태
- `README.md` runtime 설정과 자동 몰랭 설명
- `PROJECT_STATUS.md`, `CHANGELOG.md`
- application persistence와 production activation runbook

## 승인

- Owner decision: 2026-07-31 ADR-0028 Option B를 승인하고 freshness와
  reconciliation 후보 비교 및 권장값이 포함된 bounded implementation plan
  작성을 지시함. Owner는 production 배포 직전까지 불필요한 중간 의사결정
  요청 없이 진행하는 workflow를 선호한다고 명시함.
- Approved date: 2026-07-31

## 진행 결과

- Source/poll timestamp 분리, 정확히 3분 freshness 경계와 stale `unknown`을
  구현하고 기존 세 failing regression을 GREEN으로 전환했다.
- 관측 target Discord 사용자 중복 제거, guild별 single-flight, 2분 periodic
  reconciliation과 late Gateway-event generation 보호를 구현했다.
- Unknown Voice State만 정상 inactive로 취급하고 다른 provider failure와
  bounded timeout은 timestamp를 갱신하지 않는 `unknown`으로 정규화했다.
- Runtime 기본값 `120000/180000`과 순서·상한 검증을 systemd asset 및 bot
  assembly에 반영했다.
- Migration `0011`과 production runner 등록, nullable historical row와 신규
  Discord source timestamp persistence를 PostgreSQL 17에서 검증했다.
- `TMPDIR=/tmp npm test` 및 강제 PostgreSQL 모드는
  `307 tests / 300 pass / 7 explicit external-URL skips / 0 fail`,
  별도 observation-store PostgreSQL integration은 `1/1`, typecheck, server/web
  build, migration asset 11개와 diff check가 PASS했다.
- Docker daemon이 꺼져 container wrapper는 실행되지 않았다. Host PostgreSQL
  17의 빈 cluster에 migrations 0001~0011을 적용해 schema `11|11`과 신규 store
  integration을 대신 검증했다.
- Exact candidate `4f8832124f194e92a29003eb7f8c7056bce5e60b`의 fresh encrypted
  backup과 별도 PostgreSQL 17 restore, schema `10→11`, immutable stage와
  production tree 동일성을 검증했다.
- Production current `4f8832124f19`, previous `19ea83925f6b`, schema `11`,
  effective observation/reconciliation/freshness `1/120000/180000`을
  read-back했다. Loopback/canonical health, Gateway connected와 240초 동안
  5개 fresh checkpoint, backup/monitor timer가 PASS했다.
- 최종 관측 구간에는 active target이 없어 sanitized Voice 결과는
  `NO_ACTIVE_TARGET`였다. 실제 솔로랭크 경기별 fresh source timestamp 회귀는
  PLAN-0013의 real-game smoke와 함께 남아 있다.
- Production merge가 자동 deploy workflow를 시작해 build 중 취소했다. 비활성
  release와 remote temp를 제거하고 승인된 candidate만 수동 activation했다.
  자동 production deploy 승인 경계 수정은 별도 후속 architecture task다.
- 첫 activation verifier는 Gateway 연결 완료 뒤의 시각부터 journal을 조회해
  state row가 없다는 이유로 잘못 실패했다. 5개 health checkpoint는 정상이었고
  최종 symlink read-back은 candidate active 상태였다. 최종 판정은 restart 없는
  read-only acceptance로 수행했다.
