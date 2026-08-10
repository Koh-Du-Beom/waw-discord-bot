export function observationFeatureEnabled(
  value: string | undefined,
): boolean {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error("invalid game observation feature gate");
}

export function gameAlertChannelId(
  value: string | undefined,
  observationEnabled: boolean,
): string | undefined {
  if (!observationEnabled) return undefined;
  if (value === undefined || !/^[1-9][0-9]{16,19}$/u.test(value)) {
    throw new Error("invalid game alert channel");
  }
  return value;
}

export function observationTimingConfiguration(input: {
  reconciliationInterval?: string;
  freshness?: string;
}): {
  reconciliationIntervalMilliseconds: number;
  freshnessMilliseconds: number;
} {
  const reconciliationIntervalMilliseconds = milliseconds(
    input.reconciliationInterval,
    120_000,
  );
  const freshnessMilliseconds = milliseconds(input.freshness, 180_000);
  if (
    reconciliationIntervalMilliseconds < 30_000 ||
    freshnessMilliseconds <= reconciliationIntervalMilliseconds ||
    freshnessMilliseconds > 300_000
  ) {
    throw new Error("invalid Discord voice observation timing");
  }
  return { reconciliationIntervalMilliseconds, freshnessMilliseconds };
}

function milliseconds(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error("invalid Discord voice observation timing");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("invalid Discord voice observation timing");
  }
  return parsed;
}
