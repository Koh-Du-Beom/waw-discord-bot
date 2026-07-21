# ADR-0007: Discord OAuth와 server-side opaque session 인증 경계

- Status: Proposed
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OWN-026`~`OWN-033`, `SEC-001`~`SEC-009`, `ADR-0001`, `ADR-0006`
- Related research: `docs/research/technology-options/auth-authorization-session-options.md`, `docs/research/technology-options/data-flow-and-threat-model.md`, `docs/research/technology-options/storage-auth-deployment-boundary-integration-review.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

첫 MVP dashboard는 Discord 사용자만 로그인시키고, 허용 guild의 현재 member/role을 기준으로 운영자·관리자 권한을 판정한다. Discord OAuth 로그인만으로 제품 권한이 자동으로 증명되지는 않으며, Discord user token·browser cookie·bot token·Supabase credential은 서로 다른 trust boundary다.

`ADR-0001`은 web과 bot을 한 지속 server 경계에 두었고, `ADR-0006`은 canonical storage로 Supabase Free PostgreSQL을 선택했다. 따라서 browser session의 canonical state, revocation과 role cache는 PostgreSQL에 두되, bot-side member 조회는 public endpoint가 아닌 same-host local module/process boundary로 제한할 수 있다.

## Considered options

### Option A: Discord Authorization Code `identify` + bot-side member 조회 + opaque server-side session

Discord OAuth access token은 callback 중 identity 확인에만 일시 사용하고 영구 저장하지 않는다. browser에는 `__Host-` host-only cookie로 추측 불가능한 session ID만 두고, identity·authorization tier·확인 시각·idle/absolute expiry·revocation은 PostgreSQL에 둔다. 현재 member/role은 bot-side 조회와 최대 5분 read-only cache로 확인한다.

### Option B: Stateless signed browser token

cookie 또는 bearer token에 identity·expiry·tier claim을 넣는다. 별도 lookup 없이 검증할 수 있지만 logout, role 상실, incident의 즉시 폐기와 1일 유휴·7일 절대 session 계약을 만족하려면 denylist/version state가 다시 필요하다.

### Option C: Managed auth/session provider + Discord role adapter

OAuth callback과 session lifecycle 구현을 줄일 수 있다. 하지만 token 보존·revoke·environment 분리·export·비용과 Discord current-role verification은 별도로 검증해야 하며, 첫 MVP에 또 하나의 control plane을 추가한다.

## Proposed decision

Option A를 채택한다.

- 로그인은 Discord Authorization Code의 `identify` scope만 사용한다.
- Discord user OAuth access token과 refresh token은 persistent storage·browser·log·backup에 저장하지 않는다.
- OAuth callback 뒤 opaque session을 새로 발급한다. cookie는 `__Host-`, `Secure`, `HttpOnly`, `Path=/`, `Domain` 미설정으로 하고, exact redirect URI·high-entropy single-use short-lived `state`·CSRF/Origin 검증을 요구한다.
- session은 1일 idle·7일 absolute 만료다. login, privilege change와 logout 때 rotation/revocation을 수행한다.
- 일반 read-only 요청은 최대 5분의 성공한 role cache만 쓸 수 있다. cache가 만료되거나 Discord/local role 조회가 실패하면 read는 `unavailable`, mutation은 deny다.
- mutation은 current role 재조회와 CSRF를 요구한다. 고위험 작업은 15분 이내 Discord OAuth 완료, current role 강제 재조회, CSRF, 명시적 확인을 모두 요구한다.
- browser session, Discord user token, bot token과 Supabase DB role credential은 상호 대체하지 않는다. application은 Supabase workload별 최소 DB role을 이후 implementation plan에서 정한다.
- arbitrary preview에서는 로그인·변경을 비활성화한다. 필요한 fixed preview는 별도 Discord app·cookie·database credential로 분리한다.

## Rationale

Opaque session은 long-lived 관리 세션에서 필요한 즉시 revoke와 role 상실 폐기를 가장 직접적으로 지원하고 browser에 Discord token·권한 claim을 남기지 않는다. Discord identity와 product authorization을 분리하면서, single-server 경계에서는 bot-side 현재 role 조회를 외부 network API로 만들지 않는다.

## Consequences

### Positive

- logout·role 상실·incident 때 server-side record로 session을 즉시 폐기할 수 있다.
- browser와 backup에 Discord token·session claim을 남기지 않는다.
- low-risk read cache와 mutation/high-risk 기본 거부를 명시적으로 구분한다.

### Negative

- session table cleanup, rotation·revoke와 role cache 관측이 필요하다.
- Discord 또는 local bot-side role 조회 장애는 dashboard write를 막고 cache 만료 뒤 read도 unavailable이 된다.

### Risks

- Discord confidential web flow의 PKCE 지원·강제 범위는 실제 고정 preview Spike에서 확인해야 한다.
- same-host module/process 경계가 bot token과 DB credential을 충분히 분리하지 못할 수 있다.
- PostgreSQL/RLS만으로 application authorization을 대체했다고 오해할 수 있다.

## Validation

- synthetic OAuth transaction에서 state 재사용·만료·redirect mismatch·CSRF/Origin failure를 deny하는 contract test
- session rotation, 1일 idle/7일 absolute expiry, logout/revoke와 role cache 5분 경계 test
- Discord/local role lookup timeout·401/403/404/429/5xx에서 read/mutation/high-risk contract test
- 고정 preview의 PKCE 지원 확인은 별도 approval 후 disposable Discord app/credential로 수행

## Rollback or migration

session schema와 cookie name은 versioned migration으로 유지한다. 향후 managed auth로 이동할 경우 opaque session을 병행 검증하고, provider token persistence·revoke·environment isolation·export가 동일 계약을 충족한 뒤에만 cutover한다.

## Conditions for reconsideration

- token 미보존 상태에서 필요 UX와 role revalidation을 달성할 수 없는 경우
- actual Discord OAuth flow가 state/PKCE/redirect security contract를 만족하지 않는 경우
- process/secret separation Spike가 bot token·DB credential blast radius를 줄이지 못하는 경우
- managed auth가 같은 revoke·role·cost·export 기준을 더 적은 운영 부담으로 입증하는 경우

## Approval

- Owner decision: Pending
- Approved date: Pending
