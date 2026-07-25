# ADR-0017: 대시보드-봇 관리자 명령용 별도 로컬 IPC

- Status: Accepted
- Date: 2026-07-25
- Owners: 프로젝트 소유자
- Related requirements: `FUN-005`, `FUN-015`, `OWN-028`, `OWN-031`~`OWN-034`, `SEC-001`~`SEC-010`, `INT-001`~`INT-003`
- Related research: `docs/research/technology-options/deployment-boundary-and-internal-communication.md`, `docs/research/technology-options/storage-auth-deployment-boundary-integration-review.md`
- Related ADRs: `ADR-0007`, `ADR-0013`, `ADR-0015`, `ADR-0016`
- Supersedes: 없음
- Superseded by: 없음

## Context

`ADR-0015`는 web이 Discord bot token을 받지 않으면서 mutation 시점의 현재
Discord 역할을 확인하도록 4 KiB 단건 Unix socket lookup을 채택했다. 이
protocol은 `{actorId,guildId}`에 대한 allowlisted 역할 결과만 반환하며 상태
변경, pagination 또는 실행 결과 재조정을 담당하지 않는다.

PLAN-0005는 대시보드에서 Riot 연결 승인 대기 목록을 조회하고 관리자만 승인·
거절하도록 요구한다. HTTP 경계는 이미 다음을 강제한다.

- 목록: CSRF가 적용된 mutation 인증과 현재 administrator 역할
- 승인·거절: CSRF, 15분 이내 OAuth, 명시적 `confirmation: true`, 현재
  administrator 역할
- 승인·거절: `expectedVersion`을 이용한 stale 방지

Web runtime에 bot feature table 쓰기 권한을 주지 않았기 때문에 production
port는 현재 `riot_admin_ipc_unavailable`로 실패한다. Bot에는 관리자 executor와
PUUID validation port, operation deduplication, row lock, mutation·감사 원자
transaction이 존재한다.

관리 명령은 역할 lookup과 다른 전달 성질을 가진다. 목록은 pagination이 필요하고,
승인·거절 timeout은 실제 반영 여부가 불명확할 수 있으므로 안정된
`operationId`로 결과를 조회할 수 있어야 한다. PUUID와 Riot ID는 Discord
원문·credential은 아니지만 필요 최소 범위로 제한해야 하는 개인 식별 데이터다.

