# Dashboard design refresh: current UI audit and success criteria

Date: 2026-07-26

## Scope and evidence

This is the approval-stage audit required by
`docs/prompts/dashboard-design-refresh.md`. It covers the current React UI in
`web/`, the public dashboard DTOs and routes, and the accepted authentication
and administrator-command boundaries. The comparison prototypes under
`docs/design/dashboard-directions/` are static, synthetic, and deliberately
disconnected from production APIs.

No production code, API route, authentication rule, permission boundary,
deployment asset, or production environment was changed.

## Current UI audit

### What already works

- The loading, login, denied, unavailable, ready, save-success, save-error, and
  version-conflict states are explicit.
- A skip link, semantic headings, labelled controls, 44 px minimum action
  height, visible focus ring, reduced-motion handling, and a single-column
  breakpoint already establish a sound accessibility baseline.
- The overview distinguishes gateway, storage, and backup state. Settings use
  optimistic concurrency through `expectedVersion`, and audit is refreshed
  after mutation.
- The browser client keeps the opaque session/CSRF contract. The server remains
  the authority for operator versus administrator access.
- No production token, OAuth code, session identifier, PUUID, or Discord
  identifier is rendered by the current ready view.

### Information architecture findings

- The page is a useful foundation dashboard, but it has only one flat overview.
  It does not yet give the promised product areas—home, Riot requests,
  `/몰랭검거` observations, audit, and operations—stable places in the
  navigation.
- Health, the low-risk summary setting, and audit have nearly equal visual
  weight. “What needs attention now?” is not the first scan path.
- Three isolated metric cards make related system state slower to compare and
  lean toward a generic SaaS template.
- The `/몰랭검거` brand and the private Discord “operation room” character are
  absent. “WAW 운영 dashboard” and the light editorial palette could belong to
  many unrelated products.
- Audit rows omit useful human-readable reason context and filters. This is
  acceptable under the current narrow DTO, but the layout should reserve space
  without inventing new API fields.
- The current UI does not expose the already-defined Riot request routes. A
  future implementation must keep approval/rejection administrator-only,
  recent-authenticated, CSRF-protected, explicitly confirmed, version-checked,
  and fail-closed.

### Status and trust findings

- Current labels cover infrastructure health and audit outcomes, but not the
  product vocabulary `정상`, `확인 필요`, `불일치`, `알 수 없음`, `정정됨`.
- Automatic Riot/Go Live disagreement needs a persistent “검토 신호이며 위반
  확정이 아님” explanation. Red alarm styling alone would overstate certainty.
- Several meanings rely heavily on color. The refresh needs a unique icon and
  visible text for every product state.
- “일부 장애” is clear for system health, but product observations and system
  incidents must remain visually and semantically separate.

### Responsive and accessibility findings

- The current 720 px collapse is safe for the existing content, but no
  navigation, dense table, filter bar, or administrator decision flow has been
  exercised on mobile.
- Focus indication is strong, but the light palette’s muted text and translucent
  surfaces should be re-measured when colors change. Prototype colors are not
  accepted tokens until automated contrast checks pass.
- Audit content is a list, which reflows well. Future tabular information must
  become labelled stacked rows on narrow screens rather than horizontal scroll
  being the only access path.
- Save feedback correctly receives focus. Future confirmation dialogs must
  restore focus, name the affected request without exposing stable identifiers,
  and state that authorization is rechecked by the server.

## Contracts that must be preserved

- Canonical production origin: `https://waw.dubeom.com`.
- Existing SPA fallback and `DASHBOARD_API_PATHS`; no visual prototype implies
  a new route or response field.
- Opaque HttpOnly/Secure session, OAuth state validation, exact redirect origin,
  CSRF validation, origin checks, logout/revocation, and fail-closed role
  revalidation.
- Read access for authorized operator/administrator tiers; settings mutation
  and Riot decisions remain administrator-only where currently enforced.
- Riot decision confirmation, recent authentication, optimistic version check,
  stable operation reconciliation, and audit-before-IPC behavior.
- Automatic observations remain advisory. “불일치” means evidence needs human
  review, not that a person violated a rule.
- No secrets or stable internal identifiers in UI, logs, screenshots, fixtures,
  or test output.

## Observable success criteria

