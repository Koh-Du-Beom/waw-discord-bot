# PLAN-0006 Task 8 Gate A read-only preflight — 2026-07-26

- Status: Complete — Gate B awaits separate owner approval
- Scope: Metadata-only AWS Lightsail, production host and Supabase preflight
- Production changes: None
- Canonical domain: `https://waw.dubeom.com`

No schema, credential, user/group, unit, service, firewall, DNS, feature flag,
file or external resource was changed.

## Confirmed

| Check | Result | Evidence |
| --- | --- | --- |
| Canonical root | PASS | HTTPS `200`, `text/html; charset=utf-8` |
| Canonical health | PASS | HTTPS `200`, `application/json; charset=utf-8`, fixed body `{"status":"healthy"}` |
| DNS presence | PASS | Canonical hostname returned an A record; address intentionally omitted |
| Reviewed local commit | INFO | `38dc17ff6f8438f81ee559769f2cd3532b3d5a2c` |
| Reviewed migration 0001 SHA-256 | INFO | Worktree bytes: `8fb915c343e0dbc09439d9f787d10103d56aa962579236a484162dded9f5dbe2`; LF bytes: `337cb749ea8eab659a09a8906c8887bcc49e7d47930448610149d13ac046db10` |
| Reviewed migration 0002 SHA-256 | INFO | Worktree bytes: `972eff5483799f9594e91cb09ca54a73b49f708bab60abac34f0b55aa53b34c7`; LF bytes: `fabb240cfc7104b6bd9650bb0ade6cdd3c099934a9ad95fbff8d836debaa165d` |
| Reviewed migration 0003 SHA-256 | INFO | Worktree bytes: `f7f94d1f2c5b4d5f39fd763f36f7b7d8819462f818d37052bf51507058edc184`; LF bytes: `7c807c9113524103eed0314565ac6263facc49098e1d0c5eedf13038ddb97a5f` |
| Reviewed migration 0004 SHA-256 | INFO | `9142361bec0d953f14e8cd835cec5a5fb77c66bfbb80c859b7afdcd23ccc7b45` |
| Reviewed migration 0005 SHA-256 | INFO | `d4f1dac70fafb0d43ec18ee63303db4be25b13b7f4ba66a6d71f97972b71d32a` |
| Reviewed migration 0006 SHA-256 | INFO | `cbb29bf17b60aba6d0106a97085a559ab7dad4ecaffdd5fb2e2d338262a3eb78` |
| Active production release | PASS | `/opt/waw/current` resolves to release `1943fd8`; previous resolves to `b454092` |
| Core services | PASS | `waw-web`, `waw-bot`, `caddy`, `waw-backup.timer`, and `waw-monitor.timer` are active and enabled; no failed unit was listed |
| Effective service identities | PASS | `waw-web` runs as `waw-web:waw-web` with `waw-member-role`; `waw-bot` runs as `waw-bot:waw-member-role` |
| Admin IPC disabled state | PASS | No `WAW_ADMIN_COMMAND_IPC_ENABLED` value, `waw-admin-command` group, runtime directory, or socket exists |
| Backup and monitor | PASS | Both timers are active/enabled; latest `waw-backup.service` and `waw-monitor.service` results are `success` with exit status `0` |
| Lightsail status-check alarm | PASS | The authenticated Lightsail console showed the enabled `StatusCheckFailed` alarm in `OK`: notify when failures are greater than or equal to `1`, `2` times within `10` minutes (5-minute period, evaluation/datapoints `2/2`). Missing data is not evaluated. Notification destination details were intentionally omitted. |
| Production migration ledger | ATTENTION | Versions 1–4 are present; versions 5–6 are not applied |
| Production table RLS | PASS | RLS is enabled for every queried existing application table |
| Production policy/grant inventory | INFO | Seven policies and 26 explicit `waw_web`/`waw_bot` table grants were returned |
| Production workload roles | PASS | `waw_web` and `waw_bot` are non-login, non-inheriting and have no create/replication/bypass-RLS capabilities; `waw_web_runtime` is login/inheriting without elevated database capabilities |
| Migration checksum portability | PASS | The runner records canonical LF hashes and accepts only LF/CRLF renderings of otherwise identical SQL. Exact production 0001-0004 mixed-ledger regression passed. |
| Exact rollout input preflight | PASS | Clean commit `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b` was exported as source archive SHA-256 `7a72e9fe5bc2c9b3ed87ca86e60efae7b1033ac47b62c3f33c39b63b65c7d27b`. It passed isolated release staging, clean install, typecheck, build and production application asset verification. The archive is evidence only and was not deployed. |

The local working tree contains the approved in-progress PLAN-0005/0006 work
and is not an immutable production release artifact. The reviewed commit must
not be treated as the rollout release without a separately reviewed clean
archive and hash.

## Resolved findings

| Gate A check | State | Evidence |
| --- | --- | --- |
| Lightsail alarm | RESOLVED | The owner-provided authenticated Chrome session exposed the exact alarm read-only. It is enabled and in `OK` with the expected threshold and `2/2` evaluation window. No alarm action or setting was invoked. |
| Migration checksum portability | RESOLVED | Production versions 1-2 match the canonical LF rendering and versions 3-4 match the exact CRLF rendering of unchanged current SQL. Both representations are now accepted; changed SQL still fails. |

The approved browser SSH session and authenticated Chrome AWS session were used
only for the listed read-only checks. Earlier local CLI and restricted console
attempts failed without changing AWS. No host file, service, user, group,
socket, flag, credential or alarm was changed.

## Stop decision

Gate A is complete and safe to proceed. This evidence does not authorize Gate B.
Do not create a backup, run migrations, install a group/unit, activate a
release, restart a service or change a feature flag until the owner separately
approves the exact Gate B change set.
