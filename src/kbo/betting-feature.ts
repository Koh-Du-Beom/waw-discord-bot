export function kboBettingFeatureEnabled(
  feature: string | undefined,
  rights: string | undefined,
): boolean {
  const featureEnabled = exactFlag(feature, "KBO betting");
  const rightsAuthorized = exactFlag(rights, "KBO data rights");
  return featureEnabled && rightsAuthorized;
}

function exactFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error(`invalid ${name} feature flag`);
}
