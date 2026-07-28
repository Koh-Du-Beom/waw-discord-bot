# Summary history collection fix result — 2026-07-28

- Status: PASS
- Release: `7cb6c24`
- Archive SHA-256:
  `7cb6c248c97cb05629531856352b3de03df94176915f832576c2423e0a175b86`
- Archive bytes: `207004`

## Trigger

The first registered-user `/요약 최근` smoke returned the fixed
`summary_range_incomplete` response before any provider request.

## Root cause

Discord.js returns a `Collection<Snowflake, Message>` from
`channel.messages.fetch()`. The adapter typed that result as an iterable of
messages and spread it directly. Because a Collection is Map-like, iteration
produced `[id, message]` entries. The page validator therefore rejected every
real Discord page as malformed.

The tests used arrays and did not reproduce the Discord return shape.

## Correction

- consume `fetched.values()` instead of Collection entries;
- type the adapter boundary as a readonly Map;
- use Map fixtures in the adapter tests;
- verify the compiled release against a Map-shaped fixture before activation.

## Production evidence

```text
SUMMARY_HISTORY_FIX stage=PASS map_fixture=PASS
SUMMARY_HISTORY_FIX activation=PASS restarts=2 health=PASS singleton=PASS
SUMMARY_HISTORY_FIX flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0
SUMMARY_HISTORY_FIX cleanup=PASS transient=0
SUMMARY_HISTORY_FIX result=PASS release=7cb6c24
```

No Discord command re-registration, OpenAI request, database migration or
credential change occurred. The prior release remains the rollback target.

## Remaining smoke

A registered user can retry the same bounded `/요약 최근` selection. This is
the first corrected request that may transmit real Discord content and incur a
provider charge.
