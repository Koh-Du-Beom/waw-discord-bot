# Production SSH operations with Termius

- Date: 2026-07-31
- Scope: research only; repository evidence and primary documentation
- Production access or mutation: none

## Constraints

- A human, not an AI agent, enters commands in production SSH, AWS CloudShell,
  or another external-service terminal.
- Human operations move from CloudShell-centered access to Termius using a
  passphrase-protected, human-only SSH key.
- GitHub Actions keeps the accepted exact-commit deployment path and its
  dedicated deploy key.
- Commands for the owner are supplied only in a root-level, Git-untracked
  `TEMP_*.md` handoff.
- No ADR acceptance, dependency installation, credential registration,
  production command, or production change is authorized by this research.

## Repository evidence versus current external state

| Boundary | Durable repository evidence | Current external state |
| --- | --- | --- |
| Host | The 2026-07-25 inventory observed one running Ubuntu 24.04 Lightsail host in Seoul. Later records show application releases through 2026-07-30. | Not queried. Instance state, OS patch level, public addresses, users, and effective SSH configuration are unverified. |
| Public ingress | The 2026-07-25 inventory observed IPv4 and IPv6 port 22 open to all and no 80/443. The production runbook later records public DNS/HTTPS activation, and the repository identifies `https://waw.dubeom.com` as canonical. | Not queried. The exact IPv4/IPv6 firewall rules are unverified; the 2026-07-25 firewall table is stale and must not be used as current truth. |
| Human access | The inventory records a named AWS IAM operator and temporary browser SSH/CloudShell as the intended manual path. The runbook calls the named human path break-glass after GitHub Actions activation. | IAM user, MFA, Termius host entry, human public key, and host authorization are unverified. |
| Deploy access | Accepted ADR-0024 and Actions workflows use `LIGHTSAIL_DEPLOY_SSH_KEY`, pinned known hosts, `LIGHTSAIL_USER`, and exact `GITHUB_SHA`. A no-mutation SSH preflight and later deployments passed in repository history. | Repository variables, secrets, authorized key, fingerprints, and present revocation state were not read. |
| Host hardening | Repository policy requires least privilege, default deny, bounded preflight, and rollback. No durable inventory records effective `PermitRootLogin`, password authentication, X11/TCP forwarding, or fail2ban state. | All four are unverified. |

The dated external-services inventory also describes Discord OAuth, Gateway,
Riot, OpenAI, DNS, Caddy, Supabase, S3, IAM, alarms, and monitoring as they
stood on 2026-07-25. `PROJECT_STATUS.md` records substantial later activation.
That inventory is historical evidence, not a current external-service
inventory. This task does not rewrite it because doing so without external
read-back would create false current-state claims.

## Primary-source findings

- Ubuntu supports `/etc/ssh/sshd_config.d/*.conf`, warns that a bad remote
  configuration can cause lockout, and requires `sshd -t` before restarting
  SSH. It recommends Ed25519 keys and correct `authorized_keys` permissions:
  <https://documentation.ubuntu.com/server/how-to/security/openssh-server/>.
- OpenSSH defines `DisableForwarding yes` as disabling X11, agent, TCP, and
  StreamLocal forwarding. `PermitRootLogin no` denies root SSH login:
  <https://man.openbsd.org/sshd_config>.
- Lightsail maintains independent IPv4 and IPv6 firewalls. Rules are
  permissive, the most permissive matching rule wins, and AWS recommends
  limiting TCP 22 to the administration client's source address:
  <https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html>.
- Fail2ban ships jails disabled by default and directs operators to enable
  only relevant jails in local configuration. Its `sshd` jail supports the
  systemd backend:
  <https://github.com/fail2ban/fail2ban/blob/master/config/jail.conf>.

## Options

### A. Import the GitHub deploy key into Termius

Smallest setup, but it merges human and automation attribution, rotation, and
revocation. A lost operator device would require deployment-key rotation.

Verdict: reject; it conflicts with Accepted ADR-0024.

### B. Give Termius a human-only key but retain the shared `ubuntu` account

Keys rotate independently, but host audit records still identify the same OS
account and its authorization file contains both roles.

Verdict: viable rollback fallback, not the recommended steady state.

### C. Dedicated human account and key; existing GitHub deploy path unchanged

Create `waw-operator` with a passphrase-protected Ed25519 key and bounded sudo
access. Keep the existing GitHub key, account, known-host pinning, workflow,
exact-commit archive, serialization, and rollback unchanged.

Verdict: recommend. It separates attribution and revocation without changing
application deployment.

## Termius connection record without secrets

