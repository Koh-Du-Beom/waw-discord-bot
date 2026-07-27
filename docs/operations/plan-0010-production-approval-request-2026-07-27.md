# PLAN-0010 production approval request — 2026-07-27

- Owner decision: approved and executed
- Candidate: `2ac0996070fc89667d9d1c2cd698ff35ea14af7d`
- Release ID: `2ac0996`
- Archive SHA-256:
  `86c1520a01b49d7e38131f9f25b4235b0447c22ada612832bd6944db7267e66f`
- Archive bytes: `618752`
- Gate A: PASS in local, disposable PostgreSQL 17, clean Linux, and AWS
  CloudShell Linux
- Production mutation: completed within the approved scope

## Approval scope

Approve only:

1. read-only production preflight and fresh verified backup;
2. migration `0008_summary_hourly_cooldown.sql`;
3. activation of immutable release `2ac0996`;
4. service, migration-ledger, asset, canonical-domain, health, and fixed
   feature-flag verification.

Keep all three flags exactly disabled:

- `WAW_SUMMARY_QUOTA_ENABLED=0`
- `WAW_DASHBOARD_QUOTA_ENABLED=0`
- `WAW_GAME_OBSERVATION_ENABLED=0`

Do not inject a summary-provider credential, call a summary provider, register
or alter Discord commands, enable game observation, or include later source
changes in this approval.

## Stop conditions

Stop before migration or activation if the archive hash/bytes, current release,
rollback target, migration ledger `1..7`, backup publication/restore evidence,
database role, available disk, timer state, or the three fixed flags differ
from the reviewed values.

Stop after migration and before release activation if version `8`, its exact
checksum, retained reservation ledger, removed daily-limit structures, or
workload grants differ from the tested contract.

Stop after activation and roll the application back if either service loses
singleton ownership, startup or migration fails, assets differ, the canonical
domain or `/health` is unhealthy, a secret/raw message appears in logs, or any
fixed flag is not `0`.

## Rollback

Reactivate the previously verified immutable release and recheck both services,
assets, `https://waw.dubeom.com`, `/health`, logs, and all three flags. Keep
schema version `8`: migration `0008` removes obsolete default-off daily-quota
structures and has no down migration. Do not recreate those structures during
application rollback.

## Decision requested

Approve or reject this exact tuple and scope. Approval of candidate `2ac0996`
does not approve any summary adapter change made after that commit and does not
activate quota or game observation.

## Execution result

PASS on 2026-07-27:

- published a fresh encrypted backup with schema version `7`, `114` rows,
  valid constraints, and archive SHA-256
  `a46c8116b8f067dabf9bea3f64fcf489c33b66b7e3db307aa17b9c1f223d28604`;
- restored that backup into disposable PostgreSQL and verified schema version
  `7`, `114` rows, zero invalid constraints, and zero invalid foreign keys;
- staged the exact `618752`-byte archive and verified its reviewed SHA-256,
  immutable files, eight migration assets, and all three fixed flags;
- applied migration `0008` with the staged compiled runner;
- activated release `2ac0996` with `cb93ed8` retained as the rollback target;
- verified both services active with zero restarts, no failed systemd units,
  active backup/monitor timers, and no remaining migration credential file;
- verified `https://waw.dubeom.com/health` returns `{"status":"healthy"}`;
- verified the dashboard is authenticated and reports healthy Discord Gateway
  and storage connections.

The first web health probe immediately after restart saw a transient connection
refusal; the bounded retry passed. Failed transfer attempts were rejected
before staging. The temporary exact-object transfer IAM user, access key,
policy, S3 object, CloudShell files, local files, and production archive were
removed after verification.

The following remained disabled and no summary-provider credential was
installed:

- `WAW_SUMMARY_QUOTA_ENABLED=0`
- `WAW_DASHBOARD_QUOTA_ENABLED=0`
- `WAW_GAME_OBSERVATION_ENABLED=0`

## Remaining product work

1. Finish and gate the uncommitted synthetic OpenAI summary adapter, provision
   its production credential separately, then enable only the per-user rolling
   one-hour summary quota.
2. Run the consented Riot Spectator production spike and enable game
   observation only after the spike passes.
3. Run an end-to-end Discord smoke test:
   `/라이엇계정` → automatic observation/stack accumulation →
   `/몰랭검거`, plus `/요약` and its one-hour cooldown.
4. Separately investigate why the dashboard shows backup status as unavailable
   despite the successful operational backup publication and restore check.
