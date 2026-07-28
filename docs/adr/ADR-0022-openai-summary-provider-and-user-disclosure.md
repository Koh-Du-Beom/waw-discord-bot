# ADR-0022: OpenAI summary provider and registered-user disclosure

- Status: Accepted
- Date: 2026-07-28
- Owners: Product owner
- Related requirements: FUN-004, FUN-005, PRI-001 through PRI-003
- Related ADRs: ADR-0016, ADR-0021

## Context

ADR-0016 kept provider-specific inference behind a port and required a separate
provider approval. The exact OpenAI Responses adapter has since passed a
single-request synthetic marker/schema gate with `store:false`, no retry, and
no local persistence of message or summary content. Production remains
default-off until a dedicated credential is installed and both provider and
rolling-hour quota flags are enabled.

OpenAI's current API data controls state that API inputs and outputs are not
used for model training by default. Default abuse-monitoring logs may contain
customer content and may be retained for up to 30 days unless law requires
longer retention. `store:false` prevents Responses application-state storage
but does not remove default abuse-monitoring retention.

## Decision

- Use the pinned OpenAI Responses adapter for conversation summary.
- Send only the complete, explicitly requested channel or thread range of at
  most 24 hours.
- Keep `store:false`; do not use conversations, files, background mode, tools,
  or provider-side persisted application state.
- Do not persist or log raw Discord message content or generated summaries in
  WAW.
- Enforce one provider reservation per registered user per rolling hour.
- Publish the external-processing boundary in both the authenticated dashboard
  and the private `/도움말` response before activation.
- Present the disclosure as a `※ 외부 처리 안내` note directly inside the
  summary help rather than as an unrelated top-level section.
- Use Discord choices for recent 10-minute through 24-hour ranges. Keep direct
  input as an advanced `Asia/Seoul` wall-time form accepting `HH:mm`,
  `오늘 HH:mm`, and `어제 HH:mm`; do not require ISO 8601 from users.
- Stop and require a new product decision if provider, model, endpoint,
  retention, training, region, or data-control behavior materially changes.

## Disclosure

> 요약을 요청하면 선택한 채널·스레드의 최대 24시간 메시지가 OpenAI API로
> 전송됩니다. API 입력·출력은 기본적으로 모델 학습에 사용되지 않지만,
> 안전성 모니터링을 위해 최대 30일 보존될 수 있습니다. WAW는 메시지 원문과
> 생성된 요약을 영구 저장하거나 로그에 기록하지 않으며, 등록 사용자별로
> 1시간에 한 번만 요청할 수 있습니다.

## Rollback

Set the summary provider and quota flags to exact zero and restart only the bot.
Retain quota reservation audit rows. Remove the provider credential only after
the default-off bot is healthy. The dashboard and help disclosure may remain
visible while the feature is unavailable.

## Approval

- Owner decision: Approved on 2026-07-28 — publish the recommended
  disclosure/data-processing policy and proceed to dedicated key issuance.
