import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";

export type CategoryScope = Awaited<ReturnType<typeof scopedOdoo>>;
export type OdooCategory = { id: number; name: string; parent_id: [number, string] | false; company_id: [number, string] | false };

export function categoryDomain(companyIds: number[]): unknown[] {
  return [["company_id", "in", companyIds]];
}

export async function categoryScope(request: NextRequest, write = false) {
  if (!isSameOrigin(request)) throw new OdooScopeError("Cross-origin requests are not allowed.", 403);
  await requirePermission(request, ...(write ? ["stock.products.edit"] : ["stock.products.view", "stock.products.edit", "stock.products.import_export"]));
  if (write && process.env.ODOO_CATEGORY_WRITE_ENABLED !== "true") throw new OdooScopeError("Category changes are not enabled. Complete the Odoo upgrade and isolated verification first.", 503);
  const scope = await scopedOdoo(request);
  const fields = await scope.rpc<Record<string, unknown>>("pos.category", "fields_get", [["company_id"]], { attributes: ["type"] });
  if (!fields.company_id) throw new OdooScopeError("Category management requires the Odoo retail module upgrade. Contact your administrator.", 503);
  return scope;
}

export async function validateCategoryIds(scope: CategoryScope, ids: number[]) {
  if (!ids.length) return;
  const fields = await scope.rpc<Record<string, unknown>>("pos.category", "fields_get", [["company_id"]], { attributes: ["type"] });
  if (!fields.company_id) throw new OdooScopeError("Upgrade the Odoo retail module before assigning categories.", 503);
  const records = await scope.rpc<Array<{ id: number }>>("pos.category", "search_read", [[...categoryDomain(scope.companyIds), ["id", "in", ids]]], { fields: ["id"], limit: ids.length });
  if (new Set(records.map((record) => record.id)).size !== new Set(ids).size) throw new OdooScopeError("Choose categories owned by this store.", 403);
}

export async function ownedCategory(scope: CategoryScope, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new OdooScopeError("Invalid category.", 400);
  const records = await scope.rpc<OdooCategory[]>("pos.category", "search_read", [[["id", "=", id], ["company_id", "in", scope.companyIds]]], { fields: ["id", "name", "parent_id", "company_id"], limit: 1 });
  if (!records[0]) throw new OdooScopeError("Category not found or read-only.", 404);
  return records[0];
}

export async function categoryValues(request: NextRequest, scope: CategoryScope, id?: number) {
  const body = await request.json().catch(() => null);
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some((key) => !["name", "parentId"].includes(key))
    || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120
    || (body.parentId !== null && body.parentId !== undefined && (!Number.isSafeInteger(body.parentId) || body.parentId < 1))) throw new OdooScopeError("Enter a category name (1–120 characters) and a valid parent.", 400);
  let parentId = body.parentId || false;
  const visited = new Set<number>(id ? [id] : []);
  while (parentId) {
    if (visited.has(parentId)) throw new OdooScopeError("A category cannot be its own ancestor.", 409);
    visited.add(parentId);
    const parent = await ownedCategory(scope, parentId);
    parentId = parent.parent_id ? parent.parent_id[0] : false;
  }
  const duplicates = await scope.rpc<Array<{ id: number }>>("pos.category", "search_read", [[["company_id", "=", scope.companyIds[0]], ["name", "=ilike", body.name.trim()], ["parent_id", "=", body.parentId || false], ...(id ? [["id", "!=", id]] : [])]], { fields: ["id"], limit: 1 });
  if (duplicates.length) throw new OdooScopeError("A category with this name already exists under this parent.", 409);
  return { name: body.name.trim(), parent_id: body.parentId || false };
}

export function categoryError(error: unknown) {
  const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
  return NextResponse.json({ message: error instanceof OdooScopeError || error instanceof StoreAccessError ? error.message : "Category service is unavailable. Retry shortly." }, { status, headers: { "Cache-Control": "no-store" } });
}
