export type RegisterOpenTarget = {
  configId: number;
  companyId: number | null;
  hasOpenSession: boolean;
};

export type RegisterOpenDecision = "open" | "already-open" | "denied";

export function resolveRegisterOpenDecision(
  target: RegisterOpenTarget | null,
  requestedConfigId: number,
  allowedCompanyIds: number[],
): RegisterOpenDecision {
  if (!target || target.configId !== requestedConfigId || target.companyId == null
    || !allowedCompanyIds.includes(target.companyId)) return "denied";
  return target.hasOpenSession ? "already-open" : "open";
}
