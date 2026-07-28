# OpenAI summary marker synthetic spike pass — 2026-07-28

- Status: PASS
- Candidate:
  `f42e2b06b23695bee113091581aba635ec343494`
- Release ID: `f42e2b0`
- Requests: `1`
- Retry: `0`
- Activation: `0`
- Service restart: `0`
- Feature flags: `0,0,0,0`

## Root cause and correction

The staged build ran under `umask 077`. Build output and dependencies were
therefore readable only by root, while the release manager removed write bits
without restoring the read and directory-traverse permissions required by the
bot service user. Root preflight passed, but bot-user module import failed
before an OpenAI request.

The release manager now normalizes the secret-free release tree with
`a+rX` before removing all write bits. The exact inactive staged release was
repaired without activation, restart, migration or symlink change. A bot-user
check then imported both compiled summary modules and validated the fixed
request shape with network disabled.

The release-manager fixture also passed on CloudShell Linux under `umask 077`,
including other-user read, directory traversal and zero writable files.

The post-repair transient diagnostic passed every fixed stage:

- bootstrap `1`;
- compiled imports `1`;
- systemd `LoadCredential` read `1`;
- request validation and marker contract PASS;
- child stdout/stderr delivery `1/1`;
- network and provider request `0`;
- cleanup PASS.

## Synthetic provider result

The approved invented Korean marker conversation made exactly one Responses
request. It completed in `2,895 ms` with:

- input tokens: `444`;
- output tokens: `79`;
- total tokens: `523`;
- strict response schema: PASS;
- omission count: `0`;
- duplicate count: `0`;
- wrong-section count: `0`;
- unmarked-item count: `0`;
- invented items: `0`;
- unexpected items: `0`.

No request/response body, marker text, credential value, recognizable
credential prefix, provider error, host or account identifier was printed or
retained.

## Cleanup and remaining gate

Production credential source, runtime credential, transient unit, CloudShell
handoff files, target metadata file and local clipboard/file copies were
removed. All four feature flags remained exactly `0`; activation and service
restart remained `0`.

The owner confirmed that the dedicated key usage view shows exactly one
2026-07-28 request and revoked the key. The synthetic gate is complete. A
passing synthetic spike does not authorize real Discord content or
summary-provider activation.
