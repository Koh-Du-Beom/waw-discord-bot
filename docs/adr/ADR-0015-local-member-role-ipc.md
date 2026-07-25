# ADR-0015: 웹-봇 현재 역할 조회용 로컬 IPC

- Status: Accepted
- Date: 2026-07-26
- Owners: 프로젝트 소유자
- Related requirements: `OWN-028`, `OWN-031`~`OWN-034`, `SEC-001`~`SEC-010`, `OPS-001`~`OPS-002`
- Related research: `docs/research/technology-options/deployment-boundary-and-internal-communication.md`, `docs/research/technology-options/storage-auth-deployment-boundary-integration-review.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

`ADR-0007`은 Discord OAuth user token을 보존하지 않고 bot-side current member
조회로 권한을 판정하며, web과 bot 사이의 경계를 같은 host의 local module/process
경계로 제한했다. `ADR-0011`과 `ADR-0013`은 web과 bot을 서로 다른 systemd
사용자·unit·credential로 분리한다.

일반 read-only 요청에는 최대 5분의 성공한 role cache를 쓸 수 있지만 mutation은
현재 역할을 강제로 재조회해야 한다. 따라서 PostgreSQL의 비동기 role cache만으로는
승인된 계약을 만족하지 못한다. 반대로 web에 Discord bot token을 주거나 인터넷
또는 loopback TCP API를 추가하면 credential과 network 경계를 넓힌다.

Node.js의 안정화된 `node:net` API는 Unix domain socket IPC를 지원하며 socket
path를 파일시스템 권한으로 제한할 수 있다. systemd가 관리하는 `/run` 아래 runtime
directory는 재부팅 후 남지 않는 process runtime object에 적합하다.

- [Node.js `node:net` IPC documentation](https://nodejs.org/api/net.html#ipc-support)
- [systemd `RuntimeDirectory=` documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#RuntimeDirectory=)

## Decision drivers

1. web은 Discord bot token을 읽지 않아야 한다.
2. bot은 browser cookie, OAuth code/token과 web DB credential을 읽지 않아야 한다.
3. mutation은 짧은 deadline 안에 current member/role 결과를 받아야 하며 실패 시
   기본 거부해야 한다.
4. public 또는 TCP listener를 추가하지 않아야 한다.
5. 허용된 web process만 lookup을 요청할 수 있어야 한다.
6. 요청과 log에는 Discord user ID와 allowlisted 결과 코드 외의 secret·원문을
   포함하지 않아야 한다.
7. stale socket, bot restart, malformed/oversized input과 timeout을 재현 가능하게
   검증해야 한다.

## Considered options

### Option A: Unix domain socket request/reply

bot이 `/run/waw-member-role/member-role.sock`에서 짧은 JSON Lines
request/reply protocol을 제공한다. systemd가 runtime directory를 만들고
`waw-bot` 소유, 전용 shared group 읽기/쓰기, group 외 접근 금지로 제한한다.
web만 그 group의 보조 구성원이다.

### Option B: PostgreSQL role cache polling

bot이 주기적으로 cache를 쓰고 web이 읽는다. 기존 저장소를 재사용하지만 mutation
시점의 강제 재조회를 증명하지 못하며 bot 장애 직전의 stale 값을 현재 권한으로
오인할 수 있다.

### Option C: loopback HTTP/TCP API

구현과 진단은 익숙하지만 host의 다른 process가 접속할 수 있는 network listener와
별도 application authentication을 추가한다. 첫 MVP의 최소 공개·내부 면적보다 넓다.

### Option D: web process에 bot token 제공

경계 구현은 가장 단순하지만 web 침해가 Discord bot credential까지 확장되어
`ADR-0007`, `ADR-0013`과 충돌한다.

## Decision

Option A를 채택한다.

- protocol은 version `1`의 한 요청·한 응답 JSON Lines다.
- 요청은 `{version, requestId, actorId, guildId}`만 허용한다. `actorId`와
  `guildId`는 Discord snowflake 형식이어야 하고 unknown field, 여러 frame,
  4 KiB 초과 frame은 거부한다.
- 응답은 같은 `requestId`와 `operator`, `administrator`, `unauthorized`,
  `unavailable` 중 하나만 반환한다. role ID, Discord profile, token과 provider
  body는 반환하거나 기록하지 않는다.
- web client의 전체 deadline은 3초다. connect/read timeout, EOF, malformed
  response, request ID mismatch와 bot unavailable은 모두 `unavailable`로 닫힌다.
- bot은 요청마다 Discord cache 또는 fetch로 allowed guild의 현재 member를
  확인하고 server-side allowlisted role mapping을 적용한다.
- socket은 `/run/waw-member-role/member-role.sock`에 두고 mode `0660`,
  owner `waw-bot`, group `waw-member-role`로 제한한다. `waw-web`만 shared
  group에 추가하며 다른 application user는 추가하지 않는다.
- stale socket은 bot startup에서 path가 socket인지 확인한 뒤에만 제거한다.
  symlink·regular file·다른 owner target이면 시작을 거부한다.
- bot restart 동안 web read는 유효한 5분 cache만 사용할 수 있고 mutation은
  즉시 deny한다. systemd dependency는 web을 bot에 강결합하지 않는다.

## Rationale

Unix socket은 별도 public/TCP endpoint와 application credential을 만들지 않으면서
OS 사용자·group 경계를 활용한다. 동기 request/reply는 mutation의 current-role
요구를 충족하고, Discord 또는 bot 장애를 짧은 deadline 안에 기본 거부로 닫을 수
있다. PostgreSQL cache는 read-only 장애 완화에만 유지한다.

## Consequences

### Positive

- web과 bot credential의 분리를 유지한다.
- host 외부와 shared group 밖 process가 role lookup을 호출할 수 없다.
- current lookup 실패를 cache와 구분해 mutation을 안전하게 거부할 수 있다.

### Negative

- 작은 versioned IPC protocol, frame 제한, timeout과 socket lifecycle을 운영한다.
- `waw-web`과 `waw-bot` 사이에 제한된 shared group 경계가 생긴다.
- Linux/systemd production 경계에 맞춘 구현이라 Windows local test에는 임시
  Unix socket 또는 named-pipe 호환 fixture가 필요하다.

### Risks

- shared group에 다른 process가 추가되면 Discord user ID에 대한 lookup oracle이
  될 수 있다.
- stale socket을 안전하지 않게 정리하면 symlink/path replacement 문제가 생길 수
  있다.
- Discord API rate limit이나 large request flood가 Gateway process를 방해할 수
  있으므로 connection/frame/concurrency 제한이 필요하다.

## Validation

- protocol schema, unknown field, snowflake, frame size, multi-frame과 request ID
  mismatch RED→GREEN unit test
- allowed role, no role, missing member, timeout, 429/5xx와 disconnect 기본 거부 test
- 실제 Unix socket에서 web user 허용, unrelated user 거부와 socket mode/owner
  disposable Ubuntu test
- stale regular file/symlink default-deny, bot restart와 graceful shutdown test
- web process에 bot credential이 없고 bot process에 web credential이 없는
  `/proc`·systemd credential isolation 재검증
- mutation은 IPC 장애 때 deny되고 read-only만 5분 cache를 쓰는 HTTP integration test

## Rollback or migration

IPC server/client와 shared group membership을 제거하고 web mutation을
`unavailable`로 유지한다. PostgreSQL role cache와 OAuth/session schema에는
destructive rollback이 없다. 이전 release로 되돌릴 때 socket과 runtime directory는
service stop 뒤 제거하며 bot token을 web에 주는 fallback은 허용하지 않는다.

## Conditions for reconsideration

- disposable Ubuntu Spike에서 group/socket 권한이 credential blast radius를 줄이지
  못하는 경우
- Discord current member 조회가 3초 deadline과 rate-limit 기준을 지속적으로
  만족하지 못하는 경우
- web과 bot이 다른 host로 분리되는 승인된 후속 architecture가 필요한 경우

## Approval

- Owner decision: Approved — 권한 제한 Unix socket request/reply 경계
- Approved date: 2026-07-26
