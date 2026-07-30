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
