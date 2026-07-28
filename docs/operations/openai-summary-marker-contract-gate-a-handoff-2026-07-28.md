# OpenAI summary marker contract Gate A handoff — 2026-07-28

- Status: local Gate A PASS; CloudShell Linux exact archive stage pending
- Candidate: `f42e2b0a1f6066e3ffbec610a5322433987521ad`
- Release ID: `f42e2b0`
- Archive SHA-256:
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`
- Archive bytes: `640107`
- Production mutation: none
- OpenAI request or credential use: none
- Provider, quota, dashboard quota and game-observation activation: none

## Candidate scope

The candidate fixes the synthetic spike's marker-oracle mismatch without
changing the default-off provider boundary:

1. the adapter prompt preserves every input synthetic marker verbatim exactly
   once;
2. `CORE`, `DECISION`, `ACTION` and `UNRESOLVED` markers belong only to
   `coreDiscussion`, `decisions`, `actionItems` and `unresolved`, respectively;
3. when marker input is present, every output item contains exactly one expected
   marker and no marker-free item is allowed;
4. the shared evaluator returns only omission, duplicate, wrong-section and
   unmarked-item counts, never response content;
5. fake regressions distinguish each count and prove the adapter receives the
   shared prompt contract.

No package manifest, lockfile, migration, systemd asset, provider model,
retention boundary or feature flag changed.

## Local evidence

- `TMPDIR=/tmp npm test`:
  `260 tests / 253 pass / 7 explicit external skips / 0 fail`.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- `git diff --check`: passed before the candidate commit.
- Two independent
  `git archive --format=tar f42e2b0a1f6066e3ffbec610a5322433987521ad | gzip -n`
  streams were byte-identical and matched the hash and byte count above.

The first macOS full-suite attempt used the repository's long temporary path
and failed one Unix-socket setup with `EINVAL`. The fresh short-`TMPDIR` run
above is the verdict; it exercised the disposable PostgreSQL integration and
had no failures.

## CloudShell Gate A boundary

The next task is read-only validation of this exact archive in AWS CloudShell
Linux. It may:

1. verify the uploaded archive SHA-256 and byte count;
2. extract into a disposable directory;
3. use the repository-pinned Node toolchain or a checksum-verified official
   Node archive;
4. run clean install, tests, typecheck, build and production dependency audit;
5. verify compiled marker contract, migration count, read-only staged files and
   all four default-off feature flags;
6. remove uploaded, extracted, build and temporary runtime artifacts.

Stop on any archive identity, install, test, build, migration, permission,
compiled-contract or feature-flag mismatch. Do not contact OpenAI, request or
create a credential, stage or activate a production release, mutate production,
or enable provider, quota, dashboard quota or game observation.

CloudShell Gate A may establish that this candidate is reproducible on Linux.
It does not authorize another credentialed synthetic spike. A later approval
must name the exact candidate tuple and accepted provider retention boundary
before any OpenAI request.
