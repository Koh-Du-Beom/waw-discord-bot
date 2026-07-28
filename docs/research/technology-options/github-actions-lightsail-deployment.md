# GitHub Actions to Lightsail deployment options

- Date: 2026-07-28
- Scope: application release delivery only; systemd, Caddy, Supabase, S3 backup
  and workload credential decisions remain unchanged
- Repository: private `Koh-Du-Beom/waw-discord-bot`

## Constraints

- Production remains one Ubuntu 24.04 Lightsail host running immutable
  `/opt/waw/releases/<release>` directories through systemd.
- A deployment must preserve exact archive hashing, pinned SSH host keys,
  preflight stop conditions, singleton health and previous-release rollback.
- GitHub, workflow logs and artifacts must never receive Discord, OAuth,
  database, provider, backup or application credential values.
- Long-lived AWS access keys and long-lived deployment private keys are not
  acceptable defaults.
- A mutable branch name is an authorization trigger, not release identity.
  Release identity remains the full commit SHA plus source archive SHA-256.

## Official capability findings

GitHub Actions supports `push`, `pull_request` and manual deployment triggers,
deployment environments, branch restrictions and deployment concurrency.
Environment required reviewers are plan/visibility dependent; for GitHub Free,
Pro and Team they are documented as public-repository-only. This private
repository therefore cannot rely on an environment reviewer unless the actual
account plan is separately verified.

GitHub OIDC can exchange a workflow JWT for a short-lived AWS role session
without storing a long-lived AWS credential. AWS recommends restricting the
role trust to a specific organization/repository/branch or environment subject.
The trust must validate the GitHub `sub` claim rather than accepting a wildcard.

Lightsail `GetInstanceAccessDetails` returns temporary SSH access material,
expiry, instance address and recorded SSH host keys. It supports tag-based
access control. The existing operator design has already used the same bounded
access-detail capability and host-key pinning.

Primary sources:

- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws>
- <https://docs.github.com/en/actions/reference/security/oidc>
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create-for-idp_oidc.html>
- <https://docs.aws.amazon.com/cli/latest/reference/lightsail/get-instance-access-details.html>

## Options

### A. GitHub-hosted runner, static AWS key and static SSH deploy key

The workflow stores an AWS access key and private SSH key as GitHub secrets.
This is familiar but creates two long-lived credentials, a rotation burden and
a direct conflict with the current temporary-access policy.

Verdict: reject.

### B. Self-hosted GitHub runner on the production Lightsail host

The host polls GitHub and can deploy locally without inbound SSH. It also places
a workflow-controlled execution agent inside the production trust boundary.
Any workflow allowed onto that runner can reach host-local resources; GitHub
warns that self-hosted runners are not isolated by environments. It adds runner
patching, lifecycle and persistence to the 1 GB host.

Verdict: retain only as a reconsideration option.

### C. GitHub-hosted runner with OIDC and temporary Lightsail SSH access

A job tied to the protected `production` branch obtains a short-lived,
repository/branch-bound AWS role through OIDC. The role may read only the exact
Lightsail target and request temporary access details. The job writes the
returned private key, certificate and known-host entries to runner-temporary
mode-`0600` files, opens one bounded SSH channel, then deletes all material.

The remote command reuses the repository release manager: verify preflight,
stage the exact archive, install only reviewed changed assets, switch the
current symlink, restart in bounded order, verify health, and roll back to the
recorded previous symlink on failure.

Verdict: recommended.

## Branch model

- `develop`: default integration branch. Feature branches merge here after CI.
- `production`: deployment branch. It accepts PRs from `develop`; direct pushes
  and force pushes are prohibited.
- A merge/push to `production` starts the deployment workflow.
- `main`: transition-only compatibility branch. After branch protections and
  documentation links move, it is archived rather than used as a third moving
  development line.

The initial bootstrap should create:

- `develop` at the current reviewed candidate
  `bc8067591204c4122b13f92fba4115757ec58c5d`;
- `production` at the pre-candidate remote baseline
  `30d6f1763195950a9f45710c8825a3a4f9aaa156`, which contains the recorded
  production rollout evidence;
- the first `develop` to `production` PR as the auditable authorization for the
  dashboard alignment deployment.

The branch position documents desired source state but does not claim the host
is healthy. Workflow deployment records and immutable release metadata remain
the runtime evidence.

## Required controls

- CI workflow on pull requests and pushes to `develop`; no AWS permission.
- Deployment workflow only on `push` to `production`, plus a separately
  protected manual rollback path.
- Workflow `permissions` default to read-only; deploy job grants only
  `contents: read` and `id-token: write`.
- AWS trust binds the exact repository and `production` ref/immutable subject
  format actually emitted by this repository.
- IAM role policy permits only the minimum Lightsail reads and
  `GetInstanceAccessDetails` for the exact tagged instance; no IAM, S3, DNS,
  firewall, instance lifecycle or snapshot changes.
- Third-party actions are pinned to full commit SHAs.
- `concurrency` allows one production deployment and does not cancel an active
  deployment midway.
- Archive is generated from `GITHUB_SHA`; release ID is that full SHA or a
  collision-safe prefix, never the mutable branch name.
- SSH uses `IdentitiesOnly`, the returned certificate and generated
  `known_hosts`; `StrictHostKeyChecking=no` is prohibited.
- No `set -x`, environment dump, access-detail JSON, credential output, remote
  journal body or application secret is logged.
- A trap removes key/certificate/archive/controller files from the runner and
  remote staging path.
- Migration execution remains a separate explicit input/gate. A normal
  application deploy does not infer permission to migrate.
- Success requires canonical root and `/health`, web/bot unit health, singleton
  and expected feature flags. Failure reactivates the recorded previous release.

## Unresolved external setup

- actual GitHub plan and available private-repository environment protections;
- repository ruleset/branch-protection creation permissions;
- AWS account OIDC provider and role creation authority;
- exact immutable GitHub OIDC subject observed for this repository;
- whether the existing named human operator policy should remain completely
  separate or share only the same target constants with the CI role.

These require metadata-only inspection and explicit external change approval.
No workflow should contain guessed account IDs, instance identifiers or role
ARNs.

## Owner-directed simplification (2026-07-28)

After ADR-0023 implementation, the owner preferred direct GitHub Secret
injection because OIDC, IAM trust and temporary Lightsail access added
unnecessary control-plane complexity for one host.

GitHub documents that repository secrets are encrypted before reaching GitHub,
are available to a workflow only when explicitly referenced, and should be
passed as inputs or environment variables rather than exposed on command
lines. GitHub also documents that private-repository environment secrets and
required reviewers are plan-dependent and unavailable in the current GitHub
Free/private combination.

Revised option:

- dedicated, independently rotatable SSH private key in
  `LIGHTSAIL_DEPLOY_SSH_KEY`;
- pinned known-host records in `LIGHTSAIL_SSH_KNOWN_HOSTS`;
- non-secret host/user repository variables;
- no AWS credential, role, OIDC token or Lightsail access-detail call;
- unchanged immutable archive, health and rollback contract.

This accepts a larger credential lifetime/blast radius in exchange for a much
smaller deployment control plane. It is acceptable only with a dedicated key,
strict host-key checking, runner-temporary files, no secret output, explicit
rotation/revocation, and a separate activation gate.

Additional primary sources:

- <https://docs.github.com/en/actions/concepts/security/secrets>
- <https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets>
- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
