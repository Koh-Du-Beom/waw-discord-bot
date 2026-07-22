# ADR-0010: Fastify API와 React SPA dashboard 구조

- Status: Accepted
- Date: 2026-07-22
- Owners: Project owner
- Related requirements: `FUN-016`~`FUN-020`, `SEC-001`~`SEC-010`, `DEP-001`~`DEP-002`, `OPS-001`~`OPS-004`, `QUA-001`~`QUA-002`
- Related research: `docs/research/technology-options/web-framework-and-self-hosting-options.md`, `docs/research/spikes/dashboard-fastify-vertical-slice/README.md`
- Supersedes: None
- Superseded by: None

## Context

첫 MVP는 `ADR-0001`에 따라 web과 bot을 서울 Lightsail의 단일 지속 server 경계에 배치하고, `ADR-0004`의 TypeScript·Node.js runtime과 `ADR-0007`의 Discord OAuth `identify`·opaque database session을 사용한다. Dashboard는 public content나 SEO보다 승인된 운영자의 상태 조회, 감사 filter와 설정 mutation이 중심이다.

같은 host라도 web은 bot token, backup/migration credential과 owner recovery identity를 읽지 않아야 한다. 모든 browser 입력은 untrusted이며 protected read와 mutation은 server에서 session·현재 역할·CSRF와 위험 수준을 기본 거부로 확인해야 한다.

## Decision drivers

- Authorization, CSRF, input schema, response DTO와 audit를 누락 없이 검토할 수 있는 좁은 HTTP 경계
- Opaque server-side session과 Discord token 미보존 계약
- Bot/web process와 secret capability 분리
- Node 24·TypeScript toolchain, deterministic HTTP test와 accessible form 중심 UI
- 1GB Lightsail self-host, canonical HTTPS origin, systemd restart와 atomic rollback
- Vercel 또는 framework-specific hosting control plane을 추가하지 않는 낮은 비용과 lock-in

## Considered options

### Option A: Fastify API + Vite/React Router SPA

Fastify가 OAuth callback, session, authorization, API, audit와 static assets의 server boundary를 담당한다. React Router SPA는 같은 origin API의 untrusted client이며 UI route guard를 authorization으로 사용하지 않는다.

### Option B: Next.js App Router self-host

Server Components, Route Handlers와 Server Actions로 UI와 server data flow를 통합하고 standalone Node output으로 배포한다. 초기 boilerplate와 authenticated first render는 강점이지만 모든 action/handler/data entry point에 같은 authorization을 강제해야 한다.

### Option C: React Router framework SSR/BFF

Route loader/action과 SSR server bundle을 사용한다. Form revalidation은 강점이지만 현재 범위에서 A보다 authorization surface나 운영 단위가 작다는 증거가 없다.

## Decision

첫 MVP dashboard는 **Fastify API + Vite/React Router SPA**로 구성한다.

- Fastify route가 유일한 browser→application command/query boundary다.
- Protected route는 shared pre-handler만으로 끝내지 않고 domain operation 가까이서 session과 authorization tier를 재확인한다.
- Mutation은 exact production Origin, CSRF, current role과 operation별 권한을 모두 요구한다. UI 숨김은 권한 근거가 아니다.
- Request schema는 예상 밖 field를 조용히 제거·coerce하지 않도록 project configuration과 tests를 고정한다. Response schema/DTO는 allowlist로 직렬화한다.
- Request/audit logger는 cookie, OAuth code/token, authorization header, Discord message와 database/backup credential을 기록하지 않는다.
- Vite build는 immutable release artifact로 만들고 `vite preview`를 production server로 사용하지 않는다.
- TLS와 canonical host는 reverse proxy가 담당한다. Web, bot과 backup은 별도 system account/environment file로 capability를 분리한다.
- Exact package versions와 plugin은 implementation plan의 첫 task에서 clean install, lockfile, audit와 license/provenance 검토 후 고정한다.

## Rationale

