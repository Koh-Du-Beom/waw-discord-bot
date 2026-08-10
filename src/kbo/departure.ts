export type KboDepartureInput = {
  operationId: string;
  guildId: string;
  discordUserId: string;
  departedAt: Date;
};

export type KboDepartureResult = "departed" | "not_enrolled";

export type KboDepartureStore = {
  listActiveDiscordUserIds(guildId: string): Promise<readonly string[]>;
  depart(input: KboDepartureInput): Promise<KboDepartureResult>;
};

export function assertKboDepartureInput(input: KboDepartureInput): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.operationId) ||
    !/^[1-9][0-9]{16,19}$/.test(input.guildId) ||
    !/^[1-9][0-9]{16,19}$/.test(input.discordUserId) ||
    Number.isNaN(input.departedAt.getTime())
  ) {
    throw new TypeError("invalid KBO departure input");
  }
}
