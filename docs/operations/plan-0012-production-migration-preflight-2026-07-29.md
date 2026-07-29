# PLAN-0012 production migration preflight

- Date: 2026-07-29
- Scope: Task 8 read-only preflight and migration preparation
- Status: BLOCKED before migration — fresh backup restore evidence required
- Production changes: none

## Immutable release

The reviewed candidate before this evidence-only documentation commit was
`7bfb686a076edf6024134bd660d14b0b57aff3bc`. Its reproducible source archive
was 804,367 bytes with SHA-256
`c1bc35f980a854702dffd2f8fee05c9a9ac485ee6d0eef67850645154b72367b`.
The final candidate must be regenerated from the documentation commit and pass
CI before migration approval.

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
uploaded byte/hash match and local cleanup contract. It does not prove that
this exact latest ciphertext has passed an empty-target restore rehearsal.
That separate evidence was not available during this read-only preflight, and
the offline `age` identity is deliberately absent from the production host.

Therefore migration `0009` and `0010` must not run yet. The owner must provide
or execute the approved exact-object restore-verification gate, record only its
non-secret result, and then issue a new exact migration approval.

## Verification

- Final local unit suite with short macOS socket path: `274` pass, `0` fail,
  `7` skip.
- Candidate `7bfb686a076edf6024134bd660d14b0b57aff3bc` develop CI:
  success.
- Production mutation, migration, deployment and real Riot link removal: `0`.

