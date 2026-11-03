import { withReportInvalidation } from "@/lib/report-write-invalidation";
import { NextRequest, NextResponse } from "next/server";
import { categoryDomain, categoryError, categoryScope, categoryValues, type OdooCategory } from "@/lib/odoo-categories";
import { OdooScopeError } from "@/lib/odoo-scope";

import { groupCategories } from "@/lib/category-groups";
import { catalogueDomain } from "@/lib/product-catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = await categoryScope(request);
    const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    if (request.nextUrl.searchParams.get("view") === "unified") {
      const records: OdooCategory[] = [];
      for (let offset = 0; ; offset += 100) {
        const batch = await scope.rpc<OdooCategory[]>("pos.category", "search_read", [categoryDomain(scope.companyIds)], {
          fields: ["id", "name", "parent_id", "company_id"], order: "name asc, id asc", limit: 100, offset,
        });
        records.push(...batch);
        if (batch.length < 100) break;
      }
      const groups = groupCategories(records);
      const items = new Array<Record<string, unknown>>(groups.length);
      let cursor = 0;
      async function worker() {
        while (cursor < groups.length) {
          const index = cursor++;
          const group = groups[index];
          const record = group.find((item) => item.company_id && scope.companyIds.includes(item.company_id[0])) ?? group[0];
          const ids = group.map((item) => item.id);
          const productCount = await scope.rpc<number>("product.product", "search_count", [[
            ...catalogueDomain("all"), ["company_id", "in", scope.companyIds], ["pos_categ_ids", "in", ids],
          ]]);
          if (!Number.isSafeInteger(productCount) || productCount < 0) throw new OdooScopeError("Category product counts are unavailable. Please reload.", 502);
          // Counts and the product link use the same union domain; a product in two matching categories counts once.
          const childCount = groups.filter((children) => children.some((child) => child.parent_id && ids.includes(child.parent_id[0]))).length;
          items[index] = { ...record, ids, productCount, childCount,
            editable: group.length === 1 && !!record.company_id && scope.companyIds.includes(record.company_id[0]),
          };
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker));
      return NextResponse.json({ items, hasNext: false, writeEnabled: process.env.ODOO_CATEGORY_WRITE_ENABLED === "true" }, { headers: { "Cache-Control": "no-store" } });
    }

    const offset = Math.max(0, Math.min(100000, Number(request.nextUrl.searchParams.get("offset")) || 0));
    const records = await scope.rpc<OdooCategory[]>("pos.category", "search_read", [[...categoryDomain(scope.companyIds), ...(query ? [["name", "ilike", query]] : [])]], { fields: ["id", "name", "parent_id", "company_id"], order: "name asc, id asc", limit: 101, offset });
    const page = records.slice(0, 100);
    const counts = page.length ? await scope.rpc<Record<string, { productCount: number; childCount: number }>>("pos.category", "orithos_category_counts", [page.map((record) => record.id)]) : {};
    if (page.some((record) => !counts[String(record.id)] || !Number.isSafeInteger(counts[String(record.id)].productCount) || !Number.isSafeInteger(counts[String(record.id)].childCount))) throw new OdooScopeError("Orithos returned incomplete category counts. Reload before editing.", 502);
    const items = page.map((record) => ({ ...record,
      editable: !!record.company_id && scope.companyIds.includes(record.company_id[0]),
      productCount: counts[String(record.id)]?.productCount ?? 0,
      childCount: counts[String(record.id)]?.childCount ?? 0,
    }));
    return NextResponse.json({ items, hasNext: records.length > 100, writeEnabled: process.env.ODOO_CATEGORY_WRITE_ENABLED === "true" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return categoryError(error); }
}

async function handlePOST(request: NextRequest) {
  try {
    const scope = await categoryScope(request, true);
    const values = await categoryValues(request, scope);
    const id = await scope.rpc<number>("pos.category", "create", [{ ...values, company_id: scope.companyIds[0] }]);
    if (!Number.isSafeInteger(id) || id < 1) throw new OdooScopeError("Category creation could not be confirmed. Reload before retrying.", 502);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return categoryError(error); }
}

export const POST = withReportInvalidation(handlePOST);
