import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LINES = 100;
const COVERAGE_DAYS = new Set([7, 14, 21, 28, 42]);
const REPLENISHMENT_METHOD = "rules_v1_weighted_velocity";

type OdooError = { message?: string; data?: { message?: string; name?: string } };

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

class OdooRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function callOdoo<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new OdooRequestError("Odoo purchase service is unavailable", 502);
  const payload = await response.json() as { result?: T; error?: OdooError };
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new OdooRequestError("Your Odoo session has expired. Sign in to Odoo again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new OdooRequestError("Your Odoo account does not have permission to access purchase records.", 403);
    throw new OdooRequestError("Odoo rejected the request. Check the vendor, product purchase settings and purchase permissions.", 422);
  }
  return payload.result as T;
}

async function getSessionContext(request: NextRequest, sessionId: string) {
  const correlationId = request.headers.get("x-correlation-id");
  const response = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new OdooRequestError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const payload = await response.json() as {
    result?: { uid?: number; user_context?: { allowed_company_ids?: number[] } };
    error?: OdooError;
  };
  if (payload.error || !payload.result?.uid) throw new OdooRequestError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, payload.result, correlationId);
  const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
  if (forced.error) throw new OdooRequestError(forced.error, forced.status);
  const companyId = forced.companyIds[0];
  if (!companyId) throw new OdooRequestError("No Odoo company is available to this account.", 403);
  return { companyId };
}

