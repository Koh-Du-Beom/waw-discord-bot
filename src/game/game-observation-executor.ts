import {
  ACCEPTED_OBSERVATION_POLICY,
  compareGameEvidence,
  riotGameKey,
  type ComparisonState,
  type EvidenceState,
  type ObservationPolicy,
} from "./observation-state.ts";

export type NormalizedGameObservation = {
  platformId: string;
  gameId: string;
  queueId: number;
  gameStartedAt: Date;
  discordUserId: string;
  observedAt: Date;
  riot: {
    state: EvidenceState;
    evidenceCode: string;
    generation: number;
  };
  goLive: {
    state: EvidenceState;
    evidenceCode: string;
    generation: number;
    interruptedAt?: Date;
  };
};

export type PersistedGameObservation = NormalizedGameObservation & {
  gameKey: string;
  comparisonState: ComparisonState;
  policyVersion: number;
};

export type GameObservationStore = {
  record(
    observation: PersistedGameObservation,
  ): Promise<"recorded" | "duplicate" | "stale">;
};

export class GameObservationInputError extends Error {}

export class GameObservationExecutor {
  constructor(
    private readonly store: GameObservationStore,
    private readonly policy: ObservationPolicy = ACCEPTED_OBSERVATION_POLICY,
    private readonly policyVersion = 1,
    private readonly observedQueueIds: ReadonlySet<number> = new Set([420]),
  ) {}

  async execute(
    input: NormalizedGameObservation,
  ): Promise<"recorded" | "duplicate" | "stale" | "queue_ignored"> {
    validate(input);
    if (!this.observedQueueIds.has(input.queueId)) return "queue_ignored";

    const comparisonState = compareGameEvidence(
      {
        riot: input.riot.state,
        goLive: input.goLive.state,
        gameStartedAt: input.gameStartedAt,
        ...(input.goLive.interruptedAt === undefined
          ? {}
          : { goLiveInterruptedAt: input.goLive.interruptedAt }),
      },
      input.observedAt,
      this.policy,
    );

    return this.store.record({
      ...input,
      gameKey: riotGameKey(input.platformId, input.gameId),
      comparisonState,
      policyVersion: this.policyVersion,
    });
  }
}

function validate(input: NormalizedGameObservation): void {
  if (
    input.platformId.trim().length === 0 ||
    input.gameId.trim().length === 0 ||
    input.discordUserId.trim().length === 0 ||
    input.riot.evidenceCode.trim().length === 0 ||
    input.goLive.evidenceCode.trim().length === 0
  ) {
    throw new GameObservationInputError("required observation field is empty");
  }
  if (
    !Number.isSafeInteger(input.queueId) ||
    input.queueId <= 0 ||
    !Number.isSafeInteger(input.riot.generation) ||
    input.riot.generation < 0 ||
    !Number.isSafeInteger(input.goLive.generation) ||
    input.goLive.generation < 0 ||
    !Number.isFinite(input.gameStartedAt.getTime()) ||
    !Number.isFinite(input.observedAt.getTime()) ||
    input.gameStartedAt.getTime() > input.observedAt.getTime() ||
    (input.goLive.interruptedAt !== undefined &&
      (!Number.isFinite(input.goLive.interruptedAt.getTime()) ||
        input.goLive.interruptedAt.getTime() > input.observedAt.getTime()))
  ) {
    throw new GameObservationInputError("invalid observation value");
  }
}
