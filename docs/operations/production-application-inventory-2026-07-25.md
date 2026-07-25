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

## G5 gaps

- The Lightsail console UI did not expose the instance UUID/ARN. The exact ARN
  must be obtained through an approved read-only API call before rendering or
  attaching the production-operator policy.
- Host-local backup, monitoring, journald, disk, memory, listener, unit,
  credential-path and schema checks still require the separately approved
  non-root SSH preflight.
- Exact release hash, credential kinds, maintenance window and rollback owner
  remain unapproved.

Stop before IAM creation/attachment, temporary SSH access or host mutation.
