# OpenAI summary production preflight correction approval request — 2026-07-28

- Status: Owner approval requested; not authorized or executed
- Scope: one explicit default-off bridge installation followed by one labelled
  read-only schema preflight
- Production staging/activation: prohibited
- OpenAI requests: prohibited

## Exact source and archive tuple

- source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- release id: `78c8a1d`
- archive: `waw-78c8a1d-source.tar.gz`
- archive SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- archive size: `656396` bytes

This tuple passed local and CloudShell Linux Gate A. The exact evidence is in
`openai-summary-preflight-correction-gate-a-2026-07-28.md`.

Only these candidate assets are in scope:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `deploy/manage-summary-provider-default-off.sh` | `3016` | `6e9783a73c9c48210ce42a164cc0f5d6748dc3a2c0e6c47a0bc320747af81ad7` |
| `deploy/systemd/waw-summary-provider-default-off.conf` | `53` | `b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a` |
| `scripts/check-production-schema-version.sh` | `4260` | `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067` |

The controller may copy these three verified assets only into a fresh
root-owned mode `0700` transient directory. It must not unpack, stage or
activate the candidate as a release.

## Requested authorization

Approval is requested for this single ordered execution:

1. perform the labelled metadata-only preconditions below;
2. install exactly one provider default-off bridge and invoke exactly one
   successful `systemctl daemon-reload`;
3. prove that the running bot identity and all default-off boundaries remain
   unchanged;
4. read the existing database credential only inside the reviewed schema
   runner and perform exactly one read-only schema query;
5. retain the bridge only if every required postcondition and schema result
   passes;
6. remove the transient controller directory and access material.

Approval does not carry forward to a retry. Any failed or unknown assertion
stops the run. A later attempt requires fresh owner approval and a new access
session.

## Phase A — labelled preconditions

Before mutation, output only non-sensitive labels and require:

- candidate commit, release ID, archive hash, byte size and all three asset
  hashes match this request;
- current production release and previous release are valid, distinct and
  unchanged from the last accepted diagnostic;
- no candidate release is staged under `/opt/waw/releases/78c8a1d`;
- no OpenAI summary credential exists;
- bot and web services are active, failed unit count is zero and canonical
  health is `healthy`;
- summary provider declaration count is zero in the current fragment,
  drop-ins and resolved environment;
- summary quota, game observation and dashboard quota flags resolve to exact
  zero;
- bot unit fragment is exactly `/etc/systemd/system/waw-bot.service`;
- the drop-in set is exactly the previously observed
  `/etc/systemd/system/waw-bot.service.d/admin-command-ipc.conf`;
- `/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf`
  is absent;
- `MainPID` and `ExecMainStartTimestampMonotonic` are valid and captured for
  byte-for-byte postcondition comparison.

Do not read the database credential during Phase A. Stop before mutation if
any value differs, is unavailable or is `UNKNOWN`.

## Phase B — exact bridge mutation

The only persistent production mutation authorized is creation of:

`/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf`

with exact bytes:

```ini
[Service]
Environment=WAW_SUMMARY_PROVIDER_ENABLED=0
```

Required metadata:

- owner/group: `root:root`
- mode: `0644`
- SHA-256:
  `b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a`

Execute the verified manager once with action `install`. It may create the
drop-in directory if absent, install the exact file and invoke only:

```text
/usr/bin/systemctl daemon-reload
```

It may not invoke start, stop, restart, reload, try-restart or enable on any
unit. It may not signal the bot process.

Immediately require:

- target bytes and metadata match exactly;
- unit source contains exactly one provider-zero declaration and no
  provider-one/other declaration;
- resolved environment contains exactly one provider-zero declaration and no
  provider-one/other declaration;
- bot remains active;
- `MainPID` and start timestamp equal their pre-mutation values;
- canonical health remains `healthy`;
- the other three production feature flags remain exact zero;
- failed unit count remains zero.

Stop and enter the rollback path on any mismatch.

## Phase C — exact labelled schema preflight

Only after Phase B passes, execute the verified
`scripts/check-production-schema-version.sh` once as root with:

```text
WAW_EXPECTED_SCHEMA_VERSION=8
```

The runner may:

