import type { EvidenceState } from "./observation-state.ts";

export type DiscordStreamObservation = {
  guildId: string;
  discordUserId: string;
  state: EvidenceState;
  observedAt: Date;
  generation: number;
  evidenceCode:
    | "voice_state_event"
    | "reconciled"
    | "gateway_unavailable"
    | "stale";
};

export class DiscordStreamObserver {
  private generation = 0;
  private readonly states = new Map<string, DiscordStreamObservation>();

  observe(input: {
    guildId: string;
    discordUserId: string;
    selfStream: boolean | null | undefined;
    observedAt: Date;
  }): DiscordStreamObservation {
    const observation: DiscordStreamObservation = {
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      state:
        input.selfStream === true
          ? "active"
          : input.selfStream === false
            ? "inactive"
            : "unknown",
      observedAt: input.observedAt,
      generation: ++this.generation,
      evidenceCode: "voice_state_event",
    };
    this.states.set(key(input.guildId, input.discordUserId), observation);
    return observation;
  }

  reconcile(input: {
    guildId: string;
    observedAt: Date;
    members: readonly { discordUserId: string; selfStream: boolean | null }[];
    baselineGenerations?: ReadonlyMap<string, number | undefined>;
  }): readonly DiscordStreamObservation[] {
    return input.members.flatMap((member) => {
      const stateKey = key(input.guildId, member.discordUserId);
      if (
        input.baselineGenerations !== undefined &&
        this.states.get(stateKey)?.generation !==
          input.baselineGenerations.get(member.discordUserId)
      ) {
        return [];
      }
      const observation = this.observe({
        guildId: input.guildId,
        discordUserId: member.discordUserId,
        selfStream: member.selfStream,
        observedAt: input.observedAt,
      });
      const reconciled = { ...observation, evidenceCode: "reconciled" as const };
      this.states.set(stateKey, reconciled);
      return [reconciled];
    });
  }

  disconnect(observedAt: Date): void {
    for (const [stateKey, previous] of this.states) {
      this.states.set(stateKey, {
        ...previous,
        state: "unknown",
        observedAt,
        generation: ++this.generation,
        evidenceCode: "gateway_unavailable",
      });
    }
  }

  current(guildId: string, discordUserId: string): DiscordStreamObservation | undefined {
    return this.states.get(key(guildId, discordUserId));
  }

  currentAt(
    guildId: string,
    discordUserId: string,
    observedAt: Date,
    freshnessMilliseconds: number,
  ): DiscordStreamObservation | undefined {
    const current = this.current(guildId, discordUserId);
    if (
      current === undefined ||
      current.state === "unknown" ||
      observedAt.getTime() - current.observedAt.getTime() < freshnessMilliseconds
    ) {
      return current;
    }
    return { ...current, state: "unknown", evidenceCode: "stale" };
  }
}

function key(guildId: string, discordUserId: string): string {
  return `${guildId}:${discordUserId}`;
}
