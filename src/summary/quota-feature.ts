export function summaryQuotaEnforcementEnabled(value: string | undefined): boolean {
  return value === "1";
}

export function dashboardQuotaEnabled(value: string | undefined): boolean {
  return value === "1";
}
