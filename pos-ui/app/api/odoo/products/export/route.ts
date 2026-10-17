import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_ROWS = 5_000;

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };

class OdooExportError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

async function callOdoo<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new OdooExportError("Odoo could not export these products.", 502);
  const payload = await response.json() as RpcResult<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new OdooExportError("Your Odoo session has expired. Sign in again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new OdooExportError("Your Odoo account does not have permission to export products.", 403);
    throw new OdooExportError("Odoo rejected this product export.", 422);
  }
  return payload.result as T;
}

function csvEscape(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  try {
    const infoResponse = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!infoResponse.ok) throw new OdooExportError("Your Odoo session has expired. Sign in again.", 401);
    const infoPayload = await infoResponse.json() as { result?: { uid?: number; user_context?: Record<string, unknown> }; error?: unknown };
    const info = infoPayload.result;
    if (infoPayload.error || !info?.uid) throw new OdooExportError("Your Odoo session has expired. Sign in again.", 401);
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, info);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new OdooExportError(forced.error, forced.status);
    const companyIds = forced.companyIds;
    if (!companyIds.length) throw new OdooExportError("No Odoo company is available to this account.", 403);
    const companyId = companyIds[0];
    const context = { ...(info.user_context ?? {}), allowed_company_ids: companyIds, force_company: companyId };

    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const domain: unknown[] = [
      ["company_id", "=", companyId],
      ["sale_ok", "=", true],
    ];
    if (!includeInactive) {
      // Active-only: archived DEMO SKUs after sample purge stay out automatically.
      domain.push(["active", "=", true]);
    }

    const products = await callOdoo<Array<{
      name?: string;
      list_price?: number;
      default_code?: string | false;
      barcode?: string | false;
      standard_price?: number;
      pos_categ_ids?: number[];
    }>>(sessionId, "product.template", "search_read", [domain], {
      fields: ["name", "list_price", "default_code", "barcode", "standard_price", "pos_categ_ids"],
      limit: MAX_ROWS,
      order: "name asc, id asc",
      context,
    });

    const categoryIds = [...new Set((products ?? []).flatMap((product) => product.pos_categ_ids ?? []))];
    const categories = categoryIds.length
      ? await callOdoo<Array<{ id: number; name?: string }>>(sessionId, "pos.category", "search_read", [[
          ["id", "in", categoryIds],
        ]], { fields: ["id", "name"], limit: 500, context })
      : [];
    const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name ?? ""]));

    const lines = ["Product Name,Sale Price,SKU,Barcode,Cost,POS Category"];
    for (const product of products ?? []) {
      const posCategory = (product.pos_categ_ids ?? [])
        .map((id) => categoryNames.get(id) ?? "")
        .filter(Boolean)
        .join(" / ");
      lines.push([
        csvEscape(asText(product.name)),
        csvEscape(asMoney(product.list_price)),
        csvEscape(asText(product.default_code)),
        csvEscape(asText(product.barcode)),
        csvEscape(asMoney(product.standard_price)),
        csvEscape(posCategory),
      ].join(","));
    }

    const slug = forced.binding?.subdomain || "store";
    const filename = `${slug}-products.csv`;
    return new NextResponse(`${lines.join("\r\n")}\r\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof OdooExportError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
