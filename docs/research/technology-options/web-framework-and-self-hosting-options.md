# D-10 관리 dashboard 웹 프레임워크와 self-host 배포 후보

- 상태: Research
- 확인일: 2026-07-22
- 결정 질문: 서울 Lightsail의 단일 지속 server 경계에서 `https://waw.dubeom.com` dashboard를 어떤 TypeScript 웹 구조로 구현·배포할 것인가?
- 연결 요구사항: `FUN-016`~`FUN-020`, `SEC-001`~`SEC-010`, `DEP-001`~`DEP-002`, `OPS-001`~`OPS-004`, `QUA-001`~`QUA-002`
- 선행 결정: `ADR-0001`, `ADR-0004`, `ADR-0005`, `ADR-0006`, `ADR-0007`
- 비범위: dependency 설치, 제품 코드, DNS/TLS 변경, OAuth credential 생성, ADR 승인

## 제약과 평가 기준

첫 MVP는 web과 bot을 같은 host에 두지만 capability를 합치지 않는다. Browser에는 opaque `__Host-` session cookie만 두고, Discord OAuth token은 callback 뒤 폐기하며, 현재 guild role과 mutation 권한은 server에서 기본 거부로 확인한다. Dashboard는 검색 노출이나 공개 콘텐츠보다 인증된 운영 화면, 표·필터·설정 form과 상태 표시가 중심이다.

후보는 다음 순서로 평가한다.

1. 모든 loader/API/mutation에서 server-side session·role·CSRF 검사를 빠뜨리지 않는 구조
2. bot token과 backup/migration credential을 web process가 읽지 않는 process 경계
3. 외부 입력 schema, 최소 response DTO와 민감정보 없는 구조화 로그
4. `waw.dubeom.com` 단일 HTTPS origin과 production/preview cookie·redirect 분리
5. 1GB host에서 web·bot 병행 실행, systemd 재시작, health와 atomic rollback
6. Node/TypeScript 도메인 계약 재사용, 결정적 단위·HTTP 통합·브라우저 시험
7. dependency 수, security update, build artifact와 공급자 종속성

## 후보 A — Fastify API + Vite/React Router SPA

Fastify process가 OAuth callback, opaque session, authorization, API와 정적 build 제공을 담당하고, React Router SPA는 같은 origin의 JSON endpoint만 호출한다. Nginx 또는 동등한 reverse proxy가 TLS와 canonical host를 처리한다.

### 공식 확인 사실

- Fastify 최신 reference는 v5 계열이며 request lifecycle, hooks, schema validation/serialization과 TypeScript 경로를 제공한다. JSON Schema response serializer는 허용 필드만 직렬화해 우발적인 field 노출을 줄일 수 있다.
- Fastify logging은 Pino 기반 request logger, request ID와 redaction을 제공하지만 기본적으로 꺼져 있다. 공식 문서는 header logging이 인증정보를 노출할 수 있다고 경고한다.
- Validation error는 기본 응답에 schema 세부사항을 포함하므로 project-safe error handler가 필요하다. User-provided schema를 compile해서는 안 되며 DB lookup은 validation이 아니라 authorization hook/handler에서 수행해야 한다.
- React Router Framework의 SPA mode는 `ssr:false`로 runtime SSR을 끄고 build-time `index.html`을 생성한다. Vite의 production output은 `dist`이며 `vite preview`는 production server가 아니다.

### 평가

- 장점: public mutation 표면을 Fastify routes로 한정하기 쉽다. Route schema, authorization hook, response DTO, audit와 log redaction을 하나의 HTTP 경계에서 강제할 수 있다. SSR cache·Server Action·server/client module 혼합 규칙이 없어 opaque session 계약을 추적하기 단순하다.
- 단점: API types, browser data fetching, form error와 asset serving을 직접 연결해야 한다. SPA shell은 첫 load에서 API round trip이 필요하고 JavaScript 실패 시 운영 UI가 제한된다.
- 보안 조건: cookie parser, CSRF/Origin 검사, security headers, rate limit과 static fallback은 Fastify core만으로 완성되지 않으므로 정확한 공식 plugin과 version을 lock·검토해야 한다. Client route guard는 UX일 뿐 authorization 근거로 사용하지 않는다.
- 운영/rollback: immutable server build와 `dist`를 같은 release directory로 묶고 systemd symlink를 atomic하게 전환할 수 있다. Reverse proxy에는 dashboard 하나만 공개하고 bot local process/IPC는 외부에 열지 않는다.
- 종속성: Vercel 전용 기능은 없고 일반 Node/static asset 경로라 공급자 lock-in이 낮다. 대신 조립 책임은 프로젝트에 남는다.

