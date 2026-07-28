# OpenAI summary preflight correction proposal — 2026-07-28

- Status: Local/disposable validated; production mutation not authorized
- Scope: correct only the two failed read-only preflight assumptions
- Candidate tuple: unchanged
  `f42e2b06b23695bee113091581aba635ec343494`,
  archive SHA-256
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`,
  `640107` bytes

## Evidence being corrected

The labelled production diagnostic established:

1. the current bot unit and its only drop-in have no
   `WAW_SUMMARY_PROVIDER_ENABLED` declaration, although the repository's
   candidate unit contains an explicit zero;
2. the schema check failed before connecting because current release
   `2ac0996` cannot dynamically import the `postgres` package;
3. the attempted query also named `schema_migrations`, while this repository's
   canonical version table is `public.app_schema_version`.

Absence is runtime-safe because provider assembly enables only on exact `1`,
but it does not satisfy the approved preflight requirement for an explicit
default-off declaration.

## Correction A — explicit provider default-off bridge

### Exact change set

Add one root-owned drop-in:

`/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf`

Exact bytes:

```ini
[Service]
Environment=WAW_SUMMARY_PROVIDER_ENABLED=0
```

- terminating LF: required
- owner/group: `root:root`
- mode: `0644`
- SHA-256:
  `b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a`

Then run only `systemctl daemon-reload`. Do not restart, stop or reload
`waw-bot.service`. The application currently treats absence as disabled and
the drop-in preserves that state explicitly; the running process and Gateway
singleton must remain unchanged.

### Preconditions and stop conditions

Before installation, require:

- fragment exactly `/etc/systemd/system/waw-bot.service`;
- existing drop-in set exactly
  `/etc/systemd/system/waw-bot.service.d/admin-command-ipc.conf`;
- proposed target absent;
- current fragment/drop-ins and resolved environment contain zero provider
  flag declarations;
- bot active, canonical health healthy and failed units zero;
- current and previous releases remain distinct;
- all four production feature boundaries are disabled, treating the provider
  flag's current absence as disabled only for this pre-change check.

Stop on any different path, existing target, provider value, service state,
health state or release identity. Do not overwrite or merge an existing file.

### Post-install readback

Require all of the following without restarting the bot:

- target SHA-256, owner, group and mode match exactly;
- `systemctl cat waw-bot.service` contains exactly one provider-zero
  declaration and no provider-one/other declaration;
- `systemctl show -p Environment` resolves exactly one provider-zero
  declaration and no provider-one/other declaration;
- `systemctl is-active waw-bot.service` remains `active`;
- `MainPID` and `ExecMainStartTimestampMonotonic` are byte-for-byte unchanged
  from the pre-change readback;
- canonical health remains healthy;
- summary quota, game observation and dashboard quota remain explicit zero;
- no credential is created and no OpenAI request occurs.

### Exact rollback

Rollback is allowed only when the target still has the proposed SHA-256,
`root:root` ownership and mode `0644`:

1. unlink only
   `/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf`;
2. run `systemctl daemon-reload`;
3. verify the target is absent;
4. verify the original fragment and `admin-command-ipc.conf` remain unchanged;
5. verify bot `MainPID`, start timestamp, singleton and health remain
   unchanged.

Do not restart the bot during rollback. Stop and report a changed-target
conflict instead of deleting a file whose bytes or metadata differ.

### Lifecycle

This is a bridge for the current older production unit. The reviewed candidate
base unit already contains the same explicit zero. A later separately approved
base-unit replacement must remove this bridge in the same bounded change, or
the exact-declaration count would become two. The replacement must prove that
the base unit supplies exactly one zero before removing the bridge.

## Correction B — release-independent schema readback

### Selected method

Use the host-installed PostgreSQL 17 `psql` client already required by the
production backup path. Do not import Node packages and do not execute anything
under `/opt/waw/current`.

Canonical read-only SQL:

```sql
select coalesce(max(version), 0)::int
from public.app_schema_version;
```

SQL SHA-256 including its terminating LF:

`e7a8ccbf643fd543fba31c07647fe526a058d996f050df6bba17ea0058314a0b`

The expected single-line result is exactly `8`.

### Credential handling

The future approved runner must:

- run as root because the source credential is intentionally `root:root`
  mode `0600`;
- require exactly one nonempty credential line;
- disable shell tracing and never print the line, its length, hash or prefix;
- parse the connection URI in the OS Python standard library, independent of
  the current release and its npm dependencies;
- pass only decoded libpq parameters to the child `psql` environment, never
  the URI in argv, command history, a copied file or output;
- set `PGCONNECT_TIMEOUT=10`, `PGAPPNAME=waw-schema-preflight`, disable
  password prompting and discard child stderr;
- let the parser/child environment terminate immediately after `psql` exits;
- discard provider stderr and emit only fixed stage/result codes.

Decoded password and connection fields are briefly visible only in the
root-owned `psql` child environment. This is no broader than root's existing
ability to read the credential source. The complete URI is never placed in the
environment. If this boundary is not acceptable, stop and propose a dedicated
read-only libpq service credential instead of improvising another transport.

### Exact execution shape

The approved future implementation should be equivalent to:

```bash
set +x
credential=/etc/waw-credentials/bot-database-url
awk 'NR != 1 || length($0) == 0 { exit 1 } END { if (NR != 1) exit 1 }' \
  "$credential"
