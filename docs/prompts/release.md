# Release Review

Read `AGENTS.md`, release changes, Accepted ADRs, operations policy, project status, and changelog.

Verify:

- Required tests and checks
- Database migration and compatibility
- Backup and tested recovery
- Secrets and environment configuration
- OAuth redirect for `https://waw.dubeom.com`
- DNS and TLS readiness
- Bot single-instance or coordination guarantees
- Monitoring and alerting
- External API failure behavior
- Rollback procedure
- Known risks
- Documentation and changelog

Return one verdict: Ready, Ready with explicit accepted risks, or Not ready. Include evidence, blockers, rollback steps, and post-release checks.
