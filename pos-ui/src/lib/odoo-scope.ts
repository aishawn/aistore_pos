import { NextRequest } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";

export class OdooScopeError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function scopedOdoo(request: NextRequest) {
  const session = request.cookies.get("orithos_odoo_session")?.value;
  if (!session) throw new OdooScopeError("Odoo session expired.", 401);
  const base = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new OdooScopeError("Odoo is not configured.", 503);
  const url = new URL(base);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new OdooScopeError("Odoo connection must use HTTPS.", 503);
  async function envelope<T>(path: string, params: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: `session_id=${session}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new OdooScopeError("Odoo is temporarily unavailable.", 502);
    const payload = await response.json() as { result?: T; error?: { data?: { name?: string }; message?: string } };
    if (payload.error) {
      const detail = `${payload.error.data?.name ?? ""} ${payload.error.message ?? ""}`;
      if (/session|authenticate|log in/i.test(detail)) throw new OdooScopeError("Odoo session expired.", 401);
      if (/accesserror|access denied|permission/i.test(detail)) throw new OdooScopeError("Your account cannot perform this operation.", 403);
      throw new OdooScopeError("Odoo rejected this operation. Review the record before retrying.", 422);
    }
    if (payload.result === undefined) throw new OdooScopeError("Odoo returned no result.", 502);
    return payload.result;
  }
  const info = await envelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>("/web/session/get_session_info", {});
  if (!info.uid) throw new OdooScopeError("Odoo session expired.", 401);
  const allowed = await resolveOdooAllowedCompanyIds(session, info);
  const forced = await resolveTenantForcedCompanyIds(request, allowed);
  if (forced.error) throw new OdooScopeError(forced.error, forced.status);
  const context = odooCompanyContext(forced.companyIds);
  return {
    companyIds: forced.companyIds,
    uid: info.uid,
    binding: forced.binding,
    rpc: <T>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) =>
      envelope<T>("/web/dataset/call_kw", { model, method, args, kwargs: { ...kwargs, context } }),
  };
}
