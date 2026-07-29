# ADR-0026: 열린 Dashboard의 외부 Riot 상태 갱신

- Status: Proposed
- Date: 2026-07-29
- Owners: Project owner
- Related requirements: `FUN-005`, `FUN-015`, `FUN-018`, `QUA-001`, `QUA-002`
- Related research: [HTML page visibility](https://html.spec.whatwg.org/multipage/interaction.html#page-visibility), [HTML server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- Related ADRs: `ADR-0010`, `ADR-0016`, `ADR-0017`, `ADR-0025`
- Supersedes:
- Superseded by:

## Context

Dashboard는 `App` mount 때 `getRiotLinks`와 administrator의
`getRiotRequests`를 한 번 읽고, 이후에는 Dashboard 안에서 실행한
승인·반려·해제 mutation만 관련 local state를 갱신한다. 열린 browser 밖에서
Discord 사용자가 `/라이엇계정 연결`을 실행하거나 bot이 Discord/Riot 표시
metadata를 갱신하면 같은 Dashboard instance에는 이를 알리는 trigger가 없다.

2026-07-29 characterization test에서 initial render 뒤
`visibilitychange`를 발생시켰지만 `getRiotLinks` 호출 수가 `1`에 머물러 기대한
`2`와 달랐다. Page reload를 하면 PostgreSQL의 최신 상태가 보이므로 원인은
backend commit이나 cache가 아니라 client query lifecycle 누락이다.

단순한 짧은 polling에는 운영 비용이 있다. Active link는 web의 protected GET으로
읽지만 pending request 목록은 ADR-0017에 따라 bot admin-command IPC를 거치며
각 목록 시도마다 operation ledger, terminal result와 audit를 영구 기록한다.
따라서 5~15초 polling은 불필요한 감사 레코드와 IPC 부하를 만든다.

HTML은 document visibility 상태와 `visibilitychange`를 표준화한다. SSE도
표준 server-push 수단이지만 현재 Fastify/web↔bot 경계에 장기 연결, event
fan-out 또는 resume cursor가 없으므로 이번 결함 하나를 위해 도입하기에는
변경 범위가 크다.

## Decision drivers

1. 열린 Riot 화면은 외부 변경을 page reload 없이 bounded 시간 안에 보여야 한다.
2. Hidden Dashboard는 polling과 영구 감사 기록을 만들지 않아야 한다.
3. 기존 Fastify API, bot admin IPC, current-role 재확인과 감사 경계를 우회하지
   않아야 한다.
4. Refresh 실패는 이미 표시한 정상 snapshot을 빈 목록으로 바꾸거나 mutation
   성공을 되돌리지 않아야 한다.
5. 중복 timer, tab/focus event와 느린 response가 동시에 state를 덮어쓰지 않도록
   single-flight와 stale-response 방지가 필요하다.
6. 새 dependency, migration, public listener, WebSocket/SSE와 credential
   capability를 추가하지 않는 최소 변경이어야 한다.
7. 자동 조회가 만드는 IPC·operation·audit 양을 계산하고 제한해야 한다.

## Considered options

### Option A: 항상 짧은 간격으로 전체 polling

Dashboard mount부터 hidden 여부와 현재 tab에 관계없이 active link와 pending
request를 5~15초마다 읽는다.

- 장점: 구현이 가장 단순하고 반영 지연이 짧다.
- 단점: 사용하지 않는 화면도 계속 network와 IPC를 사용하고, administrator
  한 명당 시간당 240~720회의 audited pending-list operation을 만든다.
- 판단: 운영·감사 비용이 결함 규모에 비해 크므로 제외한다.

### Option B: SSE 또는 WebSocket push

Bot이나 DB 변경을 web이 event로 받아 browser에 push한다.

- 장점: 변경 직후 반영과 낮은 idle query 비용.
- 단점: bot→web event 전달, reconnect/resume, authorization expiry, slow
  consumer와 배포 순서라는 새 장기 연결 경계를 만든다. ADR-0017의 request/result
  IPC와 별도 protocol 결정이 필요하다.
- 판단: 변경 빈도와 단일 관리자 Dashboard 규모에 비해 과도하므로 제외한다.

### Option C: 활성·가시 Riot 화면만 bounded refresh

기존 query를 재사용하고 다음 trigger에서만 active link와 pending request를
함께 authoritative refresh한다.

1. 사용자가 Riot tab에 진입했을 때
2. document가 다시 `visible`이 됐고 마지막 성공 refresh가 15초보다 오래됐을 때
3. Riot tab이 active이고 document가 visible인 동안 60초마다
4. 사용자가 명시적인 `새로고침` control을 실행했을 때
5. 기존 승인·반려·해제 mutation이 terminal 상태로 끝났을 때

Hidden 전환 시 timer를 중지하고 visible 복귀 시 남은 interval을 재사용하지
않고 freshness 조건으로 즉시 판단한다.

- 장점: 새 protocol 없이 page reload 의존을 제거하고 최대 visible stale
  window를 60초로 제한한다.
- 단점: Riot tab을 1시간 계속 보는 administrator마다 pending-list operation
  최대 60회와 이에 딸린 operation/result/audit row가 생긴다.
- 판단: 현재 architecture에서 bounded freshness와 최소 변경을 함께 만족하는
  안이다.

## Proposed decision

Option C를 제안한다. Owner 승인 전에는 구현하지 않는다.

### Refresh scope

- `refreshRiotState()` 하나가 active links와, administrator일 때만 pending
  requests를 `Promise.all`로 읽는다.
- Operator는 active links만 읽고 administrator-only pending API를 호출하지 않는다.
- 한쪽 query가 실패해도 성공한 쪽만 반영할지 부분 snapshot을 만들지 않는다.
  두 query가 모두 성공한 generation만 한 번에 commit하여 화면 내 active/pending
  관계를 일관되게 유지한다.
- Refresh 실패는 기존 snapshot을 보존하고 `마지막 갱신 시각`과 비차단
  `갱신 실패` 상태를 표시한다. 빈 목록으로 대체하지 않는다.

### Concurrency and mutation ordering

- Refresh는 instance당 하나만 in-flight로 허용한다. 추가 trigger는 중복
  request를 만들지 않고 `refreshRequested`만 표시해 현재 요청 종료 뒤 한 번
  재실행한다.
- Monotonic generation을 부여하고 최신 generation보다 늦게 도착한 response는
  state에 적용하지 않는다.
- Riot 승인·반려·해제 mutation이 in-flight인 동안 timer refresh를 시작하지
  않는다. Terminal 결과 뒤에는 기존 mutation reconciliation을 authoritative
  refresh 함수로 통합한다.
- Component unmount, logout 또는 session denial 뒤 response는 폐기하고 timer와
  document listener를 제거한다.

### Timing and load bound

- Foreground interval: 60초
- Visible 복귀 freshness threshold: 15초
- Polling 조건: `tab === "riot" && document.visibilityState === "visible"`
- 한 administrator browser instance의 pending-list 자동 호출 상한:
  Riot tab을 계속 보는 동안 시간당 60회
- 여러 focus/visibility/tab event는 single-flight와 15초 freshness gate로
  합쳐진다.
- 운영 evidence에서 audit/operation 증가가 과도하면 interval을 늘리는 것은
  가능하지만 60초보다 줄이는 것은 별도 검토한다.

### Authorization and trust boundary

- 기존 same-origin API와 server-side session/current-role/CSRF 검증을 그대로
  사용한다.
- Browser visibility, selected tab과 timer는 authorization 근거가 아니다.
- Web DB role, bot token, admin IPC protocol, response DTO와 log allowlist를
  변경하지 않는다.
- 자동 refresh 오류에 request/operation ID, Discord ID, Riot ID 또는 provider
  body를 표시하거나 operational log에 추가하지 않는다.

## Rationale

이 결함은 data source가 아니라 client query invalidation 누락이다. 현재 query를
가시 화면에서만 제한적으로 재실행하면 DB·IPC·authorization 모델을 바꾸지 않고
bounded freshness를 제공한다. Visibility 기반 중지는 background timer가
browser별로 다르게 throttle되는 동작에 freshness를 맡기지 않고 application
자체가 명확한 부하 상한을 갖게 한다.

SSE는 변화량이 커지거나 60초 freshness가 제품 요구를 충족하지 못할 때 더
적합할 수 있다. 현재는 별도 event protocol과 장기 연결 운영 비용이 더 크다.

## Consequences

### Positive

- 외부 Discord 등록과 bot metadata 갱신이 page reload 없이 최대 60초 안에
  활성 Riot 화면에 반영된다.
- Riot tab 밖과 hidden document에서는 polling하지 않는다.
- 기존 authorization, audit와 process credential 경계를 유지한다.
- Refresh 실패와 mutation 성공 상태를 구분하고 기존 정상 snapshot을 보존한다.

### Negative

- 계속 열린 administrator Riot tab은 시간당 최대 60개의 audited list
  operation을 추가한다.
- 외부 변경의 즉시 push가 아니라 최대 60초의 지연이 있다.
- Visibility, timer, mutation과 unmount 경쟁을 위한 client state 코드와
  결정적 fake-clock test가 추가된다.

### Risks

- `getRiotRequests`의 audit volume이 실제 retention·backup 비용에서 예상보다
  클 수 있다.
- Partial query 결과를 잘못 반영하면 active/pending 목록이 서로 다른 시점이 된다.
- Timer cleanup이나 generation guard 누락은 duplicate request와 stale overwrite를
  재발시킬 수 있다.
- 여러 browser tab을 동시에 열면 instance별 상한이 합산된다.

## Validation

- RED: initial render 뒤 외부 fixture state를 변경해도 visibility/tab/timer 전에는
  UI와 API call count가 바뀌지 않는 현재 결함을 재현한다.
- GREEN: Riot tab 진입, visible 복귀, 60초 tick과 manual refresh에서 최신
  active/pending snapshot이 함께 보인다.
- Hidden document와 다른 tab에서 fake clock을 여러 분 진행해도 추가 호출이 없다.
- 15초 안의 focus/visibility 중복 event와 느린 request 동안 timer tick이 한
  in-flight 및 최대 한 follow-up으로 합쳐진다.
- Mutation in-flight, terminal success/failure/unknown, refresh partial failure,
  session denial, unmount와 out-of-order response를 검증한다.
- Operator는 pending request API를 호출하지 않는다.
- 자동 refresh 실패가 기존 목록을 빈 상태로 만들거나 success message를
  덮어쓰지 않는다.
- 전체 unit, typecheck, build, browser accessibility와 log/identifier redaction
  회귀를 실행한다.
- 운영 전 1시간 fake-soak으로 한 administrator instance의 pending-list operation
  수가 60 이하인지 확인한다.

## Rollback or migration

- Timer, visibility listener, manual refresh control과 통합 refresh helper를
  제거하면 기존 initial-load 및 mutation-triggered refresh 동작으로 돌아간다.
- Database migration, stored data, IPC protocol과 deployment capability 변경은
  없으므로 data rollback은 필요하지 않다.

## Conditions for reconsideration

- 제품이 60초보다 짧은 보장 지연을 요구한다.
- 실제 audit/operation volume이 retention, backup 또는 관리 화면 가독성을
  해친다.
- Dashboard 동시 사용자·tab 수나 외부 변경 빈도가 크게 증가한다.
- Riot 외 여러 domain이 같은 실시간 invalidation을 요구해 공용 SSE/event
  protocol이 더 단순해진다.

## Approval

- Owner decision: Pending
- Approved date:
