import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

type PricelistRow = {
  id: number;
  name: string;
  currency_id: Many2One;
  company_id: Many2One;
  active: boolean;
};

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.view", "customers.edit", "customers.pricelists", "sell.checkout");
    const scope = await scopedOdoo(request);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const domain: unknown[] = [
      "|",
      ["company_id", "=", false],
      ["company_id", "in", scope.companyIds],
    ];
    if (query) domain.push(["name", "ilike", query]);
    const rows = await scope.rpc<PricelistRow[]>("product.pricelist", "search_read", [domain], {
      fields: ["id", "name", "currency_id", "company_id", "active"],
      limit: limit + 1,
      offset,
      order: "name asc, id asc",
    });
    const page = (rows ?? []).slice(0, limit);
    const items = page.map((row) => ({
      id: row.id,
      name: row.name,
      currency: Array.isArray(row.currency_id) ? row.currency_id[1] : null,
      currencyId: Array.isArray(row.currency_id) ? row.currency_id[0] : null,
      company: Array.isArray(row.company_id) ? row.company_id[1] : "Shared",
      companyId: Array.isArray(row.company_id) ? row.company_id[0] : null,
      active: Boolean(row.active),
    }));
    return NextResponse.json({ items, limit, offset, hasNext: (rows?.length ?? 0) > limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos price lists are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.pricelists");
    const scope = await scopedOdoo(request);
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json() as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid price list request" }, { status: 400 });
    }
    if (Object.keys(body).some((key) => !["name"].includes(key))) {
      return NextResponse.json({ message: "This price list request contains unsupported fields" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return NextResponse.json({ message: "Price list name is required and must be 120 characters or fewer" }, { status: 400 });
    }
    const companyId = scope.companyIds[0];
    if (!companyId) return NextResponse.json({ message: "No company is available for this store" }, { status: 422 });
    const id = await scope.rpc<number>("product.pricelist", "create", [{ name, company_id: companyId }]);
    if (!Number.isSafeInteger(id) || id < 1) {
      return NextResponse.json({ message: "Orithos did not confirm the new price list" }, { status: 502 });
    }
    return NextResponse.json({ id, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos price lists are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
