const cursorPattern = /^[A-Za-z0-9_-]{16,512}$/u;

export type SummaryQuotaReservationInput = {
  operationId: string;
  guildId: string;
  discordUserId: string;
  receivedAt: Date;
};

export type SummaryQuotaReservationDecision =
  | { kind: "reserved" }
  | { kind: "duplicate"; decision: "reserved" | "cooldown" }
  | { kind: "cooldown"; availableAt: Date };

export interface SummaryQuotaReservationPort {
  reserve(
    input: SummaryQuotaReservationInput,
  ): Promise<SummaryQuotaReservationDecision>;
}

export function assertQuotaInstant(instant: Date): void {
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("invalid quota instant");
  }
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
