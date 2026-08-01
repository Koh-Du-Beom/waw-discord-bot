# ADR-0029: Human-only Termius production SSH path

- Status: Accepted
- Date: 2026-07-31
- Owners: Product owner
- Related requirements: production least privilege, operator lockout
  prevention, exact-commit deployment preservation
- Related research:
  `docs/research/technology-options/production-ssh-termius-operations.md`
- Supersedes: production runbook's CloudShell-centered normal human access only
- Superseded by:

## Context

Manual production operations currently rely on repository-documented
CloudShell/browser SSH procedures. GitHub Actions already deploys exact commits
with a dedicated repository-secret key. Human access needs an independently
revocable identity suitable for Termius without granting AI agents an external
terminal.

## Decision drivers

- Human and deployment identity, key, rotation, and revocation separation
- No AI-entered production, CloudShell, or external terminal commands
- Two-session validation and per-control rollback against SSH lockout
- Existing exact-commit GitHub Actions path unchanged
- No new production runtime dependency

## Considered options

### Option A: Reuse the GitHub deploy key in Termius

Rejected because it merges human and automation capability.

### Option B: Human-only key on the existing deployment account

Retained as a rollback fallback, but it does not provide clear OS-account
attribution.

### Option C: Dedicated human account and key

Selected: `waw-operator` uses a passphrase-protected Ed25519 key in Termius;
the existing GitHub deployment account and key remain unchanged.

## Decision

Use Option C.

- Termius is a human client only. AI agents may prepare a Git-untracked
  `TEMP_*.md` handoff but may not enter external commands.
- The human public key is installed only for `waw-operator`; its private key
  and passphrase never enter Git, chat, logs, GitHub Secrets, or the host.
- The GitHub deploy key, account, pinned known hosts, exact `GITHUB_SHA`
  archive, serialized deployment, health checks, and rollback remain unchanged.
- Root SSH login and forwarding controls are changed only after a second
  operator session and sudo path pass.
- Root login denial, forwarding denial, fail2ban, and Lightsail firewall
  restriction are independent stages with independent verification and
  rollback.
- Lightsail port 22 is restricted only to owner-confirmed stable IPv4/IPv6
  CIDRs. Unknown or dynamic CIDRs defer that stage rather than guessing.

## Rationale

Separate accounts and keys give the smallest clear revocation and attribution
boundary. Keeping GitHub Actions unchanged avoids coupling an operations-client
change to the already accepted deployment architecture.

## Consequences

### Positive

- Human-device loss does not require deploy-key rotation.
- Deploy-key revocation does not remove the human break-glass path.
- SSH hardening failures can be isolated and rolled back one control at a time.

### Negative

- One additional host account, public key, and sudo policy must be maintained.
- Source-CIDR restriction may need operational updates when the owner's network
  changes.
- fail2ban adds a host package and service, so it requires its own approval.

### Risks

- Incorrect sudo or SSH configuration can lock out the operator.
- A permissive duplicate IPv4 or IPv6 Lightsail rule can defeat restriction.
- `DisableForwarding yes` may break an undocumented workflow.
- A false-positive fail2ban rule can temporarily ban the operator.

## Validation

- Repository-only contract review before approval
- Read-only external inventory under a separate owner gate
- Human public/private fingerprint match without recording key material
- Retained first session, successful second Termius session, and bounded sudo
- `sshd -t` before every reload and effective-setting read-back
- Fresh login after each independent hardening stage
- GitHub no-mutation SSH preflight after forwarding changes
- fail2ban configuration/status check
- Complete IPv4 and IPv6 Lightsail firewall read-back

## Rollback or migration

Preserve the original session and exact pre-state until a new session passes.
Restore only the file or firewall rule changed by the failing stage. Validate
SSH configuration before reload. Do not remove the human key or original
access path until the final postcondition is accepted. GitHub deployment
rollback remains ADR-0024's immutable previous-release procedure.

## Conditions for reconsideration

- Multiple operators require centralized SSH certificates or SSO.
- Stable source CIDRs are unavailable and public port 22 is unacceptable.
- Termius no longer preserves required key or host-key controls.
- Production moves away from a single Lightsail host.

## Approval

- Owner decision: Approved — keep the existing GitHub Actions deployment
  account and key, create a separate `waw-operator` Linux account and human SSH
  key for Termius, prohibit AI agents from entering production terminal
  commands, and retain CloudShell only as a break-glass path.
- Approved date: 2026-07-31
