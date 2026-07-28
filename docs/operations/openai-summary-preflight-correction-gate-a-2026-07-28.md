# OpenAI summary preflight correction Gate A — 2026-07-28

- Status: PASS
- Production mutation: none
- Production credential/DB/OpenAI access: none

## Exact tuple

- source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- release id: `78c8a1d`
- archive: `waw-78c8a1d-source.tar.gz`
- SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- size: `656396` bytes

The archive was produced with `git archive --format=tar 78c8a1d | gzip -n`.

## Review correction

The first frozen candidate,
`7fd13ed35ae7cff8c4ab9727ee0131a34b9373e3`, failed Linux Gate A after the
build. The provider rollback fixture truncated its fake systemctl log, caused
one `daemon-reload`, but incorrectly expected the earlier cumulative count of
three. macOS's default Bash did not terminate on that final false assertion
because a succeeding status echo followed it; Linux Bash did.

The reviewed correction changes only that expected count from three to one.
The failed tuple is not approved or reused.

## Local exact-archive result

The exact replacement archive passed:

- `npm ci --ignore-scripts`
- full regression: `260` tests, `253` pass, `7` explicit skips, `0` fail
- typecheck and production build
- provider install/conflict/rollback fixture
- fake release-independent schema preflight fixture
- disposable PostgreSQL `17.10` schema preflight fixture
- production application asset test
- production-only dependency prune and audit: `0` vulnerabilities
- exact provider drop-in SHA-256
- all `8` migration assets byte-identical after build
- bot and web entry points present
- immutable-tree writable file count: `0`

Result:

```text
LOCAL_GATE_A_PASS candidate=78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5 release=78c8a1d sha256=fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb bytes=656396 migrations=8 writable=0
LOCAL_GATE_A_CLEANUP rc=0
```

## CloudShell Linux result

The same archive passed on CloudShell Linux with the official Node
`v24.18.0` archive verified against the matching Node distribution checksum.
It repeated the regression, typecheck, build, fake fixtures, production asset
test, dependency audit, migration and immutable-tree checks.

CloudShell did not provide `initdb`, `pg_ctl` and `psql`, so the real
PostgreSQL fixture was explicitly recorded as `SKIP_TOOL_UNAVAILABLE`; the
same exact source passed that fixture locally against disposable PostgreSQL
17.10.

```text
CLOUDSHELL_GATE_A_PASS candidate=78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5 release=78c8a1d sha256=fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb bytes=656396 node=v24.18.0 migrations=8 writable=0 postgres_fixture=SKIP_TOOL_UNAVAILABLE
CLOUDSHELL_GATE_A_CLEANUP rc=0
CLOUDSHELL_GATE_A_TRANSIENT_REMAINDERS=0
```

## Boundaries retained

No production host was contacted. No production unit, release, credential or
database was read or changed. No daemon reload, staging, activation or OpenAI
request occurred. Local and CloudShell Gate A workspaces, uploaded archives
and runner scripts were removed after evidence capture.

The next production step remains separately gated: obtain owner approval for
the exact default-off bridge installation and labelled read-only schema
preflight. This Gate A result does not authorize either action.
