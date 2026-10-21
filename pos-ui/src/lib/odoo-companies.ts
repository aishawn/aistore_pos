type OdooCompanySessionInfo = {
  uid?: unknown;
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

/**
 * Resolve the user's company membership when an Odoo session response omits
 * its company summary. The fallback reads the authenticated user's own
 * res.users record and never elevates privileges.
 */
export async function resolveOdooAllowedCompanyIds(sessionId: string, value: unknown, correlationId?: string | null): Promise<number[]> {
  const sessionCompanyIds = getOdooAllowedCompanyIds(value);
  if (sessionCompanyIds.length) return sessionCompanyIds;
  if (typeof value !== "object" || value === null) return [];

  const userId = positiveCompanyId((value as OdooCompanySessionInfo).uid);
  const baseUrl = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!userId || !baseUrl) return [];

  try {
    const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
    if (correlationId) headers.set("X-Correlation-ID", correlationId);
    const response = await fetch(`${baseUrl}/web/dataset/call_kw`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.users",
          method: "read",
          args: [[userId]],
          kwargs: { fields: ["company_ids", "company_id"] },
        },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];

    const payload = await response.json() as {
      result?: Array<{ company_ids?: unknown; company_id?: unknown }>;
      error?: unknown;
    };
    if (payload.error) return [];

    const user = payload.result?.[0];
    const companyIds = companyIdsFrom(user?.company_ids);
    if (companyIds.length) return Array.from(new Set(companyIds));

    const currentCompanyId = positiveCompanyId(user?.company_id);
    return currentCompanyId === null ? [] : [currentCompanyId];
  } catch {
    return [];
  }
}
