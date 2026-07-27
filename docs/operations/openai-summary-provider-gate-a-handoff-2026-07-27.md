# OpenAI summary provider Gate A handoff — 2026-07-27

- Status: local Linux and CloudShell exact archive Gate A PASS
- Candidate commit: `cff6308846a447cda17cdf9c496a8b85192ce3ae`
- Release ID: `cff6308`
- Archive SHA-256:
  `9badc975212b2d6d3d23bc7db6a3d2598760b69d3a9d71825bd55d1c78051fd9`
- Archive bytes: `632208`
- Production mutation performed: none
- Provider request or credential access performed: none
- Feature-flag mutation performed: none

## Exact change

- Added the pinned OpenAI Responses adapter for
  `gpt-5.4-mini-2026-03-17` using native `fetch`, `store:false`,
  `reasoning.effort:none`, strict four-section structured output, a
  conservative 300,000-byte request cap, 4,096 output-token cap, and 120-second
  deadline.
- Validates the complete ordinal manifest and provider capacity before
  consuming the rolling-hour reservation or dispatching.
- Defers Discord `/요약` interactions before history and provider work.
- Assembles the provider only when `WAW_SUMMARY_PROVIDER_ENABLED=1` and then
  reads only `summary-api-key` from the bot systemd credential directory.
- Keeps base production assets at:
  - `WAW_SUMMARY_PROVIDER_ENABLED=0`
  - `WAW_SUMMARY_QUOTA_ENABLED=0`
  - `WAW_GAME_OBSERVATION_ENABLED=0`
  - `WAW_DASHBOARD_QUOTA_ENABLED=0`

No migration, dependency, lockfile, Discord command registration, provider
credential, production release, database, service, or external provider state
changed.

## Verification evidence

- Targeted adapter/provider/defer regression: `15 pass / 0 fail`.
- Full local suite:
  `254 tests / 247 pass / 7 explicit external-URL skips / 0 fail`.
- Typecheck, server/web build, production application asset contract, and
  `git diff --check`: passed.
- Production dependency audit: zero vulnerabilities.
- The deterministic command
  `git archive --format=tar cff6308 | gzip -n` produced two byte-identical
  archives.
- Clean `node:24-bookworm` exact archive stage:
  - exact SHA-256 and `632208` bytes matched;
  - release-manager and production-asset fixtures passed;
  - clean install, typecheck, build, production prune, and production
    dependency audit passed;
  - eight source and compiled migrations were byte-identical;
  - immutable marker matched and writable-file count was zero;
  - compiled adapter contains the pinned model and `store:false`;
  - provider, bot quota, game observation, and dashboard quota flags were all
    exactly `0`;
  - final marker:
    `EXACT_ARCHIVE_GATE_A_PASS candidate=cff6308 ... flags=0,0,0,0 migrations=8`.

### CloudShell Linux revalidation

AWS CloudShell Amazon Linux 2023 independently passed the same exact archive:

- uploaded SHA-256 and `632208` byte count matched;
- the downloaded official Node `v24.18.0` Linux archive passed its published
  checksum;
- release-manager and production application asset fixtures passed;
- isolated clean install, typecheck, build, production prune, and production
  dependency audit passed with zero vulnerabilities;
- eight source/compiled migrations were byte-identical;
- the immutable marker matched and writable-file count was zero;
- compiled output contained the pinned model and `store:false`;
- provider, bot quota, game observation, and dashboard quota flags were all
  exactly `0`;
- final marker:
  `CLOUDSHELL_GATE_A_PASS candidate=cff6308 ... writable=0 flags=0,0,0,0 migrations=8`.

The first interactive invocation failed before PASS; an earlier interactive
`set -e` also closed the terminal, so its transient output did not preserve the
failure line. Its EXIT trap removed the isolated stage. The runner was repeated
from the unchanged exact archive with output captured to a diagnostic file; it
passed and removed the archive, runner and isolated stage. The diagnostic file
was then removed and the final matching artifact check was
`CLOUDSHELL_FINAL_CLEANUP home=0 tmp=0`.