function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "Odoo is unavailable";
  const status = error instanceof OdooRequestError
    ? error.status
    : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
  const response = NextResponse.json({ message }, { status });
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function makeReplenishmentNotes(coverageDays: number, method: string, lines: Array<{ productId: number; quantity: number; suggestedQuantity: number; reason: string }>, products: Array<{ id: number; name?: string; display_name?: string }>) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const rows = lines.map((line) => {
    const product = productById.get(line.productId);
    const name = escapeHtml(product?.display_name || product?.name || `Product ${line.productId}`);
    const reason = escapeHtml(line.reason.slice(0, 500) || "No explanation supplied.");
    return `<tr><td>${name}</td><td>${line.suggestedQuantity}</td><td>${line.quantity}</td><td>${reason}</td></tr>`;
  }).join("");
  return `<p><strong>Orithos replenishment approval audit v1</strong></p><p>Forecast method: ${escapeHtml(method)} · Target coverage: ${coverageDays} days. These quantities were reviewed by a person before this RFQ was created; this record does not confirm or send the order.</p><table><thead><tr><th>Product</th><th>Suggested</th><th>Ordered</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  try {
    const { companyId } = await getSessionContext(request, sessionId);
    const correlationId = request.headers.get("x-correlation-id");
    const suppliers = await callOdoo<Array<{ id: number; name: string; email?: string | false }>>(
      sessionId,
      "res.partner",
      "search_read",
      [[["supplier_rank", ">", 0], ["company_id", "=", companyId]]],
      { fields: ["id", "name", "email"], limit: 500, order: "name asc, id asc", context: { allowed_company_ids: [companyId], force_company: companyId } },
      correlationId,
    );
    return NextResponse.json({ suppliers: suppliers ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid RFQ request" }, { status: 400 });
  }
  if (Object.keys(body).some((key) => !["supplierId", "coverageDays", "method", "lines"].includes(key))) {
    return NextResponse.json({ message: "This RFQ request contains unsupported fields" }, { status: 400 });
  }
  const supplierId = body.supplierId;
  const coverageDays = body.coverageDays;
  const method = body.method;
  const lines = body.lines;
  if (!Number.isSafeInteger(supplierId) || Number(supplierId) < 1) return NextResponse.json({ message: "Choose a valid supplier" }, { status: 400 });
  if (!Number.isSafeInteger(coverageDays) || !COVERAGE_DAYS.has(Number(coverageDays)) || method !== REPLENISHMENT_METHOD) return NextResponse.json({ message: "Refresh the replenishment plan before creating this RFQ" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) return NextResponse.json({ message: `Choose between 1 and ${MAX_LINES} products` }, { status: 400 });

  const lineMap = new Map<number, { quantity: number; suggestedQuantity: number; reason: string }>();
  for (const rawLine of lines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) return NextResponse.json({ message: "Invalid product line" }, { status: 400 });
    const line = rawLine as Record<string, unknown>;
    if (Object.keys(line).some((key) => !["productId", "quantity", "suggestedQuantity", "reason"].includes(key))) return NextResponse.json({ message: "RFQ lines contain unsupported fields" }, { status: 400 });
    const productId = line.productId;
    const quantity = line.quantity;
    const suggestedQuantity = line.suggestedQuantity;
    const reason = line.reason;
    if (!Number.isSafeInteger(productId) || Number(productId) < 1 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0 || quantity > 100_000) {
      return NextResponse.json({ message: "Enter a valid non-negative quantity for each product" }, { status: 400 });
    }
    if (!Number.isSafeInteger(suggestedQuantity) || Number(suggestedQuantity) < 0 || Number(suggestedQuantity) > 100_000 || typeof reason !== "string" || reason.length > 2000) {
      return NextResponse.json({ message: "Refresh the replenishment plan before creating this RFQ" }, { status: 400 });
    }
    if (lineMap.has(Number(productId))) return NextResponse.json({ message: "A product can only appear once on an RFQ" }, { status: 400 });
    lineMap.set(Number(productId), { quantity, suggestedQuantity: Number(suggestedQuantity), reason: reason.trim() });
  }
  const orderLineMap = new Map(Array.from(lineMap).filter(([, line]) => line.quantity > 0));
  if (!orderLineMap.size) return NextResponse.json({ message: "Keep at least one product with a quantity above zero" }, { status: 400 });

  try {
    const { companyId } = await getSessionContext(request, sessionId);
    const correlationId = request.headers.get("x-correlation-id");
    const [suppliers, products, orderLineFields] = await Promise.all([
      callOdoo<Array<{ id: number; name: string }>>(sessionId, "res.partner", "search_read", [[
        ["id", "=", Number(supplierId)],
        ["supplier_rank", ">", 0],
        ["company_id", "=", companyId],
      ]], { fields: ["id", "name"], limit: 1, context: { allowed_company_ids: [companyId], force_company: companyId } }, correlationId),
      callOdoo<Array<{ id: number; name?: string; display_name?: string; purchase_ok?: boolean; uom_id?: [number, string] | false }>>(sessionId, "product.product", "search_read", [[
        ["id", "in", Array.from(lineMap.keys())],
        ["company_id", "=", companyId],
      ]], { fields: ["id", "name", "display_name", "purchase_ok", "uom_id"], limit: MAX_LINES, context: { allowed_company_ids: [companyId], force_company: companyId } }, correlationId),
      callOdoo<Record<string, { type?: string }>>(sessionId, "purchase.order.line", "fields_get", [["product_uom", "product_uom_id"]], { attributes: ["type"] }, correlationId),
    ]);
    const supplier = suppliers?.[0];
    if (!supplier) return NextResponse.json({ message: "This supplier is unavailable to your Odoo account" }, { status: 404 });
    if ((products?.length ?? 0) !== lineMap.size) return NextResponse.json({ message: "One or more selected products are not available in Odoo" }, { status: 422 });
    const unitField = orderLineFields && Object.hasOwn(orderLineFields, "product_uom") ? "product_uom" : orderLineFields && Object.hasOwn(orderLineFields, "product_uom_id") ? "product_uom_id" : null;
    if (!unitField) throw new OdooRequestError("Odoo did not expose a purchase unit field for RFQ lines.", 422);

    const productById = new Map((products ?? []).map((product) => [product.id, product]));
    const orderLines = Array.from(orderLineMap, ([productId, line]) => {
      const product = productById.get(productId);
      if (!product || product.purchase_ok !== true) throw new OdooRequestError("One or more selected products are not available for purchasing in Odoo.", 422);
      if (!Array.isArray(product.uom_id)) throw new OdooRequestError("A selected product has no unit of measure configured.", 422);
      return [0, 0, {
        product_id: productId,
        product_qty: line.quantity,
        [unitField]: product.uom_id[0],
        name: product.display_name || product.name || "Product",
      }];
    });
    const approvalNote = makeReplenishmentNotes(Number(coverageDays), String(method), Array.from(lineMap, ([productId, line]) => ({ productId, ...line })), products ?? []);
    const orderId = await callOdoo<number>(sessionId, "purchase.order", "create", [{
      partner_id: Number(supplierId),
      company_id: companyId,
      order_line: orderLines,
    }], { context: { allowed_company_ids: [companyId], force_company: companyId } }, correlationId);
    if (!Number.isSafeInteger(orderId) || orderId < 1) throw new OdooRequestError("Odoo did not confirm the draft RFQ", 502);

    let auditSaved = false;
    try {
      await callOdoo<number>(sessionId, "purchase.order", "message_post", [[orderId]], {
        body: approvalNote,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note",
        partner_ids: [],
      }, correlationId);
      auditSaved = true;
    } catch {
      // Do not leave an RFQ behind when its required approval audit cannot be saved.
      // The cleanup is best effort because Odoo may reject unlink after a partial write.
      try {
        await callOdoo<boolean>(sessionId, "purchase.order", "unlink", [[orderId]], { context: { allowed_company_ids: [companyId], force_company: companyId } }, correlationId);
      } catch {
        throw new OdooRequestError("The approval audit could not be saved and the draft RFQ could not be cleaned up. Do not retry; check Odoo before continuing.", 502);
      }
      throw new OdooRequestError("The approval audit could not be saved. No draft RFQ was kept; you can retry after checking Odoo.", 502);
    }

    let orderName = `RFQ #${orderId}`;
    try {
      const orders = await callOdoo<Array<{ id: number; name: string }>>(sessionId, "purchase.order", "search_read", [[["id", "=", orderId]]], { fields: ["id", "name"], limit: 1, context: { allowed_company_ids: [companyId] } }, correlationId);
      orderName = orders?.[0]?.name ?? orderName;
    } catch {
      return NextResponse.json({
        id: orderId,
        name: orderName,
        supplier: supplier.name,
        url: `${odooBaseUrl()}/web#id=${orderId}&model=purchase.order&view_type=form`,
        auditSaved,
        warning: "The draft was created and the approval audit was saved, but its reference could not be read back. Open it in Odoo; do not retry creation.",
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const baseUrl = odooBaseUrl();
    return NextResponse.json({
      id: orderId,
      name: orderName,
      supplier: supplier.name,
      url: `${baseUrl}/web#id=${orderId}&model=purchase.order&view_type=form`,
      auditSaved,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
