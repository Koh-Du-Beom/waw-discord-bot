# Authentication runbook

- Scope: `PLAN-0004` Task 2 local/disposable authentication contract
- Status: local production assembly complete; G2, G3 and production migrations
  `0003`~`0004` pending
- Canonical origin: `https://waw.dubeom.com`

## Contract

- Login stores only a SHA-256 OAuth state hash with a 10-minute expiry.
- The raw state is bound to the initiating browser with a host-only, Secure,
  HttpOnly, SameSite=Lax cookie and is deleted after callback processing.
- Callback accepts one base64url state of 32–128 characters and one non-empty
  authorization code of at most 2,048 characters.
- Discord access and refresh tokens remain callback-local and are excluded from
  persistence, responses, errors and structured logs.
- Successful callback rotates any existing opaque session and emits host-only
  Secure/HttpOnly session and session-bound CSRF cookies.
- A current role tier change rotates the opaque session without extending its
  existing absolute expiry. Read-only requests may use a successful role cache
  for at most five minutes; mutation and high-risk requests never use it.
- Mutation requires exact Origin, CSRF and current role. High-risk requests also
  require OAuth completion within 15 minutes and explicit confirmation.
- Arbitrary preview authentication remains disabled.

## Local verification

```bash
node --test src/auth/auth-service.test.ts src/auth/oauth-http-boundary.test.ts
node --test src/persistence/postgres-persistence.integration.test.ts
npm run typecheck
npm test
```

The PostgreSQL test creates a disposable local cluster and verifies migration,
state consumption, callback transaction, session rotation/touch and logout
revoke. It does not connect to Supabase or Discord.

## Pending gates

- G2: actual Discord OAuth application secret, exact redirect registration and
  OAuth round trip.
- G3: actual bot-side current member/role adapter and bot credential/intents.
- Production migrations `0003`~`0004`: candidate SHA-256 values
  `7c807c9113524103eed0314565ac6263facc49098e1d0c5eedf13038ddb97a5f`.
  Do not apply it until a separately approved backup, migration and rollback
  window.

## Rollback

Disable login and callback entry points, revoke sessions created by the affected
release and return to the prior application version. Do not destructively remove
session or audit records. If production `0003` has not been applied, rollback is
application-only. If it has, use its separately approved database rollback plan.
