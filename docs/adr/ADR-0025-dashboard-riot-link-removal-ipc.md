# ADR-0025: 대시보드 Riot 계정 연결 해제용 관리자 IPC 확장

- Status: Accepted
- Date: 2026-07-29
- Owners: 프로젝트 소유자
- Related requirements: `FUN-005`, `FUN-015`, `FUN-018`, `OWN-015`, `SEC-001`~`SEC-010`
- Related research: `docs/research/technology-options/deployment-boundary-and-internal-communication.md`, `docs/research/technology-options/data-flow-and-threat-model.md`
- Related ADRs: `ADR-0015`, `ADR-0016`, `ADR-0017`, `ADR-0020`
- Supersedes: 없음
- Superseded by: 없음

## Context

관리 대시보드는 활성 Riot 계정 연결과 승인 대기 요청을 함께 조회하지만,
활성 연결을 해제할 수는 없다. Discord 사용자는 자신의 연결 ID를 이용해
`/라이엇계정 연결해제`를 실행할 수 있으나, 관리자는 분쟁·오등록·사용자 지원
상황에서 대시보드로 연결을 종료할 수 없다.

`ADR-0016`은 disputed active link를 삭제하지 않고 `removed_at`으로 닫으며,
연결 해제 뒤 해당 계정을 후속 자동 관측 대상에서 제외하도록 결정했다.
`ADR-0017`은 web에 bot feature mutation DB 권한을 주지 않고 별도 Unix socket의
네 command만 exact allowlist한다. 현재 protocol은 generic mutation을 금지하고
승인·거절만 허용하므로, 관리자 해제를 기존 payload에 암묵적으로 추가할 수 없다.

연결 해제는 승인 거절보다 영향이 크다. 활성 링크의 후속 Riot/Go Live 관측이
중단되고, 같은 PUUID를 향후 다른 사용자에게 연결할 수 있게 된다. 반면 이미
기록된 게임 관측, 사건, 정정·취소 및 감사 이력은 보존되어야 한다.

## Decision drivers

1. Web runtime에 bot token 또는 Riot feature table mutation 권한을 추가하지
   않아야 한다.
2. 현재 administrator 역할, 15분 이내 OAuth, exact Origin/CSRF와 명시적 확인을
   모두 통과한 요청만 해제를 시도해야 한다.
3. Bot은 web이 주장하는 권한을 신뢰하지 않고 대상 링크 조회 전에 현재 Discord
   administrator 역할을 다시 확인해야 한다.
4. 연결 ID와 optimistic version으로 정확한 활성 링크 하나만 닫고 stale·중복
   요청에 안전해야 한다.
5. Timeout 뒤 성공 여부를 추정하지 않고 기존 operation result 재조정 계약을
   사용해야 한다.
6. Link 종료, operation claim, terminal result와 감사는 한 transaction에서
   commit 또는 rollback되어야 한다.
7. 해제 즉시 새 scheduler target 조회에서 제외하되 기존 관측·사건·감사 기록은
   삭제하거나 다시 쓰지 않아야 한다.
8. PUUID, Riot ID, Discord ID, browser/session 정보와 확인 사유 원문을 운영
   log에 남기지 않아야 한다.
9. Batch 해제, hard delete, PUUID 재할당과 과거 사건 정리는 이번 결정에
   포함하지 않아야 한다.

## Considered options

### Option A: ADR-0017 IPC에 단건 `riot_link_remove` 명령 추가

기존 관리자 socket, bot-side current-role 재확인, operation deduplication,
terminal result와 감사 transaction을 재사용한다. Web은 활성 링크 read model에서
받은 `linkId`와 `expectedVersion`만 전달하고 bot이 canonical row를 다시 읽는다.

장점은 기존 capability 분리와 timeout 재조정 경계를 유지하며 새 network
listener, secret 또는 DB role을 만들지 않는 것이다. 단점은 protocol schema와
영구 result reason code를 확장하고 bot/web 양쪽 배포를 조정해야 한다는 점이다.

