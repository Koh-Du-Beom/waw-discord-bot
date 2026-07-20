# D-07 인증·인가·세션 후보 조사

- 조사일: 2026-07-20
- 상태: Research — 인증 기술 또는 library 결정 아님
- 결정 질문: `waw.dubeom.com`에서 Discord 사용자의 신원을 확인하고 단일 guild의 운영자·관리자 역할을 현재 상태로 검증하며, 브라우저 세션과 분리된 web·bot·data workload 인증을 어떤 경계로 구성해야 최소 권한·즉시 폐기·CSRF 방어·환경 분리 요구를 현실적으로 검증할 수 있는가?
- 범위 밖: 인증 library·framework·vendor 선택, 저장소·배포·통신 선택, Discord bot token 배치 확정, ADR, Spike, 구현 계획과 제품 코드

## 1. 연결된 요구사항과 결정

| 입력 | D-07에서 사용하는 의미 |
|---|---|
| `SEC-001`~`SEC-006` | 허용 guild의 승인된 운영자만 접근하며 서버 측 기본 거부, OAuth `state`, 안전한 cookie·CSRF, session 폐기와 role 변경 재검증이 필요하다. |
| `SEC-007`~`SEC-009` | OAuth code/token, session secret과 내부 credential을 로그·저장소에서 제외하고 환경별 최소 권한으로 분리한다. |
| `DEP-001`, `DEP-002` | production origin은 `https://waw.dubeom.com` 하나이며 production·preview의 redirect URI, cookie와 credential을 분리한다. |
| `INT-002`, `INT-003` | web·bot·broker·DB가 분리되면 각 workload를 인증하고 replay·timeout·권한 분리와 최소 공개 면적을 적용한다. |
| `OWN-002`, `OWN-013` | 단일 guild에서 guild owner는 관리자다. 그 외에는 설정된 운영자·관리자 role만 인정하며 Discord `ADMINISTRATOR` bit만으로 승격하지 않는다. 고위험 작업 직전 현재 role을 다시 조회한다. |
| `OWN-020`, `OWN-021` | 고위험 변경은 즉시 적용 확인이 불가능하면 실패하며 live bot control은 요구하지 않는다. |
| `OWN-022` | 자가 host 장애 중 설정·감사 조회와 변경 중단을 허용하고 신뢰할 최근 상태가 없으면 `unavailable`로 표시한다. |
| `OWN-026`~`OWN-034` | Discord OAuth만 허용하고, 1일 유휴·7일 절대 세션, 5분 read-only 역할 cache, Discord user token 비보존, preview 분리와 고위험 OAuth 재인증 계약을 적용한다. web·bot은 첫 MVP에서 같은 지속 server 경계에 둔다. |
| D-03 | browser는 불신 경계다. OAuth·session secret은 필요한 최소 기간만 보호 저장할 수 있으나 로그·감사·URL·화면·평문 backup에는 넣지 않는다. |

인증(authentication), 제품 인가(authorization), session, workload 인증을 분리한다. Discord 로그인 성공은 user ID를 증명할 뿐 허용 guild·현재 role·작업 권한을 자동으로 증명하지 않는다. browser session은 web→bot 또는 web→DB credential로 재사용하지 않는다.

## 2. 평가 기준

1. Discord user ID를 위조 불가능한 server-side flow로 확인하는가.
2. 허용 guild ID, owner ID와 설정된 role ID를 현재 Discord 상태에 대조하고 실패 시 기본 거부하는가.
3. 일반 요청의 cache와 고위험 작업의 강제 재조회가 role 제거·탈퇴를 정해진 시간 안에 반영하는가.
4. OAuth code injection, login CSRF, open redirect, session fixation과 CSRF를 방어하는가.
5. browser에는 임의 session ID만 두고 HttpOnly·Secure·정확한 SameSite·host 범위를 적용하는가.
6. logout, expiry, role 상실과 incident 때 session을 server에서 즉시 폐기할 수 있는가.
7. OAuth access/refresh token을 저장하지 않거나 저장 기간·암호화·revoke를 최소화하는가.
8. production·preview·development의 application, redirect, cookie와 secret이 섞이지 않는가.
9. web·bot·DB·queue에 서로 다른 최소 권한 credential과 rotation·revoke 경로를 둘 수 있는가.
10. 단일 guild·소수 운영자에 맞게 auth service, token format과 key infrastructure를 불필요하게 늘리지 않는가.

