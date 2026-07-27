# 대화 요약 API 제약, 개인정보와 비용 가능성

- 상태: Research
- 작성·공식 자료 확인일: 2026-07-20
- 결정 질문: 최대 24시간의 Discord 메시지를 조용한 누락 없이 2분 안에 요약하면서 개인정보 요구와 월 신규 지출 3만 원을 만족할 수 있는 API 제약과 명시적 실패 계약은 무엇인가?
- 연결 요구사항: `FUN-003`, `FUN-004`, `FUN-005`, `FUN-006`, `PRI-001`, `OWN-003`, `OWN-005`
- 범위: OpenAI API, Anthropic Claude API, Google Gemini Developer API의 공식 문서·데이터 정책·가격표와 기술 독립적인 검증 조건
- 비범위: 실제 API 호출, 결제, Spike, 공급자 선택, ADR, 구현

## 정책에서 도출한 통과 조건

1. 사용자는 시간 범위만 지정한다. 시스템 내부의 토큰·청크 한계를 메시지 개수 옵션으로 전가하지 않는다 (`FUN-003`).
2. `[시작, 종료)` 범위에서 수집된 모든 메시지가 정확히 한 번 요약 입력 계보에 포함되어야 한다. 일부 누락 상태의 결과를 성공으로 표시하지 않는다 (`FUN-004`).
3. 120초 전체 deadline, 컨텍스트·rate limit 또는 비용 상한을 만족하지 못하면 결과 대신 명시적 실패나 범위 조정 안내를 반환한다 (`FUN-005`, `OWN-003`).
4. 최종 결과는 핵심 논의, 결정, 할 일, 미해결 질문을 구분하는 검증 가능한 출력 계약을 가져야 한다 (`FUN-006`).
5. 원문은 처리 중 메모리/통제된 임시 영역에만 존재하고 애플리케이션 DB·파일·로그·감사 이벤트에 영구 저장하지 않는다. 공급자 전송은 별도의 외부 처리가므로 공급자 보존 조건도 평가한다 (`PRI-001`).
6. AI 비용은 백업·도메인 부대비용과 합쳐 월 30,000원 이하여야 한다. 요청별 상한만으로 월 상한이 자동 보장되지는 않는다 (`OWN-005`).

## 확인된 사실: 공식 API 한계

아래 수치는 계정·프로젝트별 실제 한도가 아니라 확인일의 공개 기본/초기 tier다. 운영 전 콘솔에 표시되는 실제 한도를 다시 읽어야 한다.

| 후보(비교 모델) | 컨텍스트 / 최대 출력 | 공개 초기 처리량 | 비동기·Batch | 2분 목표에 대한 사실 기반 판정 |
|---|---:|---|---|---|
| OpenAI `gpt-5-mini` | 400,000 / 128,000 tokens | Tier 1: 500 RPM, 500,000 TPM, batch queue 5,000,000 tokens | Batch endpoint 지원. 모델 페이지는 batch 가격을 구분하지만, 대화형 2분 완료 보장은 명시하지 않음 | 400k 미만 단일 입력 또는 계층 처리의 후보. 공개 한도는 용량 상한이지 지연 SLA가 아님 |
| Anthropic `claude-haiku-4-5` | 200,000 / 64,000 tokens | Start: 1,000 RPM, 2,000,000 ITPM, 400,000 OTPM | Message Batch는 최대 100,000 요청/256MB, 처리·만료 창 24시간. 긴 동기 요청에는 streaming 권고; 504 timeout 가능 | 200k 초과 입력은 계층 처리가 필요. 24시간 Batch는 2분 주 경로에 부적합 |
| Google `gemini-2.5-flash` | 입력 1,048,576 / 출력 65,536 tokens | 한도는 모델·tier·계정 상태별로 AI Studio에서 확인; project 단위 RPM/TPM/RPD. Tier 1 batch enqueue 3,000,000 tokens, 10분당 지출 제한 $10 가능 | Batch는 표준가의 50%, 목표 turnaround 24시간; 48시간 초과 시 expired. 동시 batch 100, 입력 파일 2GB | 최대 입력은 가장 크지만 2분 지연 SLA는 아님. Batch는 2분 주 경로에 부적합 |

공식 근거:

