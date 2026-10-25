import { NextRequest, NextResponse } from "next/server";
import { categoryDomain, categoryError, categoryScope, categoryValues, type OdooCategory } from "@/lib/odoo-categories";
import { OdooScopeError } from "@/lib/odoo-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = await categoryScope(request);
    const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    const offset = Math.max(0, Math.min(100000, Number(request.nextUrl.searchParams.get("offset")) || 0));
    const records = await scope.rpc<OdooCategory[]>("pos.category", "search_read", [[...categoryDomain(scope.companyIds), ...(query ? [["name", "ilike", query]] : [])]], { fields: ["id", "name", "parent_id", "company_id"], order: "name asc, id asc", limit: 101, offset });
    const page = records.slice(0, 100);
    const counts = page.length ? await scope.rpc<Record<string, { productCount: number; childCount: number }>>("pos.category", "orithos_category_counts", [page.map((record) => record.id)]) : {};
    if (page.some((record) => !counts[String(record.id)] || !Number.isSafeInteger(counts[String(record.id)].productCount) || !Number.isSafeInteger(counts[String(record.id)].childCount))) throw new OdooScopeError("Odoo returned incomplete category counts. Reload before editing.", 502);
    const items = page.map((record) => ({ ...record,
      editable: !!record.company_id && scope.companyIds.includes(record.company_id[0]),
      productCount: counts[String(record.id)]?.productCount ?? 0,
      childCount: counts[String(record.id)]?.childCount ?? 0,
    }));
    return NextResponse.json({ items, hasNext: records.length > 100, writeEnabled: process.env.ODOO_CATEGORY_WRITE_ENABLED === "true" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return categoryError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await categoryScope(request, true);
    const values = await categoryValues(request, scope);
    const id = await scope.rpc<number>("pos.category", "create", [{ ...values, company_id: scope.companyIds[0] }]);
    if (!Number.isSafeInteger(id) || id < 1) throw new OdooScopeError("Category creation could not be confirmed. Reload before retrying.", 502);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return categoryError(error); }
}
