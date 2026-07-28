# Default-off `f42e2b0` rollout result — 2026-07-28

- Status: PASS
- Release: `f42e2b0`
- Archive SHA-256:
  `962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`
- Execution boundary: existing authenticated CloudShell session and one
  bounded Lightsail SSH certificate

## Change

The rollout installed the candidate `waw-bot.service` and `waw-web.service`,
removed the temporary provider-default-off bridge, activated the exact staged
release, performed one daemon reload, and restarted the bot and web services.
The candidate bot unit contains the single exact provider-default-off
declaration, so removing the bridge avoided duplicate declarations.

No database migration, provider request, credential creation, credential
change, Discord command registration, or real-message processing was part of
this rollout.

## Evidence

```text
DEFAULT_OFF_ROLLOUT precondition=PASS backup=PASS
DEFAULT_OFF_ROLLOUT activation=PASS daemon_reload=1 bridge_removed=1
DEFAULT_OFF_ROLLOUT health=PASS singleton=PASS failed_units=0
DEFAULT_OFF_ROLLOUT flags=0,0,0,0 provider_calls=0 migrations=0
DEFAULT_OFF_ROLLOUT cleanup=PASS transient=0
DEFAULT_OFF_ROLLOUT result=PASS release=f42e2b0 restarts=2
SCHEMA_DIAGNOSTIC query_total=0
SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0
SCHEMA_DIAGNOSTIC result=PASS
```

The four zero flags are summary provider, summary rolling-hour quota, game
observation, and dashboard quota. Both services returned active single
`MainPID` values, loopback `/health` returned the exact healthy payload, and
the system had zero failed units.

## Rollback

Before mutation, the controller copied both installed units and the exact
bridge to a root-only transient directory and recorded the current and previous
release targets. Any post-change failure would restore the units and bridge,
invoke the release manager rollback, reload systemd, restart both old services,
and require the old release and healthy loopback state before reporting
rollback PASS. The success path removed the transient backup.

## Controller correction

The first controller attempt requested a `180s` operation timeout, which the
bounded SSH helper rejects before opening the remote execution channel. It
made no production change and cleaned up its local and CloudShell artifacts.
The controller was corrected to the helper's existing allowed `600s` bound;
the second execution produced the PASS evidence above.
