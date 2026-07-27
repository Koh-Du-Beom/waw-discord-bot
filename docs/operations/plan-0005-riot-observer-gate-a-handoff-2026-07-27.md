# PLAN-0005 Riot observer Gate A handoff — 2026-07-27

- Status: CloudShell Linux exact Gate A PASS
- Candidate commit: `cb93ed8d3f0bbe0d8d017a3211b2217df9a1f7db`
- Release ID: `cb93ed8`
- Archive SHA-256:
  `808763f64de1a393d1b3e5fad1bf014c132e2e208c0b08c2b232a68594d4c650`
- Archive bytes: `615466`
- Production mutation performed: none
- Quota mutation performed: none

## Exact change

- Added a KR-only Spectator v5 `RiotGameObserver` using the existing bot-only
  `riot-api-key` credential.
- Normalized 404 to inactive, 429 to unknown with `Retry-After` cooldown, and
  provider, network, redirect, oversized, or malformed results to fixed
  identifier-free unknown reason codes.
- Assembled the existing active-link target source, Discord voice
  reconciliation, observation scheduler, comparison executor, and PostgreSQL
  observation store in the production bot.
- Corrected the shared discord.js boundary to read the real
  `VoiceState.streaming` property while retaining the existing normalized
  `selfStream` domain field.
- Kept `WAW_GAME_OBSERVATION_ENABLED=0`,
  `WAW_SUMMARY_QUOTA_ENABLED=0`, and
  `WAW_DASHBOARD_QUOTA_ENABLED=0`.

No migration, dependency, web UI, quota policy, credential file, Discord
registration, production unit, or production state changed.

## Verification evidence

- Targeted observer, voice adapter, scheduler, and lifecycle:
  `14 pass / 0 fail`.
- Typecheck: passed.
- Normal local suite with short socket temp path:
  `249 tests / 242 pass / 7 explicit PostgreSQL URL skips / 0 fail`.
- Disposable PostgreSQL with migrations `0001` through `0007`, using a fresh
  database for each observation integration:
  - active-link target source: `1 pass / 0 fail`;
  - evidence, deduplication, stale rejection, and atomic rollback:
    `1 pass / 0 fail`.
- Server and web production build: passed.
- Production application asset contract: passed.
- `git diff --check`: passed before candidate commit.
- The deterministic archive was generated twice with
  `git archive --format=tar cb93ed8 | gzip -n`; both byte streams matched.
- Clean `node:24-bookworm` exact archive stage:
  - archive hash and byte count matched;
  - release-manager and production-asset fixtures passed;
  - clean install, typecheck, server/web build, and production prune passed;
  - production dependency audit reported zero vulnerabilities;
  - seven migration source/compiled assets were byte-identical;
  - immutable marker matched and writable-file count was zero;
  - compiled Riot observer and Spectator v5 path were present;
  - all three relevant feature flags remained `0`;
  - final marker was `EXACT_ARCHIVE_STAGE_PASS`.

The first plain macOS full test run had one unrelated Unix-socket `EINVAL`
failure because the system temp path exceeded the platform socket limit; the
same full suite passed with `TMPDIR=/tmp`. The macOS release-manager fixture
also cannot rename its intentionally read-only staged tree, while the required
Linux fixture and exact stage passed.

A forced run of every PostgreSQL integration test against one shared database
was rejected as invalid evidence: existing fixtures assume isolated databases
and two tests observed rows created by earlier tests. The two observation
integrations were rerun against separate freshly migrated databases and passed.

## CloudShell Gate A

CloudShell Linux read-only verification passed:

1. the uploaded archive matched the exact SHA-256 and `615466` byte count;
2. the downloaded Node `v24.18.0` Linux archive passed its published checksum;
3. release-manager and production application asset fixtures passed;
4. the isolated stage completed clean install, typecheck, server/web build,
   production prune, and a zero-vulnerability production dependency audit;
5. the immutable release marker matched, all seven source/compiled migrations
   were byte-identical, and the staged release had zero writable files;
6. compiled output contained `RiotSpectatorObserver` and the Spectator v5
   active-game endpoint;
7. `WAW_GAME_OBSERVATION_ENABLED`,
   `WAW_SUMMARY_QUOTA_ENABLED`, and
   `WAW_DASHBOARD_QUOTA_ENABLED` were all exactly `0`;
8. the final marker was `CLOUDSHELL_GATE_A_PASS`.

No production host, Riot credential, AWS resource, Supabase state, Discord
state, or feature flag was contacted or mutated. Cleanup initially stopped on
the deliberately read-only staged tree; after restoring write permission only
inside `/tmp/waw-cb93ed8-gatea`, the isolated stage and uploaded archive/base64
files were removed. The final marker was `CLOUDSHELL_CLEANUP_PASS home=0 tmp=0`.

## Subsequent approval boundaries

After CloudShell Gate A passes, request approval to deploy this exact
default-off release. Deployment alone must not start Riot polling.

The consented external spike is a second production mutation and follows
`plan-0005-consented-riot-observation-spike-2026-07-27.md`. It must use one
owner-approved linked account, a bounded time window, the documented stop and
rollback conditions, and return the observation flag to `0` even on pass.

Permanent observation activation is not approved by this handoff. Automatic
`confirmed` incident transition and numeric one-stack accumulation also remain
outside this candidate and require a separate reviewed change.

## Production execution result

Owner approval was received for the exact default-off release. Candidate
`cb93ed8`, archive SHA-256
`808763f64de1a393d1b3e5fad1bf014c132e2e208c0b08c2b232a68594d4c650`,
and byte count `615466` matched at the production transfer boundary.

- Preflight found active release `1d9a1fa`, healthy local service state, active
  web, bot, backup, and monitoring units, zero failed units, and all three
  relevant feature flags set to `0`.
- This candidate changes no migration, package manifest, lockfile, or systemd
  unit from `1d9a1fa`; no database migration or unit-file mutation was needed.
- The exact archive staged successfully with seven byte-identical
  source/compiled migrations, zero writable files, the compiled Riot observer,
  the Spectator v5 endpoint, and all three feature flags at `0`.
- An initial staging command incorrectly supplied the fixture-only
  `WAW_INSTALL_ROOT=/opt/waw`, producing an isolated release under
  `/opt/waw/opt/waw/releases`. Activation stopped before any symlink or service
  change. The exact misplaced staged tree and empty parent directories were
  removed, then the archive was staged at `/opt/waw/releases/cb93ed8` using the
  production default root.
- Activation switched `current` to `cb93ed8` and `previous` to `1d9a1fa`.
  Bot and web restarted sequentially. One expected loopback connection refusal
  occurred while the bot was restarting; the bounded readiness gate recovered
  without rollback.
- Final local and canonical health responses were both
  `{"status":"healthy"}`. Web, bot, backup, and monitoring units were active,
  service restart counters were zero, and the production dashboard remained
  authenticated with Gateway and storage connected.
- `WAW_GAME_OBSERVATION_ENABLED`,
  `WAW_SUMMARY_QUOTA_ENABLED`, and
  `WAW_DASHBOARD_QUOTA_ENABLED` remained `0`. No Riot polling or quota
  enforcement was activated.
- Production and CloudShell transfer archives, extracted source, temporary SSH
  key/certificate, and access-detail JSON were removed. The immutable release
  and previous-release rollback target were retained.

The owner subsequently clarified the desired quota contract: quota applies
only to `/요약`, with one invocation per user per rolling hour. The current
disabled implementation and migration `0007` still model a daily limit; that
contract change requires a separate minimal candidate and does not alter this
default-off deployment.