- OpenAI 모델 한도·가격·Tier 1 rate limit: [GPT-5 mini model](https://developers.openai.com/api/docs/models/gpt-5-mini)
- Anthropic 모델 한도·가격: [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Anthropic rate limit·429·`retry-after`: [Rate limits](https://platform.claude.com/docs/en/api/rate-limits); timeout과 재시도: [API errors](https://platform.claude.com/docs/en/api/errors); batch: [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- Google 모델 한도: [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash); rate·지출·batch queue 한도: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits); batch 상태·부분 실패: [Batch API](https://ai.google.dev/gemini-api/docs/batch-api)

### Timeout, rate limit, Batch의 의미

- **사실:** 세 후보의 공개 rate limit은 최대 허용량이며 처리시간 보장이 아니다. 한도 이하라도 120초 완료를 공식 문서만으로 보증할 수 없다.
- **사실:** Anthropic은 `429`와 `retry-after`, `504 timeout_error`를 문서화하고 공식 SDK의 일시 오류 기본 재시도를 설명한다. Google은 한도 초과를 `429 RESOURCE_EXHAUSTED`로 설명한다. OpenAI 모델 한도는 usage tier에 따라 변한다.
- **추론:** 120초는 공급자 timeout과 별개인 애플리케이션 전체 deadline이어야 한다. 수집, 토큰 계산, 모든 map 호출, reduce 호출, 검증까지 포함하고 남은 시간이 다음 단계를 끝내기에 부족하면 시작하지 않아야 한다.
- **추론:** 24시간 Batch는 비용 절감/오프라인 작업에는 유효하지만 `OWN-003`의 대화형 2분 성공 경로에는 사용할 수 없다. 비동기 API를 사용하더라도 120초 안에 terminal success를 확인하지 못하면 요청은 실패다.
- **미확인:** OpenAI 동기 요청의 고정 서버 timeout과 세 후보의 p95/p99 한국 지역 지연은 공개 문서로 확정되지 않았다. 별도 승인된 합성 데이터 Spike 없이는 2분 충족을 주장할 수 없다.

## 전체 범위 처리 검증 계약

모델이 “모두 읽었다”고 말하는 것은 증거가 아니다. 원문을 저장하지 않으면서 애플리케이션이 결정적으로 검증해야 한다.

1. 수집 시작 시 불변 범위 `[start, end)`와 수집 기준점(cutoff)을 고정한다.
2. 메시지를 시간·안정 ID 순으로 정렬하고 각 메시지에 요청 내 연속 ordinal을 부여한다. 청크 manifest에는 `first_ordinal`, `last_ordinal`, `count`, 직전 청크와 연결되는 해시만 둔다. 해시는 원문 복구 수단이 되지 않도록 요청 종료 후 폐기한다.
3. 청크는 ordinal 구간을 겹침·공백 없이 분할한다. 각 map 결과는 입력 구간과 `processed_count`를 구조화 필드로 되돌리되, 서버가 기대값과 일치할 때만 완료로 인정한다.
4. reduce 입력은 완료된 모든 map 결과의 manifest를 포함한다. 최종 응답 전 서버가 `union(chunk ranges) == [0, collected_count)`와 map 성공 수, 최종 출력 스키마를 검증한다.
5. Discord 페이지 수집 자체도 첫/마지막 경계, 페이지 연속성, 중복 제거 후 개수로 검증한다. 수집 중 삭제·편집 또는 권한 변경으로 완전한 스냅샷을 보장할 수 없으면 성공이 아니라 명시적 실패로 분류한다.
6. 검증 뒤 원문, 청크, 중간 요약과 manifest를 폐기한다. 감사 로그에는 원문·요약문 대신 요청 ID, 시간 범위, 개수, 토큰 사용량, 비용, 단계별 결과 코드만 남긴다.

**추론:** 이 계약은 “수집된 원문 전체가 처리 계보에 들어갔음”은 증명하지만 요약의 의미론적 충실도까지 증명하지는 않는다. 합성 대화에 심은 결정·할 일·미해결 질문 marker의 recall과 섹션 스키마를 별도로 평가해야 한다.

## 개인정보, 저장, 학습, 삭제

| 후보 | 학습 사용 | 기본 저장·보존 | 삭제/ZDR 및 `PRI-001` 영향 |
|---|---|---|---|
| OpenAI API | API 입력·출력은 기본적으로 모델 학습에 사용하지 않으며 명시적 opt-in 예외 | abuse monitoring log에 고객 콘텐츠가 포함될 수 있고 기본 최대 30일. Responses API는 기본 또는 `store=true`에서 application state를 적어도 30일 저장; background mode는 polling을 위해 약 10분 저장 | 승인 대상 고객만 Modified Abuse Monitoring/ZDR 가능. ZDR이면 `store=false`로 취급되지만 background mode는 ZDR 비호환. 상태 저장 없는 endpoint/config를 명시적으로 써야 함 |
| Anthropic API | 상업 제품의 chat/API 입력·출력은 Development Partner Program·명시적 feedback 등 opt-in이 아니면 학습하지 않음 | API 입력·출력을 기본 30일 내 자동 삭제. 정책 집행 또는 법률상 더 오래 보존 가능 | 승인된 enterprise API 고객은 별도 ZDR 계약 가능하며 법률·오용 방지 예외와 UserSafety classifier 결과 보존이 있음 |
| Gemini Developer API **Paid** | paid service의 prompt/response는 제품 개선에 사용하지 않음. Free tier는 가격표상 개선에 사용됨 | paid prompt/response도 금지 사용 탐지·법적 공개 목적으로 55일 보존. 여러 국가의 시설에 일시 저장/cache 가능 | 공개 문서상 일반 paid tier의 ZDR 또는 개별 prompt 조기 삭제 수단을 확인하지 못함. 따라서 `PRI-001`을 “우리 저장소 비영구”로만 해석해도 외부 55일 보존 위험이 남음 |

공식 근거:

- OpenAI: [Data controls in the OpenAI platform](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint), [How your data is used](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/)
- Anthropic: [Commercial data retention](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [Commercial model training](https://privacy.anthropic.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training), [Zero data retention scope](https://privacy.anthropic.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to)
- Google: [Gemini API Additional Terms — Paid Services](https://ai.google.dev/gemini-api/terms), [Abuse monitoring — How We Handle Data](https://ai.google.dev/gemini-api/docs/usage-policies), [Pricing tier data-use labels](https://ai.google.dev/gemini-api/docs/pricing)

**정책 충돌/소유자 확인 필요:** `PRI-001`은 프로젝트의 영구 저장·로그 금지로는 충족 가능하지만, “외부 공급자도 원문을 보존하면 안 됨”을 뜻한다면 기본 OpenAI/Anthropic 30일과 Gemini Paid 55일은 모두 통과하지 못한다. 이 해석에서는 승인형 ZDR 계약 가능성이 확인된 OpenAI/Anthropic만 후속 후보이며 실제 자격·계약은 미확인이다.

## 가격과 사용량 시나리오

### 계산 가정

- 공식 가격 확인일: 2026-07-20. 모두 USD / 1M tokens, 표준 동기 text 가격이며 cache, Batch, tool, 세금은 제외한다.
- OpenAI `gpt-5-mini`: input $0.25, output $2.00.
- Anthropic `claude-haiku-4-5`: input $1.00, output $5.00.
- Google `gemini-2.5-flash` Paid: text input $0.30, output(생각 token 포함) $2.50.
- 환율은 가격 사실이 아니라 예산용 보수적 **가정** `1 USD = 1,500원`이다. 실제 카드 환율·해외 결제 수수료·세금으로 재계산해야 한다.
- 계층 요약의 보수적 계산식: 총 input `1.05 × 원문 tokens`, 총 output `0.05 × 원문 tokens + 최종 2,000 tokens`. prompt/schema/retry token은 제외했으므로 admission control에는 별도 여유가 필요하다.

| 시나리오 | 합성 원문 | 계산 input / output | OpenAI | Anthropic | Google |
|---|---:|---:|---:|---:|---:|
| 소규모 | 10k tokens | 10.5k / 2.5k | $0.0076 / 약 11원 | $0.0230 / 약 35원 | $0.0094 / 약 14원 |
| 중간 | 100k tokens | 105k / 7k | $0.0403 / 약 60원 | $0.1400 / 약 210원 | $0.0490 / 약 74원 |
| 상한 | 400k tokens | 420k / 22k | $0.1490 / 약 224원 | $0.5300 / 약 795원 | $0.1810 / 약 272원 |

400k는 Discord의 공식 24시간 최대치가 아니라 비용·계층 처리 비교용 합성 상한이다. 실제 Discord 원문은 사용하지 않았다. Anthropic Haiku는 200k 컨텍스트이므로 상한 시나리오에서 청크가 필수고, 나머지도 출력 여유와 안정적 검증을 위해 청크가 필요할 수 있다.

### 월 3만 원에서 요청별 상한을 정하는 데 필요한 시나리오

월별로 최소 다음 네 값을 소유자가 정하거나 운영 계측으로 얻어야 한다.

- `B_fixed`: 백업·도메인 등 AI 외 신규 월 비용
- `N_small`, `N_medium`, `N_upper`: 월 요청 수 분포와 동시 요청 최대치
- `R`: 120초 안에 허용할 유료 재시도 횟수(부분 성공 호출도 과금될 수 있음)
- `FX_buffer`: 환율·세금·가격 변경 여유율

AI 월 예산은 `B_ai = 30,000원 - B_fixed`, 요청별 admission 상한은 최소한 `B_ai / (N_small + N_medium + N_upper)`보다 작아야 한다. 동시에 사전 예상 비용을 `가격 × (모든 단계 최대 input/output) × (1 + R)`로 계산해 요청별 상한 이하일 때만 시작한다.

예시로 `B_fixed=10,000원`, 월 100건이면 평균 AI 허용액은 200원/건이다. 위 가정에서는 OpenAI 상한 시나리오조차 재시도 전 약 224원이라 거부되며, Google 약 272원과 Anthropic 약 795원도 거부된다. 이는 공급자 추천이 아니라 **요청 빈도·고정비·재시도 예산 없이는 요청별 상한을 확정할 수 없다는 계산 증거**다.

## 성공, 부분 처리, 비용 초과 판정

| 결과 | 판정 조건 | 사용자 응답 / 기록 |
|---|---|---|
| 성공 | 수집 범위 완전성, 모든 map 구간, reduce, 출력 스키마가 검증되고 120초와 비용 상한 이내 | 네 섹션 결과 반환; 감사에는 개수·사용 token·비용·완료 코드만 기록 |
| 사전 거부 | 예상 최대 token이 컨텍스트/rate/cost/deadline 예산을 넘음 | API 호출 없이 `RANGE_TOO_LARGE`, `COST_LIMIT`, `DEADLINE_NOT_FEASIBLE`와 범위 조정 안내 |
| 부분 처리 실패 | 하나 이상의 청크 누락/중복/timeout/429/5xx/안전 필터, batch per-request 실패, reduce 실패 또는 manifest 불일치 | 부분 요약을 반환하지 않고 `PARTIAL_PROCESSING` 및 처리/전체 청크 수만 알림 |
| 비용 상한 초과 | 호출 전 예약 비용이 상한 초과, 또는 실제 누적 usage가 남은 단계의 최대 예약액을 남기지 못함 | 다음 호출을 시작하지 않고 `COST_LIMIT`; 이미 든 비용은 원장에 포함 |
| deadline 실패 | 어느 단계든 120초 도달 또는 남은 시간으로 필수 단계를 완료할 수 없음 | 진행 중 호출 취소를 시도하고 `TIMEOUT`; 늦게 도착한 결과는 사용자 성공으로 승격하지 않음 |
| 공급자 결과 불완전 | 정상 HTTP라도 finish/stop reason, usage, 구조화 출력 또는 필수 섹션이 불완전 | 성공 금지, `PROVIDER_INCOMPLETE` |

**추론:** 비용 상한은 공급자 콘솔 월 cap만으로 구현할 수 없다. 요청 시작 전 최악 비용을 예약하고, 각 응답의 공식 usage 필드로 실제 비용을 확정하며, timeout 뒤에도 완료될 수 있는 호출까지 비용 원장에 잡는 애플리케이션 측 원자적 예산 장부가 필요하다.

## 비교와 잠정 결론

| 기준 | OpenAI GPT-5 mini | Anthropic Haiku 4.5 | Gemini 2.5 Flash Paid |
|---|---|---|---|
| 긴 입력 여유 | 400k | 200k | 약 1.05M |
| 합성 상한 예상비 | 가장 낮음 | 가장 높음 | 두 번째 |
| 기본 외부 보존 | 최대 30일; endpoint별 state 주의 | 기본 30일 | 55일 |
| 승인형 ZDR 공식 경로 | 있음 | 있음 | 일반 paid tier에서 미확인 |
| 2분 보장 | 없음 | 없음 | 없음 |
| vendor lock-in | 모델별 token 계산, usage/finish 상태, 정책이 달라 adapter와 교체 검증 필요 | 동일 | 동일 |

### 잠정 추천

기술 선택은 보류한다. 다음 단계의 **검증 우선 후보**는 상태 저장을 끈 OpenAI `gpt-5-mini` 동기 API다. 공개 가격에서 합성 상한 비용이 가장 낮고 Tier 1 TPM이 상한 시나리오와 같은 규모이며, 400k 컨텍스트와 승인형 ZDR 경로가 확인된다. 다만 2분 지연·한국어 요약 완전성·ZDR 자격은 확인되지 않아 선택 근거가 아직 부족하다.

### 가장 강한 대안

Gemini `gemini-2.5-flash` Paid는 약 1.05M 입력 창과 낮은 가격이 강점이라 단일 호출 가능성을 최대화한다. 반면 공식 정책의 55일 abuse-monitoring 보존과 일반 paid ZDR 미확인이 개인정보 해석에 따라 배제 조건이 될 수 있다. Anthropic Haiku 4.5는 명확한 실패/rate 문서와 승인형 ZDR이 장점이지만 200k 창과 이 비교의 높은 비용 때문에 비용 우선 대안으로는 약하다.

## 위험, 미확인 사항, 필요한 검증

- **사실 공백:** 예상 Discord 24시간 메시지 token 분포, 월 요청 횟수, 동시성, `B_fixed`, 실제 계정 rate limit, 세금/환율이 없다.
- **품질 공백:** 어떤 후보도 계층 요약의 사실 recall과 네 섹션 완전성을 공식 문서로 보장하지 않는다.
- **지연 공백:** 어떤 후보도 이 workload의 120초 p95/p99를 공개 보장하지 않는다.
- **개인정보 공백:** Discord 구성원 고지·동의, 국외 이전, 삭제 요청과 공급자 보존의 법적 적합성은 이 기술 조사에서 판단하지 않았다.
- **운영 위험:** retry는 지연과 비용을 함께 늘리고, timeout/취소가 과금 취소를 뜻하지 않는다. 공급자 장애 시 다른 공급자로 자동 전송하면 개인정보 처리자가 늘어나므로 별도 승인 없이 fallback하지 않는다.
- **유지보수/교체:** 모델 alias 대신 고정 snapshot/안정 모델 여부, 가격·한도·보존 정책을 정기 재확인해야 한다. 교체 시 같은 합성 corpus와 비용식으로 재검증한다.

별도 승인 후 필요한 최소 Spike는 실제 Discord 원문이 아닌 결정·할 일·미해결 질문 marker가 포함된 합성 10k/100k/400k token corpus로 후보별 (1) 전체 manifest 통과율, (2) marker recall, (3) p95/p99 wall time, (4) 실제 usage와 비용, (5) timeout·429·부분 실패 계약을 측정하는 것이다. 현재 요청에 따라 실행하지 않았다.

### 결정을 뒤집을 조건

- `PRI-001`이 공급자 측 보존도 금지하는 것으로 확정되고 ZDR 계약을 얻지 못하면 해당 후보를 제외한다.
- 실제 24시간 p99 token이 모델/계정 TPM 또는 120초 처리량을 넘으면 단일 호출 후보를 제외하고 계층 전략 또는 범위 정책을 재논의한다.
- 합성 상한의 재시도 포함 요청비가 확정 상한을 넘거나 월 분포가 `B_ai`를 넘으면 더 저렴한 모델, 호출 수 감소 또는 제품 범위 조정이 필요하다.
- 합성 marker recall/출력 계약/120초 목표를 가장 강한 대안이 유의하게 더 안정적으로 만족하면 검증 우선순위를 바꾼다.

## 정확한 다음 프롬프트

```text
AGENTS.md의 필수 문서를 순서대로 읽고 docs/prompts/spike.md 절차를 따라
docs/research/technology-options/summary-api-constraints.md의 검증 공백만 대상으로,
실제 Discord 원문 없이 합성 10k/100k/400k token 대화 corpus와 완전성 manifest를 설계해.
아직 API를 호출하거나 결제하지 말고, 후보별 성공/실패 기준·측정 항목·예상 최대 비용을 담은
Spike 계획만 전용 문서로 작성해. PRI-001과 120초 전체 deadline을 위반하지 마.
```

## 2026-07-27 model refresh

Official model and data-control pages were rechecked for the owner's same-day
completion goal.

- Recommended implementation target:
  OpenAI `gpt-5.4-mini-2026-03-17`, Responses API, `store: false`, reasoning
  disabled, structured output. It has a 400,000-token context window,
  128,000-token maximum output, and text pricing of USD 0.75/M input and
  USD 4.50/M output. The pinned snapshot avoids an alias changing silently.
- Strong long-context alternative: Gemini `gemini-3.6-flash`, with a
  1,048,576-token input limit and USD 1.50/M input, USD 7.50/M output.
- Cost-floor alternative: Gemini `gemini-3.5-flash-lite`, USD 0.30/M input and
  USD 2.50/M output. It is not selected without a Korean-summary fidelity
  benchmark.
- Anthropic Haiku 4.5 remains a viable fast alternative but its 200,000-token
  context and USD 1/M input, USD 5/M output do not improve the primary path.

This is an implementation recommendation, not production activation evidence.
OpenAI API content is not used for training by default, but default abuse
monitoring may retain content for up to 30 days; `store: false` avoids Responses
application-state storage but is not equivalent to approved Zero Data
Retention. A provider credential, owner acceptance of this retention boundary,
and a synthetic Korean marker-recall/deadline spike remain required before
real Discord messages are sent.
