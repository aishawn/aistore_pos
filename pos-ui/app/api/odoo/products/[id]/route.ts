import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const EDITABLE_FIELDS = new Set(["barcode", "default_code", "list_price", "pos_categ_ids", "available_in_pos"]);

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

async function callOdoo(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new OdooRequestError("Odoo could not update this product", 502);
  const payload = await response.json() as { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new OdooRequestError("Your Odoo session has expired. Sign in to Odoo again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new OdooRequestError("Your Odoo account does not have permission to edit this product.", 403);
    throw new OdooRequestError("Odoo rejected the product update. Check the fields and your product permissions.", 422);
  }
  return payload.result;
}

class OdooRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const { id: rawId } = await context.params;
  const productId = Number(rawId);
  if (!Number.isSafeInteger(productId) || productId < 1) return NextResponse.json({ message: "Invalid product" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid product update" }, { status: 400 });
  }
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.has(key))) {
    return NextResponse.json({ message: "This product update contains unsupported fields" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if ("barcode" in body) {
    if (typeof body.barcode !== "string" || body.barcode.length > 64) return NextResponse.json({ message: "Barcode must be 64 characters or fewer" }, { status: 400 });
    values.barcode = body.barcode.trim() || false;
  }
  if ("default_code" in body) {
    if (typeof body.default_code !== "string" || body.default_code.length > 64) return NextResponse.json({ message: "SKU must be 64 characters or fewer" }, { status: 400 });
    values.default_code = body.default_code.trim() || false;
  }
  if ("list_price" in body) {
    const price = body.list_price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1_000_000) {
      return NextResponse.json({ message: "Price must be between 0 and 1,000,000" }, { status: 400 });
    }
    values.list_price = price;
  }
  if ("available_in_pos" in body) {
    if (typeof body.available_in_pos !== "boolean") return NextResponse.json({ message: "POS availability must be true or false" }, { status: 400 });
    values.available_in_pos = body.available_in_pos;
  }
  if ("pos_categ_ids" in body) {
    const categoryIds = body.pos_categ_ids;
    if (!Array.isArray(categoryIds) || categoryIds.length > 20 || categoryIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1)) {
      return NextResponse.json({ message: "Choose valid POS categories" }, { status: 400 });
    }
    values.pos_categ_ids = [[6, 0, categoryIds]];
  }

  try {
    const result = await callOdoo(sessionId, "product.product", "write", [[productId], values]);
    if (result !== true) return NextResponse.json({ message: "Odoo did not confirm the product update" }, { status: 502 });
    return NextResponse.json({ ok: true, productId }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof OdooRequestError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