### Option B: Web DB role에 제한된 링크 종료 권한 추가

Web 전용 stored procedure 또는 `UPDATE removed_at` 권한으로 직접 해제한다.
왕복이 짧고 bot IPC 장애와 무관하지만 bot-side Discord 역할 재확인과 단일
관리 명령 경계를 우회한다. Web 침해 시 활성 Riot 링크 mutation capability가
직접 노출되고, ADR-0017의 capability matrix와 충돌한다.

### Option C: Discord 관리자 명령만 제공하고 대시보드는 읽기 전용 유지

관리자 전용 Discord slash command를 새로 만들어 bot 안에서만 처리한다.
Capability 분리는 단순하지만 사용자가 요청한 대시보드 운영 흐름을 충족하지
못하며 연결 ID를 복사해 다른 UI로 이동해야 한다.

### Option D: 계정 row hard delete와 관련 관측 정리

현재 연결만 완전히 제거하고 관련 관측도 함께 삭제할 수 있다. 그러나 감사,
정정, 오탐 분석과 참조 무결성을 훼손하고 `ADR-0016`의 `removed_at` 종료
결정을 위반한다.

## Decision

Option A를 선택한다. 이 ADR은 `ADR-0017`을 supersede하지 않고 그 versioned
관리자 command protocol에 단건 연결 해제 capability를 명시적으로 추가한다.

### Protocol 확장

- Protocol version 1에 exact command `riot_link_remove`를 추가한다. Version을
  올려야 한다는 parser 또는 rollout 증거가 나오면 구현을 중단하고 별도 결정한다.
- Payload는 `linkId`, `expectedVersion`, `confirmation: true`만 허용한다.
- `discordUserId`, PUUID, Riot ID, removal timestamp, actor role, 사유 원문,
  browser session과 OAuth/CSRF 증거는 payload에 넣지 않는다.
- Response는 기존 terminal result envelope 안의 allowlisted
  `riot_link_removed`, `riot_link_not_found`, `riot_link_stale`,
  `administrator_required`, `request_expired`, `duplicate` 또는
  `outcome_unknown` 의미만 공개한다.
- Generic method, arbitrary SQL, batch target, wildcard와 여러 link ID는
  허용하지 않는다.
- 기존 32 KiB frame, 최대 15초 TTL, 3초 client deadline, 최대 8 connection,
  한 connection당 한 request/response와 `operation_status` 계약은 유지한다.

### HTTP와 authorization 경계

- 활성 링크 목록은 인증된 dashboard read 권한으로 조회하되 browser DTO에는
  `linkId`, `expectedVersion`, 표시용 사용자 label, Riot ID, platform과
  primary 여부만 포함한다. PUUID와 raw Discord user ID는 노출하지 않는다.
- 해제 HTTP mutation은 administrator에게만 제공한다.
- Web은 exact Origin/CSRF, 현재 administrator 역할, 15분 이내 OAuth와
  `confirmation: true`를 검증한다.
- UI는 대상 사용자 label과 Riot ID를 확인 dialog에 표시하고 단건 해제임을
  명확히 알린다. 확인 dialog의 표시 문자열은 IPC payload나 audit reason으로
  신뢰하지 않는다.
- Web pre-dispatch 감사가 실패하면 IPC를 호출하지 않는다.
- Bot은 `actorId`와 allowed `guildId`로 현재 Discord administrator를 대상 링크
  조회 전에 다시 확인한다. Discord lookup timeout·429·unavailable·unauthorized는
  해제 없이 fail closed한다.

### Domain mutation과 동시성

- `riot_account_link`에 `version bigint not null default 0`과 음수 거부 constraint를
  additive migration으로 추가한다. Migration은 구현 계획의 독립 task와 별도
  production migration gate로 둔다.
- Bot은 `linkId`로 활성 link row를 `FOR UPDATE`하고 `expectedVersion`을
  비교한다.
