# Production security audit — 2026-07-24

- Scope: AWS Lightsail and backup-only production host inventory; removal of unused TCP 80 rule
- Audit identity: non-root `waw-spike-operator`
- Change authorization: temporary root bootstrap policy limited to
  `lightsail:CloseInstancePublicPorts`/`OpenInstancePublicPorts` in
  `ap-northeast-2`
- Changes made: closed the global TCP 80 Lightsail rule
- Excluded: credential contents, journal contents, host configuration and vacuum

## Outcome

The running host, backup/monitor services, credential file modes, automatic update
service, AppArmor and external status alarm are healthy. The main exposure is SSH:
Lightsail permits TCP 22 from all IPv4/IPv6 addresses, the host listens on both,
UFW is inactive, root key login is permitted and X11/TCP forwarding remain enabled.
The unused global TCP 80 rule was removed; TCP 22 is the only remaining public
Lightsail rule.

## Evidence

- Ubuntu 24.04, kernel `6.17.0-1019-aws`; no reboot required.
- Lightsail `micro_3_0` instance running; status-check alarm `OK`.
- Lightsail firewall:
  - TCP 22: `0.0.0.0/0`, `::/0`
  - TCP 80: closed at `2026-07-24T18:28:30+09:00`; operation
    `4fc601e9-3ae6-4fb7-8331-620d7b51e540` `Succeeded`
- Post-cleanup read-back showed only TCP 22 open and
  `waw-production-backup-host-status-check-failed` remained `OK`.
- Host listeners: SSH only on public TCP 22; no TCP 80 listener.
- UFW inactive.
- SSH: password and keyboard-interactive authentication disabled; public-key
  authentication enabled; `PermitRootLogin without-password`, X11 forwarding and
  TCP forwarding enabled. Root and `ubuntu` each have one mode-`0600`
  `authorized_keys` entry.
- Monitor and backup timers active/enabled; services successful; zero failed units.
- Monitor credential `root:root 0600`; backup environment `root:waw-backup 0640`
  under mode-`0750` directory; state directories mode `0700`.
- Monitor systemd exposure score `6.9 MEDIUM`; backup score `8.3 EXPOSED`.
  Backup runs as non-login `waw-backup` with `NoNewPrivileges`, strict system
  protection and narrow read/write paths, but lacks several sandbox directives
  already used by the monitor.
- Unattended upgrades active; daily timers enabled; 21 packages currently
  upgradable; automatic reboot was not explicitly configured.
- AppArmor active; `auditd` inactive. Disk 8% used; about 512 MiB memory available.
- No extra Lightsail disk, static IP or instance snapshot was present.
- The operator was correctly denied IAM policy enumeration and S3 public-access
  block/encryption reads. Those controls are unverified in this audit, not known
  to be absent.
- The temporary region-scoped Lightsail port permission was removed, its absence
  was read back, and the root bootstrap profile was logged out immediately after
  verification.

## Ranked follow-up

1. **High — SSH exposure hardening gate.** Before changing access, verify an
   owner-approved recovery path. Then restrict TCP 22 to an exact management CIDR
   or another reviewed access path, set `PermitRootLogin no`, disable X11 and TCP
   forwarding unless a measured workflow requires them, and remove the root
   authorized key after an `ubuntu` sudo and recovery rehearsal. Keep a timed
   rollback for firewall and sshd changes.
2. **Medium — systemd sandbox hardening.** Add the smallest compatible backup and
   monitor directives in a disposable Ubuntu test first. Do not risk the scheduled
   backup or journal visibility by copying directives without a syscall/path test.
3. **Medium — patch window.** Review the 21 pending packages, take the existing
   pre-change inventory, apply security updates in an owner-approved window and
   verify backup/monitor/journald/alarm plus reboot requirements.
4. **Verification gap — IAM/S3 control-plane audit.** Use a separately approved,
   short-lived read-only audit identity to read the operator policy, bucket public
   access block, bucket policy/encryption/lifecycle and writer-key age. Do not add
   these reads to the daily deployment operator merely for convenience.

## Stop conditions

- Do not restrict the SSH firewall rule or change sshd until a second tested
  access path and rollback owner exist.
- Do not remove the root key independently of `PermitRootLogin` and recovery
  rehearsal.
- Do not change journald configuration, retention or run a vacuum.
- Do not harden the backup unit directly in production before a disposable
  scheduled-run and S3 publication test.
