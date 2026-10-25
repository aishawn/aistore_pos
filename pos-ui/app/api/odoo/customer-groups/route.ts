import { companyDomain } from "@/lib/customer-access";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

type CategoryRow = {
  id: number;
  name: string;
  color: number;
  parent_id: Many2One;
  company_id: Many2One;
};

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.view", "customers.edit", "customers.groups", "sell.checkout");
    const scope = await scopedOdoo(request);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const domain: unknown[] = companyDomain(scope.companyIds, true);
    if (query) domain.push(["name", "ilike", query]);

    const rows = await scope.rpc<CategoryRow[]>("res.partner.category", "search_read", [domain], {
      fields: ["id", "name", "color", "parent_id", "company_id"],
      limit: limit + 1,
      offset,
      order: "name asc, id asc",
    });
    const page = (rows ?? []).slice(0, limit);
    const categoryIds = page.map((row) => row.id);
    const counts = new Map<number, number>();
    if (categoryIds.length) {
      for (const categoryId of categoryIds) {
        const count = await scope.rpc<number>("res.partner", "search_count", [[
          ["customer_rank", ">", 0], ["category_id", "in", [categoryId]], ...companyDomain(scope.companyIds),
        ]]);
        counts.set(categoryId, count);
      }
    }

    const items = page.map((row) => ({
      writable: Array.isArray(row.company_id) && scope.companyIds.includes(row.company_id[0]),
      id: row.id,
      name: row.name,
      color: Number(row.color) || 0,
      parentId: Array.isArray(row.parent_id) ? row.parent_id[0] : null,
      parentName: Array.isArray(row.parent_id) ? row.parent_id[1] : null,
      customerCount: counts.get(row.id) ?? 0,
    }));
    return NextResponse.json({ items, limit, offset, hasNext: (rows?.length ?? 0) > limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos customer groups are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.groups");
    const scope = await scopedOdoo(request);
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json() as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid customer group request" }, { status: 400 });
    }
    if (Object.keys(body).some((key) => !["name"].includes(key))) {
      return NextResponse.json({ message: "This customer group request contains unsupported fields" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return NextResponse.json({ message: "Group name is required and must be 120 characters or fewer" }, { status: 400 });
    }
    const id = await scope.rpc<number>("res.partner.category", "create", [{ name, company_id: scope.companyIds[0] }]);
    if (!Number.isSafeInteger(id) || id < 1) {
      return NextResponse.json({ message: "Orithos did not confirm the new customer group" }, { status: 502 });
    }
    return NextResponse.json({ id, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos customer groups are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
