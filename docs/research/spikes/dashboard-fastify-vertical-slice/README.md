# D-10 Fastify + React Router SPA vertical-slice Spike

- 상태: Completed — credential 없는 local 실행
- 일자: 2026-07-22
- 가설: Fastify API와 Vite/React Router SPA는 credential 없이도 opaque session, default-deny mutation, schema DTO와 non-secret request log를 하나의 검토 가능한 경계로 구현하고 Node 24에서 재현 가능한 production build를 만들 수 있다.
- 비범위: 실제 Discord OAuth/Gateway, Supabase, production secret, DNS/TLS, Lightsail 배포, 제품 코드 승격

## 성공 기준

- exact dependency lock의 clean install과 Vite production build 성공
- unauthenticated, expired, revoked session의 protected read/write 전부 거부
- mutation은 canonical Origin, CSRF와 admin role 조건을 모두 요구
- malformed payload 거부, response allowlist 밖 field 미직렬화
- request log에 raw cookie/session 값 없음
- test/build 뒤 `node_modules`와 `dist` 제거, production resource/credential 생성 없음

## 실패 기준

위 항목 중 하나라도 실패하거나 exact artifact가 Node 24에서 설치·실행되지 않으면 후보 A를 채택 증거로 사용하지 않는다.

## 실행

```bash
cd docs/research/spikes/dashboard-fastify-vertical-slice
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
npm test
npm run build
du -sk node_modules dist
rm -rf node_modules dist
```

이 코드는 authorization 구조를 시험하는 폐기 가능한 research fixture이며 제품 route나 session 구현이 아니다.

## 2026-07-22 결과

- Node 24.18에서 exact lock의 75 packages를 clean install했고 audit finding은 `0`이었다.
- authorization test `4/4`가 통과했다: unauthenticated/expired/revoked deny, canonical Origin+CSRF mutation, malformed input deny, response allowlist와 raw session log absence.
- Vite 8.1.5 production build가 57ms에 성공했다. `dist`는 228 KiB, installed `node_modules`는 53,704 KiB였다. Browser JS artifact는 229.11 kB, gzip 73.52 kB였다.
- `node_modules`와 `dist`는 측정 후 삭제했다. 외부 credential, production resource와 network service는 만들지 않았다.

첫 실행에서는 Fastify 기본 AJV의 `removeAdditional: true`가 예상 밖 추가 field를 거부하지 않고 제거해 mutation test가 `200`으로 실패했다. 이는 후보 탈락이 아니라 중요한 구성 증거다. `removeAdditional: false`를 명시해 추가 field를 `400`으로 거부한 뒤 clean install부터 재실행해 전부 통과했다. Deprecated `disableRequestLogging` option도 발견 즉시 제거했다.

## 결론과 한계

가설은 local vertical slice 범위에서 통과했다. 후보 A는 명시적인 API authorization/schema/DTO 경계를 만들 수 있지만 Fastify 기본 coercion·field removal을 그대로 신뢰해서는 안 된다. Production reverse proxy, real OAuth, accessibility browser test, Supabase session, bot process separation, systemd rollback과 1GB combined resource는 아직 검증하지 않았다. 이 fixture는 제품 코드로 승격하지 않는다.
