import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { companyDomain } from "@/lib/customer-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    const me = await requirePermission(request, "customers.pricelists");
    const scope = await scopedOdoo(request);
    const id = Number((await context.params).id);
    const ruleOffset = Number(request.nextUrl.searchParams.get("ruleOffset") ?? 0);
    const customerOffset = Number(request.nextUrl.searchParams.get("customerOffset") ?? 0);
    if (![id, ruleOffset, customerOffset].every(Number.isSafeInteger) || id < 1 || ruleOffset < 0 || customerOffset < 0) return NextResponse.json({ message: "Invalid price list or pagination" }, { status: 400 });
    const lists = await scope.rpc<Array<{ id: number }>>("product.pricelist", "search_read", [[["id", "=", id], ...companyDomain(scope.companyIds, true)]], { fields: ["id"], limit: 1 });
    if (!lists.length) return NextResponse.json({ message: "Price list not found" }, { status: 404 });
    const rules = await scope.rpc<unknown[]>("product.pricelist.item", "search_read", [[["pricelist_id", "=", id]]], {
      fields: ["id", "applied_on", "product_id", "product_tmpl_id", "categ_id", "min_quantity", "compute_price", "fixed_price", "percent_price", "date_start", "date_end"],
      order: "min_quantity desc, id asc", limit: 21, offset: ruleOffset,
    });
    const customersAvailable = me.isAdmin === true || me.roleCode === "ADMIN" || me.permissions?.includes("customers.view") === true;
    const customers = customersAvailable ? await scope.rpc<unknown[]>("res.partner", "search_read", [[["property_product_pricelist", "=", id], ["customer_rank", ">", 0], ...companyDomain(scope.companyIds, true)]], { fields: ["id", "name"], order: "name asc, id asc", limit: 21, offset: customerOffset }) : [];
    return NextResponse.json({ rules: rules.slice(0, 20), rulesHasNext: rules.length > 20, customers: customers.slice(0, 20), customersHasNext: customers.length > 20, customersAvailable }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Price list details are unavailable" }, { status: error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502 });
  }
}
