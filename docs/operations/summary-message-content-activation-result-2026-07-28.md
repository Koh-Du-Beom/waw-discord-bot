# Summary message-content activation result — 2026-07-28

- Status: PASS
- Release: `f08089f`
- Archive SHA-256:
  `f08089fb57f3c0645c2f845648bcca05c53c3ed9a05cd480ae3ea4bfe02605b4`
- Archive bytes: `207305`

## Trigger and root cause

The corrected Discord history collector reached the provider, but the four
summary sections were empty even though the selected channel had conversation.
The accepted Discord research boundary requires Message Content access, while
the Developer Portal toggle was off and the runtime deliberately omitted
`GatewayIntentBits.MessageContent`. Discord therefore returned message
metadata with empty content fields.

The command handler also allowed an all-empty conversation through quota
reservation and provider dispatch.

## Changes

- enabled and saved only Message Content Intent in the existing Discord
  Developer Portal application;
- added `GatewayIntentBits.MessageContent` to the runtime's minimum intents;
- retained the exclusion of `GuildMessages` because the product reads bounded
  history through REST and does not subscribe to message-create events;
- reject zero-message and all-empty-content ranges before quota reservation or
  provider dispatch;
- return fixed Korean permission guidance for unavailable content;
- added regression coverage for the intent list and the no-content boundary.

No bot token, application secret or other privileged intent was changed.

## Verification

- Full regression: `263` total, `256` pass, `7` explicit skips, `0` fail;
- typecheck and server/web build: PASS;
- production dependency audit: zero vulnerabilities;
- diff check: PASS;
- isolated release stage and compiled intent readback: PASS;
- production Map-shaped Discord fixture: PASS;
- production intent readback: PASS.

## Production evidence

```text
SUMMARY_MESSAGE_CONTENT stage=PASS map_fixture=PASS intent=PASS
SUMMARY_MESSAGE_CONTENT activation=PASS restarts=2 health=PASS singleton=PASS
SUMMARY_MESSAGE_CONTENT flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0
SUMMARY_MESSAGE_CONTENT cleanup=PASS transient=0
SUMMARY_MESSAGE_CONTENT result=PASS release=f08089f
```

The previous release remains available as the rollback target. Deployment made
no OpenAI request and no database migration.

## Remaining smoke

A registered user can retry the same bounded `/요약 최근` request. That request
may transmit real Discord content and incur a provider charge.
