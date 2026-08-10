export type KboDailyCreditClaimInput = {
  operationId: string;
  claimId: string;
  guildId: string;
  discordUserId: string;
  claimedAt: Date;
};

export type KboDailyCreditClaimResult =
  | {
      status: "claimed";
      claimDate: string;
      availablePaid: bigint;
      debtPaid: bigint;
    }
  | {
      status: "already_claimed" | "not_enrolled" | "duplicate_operation";
      claimDate: string;
    };

export type KboDailyCreditClaimStore = {
  claim(input: KboDailyCreditClaimInput): Promise<KboDailyCreditClaimResult>;
};

const dailyCredit = 50_000n;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;
const kstDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  calendar: "iso8601",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export class KboDailyCreditClaimInputError extends Error {
  constructor() {
    super("invalid KBO daily credit claim input");
    this.name = "KboDailyCreditClaimInputError";
  }
}

export function assertKboDailyCreditClaimInput(input: KboDailyCreditClaimInput): void {
  if (
    !operationIdPattern.test(input.operationId) ||
    !opaqueIdPattern.test(input.claimId) ||
    !snowflakePattern.test(input.guildId) ||
    !snowflakePattern.test(input.discordUserId) ||
    !Number.isFinite(input.claimedAt.getTime())
  ) {
    throw new KboDailyCreditClaimInputError();
  }
}

export function toKstClaimDate(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) throw new KboDailyCreditClaimInputError();
  const parts = Object.fromEntries(
    kstDateFormatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function allocateDailyCredit(correctionDebt: bigint): {
  availablePaid: bigint;
  debtPaid: bigint;
} {
  if (correctionDebt < 0n) throw new Error("invalid correction debt");
  const debtPaid = correctionDebt < dailyCredit ? correctionDebt : dailyCredit;
  return { availablePaid: dailyCredit - debtPaid, debtPaid };
}
