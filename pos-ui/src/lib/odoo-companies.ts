type OdooCompanySessionInfo = {
  user_context?: { allowed_company_ids?: unknown };
  user_companies?: {
    current_company?: unknown;
    allowed_companies?: unknown;
  };
  company_id?: unknown;
};

function positiveCompanyId(value: unknown): number | null {
  const candidate = typeof value === "object" && value !== null
    ? (value as { id?: unknown }).id
    : value;
  const id = typeof candidate === "number" ? candidate : typeof candidate === "string" ? Number(candidate) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function companyIdsFrom(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(positiveCompanyId).filter((id): id is number => id !== null);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, company]) => {
      const id = positiveCompanyId(company) ?? positiveCompanyId(key);
      return id === null ? [] : [id];
    });
  }
  return [];
}

/** Read the authorized company scope from the Odoo session response. */
export function getOdooAllowedCompanyIds(value: unknown): number[] {
  if (typeof value !== "object" || value === null) return [];
  const info = value as OdooCompanySessionInfo;
  const contextIds = companyIdsFrom(info.user_context?.allowed_company_ids);
  if (contextIds.length) return Array.from(new Set(contextIds));

  const allowedIds = companyIdsFrom(info.user_companies?.allowed_companies);
  if (allowedIds.length) return Array.from(new Set(allowedIds));

  const currentId = positiveCompanyId(info.user_companies?.current_company) ?? positiveCompanyId(info.company_id);
  return currentId === null ? [] : [currentId];
}
