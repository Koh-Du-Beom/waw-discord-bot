import { Events } from "discord.js";

import type {
  DiscordVoiceSource,
  GameObservationScheduler,
} from "../../game/observation-scheduler.ts";

type EventListener = (...arguments_: readonly unknown[]) => void;

export type DiscordVoiceEventSource = {
  on(event: string, listener: EventListener): unknown;
  off(event: string, listener: EventListener): unknown;
};

export type VoiceSchedulerSink = Pick<
  GameObservationScheduler,
  "observeVoice" | "disconnect" | "reconcile"
>;

export function createDiscordVoiceSource(input: {
  fetchMembers(guildId: string, discordUserIds: readonly string[]): Promise<
    readonly { discordUserId: string; selfStream: boolean | null }[]
  >;
}): DiscordVoiceSource {
  return { reconcile: input.fetchMembers };
}

export function attachDiscordVoiceObservationAdapter(input: {
  source: DiscordVoiceEventSource;
  scheduler: VoiceSchedulerSink;
  guildId: string;
  now: () => Date;
  reportFailure: () => void;
}): { detach(): Promise<void>; whenIdle(): Promise<void> } {
  let detached = false;
  let queue = Promise.resolve();
  const publish = (action: () => void | Promise<unknown>) => {
    if (detached) return;
    queue = queue.then(action).then(() => undefined).catch(input.reportFailure);
  };
  const voice = (...arguments_: readonly unknown[]) => {
    const state = normalizeVoiceState(arguments_[1] ?? arguments_[0]);
    if (!state || state.guildId !== input.guildId) return;
    publish(() => {
      input.scheduler.observeVoice({ ...state, observedAt: input.now() });
    });
  };
  const reconcile = () => publish(() => input.scheduler.reconcile(input.guildId));
  const disconnect = () => publish(() => input.scheduler.disconnect(input.now()));
  const listeners = new Map<string, EventListener>([
    [Events.VoiceStateUpdate, voice],
    [Events.ClientReady, reconcile],
    [Events.ShardResume, reconcile],
    [Events.ShardReconnecting, disconnect],
    [Events.ShardDisconnect, disconnect],
  ]);
  for (const [event, listener] of listeners) input.source.on(event, listener);
  reconcile();

  return {
    async detach() {
      if (detached) return;
      detached = true;
      for (const [event, listener] of listeners) input.source.off(event, listener);
      await queue;
    },
    whenIdle: async () => queue,
  };
}

function normalizeVoiceState(value: unknown): {
  guildId: string;
  discordUserId: string;
  selfStream: boolean | null;
} | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const state = value as {
    guild?: { id?: unknown };
    id?: unknown;
    member?: { id?: unknown };
    selfStream?: unknown;
    streaming?: unknown;
  };
  const guildId = state.guild?.id;
  const discordUserId = state.id ?? state.member?.id;
  const selfStream = state.selfStream ?? state.streaming;
  if (
    typeof guildId !== "string" ||
    typeof discordUserId !== "string" ||
    (typeof selfStream !== "boolean" && selfStream !== null)
  ) {
    return undefined;
  }
  return { guildId, discordUserId, selfStream };
}
