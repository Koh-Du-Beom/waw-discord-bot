export function observationFeatureEnabled(
  value: string | undefined,
): boolean {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error("invalid game observation feature gate");
}
