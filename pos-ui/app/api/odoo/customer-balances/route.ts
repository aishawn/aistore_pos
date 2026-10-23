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

    // `credit` is a non-stored monetary field in Odoo 19 — usable in domain on some
    // builds, but never as SQL ORDER BY. Always sort by stored fields, then rank in memory.
    const domain: unknown[] = [["customer_rank", ">", 0]];
    if (owingOnly) domain.push(["credit", ">", 0]);
    if (query) {
      domain.push("|", "|", "|",
        ["name", "ilike", query],
        ["phone", "ilike", query],
        ["email", "ilike", query],
        ["ref", "ilike", query],
      );
    }

    const fetchLimit = Math.min(500, Math.max(limit + 1, offset + limit + 1));
    let rows: PartnerBalance[];
    try {
      rows = await scope.rpc<PartnerBalance[]>("res.partner", "search_read", [domain], {
        fields: ["id", "name", "phone", "email", "ref", "credit", "total_invoiced", "property_product_pricelist"],
        limit: fetchLimit,
        offset: 0,
        order: "name asc, id asc",
      }) ?? [];
    } catch (firstError) {
      // Some Odoo builds also reject non-stored `credit` in domains — fall back and filter in memory.
      if (!owingOnly) throw firstError;
      const fallbackDomain: unknown[] = [["customer_rank", ">", 0]];
      if (query) {
        fallbackDomain.push("|", "|", "|",
          ["name", "ilike", query],
          ["phone", "ilike", query],
          ["email", "ilike", query],
          ["ref", "ilike", query],
        );
      }
      const all = await scope.rpc<PartnerBalance[]>("res.partner", "search_read", [fallbackDomain], {
        fields: ["id", "name", "phone", "email", "ref", "credit", "total_invoiced", "property_product_pricelist"],
        limit: 500,
        offset: 0,
        order: "name asc, id asc",
      }) ?? [];
      rows = all.filter((row) => (Number(row.credit) || 0) > 0);
    }

    rows = [...rows].sort((a, b) => {
      const creditDiff = (Number(b.credit) || 0) - (Number(a.credit) || 0);
      if (creditDiff !== 0) return creditDiff;
      return a.name.localeCompare(b.name) || a.id - b.id;
    });

    const page = rows.slice(offset, offset + limit);
    const items = page.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone || null,
      email: row.email || null,
      ref: row.ref || null,
      credit: Number(row.credit) || 0,
      totalInvoiced: Number(row.total_invoiced) || 0,
      pricelist: Array.isArray(row.property_product_pricelist) ? row.property_product_pricelist[1] : null,
    }));
    return NextResponse.json({ items, limit, offset, hasNext: rows.length > offset + limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo customer balances are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
