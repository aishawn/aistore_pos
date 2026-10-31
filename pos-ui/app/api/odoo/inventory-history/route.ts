import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;
const MAX_RANGE_DAYS = 366;

type Relation = [number, string] | false | null;

type StockMove = {
  id: number;
  product_id: Relation;
  product_uom_qty: number;
  product_qty: number;
  quantity: number;
  state: string;
  date: string;
  location_id: Relation;
  location_dest_id: Relation;
  company_id: Relation;
  write_date: string;
};

class InventoryHistoryRequestError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new InventoryHistoryRequestError("Inventory history date is invalid.");
  return parsed;
}

function relationId(value: Relation): number | null {
  return Array.isArray(value) && Number.isSafeInteger(value[0]) ? value[0] : null;
}

function relationName(value: Relation): string | null {
  return Array.isArray(value) && typeof value[1] === "string" ? value[1] : null;
}

function errorResponse(error: unknown) {
  if (error instanceof StoreAccessError || error instanceof OdooScopeError) {
    const response = NextResponse.json({ message: error.message }, { status: error.status });
    if (error.status === 401) response.cookies.delete("orithos_odoo_session");
    return response;
  }
  if (error instanceof InventoryHistoryRequestError) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Inventory history is unavailable.";
  return NextResponse.json({ message }, { status: 502 });
}

/** Read-only stock movement history for forecasting and audit; never calls an Odoo write method. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  if (!request.cookies.get("orithos_odoo_session")?.value) {
    return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  }

  try {
    await requirePermission(request, "stock.products.view");
    const scope = await scopedOdoo(request);
    const params = request.nextUrl.searchParams;
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const from = parseDate(params.get("from"), defaultFrom);
    const to = parseDate(params.get("to"), now);
    if (from > to) throw new InventoryHistoryRequestError("Inventory history date range is invalid.");
    if ((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS) {
      throw new InventoryHistoryRequestError(`Inventory history range cannot exceed ${MAX_RANGE_DAYS} days.`);
    }

    const rawLimit = Number(params.get("limit") ?? 500);
    const rawOffset = Number(params.get("offset") ?? 0);
    if (!Number.isFinite(rawLimit) || !Number.isFinite(rawOffset)) {
      throw new InventoryHistoryRequestError("Inventory history pagination is invalid.");
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)));
    const offset = Math.max(0, Math.floor(rawOffset));
    const productId = params.get("productId");
    const domain: unknown[] = [
      ["company_id", "in", scope.companyIds],
      ["date", ">=", from.toISOString().slice(0, 19).replace("T", " ")],
      ["date", "<=", to.toISOString().slice(0, 19).replace("T", " ")],
    ];
    if (productId !== null) {
      const parsedProductId = Number(productId);
      if (!Number.isSafeInteger(parsedProductId) || parsedProductId < 1) {
        throw new InventoryHistoryRequestError("Inventory history productId is invalid.");
      }
      domain.push(["product_id", "=", parsedProductId]);
    }

    const rows = await scope.rpc<StockMove[]>("stock.move", "search_read", [domain], {
      fields: [
        "id", "product_id", "product_uom_qty", "product_qty", "quantity", "state", "date",
        "location_id", "location_dest_id", "company_id", "write_date",
      ],
      limit: limit + 1,
      offset,
      order: "date asc, id asc",
    });
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({
      id: row.id,
      productId: relationId(row.product_id),
      productName: relationName(row.product_id),
      demandQuantity: Number(row.product_uom_qty),
      movedQuantity: Number(row.product_qty ?? row.quantity),
      quantity: Number(row.quantity),
      state: row.state,
      date: row.date,
      sourceLocationId: relationId(row.location_id),
      sourceLocation: relationName(row.location_id),
      destinationLocationId: relationId(row.location_dest_id),
      destinationLocation: relationName(row.location_dest_id),
      companyId: relationId(row.company_id),
      writeDate: row.write_date,
    }));
    return NextResponse.json({
      items,
      limit,
      offset,
      hasNext,
      from: from.toISOString(),
      to: to.toISOString(),
      companyIds: scope.companyIds,
      dataAsOf: new Date().toISOString(),
      source: "odoo.stock.move.read_only",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
