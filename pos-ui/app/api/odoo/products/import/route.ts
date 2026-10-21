import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_PRODUCTS = 500;

type ProductImportRow = {
  line: number;
  name: string;
  default_code: string;
  barcode: string;
  list_price: number;
  standard_price?: number;
  pos_categ_ids: number[];
};

class OdooImportError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

async function callOdoo<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new OdooImportError("Odoo could not import these products.", 502);
  const payload = await response.json() as { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new OdooImportError("Your Odoo session has expired. Sign in again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new OdooImportError("Your Odoo account does not have permission to import products or costs.", 403);
    throw new OdooImportError("Odoo rejected this product import. Check product and category settings.", 422);
  }
  return payload.result as T;
}

function validRow(value: unknown): value is ProductImportRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ProductImportRow>;
  return Number.isSafeInteger(row.line) && Number(row.line) > 0
    && typeof row.name === "string" && row.name.trim().length > 0 && row.name.length <= 120
    && typeof row.default_code === "string" && row.default_code.length <= 64
    && typeof row.barcode === "string" && row.barcode.length <= 64
    && typeof row.list_price === "number" && Number.isFinite(row.list_price) && row.list_price >= 0 && row.list_price <= 1_000_000
    && (row.standard_price === undefined || (typeof row.standard_price === "number" && Number.isFinite(row.standard_price) && row.standard_price >= 0 && row.standard_price <= 1_000_000))
    && Array.isArray(row.pos_categ_ids) && row.pos_categ_ids.length <= 20 && row.pos_categ_ids.every((id) => Number.isSafeInteger(id) && Number(id) > 0);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  let body: { products?: unknown };
  try {
    body = await request.json() as { products?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid product import request" }, { status: 400 });
  }
  if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > MAX_PRODUCTS || !body.products.every(validRow)) {
    return NextResponse.json({ message: `Provide between 1 and ${MAX_PRODUCTS} valid product rows.` }, { status: 400 });
  }
  const products = body.products as ProductImportRow[];
  if (products.some((product) => product.default_code.trim() !== product.default_code || product.barcode.trim() !== product.barcode)) {
    return NextResponse.json({ message: "Remove leading or trailing spaces from SKU and barcode values." }, { status: 400 });
  }

  try {
    const infoResponse = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!infoResponse.ok) throw new OdooImportError("Your Odoo session has expired. Sign in again.", 401);
    const infoPayload = await infoResponse.json() as { result?: { uid?: number; user_context?: Record<string, unknown> }; error?: unknown };
    const info = infoPayload.result;
    if (infoPayload.error || !info?.uid) throw new OdooImportError("Your Odoo session has expired. Sign in again.", 401);
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, info, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new OdooImportError(forced.error, forced.status);
    const companyIds = forced.companyIds;
    if (!companyIds.length) throw new OdooImportError("No Odoo company is available to this account.", 403);
    const companyId = companyIds[0];
    const context = { ...(info.user_context ?? {}), allowed_company_ids: companyIds, force_company: companyId };

    const categoryIds = [...new Set(products.flatMap((product) => product.pos_categ_ids))];
    if (categoryIds.length) {
      const categories = await callOdoo<Array<{ id: number }>>(sessionId, "pos.category", "search_read", [[
        ["id", "in", categoryIds],
      ]], { fields: ["id"], limit: 100, context }, correlationId);
      const existingIds = new Set((categories ?? []).map((category) => category.id));
      if (categoryIds.some((id) => !existingIds.has(id))) throw new OdooImportError("One or more selected POS categories are unavailable in this Odoo account.", 400);
    }

    const skus = [...new Set(products.map((product) => product.default_code.trim()).filter(Boolean))];
    const barcodes = [...new Set(products.map((product) => product.barcode.trim()).filter(Boolean))];
    const existing = skus.length || barcodes.length
      ? await callOdoo<Array<{ default_code?: string | false; barcode?: string | false }>>(sessionId, "product.template", "search_read", [[
          ["|", ["default_code", "in", skus], ["barcode", "in", barcodes]],
        ]], { fields: ["default_code", "barcode"], limit: 2_000, context }, correlationId)
      : [];
    const existingSkus = new Set((existing ?? []).map((product) => typeof product.default_code === "string" ? product.default_code.trim().toLocaleLowerCase() : "").filter(Boolean));
    const existingBarcodes = new Set((existing ?? []).map((product) => typeof product.barcode === "string" ? product.barcode.trim() : "").filter(Boolean));

    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const skipped: Array<{ line: number; reason: string }> = [];
    const toCreate: ProductImportRow[] = [];
    for (const product of products) {
      const sku = product.default_code.trim().toLocaleLowerCase();
      const barcode = product.barcode.trim();
      const duplicateReason = (sku && existingSkus.has(sku)) || (barcode && existingBarcodes.has(barcode))
        ? "SKU or barcode already exists in Odoo"
        : (sku && seenSkus.has(sku)) || (barcode && seenBarcodes.has(barcode))
          ? "SKU or barcode is duplicated in this file"
          : null;
      if (duplicateReason) {
        skipped.push({ line: product.line, reason: duplicateReason });
        continue;
      }
      if (sku) seenSkus.add(sku);
      if (barcode) seenBarcodes.add(barcode);
      toCreate.push(product);
    }

    if (!toCreate.length) return NextResponse.json({ created: 0, skipped }, { status: 200, headers: { "Cache-Control": "no-store" } });
    const availableFields = await callOdoo<Record<string, { type?: string }>>(sessionId, "product.template", "fields_get", [["is_storable", "detailed_type", "type"]], { attributes: ["type"], context }, correlationId);
    const stockField = Object.hasOwn(availableFields ?? {}, "is_storable") ? "is_storable"
      : Object.hasOwn(availableFields ?? {}, "detailed_type") ? "detailed_type"
        : Object.hasOwn(availableFields ?? {}, "type") ? "type" : null;
    if (!stockField) throw new OdooImportError("This Odoo product model does not expose an inventory product type.", 422);

    const values = toCreate.map((product) => ({
      name: product.name.trim(),
      company_id: companyId,
      sale_ok: true,
      purchase_ok: true,
      available_in_pos: true,
      list_price: product.list_price,
      ...(product.standard_price !== undefined ? { standard_price: product.standard_price } : {}),
      default_code: product.default_code.trim() || false,
      barcode: product.barcode.trim() || false,
      pos_categ_ids: [[6, 0, product.pos_categ_ids]],
      [stockField]: stockField === "is_storable" ? true : "product",
    }));
    await callOdoo<number[] | number>(sessionId, "product.template", "create", [values], { context }, correlationId);
    return NextResponse.json({ created: toCreate.length, skipped }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof OdooImportError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
