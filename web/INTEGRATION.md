# Dashboard UI integration notes

## Production build and deep links

`npm run build:web` builds `web/index.html` and hashed assets into
`dist/web`. Fastify must serve existing assets directly and return
`dist/web/index.html` for non-API `GET`/`HEAD` routes so browser refreshes on
SPA deep links work. API and auth paths must never fall through to the SPA.
`vite preview` is not a production server.

The document includes a `noscript` explanation. Runtime fetch failures produce
an announced unavailable state with an explicit retry.

## Shared contract integration

The session DTO now carries the session-bound CSRF value and the settings
mutation returns both the versioned setting and its audit event. The browser
adapter sends the value as `X-CSRF-Token`; the Fastify adapter additionally
requires exact Origin, the CSRF cookie, an active opaque session, and a current
server-side role matching the session tier. No client route guard or hidden
control is an authorization decision.

## Test runner coordination

Node 24 strips TypeScript types but does not execute TSX syntax directly.
`tsx@4.21.0` and `@types/jsdom@28.0.3` are pinned for UI tests. The test script
runs source TypeScript tests with Node and browser-facing TS/TSX tests through
TSX without process isolation, avoiding the Windows loader child-process hang
observed during the initial integration.

`npm run test:browser` serves the production SPA from a synthetic local
Fastify fixture, launches the installed Microsoft Edge through
`playwright-core@1.61.1`, runs `@axe-core/playwright@4.12.1`, and verifies the
keyboard-only settings mutation, result focus, and audit presentation. It
does not use a real account, OAuth provider, Discord data, or remote database.
Linux CI installs Chromium through the checked-in `playwright-core` CLI path,
not an unpinned `npx playwright` package, so the downloaded browser revision
always matches the runtime library.
