# Production data-only reset checklist

- Status: prepared, production execution not approved
- Canonical service: `https://waw.dubeom.com`
- Reset SQL: `scripts/production-data-reset.sql`
- Disposable fixture:
  `deploy/integration/postgres/test-data-reset.sh`

This procedure deletes production application data. It does not drop schemas,
tables, indexes, constraints, RLS policies, workload roles, grants, migration
history, credentials, backups, or host assets. Application deployment and this
maintenance operation are separate gates.

## Success criteria

- A fresh encrypted production backup is published and restored successfully
  into a disposable empty PostgreSQL 17 target before deletion.
- The exact reset SQL passes its approval and schema-version guards.
- All 14 explicitly listed data tables are empty after one transaction.
- `dashboard_setting` contains exactly the default singleton row:
  `summary_enabled=false`, `version=0`.
- `app_schema_version` remains exactly versions 1 through 8.
- Table, constraint, index, RLS policy, workload-role grant, migration-ledger,
  backup, monitoring, credential, DNS, firewall and release state are unchanged.
- Web and bot restart healthy, the Discord Gateway reconnects once, login works,
  and the first Discord command stores its current server display name.

## Deleted data

- Browser sessions, OAuth state and role cache.
- Operation ledger, command/administrator result and audit events.
- Riot links and link requests.
- Games, observations, incidents and incident revisions.
- Registered Discord display labels and summary cooldown reservations.
- The current dashboard setting value, replaced with its migration default.

The encrypted pre-reset archive becomes the final retained copy of the deleted
audit history. Record that retention decision without copying user identifiers
or event content into the execution log.

## Preserved state

- `app_schema_version` and `waw_schema_migration`.
- `dashboard_setting` table and its one default row.
- Every schema object, RLS policy, role and grant.
- Database project, application credentials and backup credentials.
- Release directories, systemd units, timers, Caddy, DNS and firewall.

## Gate 0 — exact approval

- [ ] Record the exact deployed commit and SHA-256 of the reset SQL.
- [ ] Owner approves deletion of the data categories above and the loss of live
      audit-query access after confirming the verified archive is the retained
      record.
- [ ] Record a maintenance window and separate execution, verification and
      recovery owners.
- [ ] Confirm no migration, credential rotation, provider activation, DNS,
      firewall, journal vacuum or application release is included.
- [ ] Confirm the application CD completed before this gate; do not make the
      production workflow execute this SQL.

Stop if the scope, hash, archive retention decision or owners are absent.

## Gate 1 — disposable proof

Run:

```sh
bash deploy/integration/postgres/test-data-reset.sh
```

The fixture must:

- apply migrations 1 through 8 to disposable PostgreSQL 17;
- seed every reset table and a non-default dashboard setting;
- prove an invocation without the exact approval GUC fails without deletion;
- run the approved reset;
- preserve schema versions, RLS policies and workload grants;
- restore the dashboard setting default and remove all seeded rows;
- remove its disposable container.

CI success for the exact candidate is required. A skipped PostgreSQL fixture is
not success.

## Gate 2 — backup and restore evidence

- [ ] Backup and monitor timers are enabled and active; their latest services
      succeeded.
- [ ] Publish a new encrypted archive after the maintenance window begins.
- [ ] Record only archive UUID, timestamp, encrypted byte count, SHA-256,
      schema version, aggregate row count and invariant.
- [ ] Use an exact-object temporary reader and offline identity to verify bytes,
      reject a wrong identity and restore into a disposable empty PostgreSQL 17
      target.
- [ ] Verify schema version 8, expected row count, foreign keys and documented
      invariant.
- [ ] Remove the reader/key, downloaded archive, decrypted dump, disposable
      database and temporary credential material.

Do not continue with a merely `published` archive; restore evidence must pass.

## Gate 3 — read-only production preflight

- [ ] Confirm `app_schema_version` is exactly `1,2,3,4,5,6,7,8`.
- [ ] Record aggregate row counts for every table named under “Deleted data”.
- [ ] Record counts of public tables, constraints, indexes, RLS-enabled tables,
      policies and `waw_web`/`waw_bot` grants.
- [ ] Confirm `dashboard_setting` has exactly one singleton row.
- [ ] Confirm no migration is pending and the migration ledger hashes match the
      deployed release.
- [ ] Confirm database capacity, active connections, canonical health and
      current/previous release metadata.
- [ ] Confirm the reset SQL contains no `drop`, `cascade`, role/grant, schema,
      credential or provider statement.

Stop on unexpected versions, schema objects, grants, connections or counts.

## Gate 4 — quiesce writes

- [ ] Disable the public application route or enter the approved maintenance
      response.
- [ ] Stop `waw-web.service` and `waw-bot.service`.
- [ ] Verify both are inactive and no application-role database session remains.
- [ ] Leave backup, monitoring, journald, Caddy and database services running.
- [ ] Recheck the aggregate row counts; restart the gate if they changed.

Do not run the reset while either application can write.

## Gate 5 — one bounded reset

Use the existing root-owned one-shot database credential boundary. Do not place
the database URL in an argument, shell history, log or environment dump.

With the credential already supplied to `psql` through that boundary, run the
exact deployed file once:

```sh
PGOPTIONS='-c waw.data_reset_approval=waw-production-data-reset-v1' \
  psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --file scripts/production-data-reset.sql
```

The file starts a transaction, verifies the exact approval value and schema
versions, truncates only its explicit table list, resets the singleton setting,
checks its postconditions and commits. Do not retry after an ambiguous client
disconnect; inspect state first.

## Gate 6 — post-reset verification

- [ ] All explicitly deleted tables have zero rows.
- [ ] `dashboard_setting` is exactly `false:0`.
- [ ] `app_schema_version`, migration hashes, schema-object counts, RLS flags,
      policy counts and grant counts match Gate 3.
- [ ] No unexpected invalid constraint, failed transaction or active
      application connection exists.
- [ ] Publish a new encrypted empty-state backup without replacing the verified
      pre-reset archive.

## Gate 7 — reactivate and accept

- [ ] Start bot once, then web, and restore the public route.
- [ ] Confirm both services active, singleton ownership and Discord Gateway
      connected.
- [ ] Confirm loopback and `https://waw.dubeom.com/health` return healthy.
- [ ] Login creates a new session and the dashboard shows empty product data.
- [ ] Execute one owner-approved Discord command and confirm its server nickname
      appears in command history.
- [ ] Confirm backup and monitoring timers remain enabled and active.
- [ ] Remove the one-shot credential context and temporary files.

## Failure and recovery

Before commit, any SQL guard or postcondition failure rolls the transaction
back. Keep services stopped, record the fixed reason and do not retry.

After commit, deletion cannot be reversed by application rollback. Do not run
`pg_restore --clean` against the original database. Keep services stopped,
verify the pre-reset archive again in a disposable target, and obtain a new
owner decision for one of:

1. retain the verified empty production state and correct forward; or
2. provision an empty replacement database, restore the verified archive there,
   verify it, then perform a separately reviewed credential cutover.

Application release rollback does not restore deleted database rows. Never
claim rollback success from service health alone.

## Evidence and stop conditions

Record only exact commit/hash, timestamps, aggregate counts, fixed stage
results, schema/RLS/grant counts, health status and cleanup results. Never
record Discord IDs/nicknames, row contents, connection strings, cookies,
tokens, keys or archive plaintext.

Any missing verified backup, changed row count after quiescence, schema mismatch,
unexpected grant, failed cleanup, ambiguous reset outcome or unhealthy service
means `STOPPED`.
