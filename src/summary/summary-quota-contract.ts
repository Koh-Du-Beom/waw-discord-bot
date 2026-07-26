const KOREAN_TIME_ZONE = "Asia/Seoul";
const cursorPattern = /^[A-Za-z0-9_-]{16,512}$/u;

export type SummaryQuotaReservationInput = {
  operationId: string;
  guildId: string;
  discordUserId: string;
  receivedAt: Date;
};

export type SummaryQuotaReservationDecision =
  | { kind: "reserved"; quotaDate: string; used: number; effectiveLimit: number }
  | { kind: "duplicate"; quotaDate: string; used: number; effectiveLimit: number }
  | { kind: "disabled"; quotaDate: string }
  | { kind: "exhausted"; quotaDate: string; used: number; effectiveLimit: number };

export interface SummaryQuotaReservationPort {
  reserve(
    input: SummaryQuotaReservationInput,
  ): Promise<SummaryQuotaReservationDecision>;
}

export function koreanQuotaDate(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("invalid quota instant");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function parseCommandLogPageInput(input: {
  limit?: number;
  cursor?: string;
}): { limit: number; cursor?: string } {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("invalid command log limit");
  }
  if (input.cursor !== undefined && !cursorPattern.test(input.cursor)) {
    throw new Error("invalid command log cursor");
  }
  return {
    limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  };
}
