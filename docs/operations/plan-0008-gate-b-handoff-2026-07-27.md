# PLAN-0008 Gate B recovery handoff — 2026-07-27

- Status: Gate B restore verification complete; migration `0007` and
  default-off deployment remain separately owner-gated
- Reviewed candidate:
  `d2d3ed442e7cd80a00d1646fd866139174bf4043`
- Reviewed source ZIP SHA-256:
  `3fcab2794d11a7de6c061be3e61d8f43d699a33a9c8783f1e499784ee541d987`
- Migration `0007` SHA-256:
  `32588ca4d830b7c2cd9f4c6d16c1046c16ac574375fd483dc899a6ae91eba4db`

## Gate A result

The exact candidate and archive matched the owner approval. The worktree was
clean. Local typecheck, build, production asset checks, isolated archive
typecheck/build, and the complete test suite passed. The suite reported 231
tests, 223 passes, eight explicit PostgreSQL-tooling skips, and zero failures.

Production metadata remained compatible with the reviewed rollout:

- the migration ledger contained versions `0001` through `0006`;
- migration `0007` objects were absent;
- no invalid constraint was reported;
- the canonical dashboard and health endpoint were healthy;
- the application, proxy, backup timer, and monitor timer were active;
- no failed systemd unit was listed.

Gate A passed. No migration, application release, feature gate, DNS, firewall,
or certificate change was made.

## Fresh encrypted backup

The owner-approved one-shot `waw-backup.service` completed successfully.

- Created: `2026-07-26T23:30:53Z`
- Completed: `2026-07-26T23:31:05Z`
- Status: `published`
- Schema version: `6`
- Expected row count: `97`
- Expected invariant: `constraints_valid`
- Encrypted bytes: `48466`
- Archive SHA-256:
  `06a0f7be6f56a3994d27e82c866fd9afd985de737f2137c5300486a16a865688`
- Archive ID: `d3ad78540e16e208d888e9edbdcc254b`
- Exact object:
  `backups/2026-07-26T23-30-53Z-d3ad78540e16e208d888e9edbdcc254b.dump.age`
- Service result: `success`, exit status `0`

Publication is not restore verification. The archive must remain `unverified`
until the procedure below passes.

## Next-session restore boundary

Run the restore only on the separate computer that holds the offline encrypted
`age` identity. Do not place the identity, its passphrase, AWS credentials,
database URLs, raw dump data, or provider payloads in chat, Git, shell history,
screenshots, or logs.

The next session must:

1. Revalidate the exact candidate, source archive SHA-256, backup marker, and
   exact S3 object metadata.
2. Create a temporary reader restricted to `GetObject` for the exact object
   above. It must not receive Put, Delete, other-object Get, IAM mutation, or
   bucket-policy authority.
3. Download only the encrypted archive and manifest into a fresh temporary
   directory.
4. Verify byte count `48466` and the exact archive SHA-256 before decryption.
5. Prove a wrong identity is rejected.
6. Decrypt with the offline identity without exposing it or its passphrase.
7. Restore with `pg_restore --exit-on-error` into a disposable, empty
   PostgreSQL 17 target. Never restore into the production Supabase project.
8. Verify schema version `6`, total expected row count `97`, zero invalid
   constraints, foreign-key validity, and `constraints_valid`.
9. Record only non-sensitive timestamps, elapsed seconds, hashes, counts, and
   fixed outcomes.
10. Remove the temporary reader access key, policy, and user; encrypted local
    copy, manifest, decrypted dump, identity copy, target database/container,
    and any ephemeral SSH material. Confirm all temporary resources are absent.

Migration `0007`, candidate deployment, and quota feature activation remain
outside this handoff. After restore verification, report the Gate B exact
change set and request a separate owner approval for additive migration `0007`
and default-off deployment.

## Restore verification result

The separate Mac holding the passphrase-encrypted offline identity completed
the recovery procedure on 2026-07-27.

- Exact S3 object metadata and manifest matched this handoff.
- The temporary reader could get only the exact archive and manifest. Another
  object and IAM access were denied; policy evaluation denied Put and Delete.
- The encrypted archive was `48466` bytes and its SHA-256 matched
  `06a0f7be6f56a3994d27e82c866fd9afd985de737f2137c5300486a16a865688`.
- A generated wrong identity was rejected.
- `pg_restore --exit-on-error` completed against an empty disposable
  PostgreSQL 17 target.
- Schema version was `6`, expected row count was `97`, invalid constraints
  were `0`, and invalid foreign keys were `0`.
- The final measured restore verifier elapsed time was `21` seconds.
- The temporary IAM access key, policy, and user were deleted. CloudShell and
  local encrypted copies, manifest, decrypted stream, temporary directory, and
  PostgreSQL container were removed.

The verifier initially exposed two local-tooling defects: schema-only dumps do
not recreate the `waw_web` and `waw_bot` cluster roles required by policies,
and the schema check selected every ledger row instead of `max(version)`.
`scripts/verify-production-restore-local.sh` now creates the two disposable
roles, checks the maximum schema version, and reports invalid foreign keys.
No production database, migration, release, feature gate, DNS, firewall, or
certificate change occurred.

Gate B passed. The next action is to present the exact migration `0007` and
default-off deployment change set and obtain a separate owner approval.
