# Windows/new-host encrypted PostgreSQL restore runbook

- Status: Linux new-host synthetic restore executed 2026-07-22; Windows and S3-download continuity not yet executed
- Scope: `ADR-0008`, `ADR-0009`, `PLAN-0002` Task 2 recovery verification
- Success criteria: archive download checksum, `age` decrypt, empty PostgreSQL restore, schema version/row count/foreign key/core invariant verification, cleanup, elapsed time below 8 hours

## Safety boundary

- Use only a disposable synthetic archive and an empty target database. Do not connect this procedure to the original Supabase project or any production database.
- Obtain the archive through an owner-operated authenticated S3 download. Do not put AWS access keys, database passwords, private `age` identity contents, or raw dump data in chat, command history, Git, or logs.
- Keep the owner identity in an ephemeral local file or secure prompt only. Delete it, decrypted dumps, archive copies, temporary database and any temporary AWS credential immediately after the verifier.
- The runtime backup writer never receives the private identity or S3 read/delete authority.

## Preflight

1. Prepare an isolated Windows machine or newly provisioned host with no production database data.
2. Install verified `age` and PostgreSQL client tools (`psql`, `pg_restore`); record tool versions, not paths containing personal data.
3. Start a disposable local PostgreSQL target and create an empty database. Supply target authentication only through the host's secure environment/credential mechanism, not command-line arguments.
4. Prepare a synthetic archive manifest containing only archive UUID, UTC timestamp, encrypted byte count, SHA-256, schema version, expected row count and expected invariant.
5. Capture a start timestamp in UTC.

## Recovery verification

1. Owner downloads the encrypted archive from S3 to a temporary local directory.
2. Compute SHA-256 and byte count; they must exactly match the manifest before decryption.
3. Decrypt with the offline identity into a temporary custom-format PostgreSQL dump. A wrong identity must fail without producing a verified dump.
4. Restore into the empty target with `pg_restore --exit-on-error`; do not use `--clean` against any non-disposable target.
5. Run non-sensitive verifier queries:
   - schema version equals manifest expectation;
   - row count equals manifest expectation;
   - foreign-key checks succeed;
   - one documented synthetic invariant succeeds.
6. Record only UTC timestamps, elapsed seconds, archive SHA-256, encrypted byte count, verifier outcome and non-secret reason code.
7. Mark the archive `verified` only if every prior step succeeds. Otherwise mark it `unverified`; never replace the previous verified archive.

## Cleanup and evidence

1. Drop the disposable target database and stop/remove its local PostgreSQL process or container.
2. Remove the downloaded archive, decrypted dump, temporary identity copy and any temporary credentials.
3. If a disposable S3 object/bucket or IAM principal was created for this run, delete it and confirm resource absence in the console.
4. Record final cleanup outcome and confirm the elapsed time is under 8 hours.

## Execution evidence and remaining gap

On 2026-07-22, the Linux new-host verifier passed on a disposable Seoul Lightsail Ubuntu 24.04 instance: wrong identity rejection, archive byte/hash equality, empty PostgreSQL 16 restore, schema version `1`, row count `2`, foreign-key orphan count `0`, and the synthetic invariant. Verifier containers and the temporary script were removed, then all tagged disposable instances were deleted and the final instance list was empty.

The Orca browser download hook still did not deliver the earlier S3 object or temporary access-key CSV to the expected local path. The run therefore establishes true new-host restore behavior from a transferred synthetic verifier, but not byte continuity from an actual S3 download. Least-privilege writer/reader deny and lifecycle prefix scope also remain unverified.
