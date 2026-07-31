# PLAN-0013 game observation activation result

Date: 2026-07-30 (Asia/Seoul)

## Outcome

Production release `19ea83925f6b27f66c924e2b1860a3c5d0904a89` was
deployed and game observation is active.

- Source archive SHA-256:
  `b4f50d3eb4c1f570aa8b34d3714d1b40eaa1e8fa2006c5eeeeefe747fd00f2ed`
- Effective `WAW_GAME_OBSERVATION_ENABLED`: `1`
- Discord alert channel guild, type, View Channel and Send Messages checks: PASS
- Bot, web, backup timer and monitor timer checks: PASS
- Loopback and canonical health: PASS
- Database migrations: `0`
- Discord test messages: `0`
- Real Riot game smoke: not run by owner request
- Rollback: not required

## Preflight and activation

Read-only preflight run
[`30519252199`](https://github.com/Koh-Du-Beom/waw-discord-bot/actions/runs/30519252199)
verified the then-current release, rollback link, services, timers, credentials,
loopback/canonical health and effective flag. It also used Discord read-only API
requests to verify the configured guild text channel and the bot's effective
View Channel and Send Messages permissions without sending a message.

The first application deployment run
[`30519446562`](https://github.com/Koh-Du-Beom/waw-discord-bot/actions/runs/30519446562)
succeeded. Its follow-up activation run found the flag already equal to `1`,
but the manager incorrectly required that state to originate from its own
drop-in filename. That activation command failed before changing production;
the preceding preflight and subsequent read-back continued to report the
effective flag as `1`.

PR [#5](https://github.com/Koh-Du-Beom/waw-discord-bot/pull/5) removed that
ownership assumption while preserving conflict-safe drop-in installation and
rollback when the effective flag is `0`. CI passed, deployment run
[`30519766674`](https://github.com/Koh-Du-Beom/waw-discord-bot/actions/runs/30519766674)
activated the exact final release, and owner-dispatched run
[`30519827652`](https://github.com/Koh-Du-Beom/waw-discord-bot/actions/runs/30519827652)
reported:

- `game_observation_preflight_pass release=19ea83925f6b enabled=1`
- `discord_alert_channel_preflight_pass`
- `game_observation_activation_already_enabled release=19ea83925f6b`

An independent request to `https://waw.dubeom.com/health` returned HTTP `200`
with status `healthy`.

## Remaining verification

After a registered user finishes a new solo-ranked game while not streaming,
verify that the production observation creates one `confirmed/violation`
incident, adds exactly one stack, and sends exactly one public
`🚨🚨🚨🚨 몰랭 검거 🚨🚨🚨🚨` alert. This real Discord/Riot smoke was
deliberately left to the owner and users.
