# OpenAI summary adapter synthetic handoff — 2026-07-27

- Status: default-off production assembly regression PASS
- Production assembly: not performed
- Provider credential: not requested, read, stored, or injected
- Real Discord message transmission: not performed

## Implemented boundary

`OpenAiConversationSummarizer` uses native `fetch` and the Responses API with
the exact model `gpt-5.4-mini-2026-03-17`, `store: false`,
`reasoning.effort: none`, a conservative 300,000-byte pre-dispatch request
limit, a 4,096 output-token limit, a 120-second deadline, and a strict
four-section JSON schema. It validates the complete ordinal manifest before
dispatch and normalizes provider or malformed-response failures without logging
request or response bodies. Oversized input fails explicitly with range
adjustment guidance before quota reservation or provider dispatch.

The adapter is assembled only when `WAW_SUMMARY_PROVIDER_ENABLED=1`; the
production unit fixes that flag to `0` and does not load a provider credential.
`/요약` defers its Discord reply before history/provider work. Tests use only a
fake transport, a synthetic bearer canary, and synthetic Korean message text;
no OpenAI request is possible in the test.

## Evidence and remaining gate

- Full suite with a short macOS temporary path:
  `254 tests / 247 pass / 7 explicit external skips / 0 fail`.
- Adapter/provider/defer regression: `15 pass / 0 fail`.
- Build, typecheck, production asset contract, production dependency audit, and
  `git diff --check`: passed; production dependency vulnerabilities were zero.
- The first full-suite run after adding summary defer found one stale integration
  fixture that lacked Discord's defer/edit methods. The fixture was updated and
  the fresh full suite passed.

Before production use, the owner must accept the provider/data-retention
boundary, a synthetic Korean quality/cost evaluation must pass, and the exact
bot-only credential plus systemd drop-in must be approved. The conservative
input cap intentionally rejects some requests the model might accept; add
hierarchical summarization only if real usage proves that ceiling inadequate.
