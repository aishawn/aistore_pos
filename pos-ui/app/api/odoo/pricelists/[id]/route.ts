import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string) {
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.pricelists");
    const scope = await scopedOdoo(request);
    const pricelistId = parseId((await context.params).id);
    if (!pricelistId) return NextResponse.json({ message: "Invalid price list ID" }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json() as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid price list request" }, { status: 400 });
    }
    const allowed = new Set(["name", "active"]);
    if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.has(key))) {
      return NextResponse.json({ message: "This price list request contains unsupported fields" }, { status: 400 });
    }

    const values: Record<string, string | boolean> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 120) {
        return NextResponse.json({ message: "Price list name is required and must be 120 characters or fewer" }, { status: 400 });
      }
      values.name = name;
    }
    if (typeof body.active === "boolean") values.active = body.active;
    if (Object.keys(values).length === 0) {
      return NextResponse.json({ message: "No valid price list fields were provided" }, { status: 400 });
    }

    const owned = await scope.rpc<Array<{ id: number }>>("product.pricelist", "search_read", [[
      ["id", "=", pricelistId],
      "|",
      ["company_id", "=", false],
      ["company_id", "in", scope.companyIds],
    ]], { fields: ["id"], limit: 1 });
    if (!owned?.length) return NextResponse.json({ message: "Price list was not found for this store" }, { status: 404 });

    const ok = await scope.rpc<boolean>("product.pricelist", "write", [[pricelistId], values]);
    if (ok !== true) return NextResponse.json({ message: "Odoo did not confirm the price list update" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo price lists are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.pricelists");
    const scope = await scopedOdoo(request);
    const pricelistId = parseId((await context.params).id);
    if (!pricelistId) return NextResponse.json({ message: "Invalid price list ID" }, { status: 400 });

    const owned = await scope.rpc<Array<{ id: number }>>("product.pricelist", "search_read", [[
      ["id", "=", pricelistId],
      "|",
      ["company_id", "=", false],
      ["company_id", "in", scope.companyIds],
    ]], { fields: ["id"], limit: 1 });
    if (!owned?.length) return NextResponse.json({ message: "Price list was not found for this store" }, { status: 404 });

    // Soft-deactivate — hard unlink can break POS configs that still reference the list.
    const ok = await scope.rpc<boolean>("product.pricelist", "write", [[pricelistId], { active: false }]);
    if (ok !== true) return NextResponse.json({ message: "Odoo did not confirm the price list archive" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo price lists are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
