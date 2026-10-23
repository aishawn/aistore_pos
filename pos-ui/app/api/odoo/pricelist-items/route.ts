import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;
type PriceRule = {
  id: number;
  pricelist_id: Many2One;
  product_tmpl_id: Many2One;
  product_id: Many2One;
  applied_on: string;
  min_quantity: number;
  compute_price: string;
  fixed_price: number;
  percent_price: number;
  date_start: string | false;
  date_end: string | false;
};

function asDate(value: string | false) { return value || null; }

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.pricelists");
    const scope = await scopedOdoo(request);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 30);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 30));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const domain: unknown[] = [["pricelist_id.company_id", "in", scope.companyIds], ["product_tmpl_id", "!=", false]];
    if (query) domain.push(["product_tmpl_id.name", "ilike", query]);
    const rules = await scope.rpc<PriceRule[]>("product.pricelist.item", "search_read", [domain], {
      fields: ["id", "pricelist_id", "product_tmpl_id", "product_id", "applied_on", "min_quantity", "compute_price", "fixed_price", "percent_price", "date_start", "date_end"],
      limit: limit + 1,
      offset,
      order: "date_start desc, id desc",
    });
    const pageRules = (rules ?? []).slice(0, limit);
    const templateIds = [...new Set(pageRules.map((rule) => Array.isArray(rule.product_tmpl_id) ? rule.product_tmpl_id[0] : 0).filter((id) => id > 0))];
    const products = templateIds.length
      ? await scope.rpc<Array<{ id: number; name: string; list_price: number; default_code: string | false }>>("product.template", "search_read", [["id", "in", templateIds]], { fields: ["id", "name", "list_price", "default_code"], limit: templateIds.length, order: "name asc, id asc" })
      : [];
    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const items = pageRules.map((rule) => {
      const templateId = Array.isArray(rule.product_tmpl_id) ? rule.product_tmpl_id[0] : 0;
      const product = productMap.get(templateId);
      return {
        id: String(rule.id),
        productId: Array.isArray(rule.product_id) ? rule.product_id[0] : templateId,
        productName: product?.name ?? (Array.isArray(rule.product_tmpl_id) ? rule.product_tmpl_id[1] : "Product"),
        sku: product?.default_code || "",
        priceSetName: Array.isArray(rule.pricelist_id) ? rule.pricelist_id[1] : "Odoo price list",
        source: "Odoo price rule",
        sourceType: "PROVIDED",
        startDate: asDate(rule.date_start),
        endDate: asDate(rule.date_end),
        quantity: Number(rule.min_quantity) || 1,
        cappedPrice: rule.compute_price === "fixed" && Number.isFinite(Number(rule.fixed_price)) ? Number(rule.fixed_price) : null,
        currentPrice: product?.list_price ?? null,
        cost: null,
        ruleType: rule.compute_price,
      };
    });
    return NextResponse.json({ items, limit, offset, hasNext: (rules?.length ?? 0) > limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo price rules are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
