# Project completion gates — 2026-07-28

- Status: In progress
- Source baseline: `main` at `19c5d6b6a3486a23881bfd17956e9a794c9b9fe0`
- Pre-correction product candidate:
  `f42e2b06b23695bee113091581aba635ec343494`
- Candidate archive:
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`,
  `640107` bytes

## Meaning of complete

The current product is complete only when the in-scope summary, Riot/game
observation, dashboard, deployment, security, backup and recovery paths meet
the product policy completion criteria. KBO remains explicitly out of scope.
The separately gated first journald vacuum is maintenance, not a product
feature, and must not be treated as implicitly approved by product completion.

## Ordered remaining gates

### 1. Summary marker synthetic OpenAI spike

The owner approved the exact tuple and bounded scope in
`openai-summary-marker-synthetic-spike-approval-request-2026-07-28.md`.

Completed actions:

1. ~~Restore a safe production access channel and pass the read-only production
   preflight.~~ PASS: schema version `8`, explicit provider zero and healthy
   default-off runtime were verified.
2. ~~Stage only `/opt/waw/releases/f42e2b0`.~~ PASS: exact immutable candidate
   staged with activation and restart count `0`.
3. ~~Complete OpenAI Platform login, then create and inject one dedicated
   project key.~~ PASS;
4. ~~Send exactly one fixed synthetic request with no retry.~~ PASS;
5. ~~Confirm the four marker counts are all zero and usage is exactly one
   request.~~ PASS;
6. ~~Revoke the key and remove all credential and transient state.~~ PASS;
7. ~~Verify health, singleton ownership, redaction and all four flags at
   zero.~~ PASS.

This gate does not authorize activation, real Discord content or a production
service restart.

### 2. Default-off release approval and rollout

Status: PASS. The owner's current instruction authorized the bounded technical
rollout without another technical confirmation. The execution fixed and
verified:

- the same exact candidate and archive tuple;
- candidate bot/web systemd units;
- removal of the temporary provider-zero bridge in the same change;
- one daemon reload and two service restarts;
- preflight backup and automatic rollback;
- healthy loopback, singleton processes and zero failed units;
- provider, rolling-hour quota, dashboard quota and game-observation flags all
  remaining off.

No migration or provider call occurred. Full evidence is in
`default-off-f42e2b0-rollout-result-2026-07-28.md`.

### 3. Real summary activation

Status: runtime and command UX activation PASS; registered-user smoke remains.

Before sending any real Discord content:

1. ~~publish the approved registered-user disclosure for external processing
   and provider retention;~~ PASS;
2. ~~verify the pinned provider/model/data-control boundary has not materially
   changed;~~ PASS;
3. ~~approve the exact provider and rolling-hour quota flag changes;~~ PASS;
4. ~~verify Discord command registration/readback;~~ PASS;
5. run one bounded authorized `/요약 최근` smoke and read back private
   `/도움말`;
6. confirm raw message content is absent from persistence, audit and journals;
7. retain a default-off rollback that does not lose quota reservation audit
   rows.

Any provider retention, model, endpoint, region or data-control change requires
new owner approval.

### 4. Riot and consented game-observation production gates

The local/disposable implementation is complete, but real Riot and Discord
observation remains separately gated.

Remaining actions:

1. resolve or obtain the required production Riot capability;
2. run the separately approved synthetic/consented Riot ID and PUUID boundary
   checks;
3. run the consented Go Live observation spike with connected Gateway and
   canonical healthy state;
4. prove start/end detection, short interruption, reconnect reconciliation,
   deduplication and identifier-free logging within the approved bounds;
5. separately approve and activate game observation;
6. execute Gate C/D dashboard approval smoke for a valid KR request if no
   current evidence remains applicable to the release being activated.

No unrelated member, message or real-game observation is allowed during the
spike.

### 5. Final release and operational acceptance

After all enabled feature gates pass:

1. run the complete local regression from a short macOS `TMPDIR`;
2. repeat the clean Linux exact-archive Gate A;
3. verify production dependency audit, migrations, immutable marker and
   writable-file count;
4. verify canonical `https://waw.dubeom.com`, OAuth redirect, session/CSRF,
   current-role authorization, bot singleton and healthy monitoring;
5. verify backup publication and that the most recent approved restore
   evidence is still applicable;
6. verify failure/permission paths and secret/content redaction;
7. update `PROJECT_STATUS.md`, plans, runbooks and `CHANGELOG.md`;
8. record exact current/previous releases and rollback evidence.

The owner must also confirm the offline recovery identity, account MFA/recovery
material, domain renewal and reissuable service credentials in
`OWNER_BACKUP_AND_ACCOUNT_CHECKLIST.md`. Secret values must not be recorded in
the repository.

## Independent maintenance gate

The first production journald vacuum remains unapproved. It requires a
separate maintenance window with oldest/newest timestamps and current usage
read back before any destructive vacuum command. Product release approval does
not authorize it.

## 2026-07-28 preflight execution result

The approved read-only preflight did not reach the production host:

- first CloudShell controller attempt stopped because the one-time access
  response temporarily exposed `hostKeys` as null;
- a fresh structural read showed three host keys, but SSH with the returned
  private key and pinned host keys was rejected with
  `Permission denied (publickey)`;
- the response also contains an SSH certificate, so the private-key-only
  connection method was incomplete;
- the existing Lightsail browser SSH session was visibly logged in, but its
  canvas-backed input could not be driven safely by the accessibility input;
- clicking its paste control copied unrelated local clipboard text into a
  hidden input. The value was cleared before Enter, shell transmission or
  execution.

Therefore:

- production commands executed: `0`;
- candidate staged or activated: `0`;
- credential created: `0`;
- OpenAI requests: `0`;
- production mutation: `0`;
- CloudShell and local preflight transient artifacts were removed.