- 일치하는 활성 link 하나만 `removed_at=occurredAt`,
  `is_primary=false`, `version=version+1`로 갱신한다. Row를 hard delete하지
  않는다.
- 이미 제거됐거나 존재하지 않는 link는 `riot_link_not_found`, version이 다른
  활성 link는 `riot_link_stale`로 종료한다. 어느 경우에도 다른 link나
  pending request를 변경하지 않는다.
- 같은 `operationId`는 mutation을 반복하지 않고 기존 terminal result를
  반환한다. Response timeout 뒤에는 같은 ID의 `operation_status`만 조회하며
  새 operation ID로 자동 재실행하지 않는다.
- Operation claim, link mutation, terminal result와 bot audit은 같은
  PostgreSQL transaction에서 commit 또는 rollback한다.
- 해제 성공 뒤 active-link target source는 기존 `removed_at is null` 조건으로
  다음 조회부터 해당 링크를 제외한다. In-flight observation은 취소 성공으로
  오표현하지 않으며, 해제 시점 이후 늦게 도착한 결과를 저장하지 않는 계약을
  구현 계획에서 검증한다.

### 데이터와 감사

- 기존 관측, game incident, revision, command audit와 admin operation result는
  보존 정책에 따라 유지한다.
- 해제로 PUUID uniqueness가 풀려도 이 작업에서 다른 사용자에게 자동 재할당하거나
  pending 요청을 자동 승인하지 않는다.
- Web 감사와 bot 감사에는 actor, guild, command, operation/correlation ID,
  timestamp, outcome과 fixed reason code만 저장한다.
- PUUID, Riot ID, link ID, Discord user ID, 확인 dialog 문자열과 browser/session
  값은 operational log에 기록하지 않는다. Link ID가 영구 감사에 필요한지는
  구현 계획 전 data-minimization 검토로 결정하며 기본값은 operation result를
  통한 간접 추적이다.

## Rationale

기존 Unix socket 관리자 command 경계는 이미 current-role 재확인, 제한된
filesystem capability, idempotency, timeout 재조정과 원자 감사를 해결한다.
단건 해제를 같은 경계의 exact command로 추가하면 web DB 권한이나 새 credential
없이 일관된 보안 모델을 유지할 수 있다.

Optimistic version과 row lock은 운영자가 오래된 화면에서 이미 변경된 링크를
해제하는 것을 막는다. `removed_at` 종료는 관측 대상에서는 제외하면서 과거
사건과 감사 추적성을 보존한다.

## Consequences

### Positive

- 관리자는 대시보드에서 활성 Riot 연결 하나를 안전하게 해제할 수 있다.
- Web과 bot credential 및 DB mutation capability 분리를 유지한다.
- 기존 current-role, recent-auth, CSRF, operation reconciliation과 감사 경계를
  재사용한다.
- 해제 후 자동 관측 제외와 과거 기록 보존을 동시에 만족한다.
- 동일 링크의 중복 클릭, stale 화면과 response timeout을 성공으로 오판하지
  않는다.

### Negative

- Active link DTO, protocol parser, bot application service, terminal result와
  dashboard UI를 함께 변경해야 한다.
- Optimistic version을 위해 additive schema migration과 production gate가
  필요하다.
- Web 침해 시 현재 administrator를 사칭할 수 있는 조건에서는 제한된 해제
  요청을 bot에 보낼 수 있으므로 bot-side 역할 재확인에 계속 의존한다.
- In-flight observer와 link removal의 경합 계약을 추가로 검증해야 한다.

### Risks

- 해제와 늦게 도착한 observer 결과가 경합하면 해제 뒤 새 관측이 저장될 수 있다.
- Version 없는 현재 schema를 timestamp나 UI snapshot으로 대체하면 stale 방지가
  약해질 수 있다.