1. At 1280 px, the first viewport names `/몰랭검거`, identifies the signed-in
   role, shows overall operations health, and places all review-needed items
   before low-risk settings.
2. At 360 px, primary navigation and every sample record remain readable without
   horizontal page scrolling; actions have at least a 44×44 px target.
3. Keyboard-only users can reach the skip link, navigation, filters, rows, and
   actions in visual order. Every interactive element has a visible focus
   indicator of at least 2 CSS px.
4. Each of `정상`, `확인 필요`, `불일치`, `알 수 없음`, and `정정됨` has
   visible Korean text plus a distinct non-color cue. No state is communicated
   by color alone.
5. Every automatic mismatch view includes adjacent copy saying it is a review
   signal and not a confirmed violation.
6. Normal body text and meaningful UI graphics meet WCAG AA contrast; focus
   indicators meet WCAG 2.2 contrast requirements. Automated checks report no
   serious or critical violations on desktop and mobile fixtures.
7. The Riot decision flow never displays PUUID, Discord IDs, session values,
   OAuth data, tokens, or raw operation IDs. Synthetic display names and masked
   Riot handles are sufficient for prototypes and tests.
8. Existing API paths, request/response DTOs, authentication behavior,
   authorization tiers, CSRF/recent-auth/confirmation gates, optimistic
   concurrency, and error semantics remain unchanged.
9. Loading, empty, denied, unavailable, conflict, timeout/outcome-unknown,
   success, and corrected states have explicit Korean copy and recovery
   guidance.
10. The selected direction can be implemented with current React/CSS patterns
    and dependencies. No new runtime UI dependency is required.

## Direction comparison

| Direction | Core idea | Strength | Risk | Recommendation |
|---|---|---|---|---|
| A. 작전 상황판 | Persistent rail, attention queue, dense operational canvas | Best scan path and strongest `/몰랭검거` identity | Density needs careful mobile transformation | Recommended |
| B. 수사 기록부 | Chronological evidence ledger with case-like sections | Makes uncertainty and corrections unusually clear | Slower for routine system scanning | Keep its evidence timeline pattern |
| C. 친구 서버 콘솔 | Compact command-console rhythm and segmented modules | Most playful and memorable | Can feel technical or game-like if overdone | Use its restrained command labels only |

### Recommended synthesis

Use Direction A as the structural base. Borrow Direction B’s evidence timeline
for observation detail and correction history, and Direction C’s restrained
slash-command motif for labels. This preserves a serious operational hierarchy
while making `/몰랭검거` distinctive without turning the dashboard into a joke.

## Owner feedback: selected dashboard specification

The owner narrowed the preferred dashboard on 2026-07-26:

- Use Pretendard and a modern, restrained dashboard visual system.
- Make a continuously scannable command-usage log table the primary dashboard
  content.
- Provide a management surface for the summary command's daily 10-use limit.
- Manage the summary limit per registered user: inherit the server default of
  10, set a 1–100 override, or disable summary use for that user.
- Retain the other accepted operation-room, Korean UX, state, responsive, and
  accessibility decisions.

Direction A is updated as the selected static prototype. Directions B and C
remain comparison evidence rather than implementation candidates.

### Contract gap found before implementation

The current repository does not expose the selected screen's data contract:

- `command_audit` is written by the bot, but the dashboard's existing
  `/api/audit` DTO only returns `settings.summary.update` events.
- `LowRiskSettingsDto` contains only `summaryEnabled` and `version`.
- No per-user daily summary quota, current usage, reset boundary, user registry,
  override/disable state, or quota mutation is
  present in the accepted dashboard API, migration, or implementation plan.

The prototype therefore uses synthetic display names and aggregate values only.
It does not imply that these fields or mutations already exist. Production
implementation needs a bounded proposal covering the read model, Korean-day
boundary, concurrency/atomic increment, administrator-only mutation, audit,
retention, pagination, and non-exposure of guild/channel/user identifiers.

## Approval gate

Approval is requested before any production UI implementation. The decision
needed is whether the updated Direction A faithfully represents the owner
feedback. Because its two primary data surfaces are not in the current API,
approval of the visual direction does not approve an API or storage change.
After visual approval, first write and approve a bounded contract/implementation
plan; then implement command-log read pagination and daily quota management as
separate tested slices. Orca built-in-browser validation remains required.