Node.js의 안정된 `node:net` API는 filesystem pathname의 Unix domain socket
server/client를 지원한다. Unix socket path는 process crash 뒤 남을 수 있으므로
기존 ADR-0015와 같은 owned-socket 확인이 필요하다.
[Node.js IPC documentation](https://nodejs.org/api/net.html#ipc-support)

PostgreSQL `SELECT ... FOR UPDATE`는 같은 행의 동시 writer를 transaction 종료까지
차단하며 row lock은 transaction 종료 시 해제된다. 따라서 transport가 아닌 bot
transaction이 stale 방지와 단일 상태 전이의 최종 경계여야 한다.
[PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS)

## Decision drivers

1. Web은 Discord bot token과 bot DB mutation credential을 받지 않아야 한다.
2. Bot은 browser cookie, session ID, OAuth code/token 또는 CSRF token을 받지
   않아야 한다.
3. 기존 member-role lookup의 작은 무상태 protocol과 장애 영역을 유지해야 한다.
4. OS 경계 밖에서 접근 가능한 TCP/public listener를 추가하지 않아야 한다.
5. Bot은 web이 전달한 authorization tier를 신뢰하지 않고 현재 Discord 역할을
   다시 확인해야 한다.
6. 승인·거절은 안정된 operation ID, optimistic version과 DB transaction으로
   중복·stale·감사 원자성을 보장해야 한다.
7. Timeout 뒤 성공이나 실패를 추정하지 않고 영구 결과 조회로 재조정해야 한다.
8. Request/response와 log는 exact allowlist를 사용하고 PUUID·Riot ID, secret과
   browser 인증정보를 운영 log에 남기지 않아야 한다.
9. 목록 크기는 frame 제한 안에서 pagination해야 하며 malformed, oversized,
   multi-frame과 과도한 concurrency를 기본 거부해야 한다.
10. IPC 장애 시 web mutation은 fail closed하고 direct DB write로 우회하지 않아야
    한다.

## Considered options

### Option A: 별도 Unix domain socket 관리자 명령 protocol

Bot이 `/run/waw-admin-command/admin-command.sock`에서 관리자 작업만 allowlist한
versioned JSON Lines request/reply server를 제공한다. 전용 systemd runtime
directory와 group으로 기존 역할 lookup capability와 분리한다.

장점은 public listener나 새 secret 없이 OS user/group 경계를 재사용하고, 역할
lookup protocol을 단순하게 유지하며, bot executor의 transaction을 최종 mutation
경계로 유지하는 것이다. 단점은 두 번째 socket lifecycle과 결과 조회 protocol을
운영해야 한다는 점이다.

### Option B: ADR-0015 member-role socket을 범용 command protocol로 확장

Socket과 group을 재사용할 수 있지만 현재 4 KiB 역할 lookup endpoint가 PUUID,
pagination, mutation과 결과 조회까지 수행하게 된다. 역할 조회만 필요한 미래
caller도 관리자 command capability를 얻게 되고 protocol 오류·부하가 current-role
인가에 전파된다.

### Option C: PostgreSQL command inbox와 bot polling

Web이 최소 권한으로 command row를 쓰고 bot이 claim·실행·결과를 기록한다.
영구 queue와 timeout 재조정은 자연스럽지만 web DB credential에 command enqueue
capability를 추가하고 polling 지연·orphan reconciliation·retention을 운영해야
한다. 같은 host의 낮은 관리자 요청량에 별도 durable queue를 추가할 근거가 약하다.

### Option D: Web에 feature table mutation 권한 부여

IPC가 필요 없지만 bot-side current role과 validator/executor를 우회하고 web
침해 범위를 Riot link와 감사 mutation으로 확대한다. Operations capability
matrix와 기존 RLS 분리에 충돌한다.

## Decision

Option A를 제안한다. 이 결정은 ADR-0015를 supersede하지 않으며 별도 capability로
확장한다.

### Process와 socket 경계

- Bot은 `/run/waw-admin-command/admin-command.sock` 하나를 소유한다.
- Socket mode는 `0660`, owner는 `waw-bot`, group은 전용
  `waw-admin-command`로 한다. `waw-web`만 보조 구성원으로 허용한다.
- 기존 `/run/waw-member-role/member-role.sock`과 `waw-member-role` group은
  변경하지 않는다.
- Path가 bot 소유 socket일 때만 startup에서 stale path를 제거한다. Symlink,
  regular file, 다른 owner target이면 bot 시작을 거부한다.
- Public/loopback TCP listener, shared application secret과 web의 bot credential은
  추가하지 않는다.
- Server는 bounded connection backlog와 최대 8개 동시 처리로 bot Gateway
  event loop를 보호한다. 초과 요청은 실행하지 않고 `unavailable`로 닫는다.

### Protocol

- 별도 protocol version은 `1`이고 한 connection당 한 request와 한 response의
  JSON Lines를 사용한다.
- Request와 response는 exact-key schema를 사용한다. Unknown field, 여러 frame,
  잘못된 UTF-8/JSON, 최대 32 KiB 초과 frame은 실행 전에 거부한다.
- 모든 요청은 `version`, transport `requestId`, `operationId`, `actorId`,
  `guildId`, `command`, `requestedAt`, `expiresAt`, command별 `payload`만
  허용한다.
- `requestId`는 한 왕복을 결합하고 `operationId`는 재시도와 영구 결과를
  결합한다. 둘을 혼용하지 않는다.
- Mutation TTL은 생성 시점부터 최대 15초이고 bot 수신 시 만료된 요청은
  mutation 없이 감사 후 거부한다.
- Client 전체 deadline은 3초다. Connect/read timeout, EOF, malformed response,
  request ID mismatch와 bot unavailable은 `unavailable`이다. Mutation timeout은
  실패 확정이 아니라 `outcome_unknown`으로 처리한다.

Allowlisted command는 다음 네 개뿐이다.

1. `riot_link_request_list`
   - payload: 최대 50의 `limit`과 선택적 opaque cursor
   - response: 다음 cursor와 pending request의 dashboard DTO 필드만 반환
2. `riot_link_request_approve`
   - payload: `requestId`, `expectedVersion`, `linkId`, `puuid`
3. `riot_link_request_reject`
   - payload: `requestId`, `expectedVersion`
4. `operation_status`
   - payload: 조회할 `operationId`
   - response: 영구 저장된 allowlisted terminal outcome/reason 또는 `unknown`

Generic method name, SQL, arbitrary command payload와 batch mutation은 허용하지
않는다. List response가 frame 한도를 넘지 않도록 server가 page size와 각 문자열
길이를 다시 검증한다.

### Authorization과 browser trust boundary

- Web은 기존 HTTP 경계에서 session, exact Origin/CSRF, 현재 역할을 확인한다.
  승인·거절에는 15분 recent OAuth와 명시적 confirmation도 확인한다.
- Web에서 인증 전에 거부된 attempt는 web 감사 경계가 기록해야 하며 감사 저장
  실패 시 IPC로 전달하지 않는다.
- Bot은 request의 `actorId`와 `guildId`로 Discord current member를 다시 읽고
  administrator인지 확인한다. Request에는 `authorizationTier`, session ID,
  cookie, CSRF token, OAuth timestamp/code/token을 넣지 않는다.
- Bot current-role 조회가 timeout, 429, unavailable 또는 unauthorized이면
  mutation과 대상/PUUID 조회 전에 거부하고 allowlisted 실패 감사를 기록한다.
- Filesystem group membership은 web process에 이 네 command를 요청할
  capability를 부여한다. Browser 인증 증거 자체는 bot으로 복제하지 않으며,
  CSRF/recent OAuth/confirmation 검증은 web process의 책임으로 남는다.

### Idempotency, result reconciliation과 audit

- Bot은 mutation 전에 `operationId`를 영구 claim한다. 같은 ID 재전송은 새
  mutation을 실행하지 않고 기존 결과를 반환한다.
- 승인·거절은 request row를 `FOR UPDATE`로 잠그고 `expectedVersion`을 비교한다.
- Operation claim, domain mutation, terminal operation result와 audit event는
  같은 PostgreSQL transaction에서 commit하거나 모두 rollback한다.
- Audit 실패 시 mutation 결과를 성공으로 반환하지 않는다.
- Client가 mutation response 전에 timeout되면 같은 operation ID를
  `operation_status`로 조회한다. Terminal 결과가 없으면 새 operation ID로
  재실행하지 않고 `unknown`을 표시한다.
- Result와 audit에는 actor, guild, command, operation/correlation ID, outcome,
  reason code와 timestamp만 둔다. PUUID, Riot ID, browser/session 정보와
  provider body는 저장하거나 log에 기록하지 않는다.
- 목록은 mutation이 아니지만 성공·실패·권한 거부 attempt를 감사한다.

## Rationale

별도 socket은 역할 lookup caller에게 관리자 mutation capability를 주지 않고,
pagination·개인 식별 데이터·timeout 재조정의 복잡성이 현재 인가 protocol을
방해하지 않게 한다. 같은 host의 filesystem 권한은 추가 network credential 없이
web process만 client로 제한한다.

Transport는 exactly-once를 보장하지 않는다. 안정된 operation ID, 영구 terminal
result, row version과 bot-side transaction을 함께 사용해야 timeout·재전송과 동시
관리자 결정을 안전하게 처리할 수 있다.

## Consequences

### Positive

- Web과 bot credential 및 DB mutation capability 분리를 유지한다.
- 기존 역할 lookup의 4 KiB schema와 장애 영역을 보존한다.
- 승인·거절 timeout 뒤 결과를 추정하지 않고 조회할 수 있다.
- Bot-side current role, PUUID validator, row lock과 audit transaction을 우회하지
  않는다.
- Production web port는 IPC가 준비될 때까지 계속 503 fail closed할 수 있다.

### Negative

- 두 번째 socket path, group, protocol과 lifecycle을 운영한다.
- Web process는 제한된 관리자 command capability를 가지므로 web 침해 시 bot에
  악성 요청을 보낼 수 있다. Bot의 current-role·schema·version·validator 검사가
  피해 범위를 제한하지만 browser recent-auth를 독립 검증하지는 못한다.
- 영구 terminal operation result와 paginated list cursor 계약을 구현해야 한다.
- Linux/systemd 권한 통합은 Windows 단위 테스트만으로 완전히 검증할 수 없다.

### Risks

- Web의 pre-dispatch 감사와 bot의 mutation 감사 사이가 분리되어 orphan attempt가
  생길 수 있다. Operation ID로 둘을 연결하고 terminal result 없는 요청을
  운영 점검해야 한다.
- 32 KiB frame이나 높은 connection 수가 bot event loop를 방해할 수 있다.
- Socket group에 다른 user가 추가되면 관리자 command oracle/capability가 된다.
- PUUID 또는 Riot ID가 parser 오류와 operational log에 반사될 수 있다.
- Timeout 뒤 새 operation ID로 재시도하면 중복 의도를 만들 수 있다.
- Bot 재시작 중 web이 stale 성공 결과를 현재 처리 결과처럼 표시할 수 있다.

## Validation

- Exact request/response schema, command별 payload, timestamp/TTL, cursor, string
  length, unknown field, malformed JSON/UTF-8, multi-frame와 32 KiB frame test
- Request ID mismatch, EOF, connect/read timeout과 late response
  `outcome_unknown` test
- Mutation timeout 뒤 같은 operation ID 결과 조회, duplicate delivery와
  concurrent administrator decision test
- Bot-side current-role 선검사: operator, removed member, wrong guild,
  Discord 429/5xx/timeout에서 대상·PUUID·mutation 미접근과 denied audit test
- PUUID validator 실패, stale version, active PUUID conflict와 audit 실패
  transaction rollback test
- Paginated list의 page boundary, stable cursor, frame 상한과 개인정보
  비반사 operational log test
- Socket owner/group/mode, unrelated user 거부, 8-connection bound, stale socket,
  symlink/regular-file refusal와 bot restart의 disposable Ubuntu test
- Web unit에 bot token/feature DB mutation credential이 없고 bot unit에 browser
  session/OAuth credential이 없는 systemd·`/proc` 검증
- IPC unavailable이면 HTTP 503, stale이면 409, timeout/unknown이면 성공을
  주장하지 않는 Fastify integration test

## Rollback or migration

- Web의 Riot 관리자 ports를 다시 `riot_admin_ipc_unavailable` 503으로 둔다.
- Admin command client/server, 전용 socket runtime directory와 group membership을
  제거한다.
- 기존 member-role IPC, OAuth/session, bot command와 PostgreSQL feature data는
  유지한다.
- 이미 기록된 operation/audit 결과는 삭제하지 않는다.
- Web DB 권한 확대나 bot token 공유를 rollback 대안으로 사용하지 않는다.

## Conditions for reconsideration

- Web과 bot이 다른 host로 이동해 filesystem socket을 공유할 수 없는 경우
- 관리자 작업량이나 payload가 bounded request/reply와 pagination으로 감당할 수
  없는 경우
- Node.js Unix socket 경계에서 필요한 peer/process 제한을 systemd group으로
  검증하지 못한 경우
- Operation result reconciliation이 별도 durable queue보다 복잡하거나 신뢰성이
  낮다는 spike 증거가 생긴 경우

## Approval

- Owner decision: Approved — 기존 member-role lookup과 분리된 권한 제한
  Unix socket 관리자 명령 protocol, bot-side current-role 재확인,
  operation 결과 재조정과 원자 감사를 승인함
- Approved date: 2026-07-26
