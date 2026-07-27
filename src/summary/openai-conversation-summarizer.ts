import type {
  ConversationSummarizer,
  SummarySections,
} from "./conversation-summary.ts";
import { SummaryCapacityError } from "./conversation-summary.ts";

const ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-mini-2026-03-17";
const MAX_RESPONSE_BYTES = 65_536;
const MAX_REQUEST_BYTES = 300_000;
const MAX_OUTPUT_TOKENS = 4_096;
const PROVIDER_TIMEOUT_MILLISECONDS = 120_000;
const sectionSchema = {
  type: "array",
  items: { type: "string" },
} as const;

export class OpenAiConversationSummarizer implements ConversationSummarizer {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMilliseconds = PROVIDER_TIMEOUT_MILLISECONDS,
  ) {
    if (
      apiKey.length === 0 ||
      /[\r\n\0]/u.test(apiKey) ||
      !Number.isSafeInteger(timeoutMilliseconds) ||
      timeoutMilliseconds <= 0
    ) {
      throw new Error("summary_provider_credential_invalid");
    }
  }

  async summarize(
    input: Parameters<ConversationSummarizer["summarize"]>[0],
  ): Promise<SummarySections> {
    const body = this.validate(input);
    const response = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(this.timeoutMilliseconds),
      ]),
      body,
    });
    if (response.status !== 200) throw new Error("summary_provider_unavailable");
    const responseBody = await response.text();
    if (Buffer.byteLength(responseBody) > MAX_RESPONSE_BYTES) {
      throw new Error("summary_provider_response_invalid");
    }
    return parseSections(responseBody);
  }

  validate(
    input: Parameters<ConversationSummarizer["summarize"]>[0],
  ): string {
    validateManifest(input.messages.length, input.manifest);
    const body = JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions:
        "주어진 전체 대화를 한국어로 요약한다. 사실을 추가하지 말고 네 섹션을 분리한다.",
      input: JSON.stringify(
        input.messages.map((message, ordinal) => ({
          ordinal,
          createdAt: message.createdAt.toISOString(),
          author: message.authorLabel,
          content: message.content,
        })),
      ),
      text: {
        format: {
          type: "json_schema",
          name: "conversation_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "coreDiscussion",
              "decisions",
              "actionItems",
              "unresolved",
            ],
            properties: {
              coreDiscussion: sectionSchema,
              decisions: sectionSchema,
              actionItems: sectionSchema,
              unresolved: sectionSchema,
            },
          },
        },
      },
    });
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new SummaryCapacityError("summary input exceeds provider budget");
    }
    return body;
  }
}

function validateManifest(
  messageCount: number,
  manifest: Parameters<ConversationSummarizer["summarize"]>[0]["manifest"],
): void {
  let next = 0;
  for (const chunk of manifest) {
    if (
      chunk.firstOrdinal !== next ||
      chunk.lastOrdinal < chunk.firstOrdinal ||
      chunk.count !== chunk.lastOrdinal - chunk.firstOrdinal + 1
    ) {
      throw new Error("summary_manifest_invalid");
    }
    next = chunk.lastOrdinal + 1;
  }
  if (next !== messageCount) throw new Error("summary_manifest_invalid");
}

function parseSections(body: string): SummarySections {
  try {
    const response = JSON.parse(body) as {
      output?: Array<{
        type?: unknown;
        content?: Array<{ type?: unknown; text?: unknown }>;
      }>;
    };
    const text = response.output
      ?.find((item) => item.type === "message")
      ?.content?.find((item) => item.type === "output_text")?.text;
    const sections = JSON.parse(String(text)) as Record<string, unknown>;
    for (const key of [
      "coreDiscussion",
      "decisions",
      "actionItems",
      "unresolved",
    ]) {
      if (
        !Array.isArray(sections[key]) ||
        !sections[key].every((item) => typeof item === "string")
      ) {
        throw new Error();
      }
    }
    return sections as SummarySections;
  } catch {
    throw new Error("summary_provider_response_invalid");
  }
}