/usr/bin/python3 - "$credential" /usr/bin/psql <<'PY'
# Read and validate one PostgreSQL URI with urllib.parse, then invoke psql
# with decoded PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD plus the fixed
# timeout, application name and canonical read-only SQL. Emit only psql's
# numeric stdout and discard stderr.
PY
```

The literal above is review material, not authorization to run it.

### Preconditions and fixed output

Require:

- `/usr/bin/psql` exists and reports major version `17`;
- `/usr/bin/python3` exists and the URI parser accepts only
  `postgres`/`postgresql`, a hostname, username and database, plus at most
  single `sslmode` and `target_session_attrs` query values;
- credential source is a regular file, `root:root`, mode `0600`, one nonempty
  line and root-readable;
- `waw-bot` cannot directly read the source credential;
- current and previous releases are valid and distinct;
- no summary API credential or staged `f42e2b0` exists.

Allowed output:

```text
SCHEMA_PREFLIGHT client_major=17
SCHEMA_PREFLIGHT credential_metadata=PASS
SCHEMA_PREFLIGHT query=PASS version=8
```

On any failure, output only the failed stage with `version=UNKNOWN`, unset the
environment and stop. Never print libpq/provider errors or retry.

### Rollback

The schema method creates no persistent asset and has no production rollback.
Its cleanup is unsetting the environment and proving no process or temporary
file remains. A failed query does not authorize migration or database repair.

## Validation before requesting production approval

Production-free validation must cover:

1. disposable-root install, idempotent exact readback, conflict refusal and
   checksum-guarded rollback of the systemd bridge;
2. a fake `systemctl` fixture proving no restart command is issued and
   `MainPID`/start-time checks are mandatory;
3. a fake `psql` proving argv and output contain no connection string;
4. credential missing, wrong mode, multiline, empty, `psql` missing/wrong
   major, query failure, multiline result and version-not-8 failures;
5. a disposable PostgreSQL 17 database with
   `public.app_schema_version` rows `1..8`, returning exactly `8`;
6. redaction scans covering stdout, stderr, process argv and generated files;
7. `git diff --check` and the relevant production-asset tests.

## Approval boundary

This proposal performs and authorizes no production mutation. A later request
must name:

- the exact drop-in bytes and SHA-256 above;
- exact pre/post/rollback commands;
- the release-independent schema runner bytes and tests;
- one daemon reload, zero service restarts and zero OpenAI calls;
- stop conditions and cleanup evidence.

Only after that correction gate passes may the previously approved synthetic
spike begin again from its full read-only preflight.

## Local/disposable implementation result

The owner approved production-free implementation. The repository now
contains:

- `deploy/systemd/waw-summary-provider-default-off.conf`;
- `deploy/manage-summary-provider-default-off.sh`;
- `deploy/test-summary-provider-default-off.sh`;
- `scripts/check-production-schema-version.sh`;
- `scripts/test-check-production-schema-version.sh`;
- `scripts/test-check-production-schema-version-postgres.sh`.

The bridge manager:

- verifies the exact source SHA-256;
- refuses changed content or metadata;
- installs with production `root:root 0644`;
- permits fixture ownership only under a non-root `WAW_INSTALL_ROOT`;
- invokes only `systemctl daemon-reload`;
- requires active bot identity and proves `MainPID` plus monotonic start time
  remain unchanged;
- removes only an exact rollback target.

The fake-systemd fixture passed install, idempotent install, wrong-mode
conflict, changed-content install conflict, changed-content rollback refusal,
exact rollback, already-absent rollback and simulated PID-change rejection. Its
command log contained no start, stop, restart or service reload.

The schema runner:

- refuses symlink, missing, empty, multiline, wrong-owner/group/mode
  credentials;
- requires PostgreSQL client major `17`;
- uses only canonical `public.app_schema_version` SQL;
- parses the URI with OS Python and places only decoded libpq fields in the
  short-lived child environment;
- rejects provider failure, multiline result and version other than `8`;
- emits only fixed metadata and never the connection value.

Fresh verification:

- `summary_provider_default_off_fixture_passed`;
- `production_schema_preflight_fixture_passed`;
- `production_schema_preflight_postgres_17_passed` against a disposable local
  PostgreSQL 17.10 cluster containing version rows `1..8`;
- `production_application_assets_test_passed`;
- full regression with `TMPDIR=/tmp`: `260 tests`, `253 pass`,
  `7 explicit skips`, `0 fail`;
- typecheck passed;
- build passed with eight copied migration assets;
- `git diff --check` passed.

No production host, real credential, database, daemon reload, service restart
or OpenAI call was used.
