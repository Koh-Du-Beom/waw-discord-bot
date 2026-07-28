# OpenAI summary Lightsail read-boundary diagnostic result — 2026-07-28

- Status: PASS
- Scope: read-only AWS session, Lightsail service and exact-target boundary
- Production commands: `0`
- Credential, secret or access-detail reads: `0`
- Production mutations: `0`
- OpenAI requests: `0`

## Certified inputs

- Controller:
  `scripts/run-lightsail-read-boundary-diagnostic.sh`
- Controller SHA-256:
  `4af081a2ac09015c3d5a9e222a4bba78686fc5af3b382c4662c8f8c907c65c8e`
- Fixture:
  `scripts/test-lightsail-read-boundary-diagnostic.sh`
- Fixture SHA-256:
  `4385b5aa9374eb5e3bf9a9b706529fca15532e78dd85e791d99dc69e2df90385`
- Transfer archive SHA-256:
  `e68ccd738142ce18df5aa4e6a4d5dba021971af5b098e126668959c61a328d56`
- Transfer archive size: `2746` bytes

The archive and controller hashes were verified in CloudShell before
execution. The target name was derived in memory from the existing approved
provision source, validated against a restricted character allowlist and
never emitted.

## Execution result

The controller ran once and emitted only its fixed labels:

- controller start: PASS
- regional Lightsail list API: PASS
- regional list response shape: PASS
- exact-target Lightsail read API: PASS
- exact-target response match: PASS
- controller cleanup: PASS, transient remainder `0`
- overall result: PASS

Exact external call counts:

- regional Lightsail list reads: `1`
- exact-target Lightsail reads: `1`
- access-detail calls: `0`
- retries: `0`
- SSH or production-host commands: `0`
- application credential, DB connection or query: `0`

Provider output, resource identifiers, account data and response bodies were
not retained in this result.

## Local verification

- Bash syntax: PASS
- success and four first-failure fixture paths: PASS
- access-response, bounded SSH and schema diagnostic fixtures: PASS
- application integration, production application, provider default-off and
  production schema asset fixtures: PASS
- complete test suite: `260` tests, `253` pass, `7` explicit external skips,
  `0` fail
- TypeScript typecheck and production build: PASS
- production dependency audit: `0` findings
- diff whitespace check: PASS

## Conclusion

The active AWS session, selected region, Lightsail service read path and exact
target read path are healthy. Combined with the preceding access-only result,
the unresolved failure is narrowed to the access-detail action or its
action-specific execution path; it is not evidence of a general AWS session,
regional Lightsail or target lookup failure.

No new IAM user, access key or root credential is indicated by this result.
The failed access-detail controller remains zero-retry and must not be rerun.
Gate 1 remains blocked until an approved production channel can complete the
read-only preflight without exposing access material.

## Cleanup

The exact CloudShell archive and run directory were deleted and verified
absent. The exact local staging directory and archive were also deleted and
verified absent.