## 3. 공식 자료에서 확인된 공통 사실

### 3.1 Discord OAuth와 현재 guild member

- Discord는 OAuth2 Authorization Code Grant를 지원한다. `state` 사용을 강하게 권장하며 code는 backend가 token endpoint에서 교환한다. Implicit Grant는 access token이 URI fragment에 노출될 수 있고 refresh token을 주지 않으므로 이 dashboard의 후보에서 제외한다. [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)
- `identify` scope는 현재 user의 안정적인 Discord ID를 제공한다. `guilds.members.read`는 지정 guild의 현재 사용자 member object와 role ID 배열을 읽을 수 있다. user access/refresh token은 password처럼 취급해야 하고 revoke endpoint가 있다. [Discord OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions), [User Resource](https://docs.discord.com/developers/resources/user), [Discord token revocation](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-with-discord#revoking-access-tokens)
- bot의 `Get Guild Member`도 지정 user의 현재 member object를 반환한다. role 이름이 아니라 role ID를 비교해야 하며 guild의 `owner_id`는 별도 필드다. [Guild Resource](https://docs.discord.com/developers/resources/guild)
- OAuth access token은 짧은 수명이며 refresh가 필요하다. OAuth token과 bot token은 서로 다른 principal이고 browser session 또는 workload credential을 대신하지 않는다. [Discord OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)

### 3.2 OAuth와 browser session 보안

- OAuth Security BCP는 Authorization Code를 사용하고 exact redirect URI matching, transaction별 code binding과 confidential web client에도 PKCE를 권장한다. open redirector를 두지 않아야 한다. Discord의 PKCE 지원 여부는 공식 metadata 또는 Spike로 확인해야 하며, 미지원이면 `state`와 code·browser transaction binding을 독립적으로 강제해야 한다. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- OWASP는 session ID를 인증 뒤와 privilege change 뒤 재발급하고, idle·absolute timeout을 server에서 강제하며 logout·expiry 때 server-side session을 폐기하도록 권고한다. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- `Secure`, `HttpOnly`, 명시적 `SameSite`와 `__Host-` cookie prefix는 session ID 노출과 subdomain cookie injection을 줄인다. `SameSite`는 CSRF 완화 수단이지 mutation별 CSRF 검증을 완전히 대체하지 않는다. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- Vercel은 Production·Preview·Development별 environment variable을 지원하고 preview deployment마다 URL이 생긴다. Discord redirect와 secret을 임의 preview URL 전체에 공유하지 말고 고정·등록된 preview 경계 또는 인증 비활성화를 비교해야 한다. [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel environments](https://vercel.com/docs/deployments/environments)

### 3.3 Workload 인증

- OAuth Security BCP는 가능한 경우 client authentication을 요구하고 대칭 shared secret보다 mTLS 또는 signed JWT 같은 비대칭 방식을 권장한다. 이는 browser session token을 내부 인증으로 재사용하라는 의미가 아니다. [RFC 9700 §2.5](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.5)
- mTLS는 client certificate의 private key 보유와 등록 identity를 TLS handshake에서 묶지만 certificate 발급·배포·rotation·revocation 운영이 필요하다. [RFC 8705](https://www.rfc-editor.org/rfc/rfc8705.html)
- 공유 DB를 통신 경계로 쓰면 DB 자체의 별도 role과 credential이 workload 인증이 될 수 있다. 직접 API·queue를 쓰면 해당 transport의 service identity 또는 만료·audience·issuer·replay를 검증하는 별도 credential이 필요하다. 구체 방식은 D-05·D-08과 함께 정해야 한다.

## 4. 사용자 인증·인가 후보 비교

### 4.1 Discord `identify` + bot-side 현재 member 조회

Flow:

1. web backend가 Authorization Code로 Discord user ID를 확인한다.
2. bot 또는 bot token을 보유한 제한된 backend가 허용 guild의 member·owner·roles를 조회한다.
3. web은 승인된 tier와 검증 시각만 받아 server-side session을 발급한다.
4. 일반 요청은 제한된 cache를 사용할 수 있고 고위험 작업은 Discord를 강제 재조회한다.

장점:

- OAuth scope와 user token 보관을 `identify`에 가깝게 최소화할 수 있다.
- Discord bot token을 Vercel web에 두지 않고 지속 bot 경계에 유지할 수 있다.
- guild owner와 설정 role ID라는 프로젝트 정책을 한 곳에서 평가할 수 있다.

비용·위험:

- web과 bot이 분리되면 role verification용 내부 경계가 필요하다. bot·Discord 장애 중 로그인·고위험 작업은 안전하게 실패해야 한다.
- Gateway role cache만 믿으면 event 유실 뒤 오래된 권한을 사용할 수 있으므로 강제 REST 재조회 경로가 필요하다.

### 4.2 Discord `identify` + `guilds.members.read`

Flow:

- web backend가 user OAuth token으로 `/users/@me`와 허용 guild의 current member를 직접 조회한다.

장점:

- login 시 web→bot role verification 경계를 없앨 수 있다.
- Discord가 현재 user에게 반환한 member·role을 직접 사용한다.

비용·위험:

- session 동안 일반·고위험 재검증을 하려면 access/refresh token을 보호 저장하거나 사용자를 다시 OAuth로 보내야 한다.
- scope 동의, token encryption·rotation·revoke와 Discord 장애가 web auth 운영에 추가된다.
- user token을 DB·queue·bot 호출 credential로 재사용해서는 안 된다.

### 4.3 관리형 인증 계층의 Discord provider

Flow:

- 외부 auth service 또는 framework adapter가 Discord code exchange와 session을 관리하고 application이 반환 identity에 제품 role 검증을 추가한다.

장점:

- OAuth callback, cookie, session rotation과 provider integration의 반복 구현을 줄일 수 있다.
- vendor가 server-side revocation과 environment 분리를 실제로 지원하면 운영 부담이 낮아질 수 있다.

비용·위험:

- Discord provider 로그인은 프로젝트의 guild owner·configured role 정책을 자동 충족하지 않는다.
- provider가 Discord refresh token을 어떻게 저장·암호화·revoke하는지, account linking과 session breach 대응을 별도로 검증해야 한다.
- auth vendor가 새 개인정보·비밀·가용성 경계가 되며 framework·pricing·migration 종속이 생긴다.

### 판정

| 기준 | `identify` + bot 조회 | `guilds.members.read` | 관리형 auth provider |
|---|---|---|---|
| Discord identity | 공식 경로 | 공식 경로 | provider 구현 검증 필요 |
| 현재 role 확인 | bot REST/Gateway 경계 | user OAuth REST | 별도 구현 필요 |
| user token 보존 최소화 | 가장 유리 | 지속 재검증 시 불리 | vendor 정책에 따름 |
| web→bot 의존 | 있음 | 없음 | role 방식에 따라 있음 |
| 즉시 폐기·감사 | 자체 session으로 가능 | 자체 session으로 가능 | vendor 기능 검증 필요 |
| 구성요소·종속성 | 내부 경계 하나 | OAuth token lifecycle | 외부 auth 경계 추가 |

## 5. Session 후보 비교

### 5.1 Server-side opaque session

Browser에는 추측 불가능한 session ID만 host-only cookie로 두고 identity, role tier, 검증 시각, idle·absolute expiry와 revocation 상태는 server store에 둔다. logout·role 상실·incident 때 한 record를 폐기할 수 있고 browser에 Discord token이나 권한 claim을 넣지 않는다.

저장소가 필요하지만 D-05 후보를 그대로 재사용할 수 있다. session ID 원문은 로그·감사·backup에 넣지 않고 server store에는 hash 또는 동등한 탈취 완화 표현을 검토한다. OAuth callback 뒤 session ID를 새로 발급한다.

### 5.2 서명·암호화된 stateless cookie/JWT

별도 session lookup 없이 identity·expiry를 검증할 수 있지만 role 상실·logout 즉시 폐기를 하려면 짧은 expiry 또는 denylist/version state가 다시 필요하다. 1일 유휴·7일 절대 session에 권한 tier를 담아도 최대 5분 역할 cache와 즉시 폐기 계약을 대신할 수 없다. payload encryption 여부와 무관하게 key rotation, audience·issuer·algorithm 고정과 replay 책임이 생긴다.

### 5.3 관리형 session

외부 auth service가 session issuance·rotation·revocation을 맡긴다. 제품 role을 매 요청 서버에서 확인하고 vendor outage·export·account deletion·audit·cookie 설정을 검증할 수 있을 때만 후보가 된다. 소규모 프로젝트에서 OAuth provider와 session만을 위해 새 유료 control plane을 두는 것은 비용 이점이 입증되어야 한다.

| 기준 | Opaque server session | Stateless token | Managed session |
|---|---|---|---|
| 즉시 logout/revoke | 강함 | 별도 state 없이는 약함 | vendor 기능에 따름 |
| role 변경 반영 | server state 갱신 가능 | 짧은 TTL/denylist 필요 | application 인가 필요 |
| cookie 최소 정보 | session ID만 | identity·claim 포함 가능 | vendor 형식에 따름 |
| 운영 부담 | session table·cleanup | key·claim·denylist | vendor·SDK·migration |
| 현재 적합성 | 가장 직접적 | 장기 session 요구와 충돌 | 강한 대안 |

## 6. Browser·권한 검증의 공통 계약

- production cookie는 `__Host-` prefix, `Secure`, `HttpOnly`, `Path=/`, `Domain` 미설정을 기본 후보로 둔다. OAuth top-level redirect와 framework 동작을 확인해 `SameSite=Lax` 또는 더 엄격한 값을 선택한다.
- OAuth transaction은 고엔트로피 `state`, 시작 browser와 callback의 binding, 짧은 만료, 단일 사용과 정확히 등록된 redirect URI를 요구한다. code·state·error query를 log나 analytics에 남기지 않는다.
- mutation은 safe method를 쓰지 않고 CSRF token과 `Origin`/동등한 server-side 검증을 적용한다. CORS는 CSRF 방어 또는 인가를 대신하지 않는다.
- session 발급·재발급·폐기와 login 실패는 actor가 확인된 범위, 시각, event type, outcome과 reason만 감사한다. session ID, OAuth code/token, cookie, raw header, IP와 User-Agent는 기본 저장하지 않는다.
- 보호 요청은 session 존재뿐 아니라 현재 server-side authorization tier와 허용 guild를 검사한다. role 조회 timeout·Discord 401/403/404/429·internal auth 실패는 권한 승인으로 승격하지 않는다.
- 고위험 작업은 현재 Discord member/owner/roles를 강제 재조회하고 관리자 tier와 CSRF를 다시 확인한 뒤에만 실행한다. 역할 조회와 감사 선행 기록 중 하나라도 실패하면 전체 거부한다.
- 자가 bot host 장애 중에는 5분 이내의 유효한 역할 cache로 read-only만 허용한다. 만료 뒤 인증된 조회도 `unavailable`이며 mutation과 고위험 작업은 즉시 거부한다.
- 고위험 작업의 마지막 Discord OAuth 완료 시각이 15분을 넘으면 OAuth를 다시 완료한다. 단순 session 활동은 이 시각을 갱신하지 않으며, 재인증 뒤에도 현재 역할 조회와 명시적 확인을 생략하지 않는다.

## 7. Workload 인증 후보와 D-05·D-08 영향

| 후보 | 적합한 경계 | 장점 | 주요 위험·검증 |
|---|---|---|---|
| DB/queue provider의 별도 role·credential | 공유 DB·관리형 queue | native ACL을 재사용하고 web·bot 권한을 분리 | public endpoint, 장기 credential, rotation·preview 분리; 원 actor는 별도 payload/row로 감사 |
| 만료되는 signed service assertion/request | direct API·queue message | audience, issuer, expiry, operation ID를 payload와 묶고 shared bearer replay를 줄일 수 있음 | clock skew, key distribution·rotation·revocation과 canonical signing 규칙 |
| mTLS/service identity proxy | direct API·private network | connection에서 workload private key 보유를 확인 | certificate/proxy 운영과 Vercel·자가 host 지원·비용 검증 필요 |
| static bearer/shared HMAC secret | 좁은 저빈도 API의 최소 대안 | 구현·운영이 가장 단순 | 유출 시 sender 구분이 약하고 rotation 중 이중 key, replay nonce·expiry와 constant-time 검증 필요 |

어느 후보도 browser session이나 Discord user token을 workload credential로 사용하지 않는다. D-05가 관리형 PostgreSQL이면 별도 DB role이 우선 비교 대상이고, D-08이 direct API면 signed request 또는 service identity가 우선 비교 대상이다. transport가 정해지기 전에 한 인증 기술로 확정하지 않는다.

## 8. 확정된 사용자 결정과 미확인 사항

### 확정된 사용자 결정

| ID | 결정 | 연결된 소유자 결정 |
|---|---|---|
| `D07-Q01` | dashboard 로그인은 Discord OAuth만 허용한다. | `OWN-026` |
| `D07-Q02` | session은 1일 비활동·7일 절대 만료를 적용한다. | `OWN-027` |
| `D07-Q03` | 역할 cache는 최대 5분이며 유효 cache에서는 read-only만 허용한다. 재조회 실패 시 변경을 거부하고 cache가 만료되면 조회도 `unavailable`로 처리한다. 고위험 작업은 항상 현재 역할을 조회한다. | `OWN-028` |
| `D07-Q04` | Discord user token은 지속 저장하지 않고 identity 확인 뒤 자체 server-side session과 bot-side member 조회를 사용한다. | `OWN-029` |
| `D07-Q05` | 임의 preview의 로그인·변경을 끄고 필요한 고정 preview만 별도 Discord app·credential을 사용한다. | `OWN-030` |
| `D07-Q06` | 고위험 작업은 15분 이내 로그인, 현재 역할 강제 조회와 명시적 확인을 모두 요구한다. | `OWN-031` |

### 미확인 사항

1. Discord가 이 confidential web flow에서 PKCE를 공식적으로 지원·강제하는지.
2. 같은 host 안의 web·bot을 별도 process로 나눌지와 process별 secret·저장소 권한은 runtime·저장소 결정 전까지 미확정이다.

## 9. 필요한 검증 — 이번 작업에서는 실행·작성하지 않음

- production과 고정 preview redirect에서 OAuth code, state, PKCE 지원, callback 재사용·만료·open redirect 거부를 확인한다.
- 운영자 role 제거·guild 탈퇴·owner 변경 뒤 cache 만료와 고위험 강제 조회가 정한 시간 안에 session을 폐기하는지 확인한다.
- login·privilege change·logout 때 session ID가 재발급·폐기되고 이전 ID, CSRF 누락, 잘못된 Origin과 preview cookie가 거부되는지 확인한다.
- Discord 401/403/404/429/5xx와 bot/web 경계 timeout 때 login·read·mutation이 결정된 계약대로 닫히는지 확인한다.
- 선택 transport에서 production·preview 및 web·bot credential 교차 사용, expiry, replay, key rotation과 revoke를 검증한다.

## 10. 잠정 권고와 가장 강한 대안

### 잠정 권고 — 선택 아님

**Discord Authorization Code의 `identify` + bot-side current member 조회 + server-side opaque session**을 첫 검증 조합으로 둔다. user OAuth access token은 identity 조회에만 일시 사용하고 프로젝트 저장소에 보존하지 않으며 refresh token도 저장하지 않는다. 일반 요청은 최대 5분 role cache에서 read-only만 허용하고, 변경과 고위험 작업은 확정된 기본 거부 조건을 유지한다.

이 조합은 Discord identity와 제품 role policy를 분리하고 browser에 임의 session ID만 남긴다. web·bot 단일 지속 server 경계에서는 역할 조회를 public network에 노출하지 않고 local process/module 호출로 제한한다. 구체 process 격리와 bot token 접근 권한은 runtime·구현 계획 전 별도로 결정한다.

### 가장 강한 대안

**검증된 관리형 auth/session + 별도 Discord role adapter**가 가장 강한 대안이다. OAuth·session lifecycle 구현을 줄일 수 있지만 guild owner·configured role·고위험 재조회는 여전히 프로젝트 책임이다. provider가 token 보존, 즉시 revoke, environment 분리, export와 무료·저비용 조건을 명확히 충족할 때만 더 단순하다고 볼 수 있다.

`guilds.members.read`와 자체 opaque session은 web→bot 조회 경계를 제거하는 직접 대안이다. 그러나 장기 role 재검증을 위해 Discord refresh token을 저장해야 한다면 token 최소화보다 이점이 큰지 별도로 판단해야 한다.

### 주요 위험

- OAuth 로그인 성공을 허용 guild·role 승인으로 오해해 다른 guild 사용자를 허용할 위험
- callback에서 한 번 복사한 role을 session 동안 그대로 신뢰할 위험
- Discord user token, bot token 또는 browser session을 내부 workload 공용 credential로 재사용할 위험
- arbitrary preview에 production OAuth secret·cookie·DB credential을 노출할 위험
- SameSite cookie나 CORS만으로 CSRF가 해결됐다고 오해할 위험
- stateless token을 쓰면서 logout·role 상실 즉시 폐기를 주장할 위험
- Discord 장애·rate limit 때 stale 관리자 권한을 정상으로 승인할 위험

### 권고를 뒤집는 조건

- 같은 host의 web 침해가 bot token과 role 조회 권한으로 확산되지 않도록 process·secret 권한을 충분히 분리할 수 없음
- Discord OAuth token을 보관하지 않고는 요구된 role 재검증 UX를 충족할 수 없음
- 검증된 관리형 auth가 token 최소화·즉시 폐기·환경 분리와 Discord role adapter를 더 적은 총운영비로 제공함
- 짧은 session만 허용되어 stateless token도 별도 denylist 없이 권한 상실 기준을 충족함
- D-05·D-08 결정에서 provider-native workload identity가 별도 signed request나 mTLS보다 단순하고 안전함이 입증됨

## 11. 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고 docs/prompts/research.md 절차에 따라
D-09 단일 지속 server 호스팅 후보를 조사해.
OWN-005, OWN-016~OWN-021, OWN-034와 D-08의 단일 server 경계를 입력으로 사용하고
외부 임대 server와 소유 Mac·대체 Windows를 비용·상시성·보안·복구로 비교해.
아직 host·runtime·저장소·인증 기술을 선택하거나 ADR, Spike,
구현 계획 또는 제품 코드를 작성하지 마. KBO는 연기 상태로 유지해.
```
