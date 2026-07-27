import type { RiotGameObserver } from "../game/observation-state.ts";

const KR_SPECTATOR_ORIGIN = "https://kr.api.riotgames.com";
const PUUID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const MAX_RESPONSE_BYTES = 16_384;

export class RiotSpectatorObserver implements RiotGameObserver {
  private rateLimitedUntil = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    if (apiKey.length === 0 || /[\r\n\0]/u.test(apiKey)) {
      throw new Error("riot_observer_credential_invalid");
    }
  }

  async observe(input: {
    platformId: string;
    puuid: string;
    signal: AbortSignal;
  }): ReturnType<RiotGameObserver["observe"]> {
    const puuid = input.puuid.trim();
    if (input.platformId.toUpperCase() !== "KR" || !PUUID_PATTERN.test(puuid)) {
      return { state: "unknown", reasonCode: "riot_target_invalid" };
    }
    if (this.now() < this.rateLimitedUntil) {
      return { state: "unknown", reasonCode: "riot_rate_limited" };
    }
    try {
      const response = await this.fetchImpl(
        `${KR_SPECTATOR_ORIGIN}/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`,
        {
          method: "GET",
          headers: { "X-Riot-Token": this.apiKey, Accept: "application/json" },
          redirect: "manual",
          signal: input.signal,
        },
      );
      if (response.status === 404) return { state: "inactive" };
      if (response.status === 429) {
        this.rateLimitedUntil = this.now() + retryAfterMilliseconds(response);
        return { state: "unknown", reasonCode: "riot_rate_limited" };
      }
      if (response.status !== 200) {
        return { state: "unknown", reasonCode: "riot_unavailable" };
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        return { state: "unknown", reasonCode: "riot_response_invalid" };
      }
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
        return { state: "unknown", reasonCode: "riot_response_invalid" };
      }
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const gameId = positiveInteger(parsed.gameId);
      const queueId = positiveInteger(parsed.gameQueueConfigId);
      const startedAtMilliseconds = positiveInteger(parsed.gameStartTime);
      if (
        gameId === undefined ||
        queueId === undefined ||
        startedAtMilliseconds === undefined
      ) {
        return { state: "unknown", reasonCode: "riot_response_invalid" };
      }
      return {
        state: "active",
        gameId: String(gameId),
        queueId,
        startedAt: new Date(startedAtMilliseconds),
      };
    } catch {
      return { state: "unknown", reasonCode: "riot_unavailable" };
    }
  }
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function retryAfterMilliseconds(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 1_000;
}