- Timeout 뒤 새 operation ID로 재시도하면 같은 운영 의도가 중복 기록될 수 있다.
- 잘못된 link를 해제하면 자동 관측이 중단되고 PUUID가 다른 연결에 사용 가능해진다.
- Link ID나 Riot ID가 HTTP/IPC parser 오류, audit 또는 operational log에
  반사될 수 있다.
- 제거된 primary link 뒤 다른 계정을 자동 primary로 승격하면 명시되지 않은
  domain mutation이 생긴다. 이 ADR은 자동 승격을 금지한다.

## Validation

- HTTP authorization: operator, stale session, missing/wrong CSRF, wrong Origin,
  15분 초과 OAuth와 confirmation 누락 시 IPC 미호출
- Bot authorization: wrong guild, operator, removed member, Discord
  timeout·429·unavailable에서 target row 미조회와 denied audit
- Exact parser: valid remove, unknown/missing field, multiple link IDs, malformed
  ID, expired TTL, oversized/multi-frame와 identifier 비반사 오류
- PostgreSQL: active link 단건 종료, not-found, already removed, stale version,
  concurrent two-admin removal, duplicate operation과 audit/terminal-result
  failure 전체 rollback
- Reconciliation: mutation response 유실 뒤 같은 operation status 조회,
  terminal result 없음에서 `outcome_unknown`, 새 operation ID 자동 재실행 없음
- Observation: 해제 전 in-flight poll의 늦은 결과 미저장, 다음 target read에서
  제외, 다른 active link 관측 유지
- Data: 과거 observation/incident/revision/audit 보존, PUUID 자동 재할당 없음,
  primary 자동 승격 없음
- Redaction: PUUID, Riot ID, link ID, Discord ID, cookie/session/OAuth/CSRF
  canary가 operational log와 public 오류에 없음
- UI: 대상 label/Riot ID 확인, 처리 중 이중 클릭 방지, success/stale/unknown
  구분, 360 px labelled table과 keyboard/focus/accessibility 검증
- Disposable PostgreSQL 17과 Ubuntu Unix socket 권한 통합, 전체 test/typecheck/
  build와 migration checksum 검증

## Rollback or migration

- Dashboard 해제 버튼과 HTTP route를 비활성화하고 active link 목록은 read-only로
  유지한다.
- `riot_link_remove` client/server dispatch를 allowlist에서 제거하고 이전
  immutable release로 전환한다.
- Additive version column이 도입됐다면 rollback에서 삭제하지 않고 미사용 상태로
  보존한다.
- 이미 성공한 해제를 자동 복원하지 않는다. 잘못된 해제 복구는 원래 link row를
  직접 되살리는 대신 새 사용자 요청과 관리자 승인을 거친 새 link로 처리한다.
- 기존 operation result, audit, 과거 관측과 사건 기록은 삭제하지 않는다.
- Web DB mutation 권한 확대나 bot token 공유를 rollback 수단으로 사용하지 않는다.

## Conditions for reconsideration

- Riot RSO가 도입되어 계정 소유자가 dashboard 또는 Discord에서 직접 verified
  unlink를 수행할 수 있는 경우
- Web과 bot이 다른 host로 분리되어 Unix socket을 공유할 수 없는 경우
- 해제 요청량이나 운영 workflow가 단건 request/reply를 넘어 batch 또는 승인
  workflow를 요구하는 경우
- In-flight observation 저장을 transaction 또는 target generation으로 안전하게
  막을 수 없다는 검증 결과가 나오는 경우
- 개인정보 보존 정책이 link 종료와 과거 사건의 익명화/삭제를 함께 요구하는 경우

## Approval

- Owner decision: Approved — ADR-0017의 별도 관리자 IPC에 단건
  `riot_link_remove`를 추가하고, additive link version, web recent
  OAuth·CSRF·명시적 확인, bot current administrator 재확인, soft delete,
  operation result 재조정과 원자 감사를 유지하는 제안안을 승인함
- Approved date: 2026-07-29
