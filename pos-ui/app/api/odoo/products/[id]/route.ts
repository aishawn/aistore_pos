import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const EDITABLE_FIELDS = new Set(["name", "barcode", "default_code", "list_price", "pos_categ_ids", "available_in_pos", "image_1920", "expectedListPrice"]);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "stock.products.edit");
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ message: "Invalid product." }, { status: 400 });
    const scope = await scopedOdoo(request);
    const products = await scope.rpc<Array<{ id: number; name: string; list_price: number }>>("product.product", "search_read", [[
      ["id", "=", id], ["company_id", "in", scope.companyIds],
    ]], { fields: ["id", "name", "list_price"], limit: 1 });
    if (!products[0]) return NextResponse.json({ message: "Product not found in this store." }, { status: 404 });
    return NextResponse.json(products[0], { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: "Could not read this store's product." }, { status: error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502 });
  }
}

function productImage(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000_000) throw new OdooRequestError("Product image must be smaller than 1.5 MB.", 400);
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new OdooRequestError("Choose a valid JPEG, PNG or WebP image.", 400);
  const bytes = Buffer.from(match[2], "base64");
  const valid = match[1] === "jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8
    : match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid || bytes.length > 1_500_000) throw new OdooRequestError("Choose a valid image smaller than 1.5 MB.", 400);
  return bytes.toString("base64");
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
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) {
      return NextResponse.json({ message: "Product name is required and must be 120 characters or fewer" }, { status: 400 });
    }
    values.name = body.name.trim();
  }
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
  if ("image_1920" in body) {
    try { values.image_1920 = productImage(body.image_1920); } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid product image" }, { status: error instanceof OdooRequestError ? error.status : 400 });
    }
  }
  if ("pos_categ_ids" in body) {
    const categoryIds = body.pos_categ_ids;
    if (!Array.isArray(categoryIds) || categoryIds.length > 20 || categoryIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1)) {
      return NextResponse.json({ message: "Choose valid POS categories" }, { status: 400 });
    }
    values.pos_categ_ids = [[6, 0, categoryIds]];
  }

  try {
    await requirePermission(request, "stock.products.edit");
    const scope = await scopedOdoo(request);
    const domain = [["id", "=", productId], ["company_id", "in", scope.companyIds]];
    const before = await scope.rpc<Array<{ id: number; list_price: number }>>("product.product", "search_read", [domain], { fields: ["id", "list_price"], limit: 1 });
    if (!before[0]) return NextResponse.json({ message: "Product not found in this store." }, { status: 404 });
    if (!Object.keys(values).length) return NextResponse.json({ message: "No product changes supplied." }, { status: 400 });
    if ("expectedListPrice" in body && (typeof body.expectedListPrice !== "number" || !Number.isFinite(body.expectedListPrice))) {
      return NextResponse.json({ message: "Invalid original price." }, { status: 400 });
    }
    if ("expectedListPrice" in body && Math.abs(before[0].list_price - Number(body.expectedListPrice)) > 0.000001) {
      return NextResponse.json({ message: "The price changed after review. Refresh and review it again." }, { status: 409 });
    }
    const result = await scope.rpc<boolean>("product.product", "write", [[productId], values]);
    if (result !== true) return NextResponse.json({ message: "Odoo did not confirm the product update" }, { status: 502 });
    if ("list_price" in values) {
      const after = await scope.rpc<Array<{ list_price: number }>>("product.product", "search_read", [domain], { fields: ["list_price"], limit: 1 });
      if (!after[0] || Math.abs(after[0].list_price - Number(values.list_price)) > 0.000001) {
        return NextResponse.json({ message: "Price was submitted but could not be confirmed. Refresh the product before retrying.", resultState: "unknown" }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, productId, resultState: "confirmed" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof OdooRequestError || error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message, resultState: status >= 500 ? "unknown" : "rejected" }, { status });
  }
}
