# Dashboard UI integration notes

## Production build and deep links

`npm run build:web` builds `web/index.html` and hashed assets into
`dist/web`. Fastify must serve existing assets directly and return
`dist/web/index.html` for non-API `GET`/`HEAD` routes so browser refreshes on
SPA deep links work. API and auth paths must never fall through to the SPA.
`vite preview` is not a production server.

The document includes a `noscript` explanation. Runtime fetch failures produce
an announced unavailable state with an explicit retry.

## Shared contract gate

The frozen settings mutation contract does not yet describe a CSRF value or a
success response. The UI currently models the minimal response as
`LowRiskSettingsDto` so version-conflict recovery remains possible. Before
runtime integration, the browser adapter default-denies this mutation. The
dashboard-runtime owner should apply this exact shared-contract change (names
may change only through coordinated review):

```diff
 export type SessionDto = {
   authenticated: true;
   actor: {
     displayName: string;
     tier: AuthorizationTier;
   };
+  csrfToken: string;
 };

+export type UpdateLowRiskSettingsResponseDto = {
+  settings: LowRiskSettingsDto;
+  auditEvent: AuditEventDto;
+};
```

The runtime route should require the session-bound CSRF value in an
`X-CSRF-Token` header in addition to exact Origin, current server-side role,
and operation authorization. The browser adapter can then send
`SessionDto.csrfToken` and consume `UpdateLowRiskSettingsResponseDto`; no
client route guard or hidden control is an authorization decision.

## Test runner coordination

Node 24 strips TypeScript types but does not execute TSX syntax directly. The
current `node --test "web/**/*.test.ts"` script also excludes `.tsx`. The
dashboard-runtime owner should coordinate this package change:

```diff
   "scripts": {
-    "test": "node --test \"src/**/*.test.ts\" \"web/**/*.test.ts\"",
+    "test": "node --test \"src/**/*.test.ts\" && tsx --test --test-isolation=none \"web/**/*.test.tsx\"",
   },
   "devDependencies": {
+    "@types/jsdom": "<reviewed exact version>",
+    "tsx": "4.21.0",
   }
```

Until those package changes are accepted, the UI test uses the existing local
`web/jsdom.d.ts` shim and was verified with an untracked one-time TSX runner.
