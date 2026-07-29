# PLAN-0012 production migration preflight

- Date: 2026-07-29
- Scope: Task 8 read-only preflight, restore gate and owner-approved migration
- Status: MIGRATED — versions `9` and `10` applied; activation not performed
- Production changes: additive migrations `0009` and `0010` only

## Immutable release

The reviewed and executed candidate was
`c7c5ad6a80788e9c756f9bdcc96998551a6622c2`. Its reproducible source archive
was 806,944 bytes with SHA-256
`717d0bd3f1cbca0861f0406098bff102e8db1db49496b8651e9eccec2025eaf6`.
Develop CI run `30434745419` passed before migration approval.

The release preparation review found and corrected two `000*.sql` globs that
excluded migration `0010` from the production release-manager asset check and
the administrator IPC integration fixture. The corrected paths use `00*.sql`.

## Read-only production evidence

An authenticated AWS CloudShell session in `ap-northeast-2` used one bounded,
certificate-authenticated and returned-host-key-pinned SSH channel. The remote
program performed reads only. No release, service, database, backup, firewall,
DNS, credential or application state was changed.

- Current release: `a2271329230b`
- Current archive SHA-256:
  `e4ffc422632307b846a3050978e5f29668461ab9aafef3a99ab72f21fd05ba2c`
- Rollback release: `930c22cb669d`
- Rollback archive SHA-256:
  `64ea981beb33c85ff4f28899b8254441a3155823f82f10efba936831c2949412`
- Current and rollback directories are distinct and valid: PASS
- Web, bot, Caddy, backup timer, monitor timer and journald active: PASS
- Web, bot, Caddy, backup timer and monitor timer enabled: PASS
- Failed systemd units: `0`
- Latest backup and monitoring service results: `success`, exit status `0`
- Loopback and canonical health: `{"status":"healthy"}`
- Production schema version through the backup role: `8`
- Remaining one-shot migration credential files: `0`
- Available `/opt/waw` and `/tmp` bytes: `33,971,777,536`
- Available memory: `397,652` KiB
- CloudShell Task 8 transient remainder after explicit cleanup: `0`

The production ledger contains versions `1` through `8`. Every recorded
checksum belongs to the reviewed runner's accepted checksum set. Versions `3`
and `4` use their accepted CRLF rendering hashes:

| Version | Recorded SHA-256 |
| --- | --- |
| 1 | `337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10` |
| 2 | `fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d` |
| 3 | `f7f94d1f2c5b4d5f39fd763f36f7b7d8819462f818d37052bf51507058edc184` |
| 4 | `a48187b28dc3726726e5bef174a6e9b01a33ba7779c75ad93c68b0e3485e6419` |
| 5 | `d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66d71f97972b71d32a` |
| 6 | `cbb29bf17b60aba6d0106a97085a559ab7dad4ecaffdd5fb2e2d338262a3eb78` |
| 7 | `32588ca4d830b7c2cd9f4c6d16c1046c16ac574375fd483dc899a6ae91eba4db` |
| 8 | `57f962cff07565e7cf99ab758293ee3cc985eb941171ba3f0e851184941cbef4` |

The only pending reviewed migrations and canonical checksums are:

| Version | Migration | Canonical SHA-256 |
| --- | --- | --- |
| 9 | `0009_riot_link_version.sql` | `b950f6c642929b9055b15d782a8763edc90f0d9dd578cd6d69339b0b07268146` |
| 10 | `0010_riot_link_removal_result.sql` | `db5898923ff6fd03f4d54c63d22ad68101834463ece0485fd1e95c7902e402f0` |

## Backup gate

The latest publication marker is healthy and less than 24 hours old:

- completed at `2026-07-29T06:07:10Z`;
- observed age `6,419` seconds;
- status `published`;
- schema version `8`;
- expected row count `0`;
- expected invariant `constraints_valid`.

`published` proves the publication pipeline's dump, encryption, upload,
uploaded byte/hash match and local cleanup contract. The separately approved
restore gate then verified this exact latest ciphertext:

- a temporary reader allowed Get only for the exact archive and manifest;
- another-object Get, Put, Delete and IAM access were denied;
- downloaded ciphertext byte count and SHA-256 matched the manifest;
- a generated wrong identity was rejected;
- the passphrase-encrypted offline owner identity was used only on the owner
  Mac and was neither copied nor exposed;
- `pg_restore --exit-on-error` completed against an empty disposable
  PostgreSQL 17 target;
- restored schema version was `8`, expected row count was `0`, invalid
  constraints were `0`, and invalid foreign keys were `0`;
- restore verification completed in `25` seconds;
- temporary reader user/key/policy, CloudShell inputs/scripts, local encrypted
  input, disposable container and temporary restore directory were removed;
- final temporary reader, CloudShell Task 8 and local restore remainders were
  all `0`.

The backup gate is PASS.

## Owner-approved migration execution

The owner approved exact candidate
`c7c5ad6a80788e9c756f9bdcc96998551a6622c2`, archive SHA-256
`717d0bd3f1cbca0861f0406098bff102e8db1db49496b8651e9eccec2025eaf6`,
and the fixed `0009`/`0010` checksums above. The archive was verified again in
CloudShell at 806,944 bytes and staged as `/opt/waw/releases/c7c5ad6` without
activation.

The exact staged runner applied pending migrations in order:

- `migration_applied version=9`
- `migration_applied version=10`

Post-migration read-back verified:

- ledger versions `9` and `10`, names and both approved checksums: PASS;
- `app_schema_version` maximum: `10`;
- `riot_account_link.version`: `bigint`, not null, default `0`;
- invalid constraints in the application `public` schema: `0`;
- current release remained `a2271329230b`;
- previous release remained `930c22cb669d`;
- web/bot services and loopback health remained active/healthy;
- service activation and restart count: `0`;
- one-shot migration credential remainder: `0`;
- CloudShell and local candidate/controller temporary remainder: `0`.

The first post-migration assertion counted `NOT VALID` constraints across every
database schema and therefore stopped after the successful migrations. Its
trap removed the credential. A fresh one-shot credential then performed a
read-only application-schema check, which passed. No down SQL, ledger rewrite,
manual schema correction, deployment, service activation or Riot link mutation
occurred.

## Verification

- Final local unit suite with short macOS socket path: `274` pass, `0` fail,
  `7` skip.
- Exact candidate `c7c5ad6a80788e9c756f9bdcc96998551a6622c2`
  develop CI run `30434745419`: success.
- Production migration: versions `9` and `10` applied and read back.
- Production deployment, activation, restart and real Riot link removal: `0`.
