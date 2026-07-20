# Project Agent Instructions

This file defines the repository-wide workflow for AI coding agents.

## Required reading order

Before changing files, read:

1. `README.md`
2. `PROJECT_STATUS.md`
3. `docs/PROJECT_GUIDE.md`
4. `docs/product/policy.md`
5. `docs/operations/deployment-and-security.md`
6. `docs/ai/codex-workflow.md`
7. Relevant files under `docs/standards/`
8. Relevant research, ADRs, and implementation plans

## Source of truth

Resolve conflicts using this priority:

1. Explicit current user instruction
2. Accepted ADRs
3. Product policy
4. Operations and security policy
5. Project standards
6. Approved implementation plans
7. Research notes and proposed ADRs
8. Existing implementation

Report conflicts instead of silently choosing an interpretation.

## Workflow

For material technical decisions:

1. Derive constraints from policy.
2. Research realistic alternatives.
3. Use official or primary sources.
4. Run a reversible spike when documentation is insufficient.
5. Write a Proposed ADR.
6. Obtain owner approval.
7. Mark the ADR Accepted.
8. Write an implementation plan.
9. Implement one bounded task at a time.
10. Test and update documentation.

Do not combine research, approval, architecture selection, and broad implementation into one uncontrolled task.

## Development principles

- Read the request and the affected files before editing.
- State assumptions that materially affect the result. If ambiguity would lead to substantially different outcomes, report it before proceeding.
- Define brief, observable success criteria for multi-step work.
- Prefer the smallest correct solution: avoid unnecessary work, reuse project patterns and helpers, prefer native features, and reuse installed dependencies before adding code or dependencies.
- Do not introduce speculative features, premature abstractions, unnecessary configuration, or boilerplate.
- Simplicity must not weaken security, accessibility, trust-boundary validation, or protection against data loss.
- Make surgical changes that match the surrounding style. Preserve user changes and report unrelated issues instead of silently fixing them.
- Fix root causes and inspect relevant callers before patching defects.
- Verify outcomes with the smallest useful test or reproducible check, and never claim completion without fresh evidence.

When these general principles and a project-specific policy or workflow differ in specificity, follow the project-specific rule. Report actual conflicts instead of silently resolving them.

## Prohibited behavior

Do not:

- Choose a stack only because it is popular or familiar.
- Treat a Proposed ADR as approved.
- Introduce production dependencies during research-only work.
- Store secrets, tokens, OAuth codes, session identifiers, or Discord message contents in logs.
- Silently truncate summaries that are required to cover a full time range.
- Claim tests passed without running them.
- Rewrite unrelated files.
- Change product policy as an implementation shortcut.

## Dashboard domain

The management dashboard canonical production domain is:

`https://waw.dubeom.com`

Do not use another production hostname without an explicit policy change.

## Communication

- Lead with outcomes and concrete evidence.
- Keep plans and progress updates concise.
- Surface tradeoffs, blockers, and anything not verified.

## Completion report

Every material task report must include:

- Files changed
- Decisions made
- Assumptions and unresolved issues
- Commands and tests run
- Results and failures
- Documentation updated
- Recommended next prompt
