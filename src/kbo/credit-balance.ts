export type KboCreditBalanceInput = {
  guildId: string;
  discordUserId: string;
};

export type KboCreditBalanceResult =
  | {
      status: "active";
      availableBalance: bigint;
      correctionDebt: bigint;
    }
  | { status: "not_enrolled" };

export type KboCreditBalanceStore = {
  read(input: KboCreditBalanceInput): Promise<KboCreditBalanceResult>;
};

const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboCreditBalanceInputError extends Error {
  constructor() {
    super("invalid KBO credit balance input");
    this.name = "KboCreditBalanceInputError";
  }
}

export function assertKboCreditBalanceInput(input: KboCreditBalanceInput): void {
  if (
    !snowflakePattern.test(input.guildId) ||
    !snowflakePattern.test(input.discordUserId)
  ) {
    throw new KboCreditBalanceInputError();
  }
}
