# Summary empty-range guidance activation result

Date: 2026-07-28 (Asia/Seoul)

## Outcome

Production release `bb53cf2` was activated successfully.

- Source archive SHA-256:
  `bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed`
- Source archive size: `207414` bytes
- Previous release: `f08089f`
- Database migrations: `0`
- OpenAI provider calls: `0`
- Service restarts: bot `1`, web `1`
- Rollback: not required
- Transient remainder: `0`

## Root cause

The bounded read-only diagnostic found:

- latest 100 Discord messages: `100`
- messages with readable content: `100`
- messages in the latest 10 minutes: `0`
- messages with readable content in the latest 10 minutes: `0`
- messages in the latest 24 hours: `100`
- messages with readable content in the latest 24 hours: `100`

The Discord content boundary was therefore healthy. The command handler treated
an empty selected range as if message content were unavailable and returned a
misleading permission instruction.

## Change

The summary command now distinguishes:

- no messages in the selected range:
  `summary_range_empty`, with guidance to choose a longer range;
- messages exist but every message body is empty:
  `summary_content_unavailable`, with Message Content permission guidance.

Both branches fail before quota reservation and provider dispatch. Message
content and identifiers were not emitted by the diagnostic, controller, or
activation output.

## Verification

Local:

- `TMPDIR=/tmp npm test`: `264` total, `257` pass, `7` explicit skips,
  `0` fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- compiled output contains both stable reason codes and the new Korean guidance
- activation scripts pass `bash -n`

The first local test invocation used the macOS default long temporary directory
and one unrelated Unix socket test failed with a path-level `EINVAL`. Repeating
with the project-standard short `TMPDIR=/tmp` passed the full suite.

Production:

- source archive and release-manager hashes: PASS
- production build: PASS
- Discord Map/Collection fixture: PASS
- Message Content intent declaration: PASS
- compiled empty-range guidance: PASS
- bot and web active: PASS
- loopback health: PASS
- singleton: PASS
- provider/quota/game flags: `1/1/0`
- failed systemd units: `0`
- controller cleanup: PASS

## Remaining verification

Run one registered-user summary over a range known to contain messages, such as
`/요약 최근 범위:최근 1시간`. This is the only remaining real provider smoke
for this defect chain and will consume the normal summary quota/provider call.