The permission/input stop condition was honored. A subsequent bounded run used
both the returned private key and SSH certificate, pinned all three returned
host keys and reached the production host. The harmless
`CERTIFIED_READONLY_CHANNEL_READY` marker passed, but one of the read-only
preflight assertions then failed and the controller exited with `rc=1`.
Per the approved stop condition, the run did not retry to diagnose the
individual assertion and did not continue to staging or credential creation.
The certified controller and its one-time access material were removed from
CloudShell and local temporary storage.

Final counts for this execution:

- production read-only channel: reached;
- full production preflight: FAIL, assertion intentionally not retried;
- candidate staged or activated: `0`;
- credential created: `0`;
- OpenAI requests: `0`;
- production mutation: `0`;
- known transient artifacts remaining: `0`.

Resume requires a separately authorized, labelled read-only diagnostic that
reports only the pass/fail state of each approved preflight invariant. It must
still stop before staging, credential creation or an OpenAI request.

## Labelled read-only diagnostic result

The owner separately approved one labelled read-only diagnostic. It ran once
through the certificate-authenticated, host-key-pinned channel and completed
with controller cleanup `rc=0`.

PASS:

- current release `2ac0996`;
- previous release `cb93ed8`;
- distinct rollback target;
- candidate `f42e2b0` absent;
- summary API credential absent;
- web, bot, backup timer and monitor timer active;
- backup and monitor timers enabled;
- latest backup and monitor service results `success`;
- failed systemd units `0`;
- summary quota, game observation and dashboard quota flags each had exactly
  one explicit zero declaration;
- canonical health `healthy`;
- available memory `398752` KiB and `/opt/waw` available disk `34484044` KiB.

FAIL:

- provider flag: the bot unit had `0` exact
  `WAW_SUMMARY_PROVIDER_ENABLED=0` declarations;
- schema version: readback returned `UNKNOWN`, so version `8` was not proved.

No follow-up query or diagnostic retry was performed. Staging, credential
creation, OpenAI calls and production mutation remained `0`. The one-time
access material, CloudShell controller and local diagnostic artifacts were
removed.

The next gate is not the synthetic spike. It is a separately approved
read-only investigation of only these two failed assertions. Any proposed
production repair requires its own exact change-set approval.

## Two-cause read-only investigation

The owner approved a read-only investigation limited to the provider flag and
schema readback failures. The sanitized investigation completed once through
the certificate-authenticated, host-key-pinned channel.

Provider flag cause:

- bot unit fragment:
  `/etc/systemd/system/waw-bot.service`;
- only drop-in:
  `/etc/systemd/system/waw-bot.service.d/admin-command-ipc.conf`;
- neither source contains a `WAW_SUMMARY_PROVIDER_ENABLED` declaration;
- declaration counts were `zero=0`, `one=0`, `other=0`;
- resolved environment counts were also `zero=0`, `one=0`, `other=0`.

The preflight failed because it requires an explicit default-off declaration;
absence was not accepted as equivalent to exact zero.

Schema readback cause:

- current release: `2ac0996`;
- credential source exists at the approved sanitized path with owner
  `root:root`, mode `0600`;
- it is nonempty and root-readable;
- it is not directly readable by `waw-bot`, preserving the source credential
  boundary;
- Node is available;
- dynamic import of the current release's `postgres` package failed;
- therefore credential parsing, DB connection and schema query were not
  attempted in that Node process.

No error body, DB URL, credential value or unit body was emitted. No follow-up
query was made. Staging, credential creation, OpenAI calls and production
mutation remained `0`; controller cleanup completed with `rc=0` and the
CloudShell/local transient artifacts were removed.

The next step requires an exact proposed correction for both preflight
assumptions. Production mutation is not authorized by this investigation.

## Lightsail read-boundary diagnostic

After the access-only controller stopped at its API stage, a smaller
output-silent read-only controller separated the remaining AWS boundaries
without calling the failed access-detail action.

PASS:

- current CloudShell AWS session;
- regional Lightsail instance-list API and numeric response shape;
- exact-target Lightsail read API and target-name response match;
- fixed-label-only output and transient cleanup.

Exact external calls were one regional service read and one exact-target read,
with no retry. Access-detail calls, SSH, production-host commands, credential
reads, DB access, OpenAI calls and production mutation were all `0`.

This proves that the existing session, region, Lightsail service and target
lookup are healthy. The unresolved failure is narrowed to the access-detail
action or its action-specific execution path; it does not justify creating a
new IAM user, access key or root credential. The failed access-only controller
remains zero-retry.

The result and certified hashes are recorded in
`openai-summary-lightsail-read-boundary-diagnostic-result-2026-07-28.md`.
Gate 1 is still blocked until a safe production channel can complete the
read-only preflight. No synthetic OpenAI request, production staging or
production mutation is authorized by this diagnostic.

## Completed preflight correction and candidate staging

The subsequent bounded correction is recorded in
`openai-summary-production-preflight-and-stage-result-2026-07-28.md`.

Current production state:

- certificate-authenticated and host-key-pinned read-only channel: PASS;
- PostgreSQL client/connection diagnostic: PASS;
- canonical backup-role schema query: PASS, version `8`, query count `1`;
- explicit provider-zero bridge: installed, exact hash and metadata;
- daemon reload: `1`; service restart: `0`;
- bot identity and canonical health: unchanged/PASS;
- exact candidate `/opt/waw/releases/f42e2b0`: staged and immutable;
- current/previous symlinks: unchanged;
- activation, migration and OpenAI request count: `0`;
- CloudShell/local/controller transient remainder: `0`.

The OpenAI Platform API-key page redirected to login. Gate 1 now stops only at
the owner login boundary; no password, MFA challenge, key or API request was
attempted.