- verify `/usr/bin/psql` is PostgreSQL client major `17`;
- verify `/usr/bin/python3` exists;
- inspect only type, owner, group, mode, readability and one-line/nonempty
  shape of `/etc/waw-credentials/bot-database-url`;
- read that credential inside the reviewed Python parser without printing,
  copying or hashing its value;
- create one mode `0700` `/tmp/waw-schema-preflight-run.*` directory;
- pass decoded libpq fields only in the short-lived child environment;
- issue exactly one `psql` command containing only:

```sql
select coalesce(max(version), 0)::int
from public.app_schema_version;
```

- use `PGCONNECT_TIMEOUT=10`, `PGAPPNAME=waw-schema-preflight`,
  `--no-password`, `ON_ERROR_STOP=1` and a 15-second process timeout;
- discard database/provider stderr;
- remove the run directory and child environment on exit.

The complete DB URL must not appear in argv, command history, a transient
file, stdout, stderr or the report. No table rows other than the single
aggregate version integer may be returned. The query is read-only and may be
attempted exactly once; timeout or failure must not be retried.

The only successful schema output is:

```text
SCHEMA_PREFLIGHT client_major=17
SCHEMA_PREFLIGHT credential_metadata=PASS
SCHEMA_PREFLIGHT query=PASS version=8
```

On failure, emit only the runner's fixed failed-stage label with
`version=UNKNOWN`, then enter rollback. Do not print `psql`, Python or provider
error text.

## Rollback and failure handling

If bridge installation begins but any Phase B or C requirement fails:

1. do not retry the schema query;
2. verify the bridge still has the exact approved SHA-256, owner, group and
   mode;
3. execute the verified manager once with action `rollback`;
4. permit exactly one additional `systemctl daemon-reload`;
5. require the bridge target to be absent;
6. require the original fragment and `admin-command-ipc.conf` to remain
   unchanged;
7. require bot `MainPID`, start timestamp, active state and canonical health
   to remain unchanged;
8. remove transient files and access material;
9. stop and report fixed labels only.

If the bridge bytes or metadata changed unexpectedly, do not delete it and do
not improvise repair. Stop with a changed-target conflict for owner review.

The maximum authorized daemon-reload count is one on success or two when a
post-install failure requires rollback. The authorized service restart count
is always zero.

## Output allowlist

The report may contain only:

- exact candidate/archive/asset hashes and byte sizes listed in this request;
- fixed PASS/FAIL/UNKNOWN stage labels;
- release IDs and sanitized systemd paths already listed here;
- counts for provider declarations, failed units and transient remainders;
- non-sensitive owner/group/mode metadata;
- bot active state and whether PID/start timestamp are unchanged, but not
  unrelated process data;
- `SCHEMA_PREFLIGHT query=PASS version=8` on success;
- daemon-reload, service-restart, DB-query and OpenAI-request counts.

It must not contain a credential value or derivative, DB URL, database host,
username, error body, unit body, environment dump, application rows, Discord
content or OpenAI content.

## Explicit exclusions

This approval does not authorize:

- creating, rotating, copying or changing any credential;
- more than one database query or any database mutation/migration;
- release staging, activation, symlink changes or application file changes;
- bot/web restart, stop, reload or signal;
- summary provider or quota activation;
- OpenAI credential creation or any OpenAI request;
- a synthetic summary spike;
- Riot/game-observation activation;
- backup, timer, monitor, firewall, DNS, certificate or journald changes;
- unrelated production diagnostics or repairs.

## Requested owner approval text

Approval should be explicit and equivalent to:

> I approve the exact candidate
> `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`, archive SHA-256
> `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`,
> `656396` bytes, and the three asset hashes in this request. Execute the
> ordered production preconditions, exact default-off bridge installation
> with at most one successful daemon-reload, and exactly one labelled
> read-only schema query. Keep every stop condition active. On any failure,
> do not retry the query; perform the checksum-guarded bridge rollback with at
> most one additional daemon-reload, clean transient/access material and
> stop. Do not stage or activate a release, create or change credentials,
> restart services, mutate the database or call OpenAI.

Until that approval is received, this document authorizes no production
access, mutation, credential read, DB query or OpenAI request.
