import type { GameObservationExecutor } from "./game-observation-executor.ts";
import {
  DiscordStreamObserver,
  type DiscordStreamObservation,
} from "./discord-stream-observer.ts";
import type { RiotGameObserver } from "./observation-state.ts";

export type ObservedRiotLink = {
  linkId: string;
  guildId: string;
  discordUserId: string;
  platformId: string;
  puuid: string;
};

export type ObservationTargetSource = {
  listTargets(): Promise<readonly ObservedRiotLink[]>;
};

export type DiscordVoiceSource = {
  reconcile(guildId: string): Promise<
    readonly { discordUserId: string; selfStream: boolean | null }[]
  >;
};

type GameObservationSink = Pick<GameObservationExecutor, "execute">;

export type SchedulerPollResult =
  | "recorded"
  | "duplicate"
  | "stale"
  | "queue_ignored"
  | "already_running"
  | "no_active_game";

type ActiveGame = {
  gameId: string;
  queueId: number;
  startedAt: Date;
};

export class GameObservationScheduler {
  private readonly streams = new DiscordStreamObserver();
  private readonly inFlight = new Set<string>();
  private readonly generations = new Map<string, number>();
  private readonly activeGames = new Map<string, ActiveGame>();
  private readonly interruptedAt = new Map<string, Date>();

  constructor(
    private readonly input: {
      targets: ObservationTargetSource;
      riot: RiotGameObserver;
      voice: DiscordVoiceSource;
      observations: GameObservationSink;
      now: () => Date;
      timeoutMilliseconds: number;
    },
  ) {}

  observeVoice(input: {
    guildId: string;
    discordUserId: string;
    selfStream: boolean | null | undefined;
    observedAt?: Date;
  }): DiscordStreamObservation {
    const previous = this.streams.current(input.guildId, input.discordUserId);
    const observedAt = input.observedAt ?? this.input.now();
    const current = this.streams.observe({ ...input, observedAt });
    const memberKey = key(input.guildId, input.discordUserId);
    if (previous?.state === "active" && current.state === "inactive") {
      this.interruptedAt.set(memberKey, observedAt);
    } else if (current.state === "active") {
      this.interruptedAt.delete(memberKey);
    }
    return current;
  }

  disconnect(observedAt = this.input.now()): void {
    this.streams.disconnect(observedAt);
  }

  async reconcile(guildId: string): Promise<readonly DiscordStreamObservation[]> {
    const observedAt = this.input.now();
    const members = await this.input.voice.reconcile(guildId);
    const observations = this.streams.reconcile({ guildId, observedAt, members });
    for (const observation of observations) {
      const memberKey = key(guildId, observation.discordUserId);
      if (observation.state === "active") this.interruptedAt.delete(memberKey);
    }
    return observations;
  }

  async tick(): Promise<ReadonlyMap<string, SchedulerPollResult>> {
    const targets = await this.input.targets.listTargets();
    const results = await Promise.all(
      targets.map(async (target) => [target.linkId, await this.poll(target)] as const),
    );
    return new Map(results);
  }

  async poll(target: ObservedRiotLink): Promise<SchedulerPollResult> {
    if (this.inFlight.has(target.linkId)) return "already_running";
    this.inFlight.add(target.linkId);
    const generation = (this.generations.get(target.linkId) ?? 0) + 1;
    this.generations.set(target.linkId, generation);
    const controller = new AbortController();
    try {
      const riot = await deadline(
        this.input.riot.observe({
          platformId: target.platformId,
          puuid: target.puuid,
          signal: controller.signal,
        }),
        this.input.timeoutMilliseconds,
        controller,
      );
      if (this.generations.get(target.linkId) !== generation) return "stale";

      if (riot.state === "active") {
        this.activeGames.set(target.linkId, {
          gameId: riot.gameId,
          queueId: riot.queueId,
          startedAt: riot.startedAt,
        });
      }
      const game = this.activeGames.get(target.linkId);
      if (!game) return "no_active_game";
      const observedAt = this.input.now();
      const voice = this.streams.current(target.guildId, target.discordUserId);
      const interruption = this.interruptedAt.get(
        key(target.guildId, target.discordUserId),
      );
      const result = await this.input.observations.execute({
        platformId: target.platformId,
        gameId: game.gameId,
        queueId: game.queueId,
        gameStartedAt: game.startedAt,
        discordUserId: target.discordUserId,
        observedAt,
        riot: {
          state: riot.state,
          evidenceCode:
            riot.state === "active"
              ? "spectator_active"
              : riot.state === "inactive"
                ? "spectator_inactive"
                : riot.reasonCode,
          generation,
        },
        goLive: {
          state: voice?.state ?? "unknown",
          evidenceCode: voice?.evidenceCode ?? "gateway_unavailable",
          generation,
          ...(interruption === undefined ? {} : { interruptedAt: interruption }),
        },
      });
      if (riot.state === "inactive") this.activeGames.delete(target.linkId);
      return result;
    } finally {
      this.inFlight.delete(target.linkId);
    }
  }
}

async function deadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  controller: AbortController,
): Promise<T | { state: "unknown"; reasonCode: string }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<{ state: "unknown"; reasonCode: string }>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ state: "unknown", reasonCode: "riot_timeout" });
        }, milliseconds);
      }),
    ]);
  } catch {
    return { state: "unknown", reasonCode: "riot_unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function key(guildId: string, discordUserId: string): string {
  return `${guildId}:${discordUserId}`;
}
