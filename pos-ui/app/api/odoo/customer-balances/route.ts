import { companyDomain } from "@/lib/customer-access";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

type PartnerBalance = {
  id: number;
  name: string;
  phone: string | false;
  email: string | false;
  ref: string | false;
  credit: number;
  total_invoiced: number;
  property_product_pricelist: Many2One;
};

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.balances");
    const scope = await scopedOdoo(request);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 40);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const owingOnly = request.nextUrl.searchParams.get("owingOnly") === "true";

    // `credit` is a non-stored monetary field in Orithos 19 — usable in domain on some
    // builds, but never as SQL ORDER BY. Keep a stable stored-field order for every page.
    const domain: unknown[] = [["customer_rank", ">", 0], ...companyDomain(scope.companyIds)];
    if (owingOnly) domain.push(["credit", ">", 0]);
    if (query) {
      domain.push("|", "|", "|",
        ["name", "ilike", query],
        ["phone", "ilike", query],
        ["email", "ilike", query],
        ["ref", "ilike", query],
      );
    }

    const fields = ["id", "name", "phone", "email", "ref", "credit", "total_invoiced", "property_product_pricelist"];
    let rows: PartnerBalance[];
    try {
      rows = await scope.rpc<PartnerBalance[]>("res.partner", "search_read", [domain], {
        fields, limit: limit + 1, offset, order: "name asc, id asc",
      });
    } catch (firstError) {
      if (!owingOnly || !(firstError instanceof OdooScopeError) || firstError.status !== 422) throw firstError;
      const fallbackDomain = domain.filter((clause) => !(Array.isArray(clause) && clause[0] === "credit"));
      const deadline = Date.now() + 20_000;
      const matched: PartnerBalance[] = [];
      let scanOffset = 0;
      while (matched.length < offset + limit + 1) {
        if (Date.now() > deadline) throw new OdooScopeError("The balance search timed out. Narrow the search and retry.", 504);
        const batch = await scope.rpc<PartnerBalance[]>("res.partner", "search_read", [fallbackDomain], {
          fields, limit: 200, offset: scanOffset, order: "name asc, id asc",
        });
        if (Date.now() > deadline) throw new OdooScopeError("The balance search timed out. Narrow the search and retry.", 504);
        matched.push(...batch.filter((row) => Number(row.credit) > 0));
        if (batch.length < 200) break;
        scanOffset += batch.length;
      }
      rows = matched.slice(offset, offset + limit + 1);
    }
    const companies = await scope.rpc<Array<{ currency_id: Many2One }>>("res.company", "search_read", [[["id", "=", scope.companyIds[0]]]], { fields: ["currency_id"], limit: 1 });
    const currency = Array.isArray(companies[0]?.currency_id) ? companies[0].currency_id[1] : null;
    const page = rows.slice(0, limit);
    const items = page.map((row) => ({
      currency,
      id: row.id,
      name: row.name,
      phone: row.phone || null,
      email: row.email || null,
      ref: row.ref || null,
      credit: Number(row.credit) || 0,
      totalInvoiced: Number(row.total_invoiced) || 0,
      pricelist: Array.isArray(row.property_product_pricelist) ? row.property_product_pricelist[1] : null,
    }));
    return NextResponse.json({ items, limit, offset, hasNext: rows.length > limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos customer balances are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