The first full regression after adding deferred replies found one stale fake
Discord interaction without `deferReply`/`editReply`. The fixture was corrected
and the complete suite was rerun successfully.

## Official API contract reviewed

- The pinned model snapshot supports the Responses endpoint, structured
  outputs, `reasoning.effort:none`, a 400,000-token context window, and a
  128,000-token output maximum:
  <https://developers.openai.com/api/docs/models/gpt-5.4-mini>.
- Responses structured output uses `text.format` with strict `json_schema`:
  <https://developers.openai.com/api/docs/guides/structured-outputs>.
- `store:false` avoids Responses application-state storage, but it does not by
  itself grant Zero Data Retention or remove default abuse-monitoring
  retention:
  <https://developers.openai.com/api/docs/guides/your-data>.

## Activation blockers

Do not request real-message activation until all of these are resolved:

1. Owner explicitly accepts the documented provider retention/data-processing
   boundary, or the organization is verified for an acceptable retention mode.
2. A credentialed, synthetic-only Korean marker recall, output-contract,
   latency, token-usage, and cost spike passes without real Discord content.
3. The exact root-owned provider credential source and bot-only systemd
   credential path are prepared without writing the value or a recognizable
   prefix/hash to logs or documents.
4. The current production release, schema version `8`, rollback target,
   service health, and all four flags are reverified.

## Exact production approval scope after blockers pass

Request one approval naming this exact candidate tuple and allowing only:

1. read-only production preflight and a fresh verified encrypted backup;
2. exact archive staging and default-off activation of release `cff6308`;
3. replacement of the reviewed bot base unit to add only
   `WAW_SUMMARY_PROVIDER_ENABLED=0`, followed by daemon reload, bot restart,
   singleton and health verification;
4. creation of `/etc/waw-credentials/bot-summary-api-key` as a root-owned,
   mode-`0600` secret source without displaying its value;
5. a bounded synthetic-only provider spike using the staged compiled adapter;
6. only if the spike passes, installation of an exact bot service drop-in:

   ```ini
   [Service]
   LoadCredential=summary-api-key:/etc/waw-credentials/bot-summary-api-key
   Environment=WAW_SUMMARY_PROVIDER_ENABLED=1
   Environment=WAW_SUMMARY_QUOTA_ENABLED=1
   Environment=WAW_GAME_OBSERVATION_ENABLED=0
   ```

7. daemon reload and one bot restart, then verification that provider and
   rolling-hour quota are `1`, game observation remains `0`, web/dashboard
   quota remains `0`, singleton ownership and canonical health are normal;
8. one owner-consented `/요약` smoke test with a deliberately synthetic Discord
   conversation, followed by an immediate second-call cooldown denial check.

Migration `0008` is already applied and must not be reapplied. Dashboard quota,
game observation, Riot state, web credentials, OAuth, Discord registration,
other services, and unrelated release contents remain outside this approval.

## Stop and rollback

Stop before release activation on any archive hash/byte mismatch, unexpected
diff, migration ledger other than `1..8`, unhealthy backup/restore evidence,
service failure, nonzero restricted flag, or missing rollback release.

Stop before flag activation if the synthetic spike violates the output schema,
120-second deadline, retention decision, input/output budget, fixed model, or
redaction contract. Do not send real Discord content.

After activation, immediately return both summary flags to `0`, remove the
drop-in, daemon-reload and restart the bot if health, singleton ownership,
Discord reply completion, cooldown enforcement, output schema, redaction, or
provider behavior fails. If the candidate itself is implicated, reactivate the
previous immutable release. Preserve schema version `8` and reservation rows.
Revoke the new provider credential if its value or recognizable derivative may
have escaped; otherwise retain the root source only for a separately approved
retry.
