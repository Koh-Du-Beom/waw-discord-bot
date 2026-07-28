# OpenAI summary disclosure activation result — 2026-07-28

- Status: PASS
- Release: `3a73844`
- Archive SHA-256:
  `3a73844cc5b1cc8f016f9b1e65b00559abe23eb0788ce26517ab766a500a39f3`
- Archive bytes: `221481`

## Credential

The initial repeated credential attempts did not enter the remote installer:
the browser multi-file upload reported two files but delivered only the
controller bundle. A key-free metadata diagnostic proved the production target
was absent while both services and default-off flags were healthy. Uploading
the key and bundle separately fixed the handoff.

The final credential installation verified:

- precondition, default-off and key material shape: PASS;
- source metadata: `root:root`, mode `0600`;
- bot-user direct source read: denied;
- bot PID and start timestamp: unchanged;
- service restart and provider request: `0`;
- local, CloudShell, controller and remote key transients: removed.

No key value, hash, length, provider error or account metadata was emitted.

## Release and activation

The runtime-only source archive passed the local release manager build,
typecheck and disclosure checks before production transfer. Production then
verified the same archive tuple, built and staged the immutable release,
verified the disclosure in server and web artifacts, installed a root-owned
bot drop-in for the summary credential and flags, activated the release,
reloaded systemd once, and restarted bot and web.

```text
SUMMARY_ACTIVATION stage=PASS disclosure=PASS
SUMMARY_ACTIVATION activation=PASS daemon_reload=1 restarts=2
SUMMARY_ACTIVATION health=PASS singleton=PASS failed_units=0
SUMMARY_ACTIVATION flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0
SUMMARY_ACTIVATION cleanup=PASS transient=0
SUMMARY_ACTIVATION result=PASS release=3a73844
```

The registered-user disclosure is included in the authenticated dashboard and
the private `/도움말` response. No direct announcement was sent to an
implicitly selected Discord channel.

## Remaining smoke

The deployment controller cannot impersonate a registered Discord user. A
registered user must invoke `/도움말` to read back the private disclosure and
then invoke one bounded `/요약` request if a real-content smoke is desired.
This is the first action that can make a billable provider request and transmit
real Discord content.
