# PLAN-0011: GitHub Actions Lightsail deployment

- Status: Approved
- Related ADR: ADR-0024
- Owner: Product owner

## Success criteria

- Pull requests and `develop` pushes run tests, typecheck, build, production
  asset checks and dependency audit without deployment authority.
- Only a `production` push can read the two repository SSH secrets.
- The workflow deploys the exact `GITHUB_SHA`, pins the SSH host key, runs one
  deployment at a time and restores the previous release on failed health.
- Normal deployment excludes migrations, application secret changes and
  feature activation.
- Secret registration and server key installation remain a separate,
  reversible activation step.

## Task 1: secret-backed workflow and controller

- Remove OIDC, AWS permissions/actions and access-detail parsing.
- Accept `LIGHTSAIL_HOST`/`LIGHTSAIL_USER` variables plus
  `LIGHTSAIL_DEPLOY_SSH_KEY`/`LIGHTSAIL_SSH_KNOWN_HOSTS` secrets.
- Write secret values only to runner-temporary mode-`0600` files.
- Validate the private key and exact known-host entry before SSH.
- Preserve exact archive hashing, bounded SSH, remote cleanup and rollback.

## Task 2: CI and disposable validation

- Keep static workflow contracts for triggers, permissions, concurrency,
  secret boundaries, host-key pinning and migration absence.
- Exercise missing, empty, symlink and malformed deployment SSH input through
  the controller without opening a network connection.
- Run the full repository suite, typecheck, build, browser check, audit and
  Linux release fixtures.
- Keep tool-dependent PostgreSQL integration out of the generic Ubuntu job via
  the repository's explicit skip flag; PostgreSQL integration remains a
  separate toolchain-required verification scope.

## Task 3: external activation gate

- Generate a dedicated deploy key; never reuse a human operator key.
- Independently read and pin the exact production SSH host keys.
- Install only the public key for the selected deployment account.
- Register the two secrets and two variables without printing their values.
- Use a manually dispatched production-environment workflow to validate the
  private key, pinned host entry and an SSH connection whose only remote
  command is `true`.
- Do not merge/push the candidate into `production` until the owner accepts the
  lack of branch protection or upgrades repository protection.

## Rollback

- Disable the workflow and remove the host public key before deleting secrets.
- Retain the existing named human operator path.
- On activation failure, restore the recorded previous immutable release and
  unit files. Never reverse compatible schema automatically.

## Documentation

- Record only secret names, key fingerprints, workflow run IDs, release/hash,
  health and rollback results. Never record private keys, host-key source
  response bodies, application credentials or provider payloads.
