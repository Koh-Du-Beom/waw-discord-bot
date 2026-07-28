# OpenAI summary production preflight and candidate stage result — 2026-07-28

- Status: PASS through candidate staging; stopped before OpenAI login
- Candidate:
  `f42e2b06b23695bee113091581aba635ec343494`
- Release ID: `f42e2b0`
- Candidate archive SHA-256:
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`
- Candidate archive bytes: `640107`
- Activation: `0`
- Service restart: `0`
- OpenAI requests: `0`

## Access and schema preflight

The Lightsail access controller correction replaced the invalid AWS CLI
`--protocol-name SSH` option with `--protocol ssh`, required the returned
private key and SSH certificate together, pinned every returned host key and
used one direct bounded SSH session without retry.

The output-silent production diagnostic passed:

- access acquisition and material validation;
- SSH, non-interactive sudo and Bash entry;
- PostgreSQL client major `17`;
- root-owned application credential metadata;
- URI parsing, including exact `uselibpqcompat=true`;
- connection-only `\quit`;
- static SQL-dispatch contract with query count `0`;
- cleanup with zero transient remainder.

The first read-only schema query through the application bot role failed
because the accepted least-privilege migrations intentionally do not grant
`waw_bot` access to `app_schema_version`. No permission was changed. The
corrected runner reused the existing backup role, whose approved daily backup
job already reads the same table. It sourced the root-owned backup environment
inside the remote process, immediately unset AWS and non-PostgreSQL values,
discarded database errors and executed the canonical aggregate once.

Fixed result:

```text
SCHEMA_PREFLIGHT client_major=17
SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE
SCHEMA_PREFLIGHT query=PASS version=8
SCHEMA_DIAGNOSTIC query_total=1
SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0
```

No DB URL, host, username, password, provider error or row content was emitted
or retained.

## Explicit provider-zero bridge

The exact previously reviewed default-off bridge was installed:

- target:
  `/etc/systemd/system/waw-bot.service.d/summary-provider-default-off.conf`;
- SHA-256:
  `b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a`;
- metadata: `root:root`, mode `0644`;
- declaration and resolved counts: `zero=1`, `one=0`, `other=0`;
- daemon reload: `1`;
- service restart: `0`;
- bot identity unchanged;
- canonical health: PASS;
- failed units: `0`.

The bridge remains installed. The candidate base unit contains its own exact
default-off declaration, so a later activation procedure must remove the
bridge in the same bounded change to avoid duplicate declarations.

## Candidate staging

Two local deterministic archive streams reproduced the approved archive tuple.
The controller independently verified the same tuple before production
transfer. `deploy/manage-production-release.sh stage` then created only:

`/opt/waw/releases/f42e2b0`

Postconditions:

- build and production dependency prune: PASS;
- immutable release marker: exact approved archive SHA-256;
- compiled bot, web and shared summary marker contract: present;
- source migrations: `8`;
- writable files: `0`;
- current and previous release links: unchanged;
- provider, summary quota, game observation and dashboard quota flags: all
  exact `0`;
- activation, migration and service restart: `0`;
- controller, CloudShell and local transfer artifacts: removed.

## External login stop

The OpenAI Platform API-key page redirected to the login page. No login field,
password, MFA challenge, key creation or API call was attempted.

The next gate requires the owner to complete the OpenAI Platform login. After
that, the approved synthetic gate may create one dedicated project key, make
one synthetic Responses request without retry, verify aggregate marker and
usage counts, revoke the key and remove all credential/transient state.
