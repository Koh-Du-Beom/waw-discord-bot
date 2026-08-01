# ADR-0030: 검거 대시보드 조회와 관리자 사건 변경 경계

- Status: Accepted
- Date: 2026-08-01
- Owners: Product owner
- Related requirements: FUN-016, FUN-018, FUN-019, SEC-001, SEC-002, OWN-008, OWN-013, OWN-020, OWN-028, OWN-031
- Related research: `docs/research/technical-constraints.md`, `docs/research/technology-options/data-flow-and-threat-model.md`, `docs/research/technology-options/deployment-boundary-and-internal-communication.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

제품 정책은 canonical dashboard의 몰랭 영역에서 등록 사용자와 Riot 계정,
진행 중 게임, 검거 이력, 오탐 정정, 점수·스택과 감지 정책을 제공하도록 요구한다.
현재 production에는 Riot/Discord 관측, 사건, 정정·취소, 1스택 집계와 Discord
명령 경로가 있지만 web은 Riot 연결과 운영 정보만 표시한다.

Web은 PostgreSQL의 game table을 읽을 수 있지만 bot mutation capability와 Discord
bot token을 가지지 않는다. 기존 dashboard 관리자 mutation은 Unix socket에서
current administrator를 재확인하고 terminal result와 감사를 원자적으로 남긴다.

## Decision drivers

1. 운영자는 현재·과거 관측과 스택을 조회할 수 있어야 한다.
2. `unknown` 증거를 위반으로 추정하지 않고 Riot과 Go Live 상태를 따로 표시한다.
3. 목록은 bounded cursor pagination과 명시적인 freshness 시각을 사용해야 한다.
4. 정정·취소는 관리자만 수행하고 stale 화면, 중복 실행과 timeout에 안전해야 한다.
5. Web에 bot token이나 game table 쓰기 권한을 추가하지 않아야 한다.
6. Riot ID, PUUID, Discord ID와 정정 사유를 운영 로그에 기록하지 않아야 한다.
7. 기존 사건·revision·감사 기록을 덮어쓰거나 삭제하지 않아야 한다.

## Considered options

### Option A: Web read model + 기존 관리자 Unix socket 확장

Web workload의 기존 read-only PostgreSQL 권한으로 allowlisted DTO를 만들고,
정정·취소만 versioned admin-command IPC로 bot에 전달한다. Bot이 current role을
재확인하고 기존 사건 transaction을 재사용한다.

### Option B: 모든 조회와 변경을 bot IPC로 전달

Bot이 단일 domain entry point가 되지만 pagination·filter 조회 트래픽이 Gateway
process와 socket에 집중되고 web의 이미 승인된 read-only DB capability를 쓰지
못한다.

### Option C: Web에 사건 변경 DB 권한 부여

구현은 직접적이지만 web 침해 범위가 관측·사건 mutation으로 넓어지고 bot-side
current-role 재확인과 기존 IPC 감사 경계를 우회한다.

## Decision

Option A를 제안한다.

- `몰랭` 탭은 요약 스택, 진행 중 관측과 cursor 기반 사건 이력을 별도 query로
  읽는다. 기본 page 크기는 50, 최대 100이며 자유로운 offset 조회는 사용하지 않는다.
- Response DTO는 사용자 표시명, 현재 Riot ID, platform, game key, Riot/Go Live
  상태, 비교 판정, 사건 상태·version과 관측시각만 allowlist한다. PUUID는 제외한다.
- 모든 상태에는 관측시각을 표시하고 freshness 기준을 넘은 증거는 현재 상태처럼
  표현하지 않는다. `unknown`은 중립적인 별도 상태로 유지한다.
- 읽기는 현재 operator 또는 administrator를 요구하며 기존 5분 read cache 계약을 따른다.
- 정정과 취소는 administrator, exact Origin/CSRF, 15분 이내 OAuth, 명시적 확인,
  사건 expected version을 요구한다.
- Web은 `game_incident_correct`와 `game_incident_cancel` 명령만 기존 Unix socket
  allowlist에 추가한다. Bot은 current administrator를 다시 확인한 뒤 기존
  `IncidentService` transaction을 재사용한다.
- Mutation은 operation claim, incident revision, incident version 변경, terminal
  result와 audit를 한 transaction에서 commit하거나 rollback한다. Timeout은 결과를
  추정하지 않고 같은 operation ID로 조회한다.
- 감지 정책은 첫 slice에서 현재 effective 값과 source를 read-only로 표시한다.
  Web에서 정책을 변경하는 기능은 canonical DB 설정, bot 적용 확인과 5분/10분
  비동기 계약을 별도 Accepted ADR로 정하기 전까지 제공하지 않는다.
- UI filter는 상태, 사용자와 기간으로 제한하고 URL·운영 로그에 Riot ID, raw
  Discord ID와 정정 사유를 넣지 않는다.
- 현재 schema는 사건과 특정 Riot link를 연결하지 않는다. 활성 link가 정확히
  하나일 때만 그 현재 Riot ID를 표시하고, 0개 또는 여러 개면 오귀속을 피하도록
  `null`을 반환한다. 실제 플레이 계정 귀속이 필요하면 additive link reference와
  historical identity 보존 경계를 별도 결정한다.

## Rationale

조회는 기존 최소 권한을 재사용하고 mutation만 이미 검증된 bot IPC로 보내면
새 public listener나 credential 없이 제품 요구를 충족할 수 있다. 조회와 변경을
분리하면 dashboard 장애가 관측 scheduler를 방해하지 않고, bot의 기존 사건
불변식과 current-role 검사를 유지한다.

## Consequences

### Positive

- Discord 명령과 dashboard가 같은 사건·스택 정의를 사용한다.
- Web DB 권한과 bot credential 경계를 유지한다.
- stale version과 불명확한 timeout에서 안전하게 실패한다.

### Negative

- Read DTO/query와 mutation IPC 두 경계를 함께 유지해야 한다.
- 진행 중 게임은 poll 시점 사이에서 잠시 오래된 상태일 수 있다.
- 감지 정책의 web 변경은 후속 결정 전까지 미완료로 남는다.

### Risks

- 잘못된 join이 다른 사용자의 식별자나 불필요한 evidence를 노출할 수 있다.
- cursor 정렬이 불안정하면 사건이 중복되거나 누락될 수 있다.
- UI가 `unknown` 또는 오래된 관측을 위반으로 오해하게 표현할 수 있다.
- 정정·취소 IPC와 Discord 명령이 서로 다른 mutation 규칙을 사용하면 drift가 생긴다.

## Validation

- DTO allowlist와 PUUID/raw provider body 비노출 contract test
- operator/admin read, 일반 member·expired/revoked/stale-role deny test
- stable cursor, 동일 시각 tie-break, filter, empty/next page test
- stale freshness와 `unknown` 표시 browser test 및 axe 검사
- current admin, recent auth, CSRF, confirmation, version conflict와 IPC 장애 test
- disposable PostgreSQL 17에서 revision·incident·result·audit 원자성과 기존
  Discord mutation 회귀 검증
- 100건 경계와 1GB host에서 query plan·응답 크기 확인

## Rollback or migration

Web route/tab과 두 IPC command를 비활성화하고 이전 release로 복귀한다. Additive
index가 필요하면 남겨도 무해해야 하며 사건, revision, 관측과 감사 row는 삭제하거나
되돌리지 않는다. Web에 write grant를 주는 rollback은 허용하지 않는다.

## Conditions for reconsideration

- Web과 bot이 서로 다른 host로 분리된다.
- 조회량이 bot 관측 또는 PostgreSQL capacity를 방해한다.
- 실시간 push가 60초 이하 polling보다 명확한 제품 요구가 된다.
- Web에서 감지 정책 변경이 승인되어 canonical setting·적용 확인 경계가 결정된다.

## Approval

- Owner decision: Approved — Option A의 web read model과 기존 관리자 Unix
  socket 확장, high-risk 정정·취소 경계, 첫 slice의 감지 정책 read-only 제한
- Approved date: 2026-08-01