| Field | Value |
| --- | --- |
| Label | `WAW production — human operator` |
| Address | Owner-verified current Lightsail address or stable canonical SSH target; do not infer it from the 2026-07-25 inventory |
| Port | `22` |
| Username | `waw-operator` after bootstrap |
| Authentication | Human-only Ed25519 private key stored in Termius; passphrase retained outside Git and chat |
| Host key | Compare against an independently verified current host-key fingerprint before first acceptance |
| Agent/X11/port forwarding | Disabled |
| Sudo password | Never stored in the host entry |

Do not store AWS account IDs, public IPs, private keys, passphrases, repository
secret values, or application credentials in durable documentation.

## Lockout-safe transition

1. Inventory effective SSH settings, key fingerprints, listening ports,
   fail2ban state, and both Lightsail firewall families without mutation.
2. Create the human key locally and install only its public half for the new
   account. Keep the original session open.
3. Open a second Termius session as `waw-operator`; verify identity and bounded
   sudo. Do not continue unless it succeeds.
4. Back up the affected host files, install one narrowly named SSH snippet,
   run `sshd -t`, inspect effective values with `sshd -T`, then reload rather
   than restart. Verify a third login before closing either earlier session.
5. Apply and verify each hardening control independently. On any failure,
   restore only that step, run `sshd -t` where applicable, reload, and verify
   the retained session and a new login.
6. Restrict the Lightsail firewall last, separately for IPv4 and IPv6, only
   after the owner's current stable source CIDRs are known. Preserve 80/443.
   Confirm a new session before closing the retained session.

If the operator's source address is dynamic or stable IPv6 is unavailable,
leave the corresponding port-22 rule unchanged and record the risk. Guessing a
CIDR is more likely to cause lockout than to improve security.

## Independent hardening stages

| Stage | Benefit | Main risk | Verification | Rollback |
| --- | --- | --- | --- | --- |
| Root login denial | Removes direct root SSH authentication while preserving sudo audit identity. | Locks out an operator who has no working non-root sudo path. | Retained session, `sshd -t`, effective `permitrootlogin no`, new operator login and sudo. | Restore only the SSH snippet, validate, reload. |
| X11/TCP forwarding denial | Reduces SSH pivot and tunnel capability. `DisableForwarding yes` also disables agent and StreamLocal forwarding. | Breaks any undocumented forwarding-dependent operation. GitHub deployment appears to use command/SCP only, but this is unverified externally. | Static workflow review, effective `disableforwarding yes`, GitHub no-mutation preflight, new human session. | Restore only the forwarding snippet, validate, reload. |
| fail2ban `sshd` jail | Adds host-local rate limiting when port 22 remains reachable. | Package/action/backend mismatch can fail service startup or ban the operator. It does not replace key authentication or the Lightsail firewall. | Config test, service status, `fail2ban-client status sshd`, retained and new sessions. | Disable/remove only the local jail, restart fail2ban, verify SSH. |
| Lightsail port-22 source restriction | Drops unwanted traffic before it reaches the host. | Wrong or changing IPv4/IPv6 CIDR causes lockout; IPv4 and IPv6 rules are independent and a broad duplicate remains effective. | Full rule read-back for both families plus a new session from every approved operator path. | Restore the exact pre-change rules from the retained AWS console session. |

Recommended order is human key/account, root denial, forwarding denial,
fail2ban, then Lightsail firewall. This preserves the widest recovery path
until host authentication is proven. Each stage needs a separate owner
continuation decision; combining them would obscure the failing control.

## Documentation conflict review

- `README.md`: compatible with exact-commit Actions and separate owner gates.
  Its CloudShell troubleshooting is historical and need not be removed.
- `PROJECT_STATUS.md`: newer than both dated inventories and shows production
  deployment/activation after 2026-07-25. It should receive an execution result
  only after owner-approved external verification, not during research.
- External-services inventory: materially stale for OAuth, Gateway, Riot,
  OpenAI, Caddy/DNS, application deployment, and possibly IAM/SSH. Update it
  only from a separately approved read-only inventory.
- Production runbook: compatible on deploy-key separation and exact-commit
  deployment, but its named-human procedure remains CloudShell/browser-SSH
  centered and does not define Termius, a dedicated host user, two-session
  SSH changes, or independent hardening rollback. Update after ADR acceptance.

## Recommendation and approval gate

Propose Option C. Owner approval must name the human account, accepted source
CIDRs (or explicitly defer firewall restriction), allowed sudo scope, deploy
account preservation, and the exact first read-only inventory. Acceptance does
not itself authorize production access; every external read or mutation remains
a separately bounded owner-dispatched step.