## 후보 B — Next.js App Router self-host Node server

Next.js가 page rendering, Route Handler와 Server Action을 한 build에서 제공하고 standalone output을 self-host한다. Reverse proxy가 TLS와 canonical host를 처리한다.

### 공식 확인 사실

- Next.js는 Node server 또는 Docker로 self-host할 수 있고, 공식 문서는 직접 노출 대신 reverse proxy 사용을 권장한다.
- `output: 'standalone'`은 필요한 traced files와 최소 `server.js`를 생성하지만 `public`과 `.next/static`은 기본으로 복사되지 않아 release packaging에서 명시적으로 포함해야 한다.
- 공식 authentication guide는 secure authorization을 data source 가까운 DAL에서 수행하고 Route Handler와 Server Action 각각을 public endpoint처럼 보호하라고 요구한다. Layout 또는 UI 숨김만으로 보호할 수 없다.
- Server Action은 Origin과 Host를 비교하고 기본 body limit을 제공하지만, 이는 application session·role·CSRF 정책을 대체하지 않는다. Reverse proxy host 전달과 allowed origin을 실제 production topology에서 검증해야 한다.
- Custom server는 integrated router로 해결할 수 없을 때만 권장되며 standalone tracing과 결합 제약이 있으므로 bot과 Next를 custom server 하나로 합치는 방식은 기본 후보에서 제외한다.

### 평가

- 장점: routing, server rendering, forms, server data loading과 build output이 통합된다. 인증된 첫 화면을 server에서 렌더링하고 browser-side API boilerplate를 줄일 수 있다.
- 단점: Server Components, Route Handlers, Server Actions와 cache가 여러 server entry point를 만든다. 이 프로젝트는 각 entry point에서 canonical opaque session과 current-role authorization을 반복 적용해야 하며 framework proxy/layout check에 의존하면 기본 거부 계약을 놓칠 수 있다.
- 보안 조건: server-only DAL, DTO, action/handler 단위 authorization, cache opt-out/개인화 검증과 proxy forwarded-host test가 필요하다. Framework auth library가 Discord token 미보존·DB opaque session 정책을 자동으로 충족한다고 가정하지 않는다.
- 운영/rollback: standalone release는 가능하지만 static/public asset 포함, build ID와 rolling deploy 중 Server Action compatibility를 검증해야 한다. Self-host는 Vercel dependency가 아니지만 Next-specific rendering/cache semantics에 대한 lock-in은 A보다 크다.

## 후보 C — React Router framework SSR/BFF

React Router의 server loaders/actions와 SSR adapter를 사용해 page/data mutation을 route module에 함께 둔다.

- 공식 문서는 server action 뒤 loader revalidation과 BFF/SPA 구성을 제공한다. 이는 form-heavy dashboard에 유용하다.
- 그러나 현재 project에는 별도 Fastify boundary보다 authorization surface가 줄어드는지, Next보다 release/runtime가 단순한지 보여주는 증거가 없다. Custom server adapter와 framework convention을 동시에 운영하게 될 가능성이 있다.
- A의 strongest alternative가 되기보다는 A의 SPA가 접근성·data consistency 기준을 충족하지 못하거나 Next의 entry-point 복잡성이 실패할 때 재평가할 후보로 둔다.

## 비교 요약

| 기준 | A. Fastify + SPA | B. Next.js self-host | C. React Router SSR/BFF |
|---|---|---|---|
| 권한 경계 가시성 | API route 한곳에 집중 | DAL이 가능하나 action/handler 등 진입점 다수 | route loader/action에 집중 가능 |
| opaque DB session 적합성 | 직접적 | 가능하나 framework auth와 분리 필요 | 가능 |
| authenticated dashboard UX | client load 뒤 표시 | server-rendered 첫 화면 강점 | SSR/form revalidation 강점 |
| 로그·schema/DTO | Fastify가 명시적 지원 | application convention 필요 | application convention 필요 |
| self-host release | Node server + static bundle | standalone packaging | adapter/server bundle 검증 필요 |
| 구현량 | API/UI 연결 코드가 더 많음 | 통합 기능으로 초기 코드가 적을 수 있음 | 중간, adapter 선택 필요 |
| framework lock-in | 낮음 | rendering/cache/action 결합이 큼 | route loader/action 결합 |