이 프로젝트의 핵심은 server rendering보다 명시적인 authorization·audit 경계다. Fastify routes는 browser에서 가능한 모든 query/mutation을 한곳에 모으고 JSON Schema validation/serialization과 request correlation을 함께 적용할 수 있다. Vite SPA는 browser를 untrusted client로 유지하며 framework rendering cache나 Server Action entry point가 authorization 모델에 추가되는 것을 피한다.

Credential 없는 vertical slice에서 exact artifacts의 Node 24 clean install, Vite production build와 네 authorization tests가 통과했다. 첫 실패에서 Fastify 기본 AJV가 추가 field를 조용히 제거하는 동작을 발견했고 project configuration으로 거부하도록 고정했다. 이는 framework default가 정책을 대신하지 않으며 boundary test가 필수임을 확인한 증거다.

Next.js는 strongest alternative다. SSR이나 integrated forms가 실제 dashboard UX/개발 비용에서 우위를 보이고 모든 entry point의 default-deny를 더 적은 코드로 입증하면 재검토한다.

## Consequences

### Positive

- Browser authorization surface와 response DTO를 명시적인 Fastify route로 제한한다.
- Domain TypeScript contracts를 bot/web에서 공유하면서 HTTP adapter를 격리할 수 있다.
- 일반 Node server와 static artifact이므로 특정 hosting provider 종속성이 낮다.
- HTTP `inject` test로 deny, malformed input, log redaction과 response allowlist를 credential 없이 검증할 수 있다.

### Negative

- API type, browser fetching, form state와 error presentation 연결을 직접 구현한다.
- SPA first load와 JavaScript failure UX가 SSR보다 약할 수 있다.
- Cookie, CSRF, headers, static serving과 rate limiting에 정확한 plugins/configuration이 추가된다.

### Risks

- Fastify AJV의 coercion/default/remove semantics를 놓치면 invalid input을 조용히 받아들일 수 있다.
- Plugin 수가 늘면 공급망과 major-version update 부담이 증가한다.
- Same-host process account와 file permission이 잘못되면 web 침해가 bot token으로 확장될 수 있다.
- Client-side route guard나 hidden control을 server authorization으로 오해할 수 있다.

## Validation

- 실제 dependency를 product workspace에 추가하기 전 exact lock clean install, audit, license/provenance와 Node engine 검증
- Synthetic OAuth/session vertical slice를 production code contract로 다시 작성하고 unauthorized, expired, revoked, stale role, Origin/CSRF, validation과 log leakage tests 실행
- Browser accessibility와 JavaScript/network failure에서 명확한 unavailable/denied 표시
- Reverse proxy에서 `__Host-` cookie, forwarded host, canonical Origin, security headers와 request-size limit 검증
- 별도 web/bot system account의 environment readability deny test
- 1GB Lightsail에서 web+bot idle/peak RSS, event-loop pause, graceful shutdown, systemd restart와 atomic rollback Spike

## Rollback or migration

UI와 domain operation 사이의 versioned command/query contract를 framework-neutral하게 유지한다. Next.js 또는 React Router SSR로 전환할 때 같은 contract, opaque session schema와 authorization tests를 새 entry point에 적용하고, 한 release에서 한 web process만 public write authority를 갖게 한다. Static SPA artifact와 Fastify adapter를 제거해도 database/domain migration이 필요하지 않아야 한다.

## Conditions for reconsideration

- SPA가 accessibility, initial-load 또는 JavaScript failure recovery 기준을 충족하지 못한다.
- API/UI 연결 코드가 authorization 누락이나 type drift를 반복적으로 만든다.
- Next.js vertical slice가 같은 deny/log/process/rollback 기준을 유의미하게 적은 코드와 운영 부담으로 통과한다.
- Fastify/plugin의 지원, Node 호환성, 공급망 또는 1GB combined capacity가 기준을 충족하지 못한다.
- Dashboard가 public content, SEO, streaming SSR 또는 independent scaling을 실제 요구하게 된다.

## Approval

- Owner decision: Approved — Fastify API + Vite/React Router SPA
- Approved date: 2026-07-22
