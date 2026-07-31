# PLAN-0015 Stages 2 through 8 execution approval

- Status: Approved
- Date: 2026-07-31
- Related plan: `docs/implementation/PLAN-0015-human-termius-production-ssh.md`
- Command handoff: root-level Git-untracked
  `TEMP_PLAN_0014_PRODUCTION_SSH_TRANSITION.md`

## Approved stages

The owner approved the remaining ordered execution:

1. Generate the human-only key locally.
2. Create `waw-operator`, install only the human public key, and verify a
   second Termius session and sudo.
3. Deny root SSH login.
4. Disable SSH forwarding and verify the existing GitHub deploy path with the
   no-mutation preflight.
5. Install and enable fail2ban's minimal `sshd` jail.
6. Restrict Lightsail port 22 after exact stable source CIDRs are known.
7. Perform final read-back.

## Execution conditions

- Human owner enters every local, production and external-service action.
- AI agents do not enter commands in Termius, production SSH, CloudShell,
  GitHub or Lightsail.
- Stages remain sequential. A failed verification stops the sequence and uses
  only that stage's rollback.
- The retained recovery session remains open through a verified new login.
- Unknown or unstable IPv4/IPv6 source CIDR defers that firewall family.
- GitHub deploy account/key, exact-commit workflow, application release,
  migrations, credentials, feature flags and data remain unchanged.

## Owner decision

- Decision: Approved all remaining stages subject to the ordered stop,
  verification and rollback conditions above.
- Approved date: 2026-07-31
