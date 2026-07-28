# OpenAI summary marker contract Gate A handoff — 2026-07-28

- Status: CloudShell Linux exact archive Gate A PASS
- Candidate: `f42e2b06b23695bee113091581aba635ec343494`
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
  `git archive --format=tar f42e2b06b23695bee113091581aba635ec343494 | gzip -n`
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

## CloudShell Gate A result

AWS CloudShell in `ap-northeast-2` passed the read-only exact archive gate:

1. the uploaded archive matched SHA-256
   `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`
   and `640107` bytes;
2. the official Node `v24.18.0` Linux x64 archive matched its published
   `SHASUMS256.txt` entry;
3. the Linux suite completed with
   `247 tests / 240 pass / 7 explicit PostgreSQL-tool skips / 0 fail`;
4. typecheck, server/web build, production dependency prune and audit passed,
   with eight compiled migration assets and zero vulnerabilities;
5. release-manager and production application asset fixtures passed;
6. the exact archive staged under a disposable `/tmp` install root with its
   immutable marker, eight byte-identical source/compiled migrations and zero
   writable files;
7. compiled output contained the shared marker prompt/evaluator contract;
8. `WAW_SUMMARY_PROVIDER_ENABLED`, `WAW_SUMMARY_QUOTA_ENABLED`,
   `WAW_GAME_OBSERVATION_ENABLED` and `WAW_DASHBOARD_QUOTA_ENABLED` were all
   exactly `0`.

The final markers were:

```text
CLOUDSHELL_GATE_A_PASS candidate=f42e2b0 sha256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b bytes=640107 node=v24.18.0 writable=0 flags=0,0,0,0 migrations=8
CLOUDSHELL_CLEANUP_PASS home=0 tmp=0
```

No OpenAI endpoint or credential, production host, Lightsail instance,
Supabase state, Discord state, service, release symlink or feature flag was
contacted or mutated. The uploaded archive, extracted source, staged tree,
temporary Node runtime and runner were removed.

Gate A authorizes requesting a separate owner approval for another
synthetic-only OpenAI spike against this exact candidate tuple. It does not
authorize that call, credential creation, production staging or activation.
