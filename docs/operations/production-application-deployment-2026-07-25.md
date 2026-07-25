# Production application deployment evidence (2026-07-25)

## Applied scope

- Activated immutable release `5231c6b` on the approved Lightsail host.
- Installed and enabled `waw-bot.service` and `waw-web.service`.
- Kept application listeners on loopback; no public firewall, DNS, or TLS
  authority was changed.
- Configured Discord roles `WAW Administrator` and `WAW Operator`, and assigned
  the administrator role to `godubeom`.

## Runtime corrections

- Changed the bot service umask from `0077` to `0027`. The bot health file is
  now owned by `waw-bot:waw-member-role` with mode `0640`, allowing only the
  intended group-scoped web reader.
- Added `uselibpqcompat=true` alongside `sslmode=require` to the root-owned
  Supabase session-pooler file credential. The connection string and secret
  values were not logged.
- Preserved the previous monitoring-only `/opt/waw/current` directory as
  `/opt/waw/legacy-current-monitoring-20260725` before activating the release
  symlink.

## Verified result

- `waw-bot.service`: active; Gateway state `connected`.
- `waw-web.service`: active.
- `waw-backup.timer`: active.
- `waw-monitor.timer`: active.
- `GET http://127.0.0.1:18080/health`: HTTP 200,
  `{"status":"healthy"}`.

## Remaining gated work

- Install and validate Caddy for the production hostname.
- Open Lightsail public ports 80 and 443.
- Point `waw.dubeom.com` DNS to the production host.
- Obtain and verify the public ACME certificate.
- Register `https://waw.dubeom.com/auth/discord/callback` in the Discord
  application and run an end-to-end OAuth login.
- Remove the temporary Discord `WAW setup` role after owner cleanup.
