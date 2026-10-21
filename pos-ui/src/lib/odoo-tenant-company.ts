import { NextRequest } from "next/server";
import { ACCESS_COOKIE, backendUrl } from "@/lib/server-auth";

export type TenantOdooBinding = {
  vendorId: number;
  subdomain: string;
  odooCompanyId: number | null;
  odooPosConfigId: number | null;
  odooWarehouseId: number | null;
  odooStockLocationId: number | null;
  odooProvisionStatus: "pending" | "ready" | "failed" | "unmapped" | string;
  odooProvisionError: string | null;
  r2Prefix: string | null;
  dummyDataRequested?: boolean;
  sampleDataClearedAt?: string | null;
};

export type ForcedCompanyResult = {
  companyIds: number[];
  binding: TenantOdooBinding | null;
  error?: string;
  status: number;
};

/**
 * Resolve the Orithos vendor → Odoo company binding for the current host,
 * then intersect with the Odoo session companies so service-account recovery
 * cannot expand into another store's company.
 */
export async function fetchTenantOdooBinding(request: NextRequest): Promise<TenantOdooBinding | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host");
  if (forwardedHost) headers["X-Forwarded-Host"] = forwardedHost;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (forwardedProto) headers["X-Forwarded-Proto"] = forwardedProto;

  try {
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/tenant/odoo-binding`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { code?: number; data?: TenantOdooBinding | null };
    if (payload.code !== 0 || !payload.data) return null;
    return payload.data;
  } catch {
    return null;
  }
}

export function odooCompanyContext(companyIds: number[]) {
  const forceCompany = companyIds[0];
  return {
    allowed_company_ids: companyIds,
    ...(forceCompany ? { force_company: forceCompany } : {}),
  };
}

export async function resolveTenantForcedCompanyIds(
  request: NextRequest,
  sessionCompanyIds: number[],
): Promise<ForcedCompanyResult> {
  const uniqueSession = Array.from(new Set(sessionCompanyIds.filter((id) => Number.isSafeInteger(id) && id > 0)));
  const binding = await fetchTenantOdooBinding(request);

  // Never fail-open to the shared service account's full company list — that leaked
  // demo catalog/registers onto newly signed-up stores (e.g. shawn.*).
  if (!binding) {
    return {
      companyIds: [],
      binding: null,
      error: "Could not resolve this store's Odoo binding. Sign in again or contact platform admin.",
      status: 503,
    };
  }

  if (binding.odooProvisionStatus === "failed") {
    return {
      companyIds: [],
      binding,
      error: binding.odooProvisionError || "Odoo store provisioning failed. Contact platform admin.",
      status: 503,
    };
  }

  if (binding.odooProvisionStatus === "pending") {
    return {
      companyIds: [],
      binding,
      error: "This store is still being linked to Odoo. Try again shortly.",
      status: 503,
    };
  }

  if (binding.odooProvisionStatus === "unmapped" || binding.odooCompanyId == null) {
    return {
      companyIds: [],
      binding,
      error: "This store is not linked to an Odoo company yet. Ask platform admin to provision Odoo.",
      status: 503,
    };
  }

  if (!uniqueSession.includes(binding.odooCompanyId)) {
    return {
      companyIds: [],
      binding,
      error: "This Odoo session cannot access the company mapped to this store.",
      status: 403,
    };
  }

  return { companyIds: [binding.odooCompanyId], binding, status: 200 };
}
