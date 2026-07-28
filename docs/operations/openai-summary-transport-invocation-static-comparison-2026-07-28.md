# OpenAI summary transport invocation static comparison — 2026-07-28

## Result

**INCONCLUSIVE for the historical byte-level difference; the documented
transport contracts are equivalent.**

This investigation used only repository documents and local files. It did not
access AWS, production, a credential, a database, or OpenAI.

## Compared evidence

| Evidence | Transport-only PASS | Schema diagnostic FAIL |
| --- | --- | --- |
| Controller SHA-256 | `91cad98dedc7271ef758091463c4077ad6ceed9a06250f56869cdb05ade4138e` | `e548414001172938607af4713beac337c05257c1c2b788ddcb60d73b6b6df61b` |
| Access acquisition | PASS, one call | PASS, one call |
| SSH result | PASS | FAIL |
| SSH retry | zero | zero |
| Remote entry | PASS | not reached |
| Cleanup remainder | zero | zero |

Both approval contracts require:

- returned private key, SSH certificate, and host keys only;
- strict returned-host-key verification;
- `ConnectTimeout=10`;
- `ConnectionAttempts=1`;
- one 15-second bounded master-connection attempt;
- a control-socket check before declaring SSH success;
- discarded raw SSH/provider output and no credential or endpoint disclosure.

The documented outer-controller differences are the label namespace, total
controller deadline (`45` versus `60` seconds), and the schema controller's
additional remote diagnostic payload. None is evidence of a different SSH
option, and the schema run failed before the payload reached production.

## Evidence limit

The two historical controller byte streams are not stored in the repository.
Only their different hashes and sanitized result labels remain. A SHA-256
digest cannot reconstruct either byte stream, so the following equality
questions cannot be answered from retained evidence:

- exact option order and presence;
- exact identity/certificate/known-hosts paths;
- destination construction;
- control-socket path and length;
- `BatchMode`, `IdentitiesOnly`, agent disabling, preferred authentication,
  and password-interactive disabling;
- the exact timeout wrapper and control-socket check command.

Fresh access acquisition also returns ephemeral material, so the successful
and failed attempts did not use byte-identical access values. Those values
were correctly deleted and must not be recovered or recorded merely to explain
this failure.

The historical failure therefore cannot be assigned to controller drift,
ephemeral access state, or the external SSH service. Treating any one of those
as the root cause would exceed the evidence.

## Drift prevention asset

`scripts/lib/bounded-lightsail-ssh.sh` now centralizes the non-sensitive SSH
establishment contract. It:

- validates regular non-symlink access-material paths;
- binds the separately parsed user and endpoint to one destination;
- fixes public-key-only, certificate, host-key, timeout, liveness, retry, and
  control-master options;
- suppresses command output;
- proves the master with `ssh -O check`;
- provides a bounded `ssh -O exit` cleanup operation.

`scripts/test-bounded-lightsail-ssh.sh` records only synthetic fixture
arguments and proves the exact ordered option list, check/exit operations,
destination binding, symlink refusal, and output silence.

Pinned local assets:

| Asset | SHA-256 |
| --- | --- |
| `scripts/lib/bounded-lightsail-ssh.sh` | `8e099f8210e9e0193ba2ae96e57fbbfad509c21385e7d85092d6e5cd8d8af23b` |
| `scripts/test-bounded-lightsail-ssh.sh` | `48f2f46f6a655695152bfa45e7c48a8cbf668654f14be241a87a96fb2b85b563` |
| `scripts/production-schema-failure-stage-remote.sh` | `e9b2a694b956af2f8a2812e1e5accf4367292823a7aedb2890de573bcedf54f3` |
| `scripts/test-production-schema-failure-stage-remote.sh` | `6d43fd3b1cae2e38841ce5a51506b11169953ccf31c1726bf9a8fafb34718e2b` |
| `scripts/run-production-schema-failure-stage-diagnostic.sh` | `b54243a4f1112af28cfce1698719e68ffa410d0b72392381f9588722034e7be8` |
| `scripts/test-production-schema-failure-stage-controller.sh` | `28d1f68fc4a5828b0bf7b4dc64a83042669fb02f1485500faefcb35b1e155bc8` |

Fresh local verification:

```text
bash syntax: PASS
bounded_lightsail_ssh_fixture_passed
production_schema_failure_stage_remote_fixture_passed
production_schema_failure_stage_controller_fixture_passed
git diff --check: PASS
```

Broader production-free regression:

- `TMPDIR=/tmp npm test`: `260` tests, `253` pass, `7` explicit skips,
  `0` fail;
- `npm run typecheck`: PASS;
- `npm run build`: PASS, eight migration assets copied;
- production application, provider default-off, and schema preflight asset
  fixtures: PASS;
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities;
- `shellcheck`: unavailable in the local toolchain, so Bash syntax and
  executable fixtures are the shell evidence.

Future transport and schema diagnostic controllers should embed or source the
same reviewed asset hash and record that hash in their approval/result
documents. They should not retain real endpoints, usernames, access material,
or raw provider errors.

## Next gate

The next no-query diagnostic controller now uses the shared asset, pins its
hash and the remote diagnostic/schema-runner hashes, and passes synthetic
success and SSH-failure fixtures with one access call and zero retry.

A new external run remains necessary because the historical invocations cannot
be compared byte-for-byte. That run requires separate approval because it
would read the existing root-only database credential once in memory and make
one connection-only handshake.
