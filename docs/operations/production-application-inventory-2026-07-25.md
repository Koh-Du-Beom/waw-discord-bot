# Production application read-only inventory — 2026-07-25

## Scope

Owner-approved AWS console inspection only. No IAM policy, SSH session, instance,
network, alarm, DNS, certificate, snapshot or application state was changed.

## Observed instance

- Name: `waw-production-backup-host`
- Region/AZ: Seoul, `ap-northeast-2a`
- State: `Running`
- Image: Ubuntu
- Plan: general purpose, 1 GB RAM, 2 vCPUs, 40 GB SSD
- Network: dual-stack
- Tags visible in inventory:
  - `environment=production`
  - `purpose=waw-production-backup`
- SSH user: `ubuntu`
- Custom key name: `waw-production-backup-key`
- Lightsail instance UUID: `b6c495e7-c6e3-4d84-b559-56503996dfab`
- Load balancer: none
- Distribution origin: none
- Static IPv4: not attached; the console warns that the current public IPv4
  changes after a stop/start

Addresses were inspected but are intentionally omitted from this durable
metadata-only record.

## Public firewall

The complete visible rule inventory contained:

| Family | Protocol | Port | Source |
| --- | --- | --- | --- |
| IPv4 | TCP | 22 | Any IPv4 address; Lightsail browser SSH |
| IPv6 | TCP | 22 | Any IPv6 address |

No public HTTP, HTTPS or application high port was present. Task 6 must not add
public application authority; DNS and 80/443 remain Task 7 gates.

## Alarm

The instance status-check alarm was enabled and in `OK` state. Its visible
condition was at least one status-check failure, twice within ten minutes, with
missing data excluded from evaluation.

## Exact-target read-only follow-up

An owner-approved root CloudShell session ran only caller-identity and
`lightsail get-instance` reads. It confirmed the root caller, exact instance
UUID above, name `waw-production-backup-host` and state `running`. The full ARN
and account ID are intentionally omitted from this durable metadata record.

The repository policy template was rendered locally for that exact target. Its
SHA-256 was:

`b7963044614bade61d8fb70e39d4f93a1fe30ded973b5309502e47300282177d`

The rendered policy was kept outside the repository and its allowlist contract
test passed. No IAM policy was created or attached.

## Remaining G5 gaps

- Host-local backup, monitoring, journald, disk, memory, listener, unit,
  credential-path and schema checks still require the separately approved
  non-root SSH preflight.
- Exact release hash, credential kinds, maintenance window and rollback owner
  remain unapproved.

Stop before IAM creation/attachment, temporary SSH access or host mutation.
