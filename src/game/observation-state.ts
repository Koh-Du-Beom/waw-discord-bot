export type EvidenceState = "active" | "inactive" | "unknown";
export type ComparisonState =
  | "compliant"
  | "grace"
  | "interrupted"
  | "violation"
  | "unknown";

export type GameEvidence = {
  riot: EvidenceState;
  goLive: EvidenceState;
  gameStartedAt?: Date;
  goLiveInterruptedAt?: Date;
};

export type ObservationPolicy = {
  startGraceMilliseconds: number;
  interruptionAllowanceMilliseconds: number;
};

export const ACCEPTED_OBSERVATION_POLICY: ObservationPolicy = {
  startGraceMilliseconds: 5 * 60_000,
  interruptionAllowanceMilliseconds: 2 * 60_000,
};

export function compareGameEvidence(
  evidence: GameEvidence,
  observedAt: Date,
  policy: ObservationPolicy,
): ComparisonState {
  if (evidence.riot === "unknown" || evidence.goLive === "unknown") return "unknown";
  if (evidence.riot === "inactive") return "compliant";
  if (evidence.gameStartedAt === undefined) return "unknown";
  if (evidence.goLive === "active") return "compliant";
  if (
    observedAt.getTime() - evidence.gameStartedAt.getTime() <
    policy.startGraceMilliseconds
  ) {
    return "grace";
  }
  if (
    evidence.goLiveInterruptedAt !== undefined &&
    observedAt.getTime() - evidence.goLiveInterruptedAt.getTime() <
      policy.interruptionAllowanceMilliseconds
  ) {
    return "interrupted";
  }
  return "violation";
}

export function riotGameKey(platformId: string, gameId: string): string {
  if (!platformId || !gameId) throw new Error("platform and game ID are required");
  return `${platformId}:${gameId}`;
}

export type RiotGameObserver = {
  observe(input: {
    platformId: string;
    puuid: string;
    signal: AbortSignal;
  }): Promise<
    | { state: "active"; gameId: string; queueId: number; startedAt: Date }
    | { state: "inactive" }
    | { state: "unknown"; reasonCode: string }
  >;
};
