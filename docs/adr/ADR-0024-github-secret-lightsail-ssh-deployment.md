# ADR-0024: GitHub Secret-based Lightsail SSH deployment

- Status: Accepted
- Date: 2026-07-28
- Owners: Product owner
- Related research:
  `docs/research/technology-options/github-actions-lightsail-deployment.md`
- Supersedes: ADR-0023

## Context

ADR-0023 selected GitHub OIDC, a narrowly scoped AWS role and temporary
Lightsail SSH access. The owner subsequently judged that control plane too
complex for this single-host deployment and explicitly approved direct
injection from GitHub Secrets.

The repository is private on GitHub Free. Branch protection/rulesets and
private-repository environment approval are not available in the current plan,
so a `production` push cannot yet be treated as technically protected approval.

## Decision

- Keep `develop` as the integration branch and `production` as the deployment
  trigger branch.
- Use one dedicated SSH private key in repository secret
  `LIGHTSAIL_DEPLOY_SSH_KEY`.
- Store the integrity-sensitive pinned host-key records in repository secret
  `LIGHTSAIL_SSH_KNOWN_HOSTS`.
- Store non-secret target metadata in repository variables `LIGHTSAIL_HOST`
  and `LIGHTSAIL_USER`.
- Remove AWS permissions, OIDC and Lightsail access-detail calls from the
  workflow.
- Materialize secrets only as mode-`0600` runner-temporary files, validate the
  private key, require strict host-key checking and clean local/remote staging.
- Preserve exact `GITHUB_SHA` archiving, SHA-256 verification, deployment
  serialization, preflight checks and failed-health rollback.
- Keep migrations, application credential changes and feature activation out
  of the normal deployment.
- Do not install the public key, register secrets, or enable the first
  production promotion until the owner separately accepts the unprotected
  production-branch risk or the repository gains technical protection.

## Consequences

The workflow is materially simpler and no AWS IAM/OIDC setup is needed.
However, repository-secret compromise grants SSH capability until the key is
removed from the host. The key therefore must be deployment-only, independently
rotatable, never reused as a human operator key, and revoked before deleting
its GitHub secret.

The pinned host-key secret is not confidential, but treating it as a secret
prevents unreviewed target substitution through an ordinary repository
variable. Rotation requires an independently verified host-key update.

## Validation

- Static contracts deny `id-token: write`, AWS actions/calls, unpinned host
  checking and secret logging patterns.
- Synthetic files verify missing, empty, symlink and malformed input rejection.
- Ubuntu CI validates Bash syntax and the existing release-manager fixture.
- A later no-mutation SSH preflight must verify the exact host and dedicated
  account before production activation.

## Rollback

Disable the workflow, remove the public key from the host, then delete the two
repository secrets. Continue with the named human operator runbook. A failed
application activation restores the recorded previous immutable release and
unit files; compatible database migrations are never automatically reversed.

## Approval

- Owner decision: Approved GitHub repository-secret SSH injection in place of
  OIDC because the OIDC/AWS control plane was unnecessarily complex here.
- Approved date: 2026-07-28
