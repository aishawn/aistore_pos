import { NextRequest } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, type StoreMe } from "@/lib/store-access";

export function canReadBalances(me: StoreMe) {
  return me.isAdmin === true || me.roleCode === "ADMIN" || me.permissions?.includes("customers.balances") === true;
}

export function companyDomain(companyIds: number[], shared = false): unknown[] {
  return shared ? ["|", ["company_id", "=", false], ["company_id", "in", companyIds]] : [["company_id", "in", companyIds]];
}

export async function customerWriteScope(request: NextRequest, values: Record<string, unknown>, id?: number) {
  await requirePermission(request, "customers.edit");
  const scope = await scopedOdoo(request);
  if (id) {
    const records = await scope.rpc<Array<{ id: number }>>("res.partner", "search_read", [[
      ["id", "=", id], ["customer_rank", ">", 0], ...companyDomain(scope.companyIds),
    ]], { fields: ["id"], limit: 1 });
    if (!records.length) throw new OdooScopeError("Customer was not found in this store.", 404);
  }
  const listId = values.property_product_pricelist;
  if (typeof listId === "number") {
    const rows = await scope.rpc<Array<{ id: number }>>("product.pricelist", "search_read", [[
      ["id", "=", listId], ["active", "=", true], ...companyDomain(scope.companyIds, true),
    ]], { fields: ["id"], limit: 1 });
    if (!rows.length) throw new OdooScopeError("This price list is not available to this store.", 403);
  }
  const commands = values.category_id as [number, number, number[]][] | undefined;
  const ids = commands?.[0]?.[2];
  if (ids?.length) {
    const rows = await scope.rpc<Array<{ id: number }>>("res.partner.category", "search_read", [[
      ["id", "in", ids], ...companyDomain(scope.companyIds, true),
    ]], { fields: ["id"], limit: ids.length });
    if (new Set(rows.map((row) => row.id)).size !== new Set(ids).size) throw new OdooScopeError("One or more groups are not available to this store.", 403);
  }
  return scope;
}
