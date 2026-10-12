import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LINES = 100;

type OdooError = { message?: string; data?: { message?: string; name?: string } };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

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

async function callOdoo<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
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

async function getSessionContext(sessionId: string) {
  const response = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
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
  const companyId = payload.result.user_context?.allowed_company_ids?.find((id) => Number.isSafeInteger(id) && id > 0);
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

export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  try {
    const suppliers = await callOdoo<Array<{ id: number; name: string; email?: string | false }>>(
      sessionId,
      "res.partner",
      "search_read",
      [[["supplier_rank", ">", 0]]],
      { fields: ["id", "name", "email"], limit: 500, order: "name asc, id asc" },
    );
    return NextResponse.json({ suppliers: suppliers ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
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
  if (Object.keys(body).some((key) => !["supplierId", "lines"].includes(key))) {
    return NextResponse.json({ message: "This RFQ request contains unsupported fields" }, { status: 400 });
  }
  const supplierId = body.supplierId;
  const lines = body.lines;
  if (!Number.isSafeInteger(supplierId) || Number(supplierId) < 1) return NextResponse.json({ message: "Choose a valid supplier" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) return NextResponse.json({ message: `Choose between 1 and ${MAX_LINES} products` }, { status: 400 });

  const lineMap = new Map<number, number>();
  for (const rawLine of lines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) return NextResponse.json({ message: "Invalid product line" }, { status: 400 });
    const line = rawLine as Record<string, unknown>;
    if (Object.keys(line).some((key) => !["productId", "quantity"].includes(key))) return NextResponse.json({ message: "RFQ lines contain unsupported fields" }, { status: 400 });
    const productId = line.productId;
    const quantity = line.quantity;
    if (!Number.isSafeInteger(productId) || Number(productId) < 1 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) {
      return NextResponse.json({ message: "Enter a valid positive quantity for each product" }, { status: 400 });
    }
    if (lineMap.has(Number(productId))) return NextResponse.json({ message: "A product can only appear once on an RFQ" }, { status: 400 });
    lineMap.set(Number(productId), quantity);
  }

  try {
    const { companyId } = await getSessionContext(sessionId);
    const [suppliers, products, orderLineFields] = await Promise.all([
      callOdoo<Array<{ id: number; name: string }>>(sessionId, "res.partner", "search_read", [[["id", "=", Number(supplierId)], ["supplier_rank", ">", 0]]], { fields: ["id", "name"], limit: 1 }),
      callOdoo<Array<{ id: number; name?: string; display_name?: string; purchase_ok?: boolean; uom_id?: [number, string] | false }>>(sessionId, "product.product", "search_read", [[["id", "in", Array.from(lineMap.keys())], ["purchase_ok", "=", true]]], { fields: ["id", "name", "display_name", "purchase_ok", "uom_id"], limit: MAX_LINES, context: { allowed_company_ids: [companyId] } }),
      callOdoo<Record<string, { type?: string }>>(sessionId, "purchase.order.line", "fields_get", [["product_uom", "product_uom_id"]], { attributes: ["type"] }),
    ]);
    const supplier = suppliers?.[0];
    if (!supplier) return NextResponse.json({ message: "This supplier is unavailable to your Odoo account" }, { status: 404 });
    if ((products?.length ?? 0) !== lineMap.size) return NextResponse.json({ message: "One or more selected products are not available for purchasing in Odoo" }, { status: 422 });
    const unitField = orderLineFields && Object.hasOwn(orderLineFields, "product_uom") ? "product_uom" : orderLineFields && Object.hasOwn(orderLineFields, "product_uom_id") ? "product_uom_id" : null;
    if (!unitField) throw new OdooRequestError("Odoo did not expose a purchase unit field for RFQ lines.", 422);

    const productById = new Map((products ?? []).map((product) => [product.id, product]));
    const orderLines = Array.from(lineMap, ([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product || !Array.isArray(product.uom_id)) throw new OdooRequestError("A selected product has no unit of measure configured.", 422);
      return [0, 0, {
        product_id: productId,
        product_qty: quantity,
        [unitField]: product.uom_id[0],
        name: product.display_name || product.name || "Product",
      }];
    });
    const orderId = await callOdoo<number>(sessionId, "purchase.order", "create", [{
      partner_id: Number(supplierId),
      company_id: companyId,
      order_line: orderLines,
    }], { context: { allowed_company_ids: [companyId], force_company: companyId } });
    if (!Number.isSafeInteger(orderId) || orderId < 1) throw new OdooRequestError("Odoo did not confirm the draft RFQ", 502);

    const orders = await callOdoo<Array<{ id: number; name: string }>>(sessionId, "purchase.order", "search_read", [[["id", "=", orderId]]], { fields: ["id", "name"], limit: 1, context: { allowed_company_ids: [companyId] } });
    const baseUrl = odooBaseUrl();
    return NextResponse.json({
      id: orderId,
      name: orders?.[0]?.name ?? `RFQ #${orderId}`,
      supplier: supplier.name,
      url: `${baseUrl}/web#id=${orderId}&model=purchase.order&view_type=form`,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
