import { getOdooCompanyTimezone } from "./odoo-store-timezone.ts";
import type { ReportCompany, ReportRpc } from "./report-data.ts";

export class ReportOdooError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

function base() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new ReportOdooError("Orithos connection is not configured", 503);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new ReportOdooError("Orithos connection must use HTTPS", 503);
  return value;
}

export async function reportEnvelope<T>(path: string, sessionId: string | null, params: unknown, correlationId?: string | null, timeoutMs = 15_000): Promise<{ result: T; cookie: string | null }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (sessionId) headers.set("Cookie", `session_id=${sessionId}`);
  if (correlationId && /^[a-f0-9-]{36}$/i.test(correlationId)) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${base()}${path}`, {
    method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
    cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new ReportOdooError("Orithos reporting is unavailable", response.status === 401 ? 401 : 502);
  const payload = await response.json() as { result?: T; error?: { message?: string; data?: { name?: string } } };
  if (payload.error || payload.result === undefined) {
    const detail = `${payload.error?.message ?? ""} ${payload.error?.data?.name ?? ""}`;
    const status = /session|authenticate|log in/i.test(detail) ? 401 : /accesserror|accessdenied/i.test(detail) ? 403 : 502;
    throw new ReportOdooError("Orithos could not load reporting data", status);
  }
  return { result: payload.result, cookie: response.headers.getSetCookie?.().find(value => value.startsWith("session_id="))?.match(/^session_id=([^;]+)/)?.[1] ?? null };
}

async function reportRpcCall<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null, timeoutMs = 15_000) {
  return (await reportEnvelope<T>("/web/dataset/call_kw", sessionId, { model, method, args, kwargs }, correlationId, timeoutMs)).result;
}

export const reportRpc: ReportRpc = async <T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) =>
  reportRpcCall<T>(sessionId, model, method, args, kwargs, correlationId);

export function companyReportRpc(companyId: number, onCall?: () => void, warehouseId?: number | null, timeoutMs = 15_000): ReportRpc {
  return <T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) => {
    onCall?.();
    const context = { ...(kwargs.context as object), allowed_company_ids: [companyId], force_company: companyId,
      ...(warehouseId && warehouseId > 0 ? { warehouse: warehouseId } : {}) };
    return reportRpcCall<T>(sessionId, model, method, args, { ...kwargs, context }, correlationId, timeoutMs);
  };
}

export async function readReportCompany(rpc: ReportRpc, session: string, companyId: number): Promise<ReportCompany> {
  const rows = await rpc<Array<{ name: string; currency_id: [number, string] | false; partner_id: [number, string] | false }>>(session, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name", "currency_id", "partner_id"], limit: 1 });
  const company = rows?.[0];
  if (!company) throw new ReportOdooError("Store company is unavailable", 403);
  const partners = company.partner_id ? await rpc<Array<{ country_id: [number, string] | false; state_id: [number, string] | false }>>(session, "res.partner", "search_read", [[["id", "=", company.partner_id[0]]]], { fields: ["country_id", "state_id"], limit: 1 }) : [];
  return { name: company.name, currency: company.currency_id ? company.currency_id[1] : "AUD", timezone: getOdooCompanyTimezone(partners?.[0]?.country_id, partners?.[0]?.state_id) };
}