## 잠정 추천

**후보 A, Fastify API + Vite/React Router SPA를 첫 Spike 후보로 추천한다.** 이 결론은 기술 채택이나 ADR 승인이 아니다.

Dashboard는 SEO나 공개 SSR보다 server-side authorization, mutation audit와 명확한 stale/unavailable 상태가 중요하다. A는 browser UI를 untrusted client로 두고, session·role·CSRF·DTO·audit를 좁은 Fastify route boundary에 집중시켜 기존 domain contract와 capability 분리를 가장 쉽게 검토하게 한다. Strongest alternative는 B다. 인증된 첫 화면의 SSR이나 form/data boilerplate 감소가 실제로 운영·보안 복잡성을 낮춘다면 Next.js가 더 작은 제품 코드가 될 수 있다.

## 필요한 최소 Spike

외부 credential 없이 별도 승인된 disposable Spike에서 A와 B의 vertical slice만 비교한다.

1. `/login` placeholder, synthetic OAuth callback, `__Host-` opaque cookie와 logout/revoke
2. Overview read 1개, CSRF+role-required mutation 1개, unauthorized/expired/stale/Discord-unavailable deny
3. UI/직접 HTTP/중첩 route/Server Action 우회 시도에서 동일 authorization 결과
4. Cookie/header/token 원문이 없는 request/audit log와 response DTO field allowlist
5. production build artifact, clean install, systemd start/stop, `/health`, graceful shutdown
6. 같은 1GB fixture에서 web+합성 bot idle/RSS/event-loop와 30초 smoke

통과 기준은 권한 우회 `0`, secret log finding `0`, deterministic test 전부 통과, clean release rollback과 합성 bot 기준을 깨지 않는 resource usage다. 실제 Discord OAuth, DNS, production credential은 이 Spike에 필요하지 않다.

## 사실·추론·가정·미확인

- 사실: 위의 framework 기능과 경고는 2026-07-22 공식 문서에서 확인했다.
- 추론: 현재 dashboard 요구에는 SSR 이점보다 단일 authorization/API 경계의 검토 가능성이 더 중요하다.
- 가정: 초기 dashboard의 접근성·초기 load 목표는 SPA로 충족 가능하며 검색 노출은 필요 없다.
- 미확인: exact artifact들의 Node 24.18/TypeScript 7 호환성, plugin 공급망, build/RSS 크기, OAuth cookie의 reverse-proxy 동작, graceful deploy 중 bot singleton 영향.

## 위험과 전환 조건

- A의 직접 조립 코드가 authorization 누락이나 client/server type drift를 늘리면 B를 우선한다.
- SPA가 접근성, 느린 첫 화면 또는 JavaScript failure 복구 기준을 충족하지 못하면 SSR 후보를 재평가한다.
- B의 action/handler/DAL test가 모든 entry point에서 같은 기본 거부를 더 적은 코드로 입증하면 B를 선택할 수 있다.
- 어떤 후보도 1GB host의 bot+web 기준이나 safe rollback을 통과하지 못하면 static UI 범위를 줄이거나 host plan을 재검토한다.

## 공식 출처

- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js standalone output: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Next.js authentication/authorization: https://nextjs.org/docs/app/guides/authentication
- Next.js Server Actions security configuration: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- Next.js custom server: https://nextjs.org/docs/app/guides/custom-server
- Fastify validation/serialization: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Fastify logging: https://fastify.dev/docs/latest/Reference/Logging/
- Fastify TypeScript: https://fastify.dev/docs/latest/Reference/TypeScript/
- React Router SPA mode: https://reactrouter.com/how-to/spa
- React Router actions/concurrency: https://reactrouter.com/start/framework/actions
- Vite production/static deployment: https://vite.dev/guide/static-deploy.html
- Vite backend integration: https://vite.dev/guide/backend-integration.html

## 정확한 다음 프롬프트

`AGENTS.md와 docs/prompts/spike.md를 읽고 D-10 research의 후보 A Fastify+React Router SPA vertical slice Spike를 설계해. 아직 dependency 설치나 Spike 실행은 하지 말고 승인 가능한 runbook과 성공/실패 기준만 작성해.`
