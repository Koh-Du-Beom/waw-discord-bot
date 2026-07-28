# Summary time UX activation result — 2026-07-28

- Status: PASS
- Release: `f8bf082`
- Archive SHA-256:
  `f8bf082e6524a07775222e97bd889a97a77bb87ab41d1a140e16b48374e58393`
- Archive bytes: `222679`

## User-facing result

The production Discord command schema now provides:

- `/요약 최근 범위:<최근 10분|30분|1시간|3시간|6시간|12시간|24시간>`;
- `/요약 직접 시작:<20:00 또는 어제 23:30> 종료:<21:00 또는 오늘 00:30>`;
- a maximum summary range of 24 hours;
- an external-processing notice presented as `※ 외부 처리 안내` inside the
  summary help rather than as an unrelated section.

Direct times are interpreted in Asia/Seoul. Invalid, future, reversed, or
over-24-hour ranges fail closed with fixed Korean guidance.

## Deployment evidence

The first command-registration attempt failed before changing the command
schema because Node ESM does not support importing the absolute
`node_modules/discord.js` directory. Automatic rollback passed and production
remained on `3a73844`.

The registration script was corrected to load the pinned absolute package
through `createRequire`. The second bounded execution passed:

```text
SUMMARY_TIME_UX stage=PASS command_schema=PASS
SUMMARY_TIME_UX command_registration=PASS requests=4
SUMMARY_TIME_UX activation=PASS restarts=2 health=PASS singleton=PASS
SUMMARY_TIME_UX flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0
SUMMARY_TIME_UX cleanup=PASS transient=0
SUMMARY_TIME_UX result=PASS release=f8bf082
```

The controller used a single running Seoul Lightsail target, ephemeral
certificate-authenticated SSH material and pinned returned host keys. Local,
CloudShell, controller and remote transfer artifacts were removed.

## Verification

- Full local regression: `262` total, `255` pass, `7` explicit skips, `0`
  failures when run with short `TMPDIR=/tmp`;
- typecheck: PASS;
- server and web build: PASS;
- diff whitespace check: PASS;
- production command schema registration/readback: PASS;
- bot/web health and singleton checks: PASS;
- provider calls: `0`;
- database migrations: `0`.

The initial local regression without the short `TMPDIR` had one macOS Unix
socket `EINVAL` caused by the temporary path length. The same suite passed
without code changes under `/tmp`.

## Remaining smoke

The controller cannot impersonate a registered Discord user. A registered user
should read back private `/도움말`, then run one bounded selection-based
`/요약 최근` request. That request may transmit real Discord content to the
approved provider and may be billable.
