import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const ALLOWED_FIELDS = new Set(["name", "list_price", "default_code", "barcode", "pos_categ_ids", "available_in_pos"]);

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

async function callOdoo<T>(sessionId: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: "product.template", method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new OdooRequestError("Odoo could not create this product", 502);
  const payload = await response.json() as { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new OdooRequestError("Your Odoo session has expired. Sign in to Odoo again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new OdooRequestError("Your Odoo account does not have permission to create products.", 403);
    throw new OdooRequestError("Odoo rejected this product. Check the details and your product settings.", 422);
  }
  return payload.result as T;
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
    return NextResponse.json({ message: "Invalid product request" }, { status: 400 });
  }
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !ALLOWED_FIELDS.has(key))) {
    return NextResponse.json({ message: "This product request contains unsupported fields" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sku = typeof body.default_code === "string" ? body.default_code.trim() : "";
  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
  const price = body.list_price;
  const availableInPos = body.available_in_pos;
  const categoryIds = body.pos_categ_ids;
  if (!name || name.length > 120) return NextResponse.json({ message: "Product name is required and must be 120 characters or fewer" }, { status: 400 });
  if (sku.length > 64 || barcode.length > 64) return NextResponse.json({ message: "SKU and barcode must be 64 characters or fewer" }, { status: 400 });
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1_000_000) {
    return NextResponse.json({ message: "Price must be between 0 and 1,000,000" }, { status: 400 });
  }
  if (availableInPos !== undefined && typeof availableInPos !== "boolean") return NextResponse.json({ message: "POS availability must be true or false" }, { status: 400 });
  if (categoryIds !== undefined && (!Array.isArray(categoryIds) || categoryIds.length > 20 || categoryIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1))) {
    return NextResponse.json({ message: "Choose valid POS categories" }, { status: 400 });
  }

  const values: Record<string, unknown> = {
    name,
    sale_ok: true,
    purchase_ok: true,
    list_price: price,
    default_code: sku || false,
    barcode: barcode || false,
    available_in_pos: availableInPos !== false,
    pos_categ_ids: [[6, 0, (categoryIds as number[] | undefined) ?? []]],
  };

  try {
    const availableFields = await callOdoo<Record<string, { type?: string }>>(sessionId, "fields_get", [["is_storable", "detailed_type", "type"]], { attributes: ["type"] });
    if (availableFields && Object.hasOwn(availableFields, "is_storable")) values.is_storable = true;
    else if (availableFields && Object.hasOwn(availableFields, "detailed_type")) values.detailed_type = "product";
    else if (availableFields && Object.hasOwn(availableFields, "type")) values.type = "product";
    else throw new OdooRequestError("This Odoo product model does not expose an inventory product type.", 422);

    const productId = await callOdoo<number>(sessionId, "create", [values]);
    if (!Number.isSafeInteger(productId) || productId < 1) throw new OdooRequestError("Odoo did not confirm the new product", 502);
    return NextResponse.json({ id: productId, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof OdooRequestError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
