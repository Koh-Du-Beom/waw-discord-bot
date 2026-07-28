# PLAN-0011: GitHub Actions Lightsail deployment

- Status: Approved
- Related ADR: ADR-0023
- Owner: Product owner

## Success criteria

- Pull requests and `develop` pushes run repository tests, typecheck, build,
  production asset checks and dependency audit without AWS authority.
- Only a `production` push job may request `id-token: write`.
- AWS OIDC trust binds the exact repository and production authority.
- The deploy job obtains temporary Lightsail access, pins returned host keys,
  stages the exact `GITHUB_SHA` archive and never logs access material.
- One deployment runs at a time. Failed activation restores the recorded
  previous release and reports unhealthy rather than success.
- Migration, application secret changes and feature activation remain absent
  from the normal deployment path.
- `develop` and `production` are protected against direct/force pushes, with
  reviewed PR promotion to production.

## Task 1: workflow and controller contracts

- Add CI and production workflow YAML.
- Add an output-allowlisted local controller that consumes temporary access
  files and an exact archive/hash.
- Pin every third-party action to a full commit SHA.
- Add static tests for triggers, permissions, concurrency, branch authority,
  forbidden secrets/logging and migration absence.
- Do not create GitHub branches, rulesets, variables, AWS resources or
  production connections.

## Task 2: disposable Linux deployment fixture

- Reuse the production release manager against a temporary filesystem.
- Exercise stage, already-staged idempotency, activation, failed-health
  rollback, current/previous target integrity and cleanup.
- Use synthetic SSH/access files only; no AWS or production host.

## Task 3: GitHub control plane

- Create `develop` at the reviewed candidate and `production` at the recorded
  pre-candidate baseline.
- Set `develop` as default only after workflow paths and documentation are
  valid on both branches.
- Configure rulesets for PR-only changes, required CI, force-push/deletion
  denial and production authority.
- Configure non-secret repository/environment variables only after exact
  target metadata is read.

## Task 4: AWS OIDC control plane

- Observe the repository's actual OIDC subject format before creating trust.
- Create or reuse the GitHub OIDC provider.
- Create one CI deployment role with exact subject/audience trust and minimum
  Lightsail read/access-detail permissions for the tagged production instance.
- Simulate exact allow and cross-repository/ref/region/action denial.
- Do not create access keys or persistent SSH keys.

## Task 5: dry run and first promotion

- Run a no-production-mutation workflow that obtains and cleans temporary
  access material, verifies target/host keys and runs metadata-only preflight.
- Open the first `develop` to `production` PR for candidate
  `bc8067591204c4122b13f92fba4115757ec58c5d`.
- Record exact archive SHA, current/previous release and rollback criteria.
- Merge and activate only after the dry run and owner approval gates pass.

## Rollback

- Disable the deployment workflow and revoke the AWS role trust.
- Keep production branch protection and use the existing named human operator
  runbook.
- On host failure, reactivate only the recorded previous immutable release;
  never reverse compatible schema automatically.

## Documentation

- Update deployment/security policy and application deployment runbook.
- Record GitHub ruleset IDs, OIDC role kind, exact workflow run, release/hash,
  health and rollback results without account IDs, instance identifiers,
  credentials or provider response bodies.
