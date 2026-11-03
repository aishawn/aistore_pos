import { withReportInvalidation } from "@/lib/report-write-invalidation";
import { NextRequest, NextResponse } from "next/server";
import { categoryError, categoryScope, categoryValues, ownedCategory } from "@/lib/odoo-categories";
import { OdooScopeError } from "@/lib/odoo-scope";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handlePATCH(request: NextRequest, context: Context) {
  try {
    const scope = await categoryScope(request, true);
    const id = Number((await context.params).id);
    await ownedCategory(scope, id);
    const values = await categoryValues(request, scope, id);
    const saved = await scope.rpc<boolean>("pos.category", "write", [[id], values]);
    if (!saved) throw new OdooScopeError("Category update could not be confirmed. Reload before retrying.", 502);
    return NextResponse.json({ id });
  } catch (error) { return categoryError(error); }
}
async function handleDELETE(request: NextRequest, context: Context) {
  try {
    const scope = await categoryScope(request, true);
    const id = Number((await context.params).id);
    await ownedCategory(scope, id);
    const children = await scope.rpc<number>("pos.category", "search_count", [[["parent_id", "=", id]]]);
    const products = await scope.rpc<number>("product.template", "search_count", [[["pos_categ_ids", "in", [id]]]], { context: { active_test: false } });
    if (children || products) throw new OdooScopeError("This category has products or child categories. Remove those references first.", 409);
    const deleted = await scope.rpc<boolean>("pos.category", "unlink", [[id]]);
    if (!deleted) throw new OdooScopeError("Category deletion could not be confirmed. Reload before retrying.", 502);
    return NextResponse.json({ id });
  } catch (error) { return categoryError(error); }
}

export const PATCH = withReportInvalidation(handlePATCH);

export const DELETE = withReportInvalidation(handleDELETE);
