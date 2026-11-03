import { type NextRequest } from "next/server";
import { fetchTenantOdooBinding } from "./odoo-tenant-company";
import { invalidateReportTarget, reportTargets, type ReportTarget } from "./report-snapshots";

export async function invalidateReportsForRequest(request: NextRequest, known?: ReportTarget) {
  if (known) return invalidateReportTarget(known);
  const binding = await fetchTenantOdooBinding(request);
  if (!binding?.odooCompanyId) return;
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0].trim().toLowerCase();
  const target = reportTargets().find(value => value.host === host && value.vendorId === binding.vendorId && value.companyId === binding.odooCompanyId);
  await invalidateReportTarget({ ...(target ?? { database: process.env.ODOO_DATABASE || "unconfigured", vendorId: binding.vendorId, companyId: binding.odooCompanyId, host, timezone: "UTC" }), sampleDataClearedAt: binding.sampleDataClearedAt ?? null });
}

/** Invalidates only after a confirmed write. It never retries or changes the write response. */
export function withReportInvalidation<T extends unknown[]>(handler: (request: NextRequest, ...args: T) => Promise<Response>) {
  return async (request: NextRequest, ...args: T) => {
    const result = await handler(request, ...args);
    if (result.ok) await invalidateReportsForRequest(request).catch(() => undefined);
    return result;
  };
}
