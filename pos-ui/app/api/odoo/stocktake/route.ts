import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_PRODUCTS = 60;
const MAX_LINES = 40;
const QUANTITY_EPSILON = 0.000001;

type RpcError = { message?: string; data?: { message?: string; name?: string } };
type RpcEnvelope<T> = { result?: T; error?: RpcError };
type Relation = number | [number, string] | false | null;
type StocktakeLocation = {
  id: number;
  complete_name: string;
  usage: string;
  company_id: Relation;
  location_id: Relation;
  warehouse_id: Relation;
};
type StocktakeProduct = {
  id: number;
  name: string;
  default_code: string | false;
  barcode: string | false;
  tracking: string;
  uom_id: Relation;
};
type StockQuant = {
  id: number;
  product_id: Relation;
  quantity: number;
  lot_id: Relation;
  package_id: Relation;
  owner_id: Relation;
  inventory_quantity_set: boolean;
};
type StocktakeWarehouse = { id: number; name: string; lot_stock_id: Relation; company_id: Relation };

class StocktakeError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new StocktakeError("Odoo connection is not configured.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new StocktakeError("Odoo connection must use HTTPS.", 503);
  }
  return value;
}

function relationId(value: Relation): number | null {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${baseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new StocktakeError("Odoo could not complete the stocktake request.", 502);
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new StocktakeError("Odoo session expired.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new StocktakeError("Your Odoo account cannot adjust inventory.", 403);
    throw new StocktakeError("Odoo rejected the stocktake. Review the quantities and location.", 422);
  }
  return payload.result as T;
}

async function deriveSingleWarehouseLocation(sessionId: string, companyId: number, context: Record<string, unknown>, correlationId?: string | null) {
  const warehouses = await rpc<StocktakeWarehouse[]>(sessionId, "stock.warehouse", "search_read", [[
    ["company_id", "=", companyId],
  ]], {
    fields: ["id", "name", "lot_stock_id", "company_id"],
    limit: 2,
    order: "id asc",
    context,
  }, correlationId) ?? [];
  if (warehouses.length !== 1) return null;
  const warehouse = warehouses[0];
  const locationId = relationId(warehouse.lot_stock_id);
  return locationId ? { id: locationId, source: "single-warehouse-fallback" as const } : null;
}

async function tenantScope(request: NextRequest, sessionId: string) {
  const correlationId = request.headers.get("x-correlation-id");
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${baseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new StocktakeError("Odoo session expired.", 401);
  const info = await response.json() as RpcEnvelope<{ uid?: number }>;
  if (info.error || !info.result?.uid) throw new StocktakeError("Odoo session expired.", 401);

  const sessionCompanies = await resolveOdooAllowedCompanyIds(sessionId, info.result, correlationId);
  const forced = await resolveTenantForcedCompanyIds(request, sessionCompanies);
  if (forced.error) throw new StocktakeError(forced.error, forced.status);
  const companyId = forced.companyIds[0];
  const context = odooCompanyContext(forced.companyIds);
  const configuredLocationId = forced.binding?.odooStockLocationId;
  const derived = !configuredLocationId && companyId
    ? await deriveSingleWarehouseLocation(sessionId, companyId, context, correlationId)
    : null;
  const rootLocationId = configuredLocationId ?? derived?.id ?? null;
  if (!companyId || !rootLocationId) {
    throw new StocktakeError("This store has no unambiguous Odoo stock location configured.", 409);
  }
  return { companyId, rootLocationId, context, correlationId, locationSource: configuredLocationId ? "tenant-binding" as const : derived?.source ?? "tenant-binding" as const };
}

async function leafLocations(sessionId: string, scope: Awaited<ReturnType<typeof tenantScope>>) {
  const locations = await rpc<StocktakeLocation[]>(sessionId, "stock.location", "search_read", [[
    ["id", "child_of", scope.rootLocationId],
    ["usage", "=", "internal"],
    ["company_id", "=", scope.companyId],
  ]], {
    fields: ["id", "complete_name", "usage", "company_id", "location_id", "warehouse_id"],
    limit: 500,
    order: "complete_name asc, id asc",
    context: scope.context,
  }, scope.correlationId) ?? [];
  if (locations.length >= 500) throw new StocktakeError("This warehouse has too many locations for stocktake. Ask an administrator to review its location structure.", 422);
  const root = locations.find((location) => location.id === scope.rootLocationId);
  if (!root || root.usage !== "internal" || relationId(root.company_id) !== scope.companyId) {
    throw new StocktakeError("The store's configured stock location is unavailable.", 409);
  }
  const parents = new Set(locations.map((location) => relationId(location.location_id)).filter((id): id is number => id !== null));
  return locations
    .filter((location) => location.usage === "internal" && !parents.has(location.id))
    .map((location) => ({ id: location.id, name: location.complete_name || String(location.id) }));
}

function selectLocation(locations: Array<{ id: number; name: string }>, locationId: number) {
  const location = locations.find((item) => item.id === locationId);
  if (!location) throw new StocktakeError("Choose an internal stock location assigned to this store.", 403);
  return location;
}

async function readProducts(
  sessionId: string,
  scope: Awaited<ReturnType<typeof tenantScope>>,
  locationId: number,
  query: string,
) {
  const domain: unknown[] = [
    ["company_id", "=", scope.companyId],
    ["available_in_pos", "=", true],
    ["active", "=", true],
  ];
  if (query) {
    domain.push("|", "|", ["name", "ilike", query], ["barcode", "ilike", query], ["default_code", "ilike", query]);
  }
  const products = await rpc<StocktakeProduct[]>(sessionId, "product.product", "search_read", [domain], {
    fields: ["id", "name", "default_code", "barcode", "tracking", "uom_id"],
    limit: MAX_PRODUCTS,
    order: "name asc, id asc",
    context: { ...scope.context, location: locationId },
  }, scope.correlationId) ?? [];
  if (!products.length) return [];

  const ids = products.map((product) => product.id);
  const quants = await rpc<StockQuant[]>(sessionId, "stock.quant", "search_read", [[
    ["product_id", "in", ids],
    ["location_id", "=", locationId],
    ["company_id", "=", scope.companyId],
  ]], {
    fields: ["id", "product_id", "quantity", "lot_id", "package_id", "owner_id", "inventory_quantity_set"],
    limit: 5000,
    order: "id asc",
    context: scope.context,
  }, scope.correlationId) ?? [];
  if (quants.length >= 5000) throw new StocktakeError("This stock location has too many inventory records to count safely in one request.", 422);

  return products.map((product) => {
    const productQuants = quants.filter((quant) => relationId(quant.product_id) === product.id);
    const expectedQty = productQuants.reduce((sum, quant) => sum + Number(quant.quantity || 0), 0);
    let ineligibleReason: string | null = null;
    if (product.tracking && product.tracking !== "none") ineligibleReason = "Tracked products must be counted in Odoo.";
    else if (productQuants.some((quant) => relationId(quant.lot_id) || relationId(quant.package_id) || relationId(quant.owner_id))) {
      ineligibleReason = "Products in lots, packages, or consignment must be counted in Odoo.";
    } else if (productQuants.some((quant) => quant.inventory_quantity_set)) {
      ineligibleReason = "An Odoo inventory count is already pending for this product.";
    }
    return {
      id: product.id,
      name: product.name,
      sku: product.default_code || "",
      barcode: product.barcode || "",
      uom: Array.isArray(product.uom_id) ? product.uom_id[1] : "Units",
      expectedQty,
      eligible: ineligibleReason === null,
      ineligibleReason,
    };
  });
}

function sessionCookie(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) throw new StocktakeError("Odoo session expired.", 401);
  return sessionId;
}

function responseError(error: unknown) {
  const status = error instanceof StocktakeError || error instanceof StoreAccessError ? error.status : 502;
  const message = error instanceof Error ? error.message : "Odoo stocktake is unavailable.";
  const response = NextResponse.json({ code: status * 100, message, data: null }, { status, headers: { "Cache-Control": "no-store" } });
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed." }, { status: 403 });
  try {
    await requirePermission(request, "stock.stocktake");
    const sessionId = sessionCookie(request);
    const scope = await tenantScope(request, sessionId);
    const locations = await leafLocations(sessionId, scope);
    const requestedLocationId = Number(request.nextUrl.searchParams.get("locationId"));
    const defaultLocationId = locations.length === 1 ? locations[0].id : null;
    const locationId = Number.isSafeInteger(requestedLocationId) && requestedLocationId > 0
      ? requestedLocationId
      : defaultLocationId;
    if (!locationId) {
      return NextResponse.json({ code: 0, message: "OK", data: { locations, defaultLocationId, locationSource: scope.locationSource, writeEnabled: process.env.ODOO_STOCKTAKE_WRITE_ENABLED === "true", products: [] } }, { headers: { "Cache-Control": "no-store" } });
    }
    const location = selectLocation(locations, locationId);
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const products = query ? await readProducts(sessionId, scope, location.id, query) : [];
    return NextResponse.json({ code: 0, message: "OK", data: {
      locations,
      defaultLocationId,
      selectedLocation: location,
      locationSource: scope.locationSource,
      writeEnabled: process.env.ODOO_STOCKTAKE_WRITE_ENABLED === "true",
      products,
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}

type CountLineInput = { productId: number; expectedQty: number; countedQty: number };

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed." }, { status: 403 });
  try {
    // Authorize before parsing business input or checking the feature gate so every
    // non-admin write attempt fails closed with the same permission response.
    await requirePermission(request, "stock.stocktake");
  } catch (error) {
    return responseError(error);
  }
  let body: { confirm?: boolean; locationId?: number; lines?: CountLineInput[] };
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid stocktake request." }, { status: 400 });
  }
  if (body.confirm !== true) return NextResponse.json({ code: 40000, message: "Confirm the reviewed count before applying it.", data: null }, { status: 400 });
  if (!Number.isSafeInteger(body.locationId) || Number(body.locationId) < 1) {
    return NextResponse.json({ message: "Choose a valid stock location." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > MAX_LINES) {
    return NextResponse.json({ message: `Include between 1 and ${MAX_LINES} counted products.` }, { status: 400 });
  }
  const seen = new Set<number>();
  for (const line of body.lines) {
    if (!line || !Number.isSafeInteger(line.productId) || line.productId < 1 || seen.has(line.productId)
      || typeof line.expectedQty !== "number" || !Number.isFinite(line.expectedQty)
      || typeof line.countedQty !== "number" || !Number.isFinite(line.countedQty) || line.countedQty < 0 || line.countedQty > 1_000_000) {
      return NextResponse.json({ message: "Review product quantities and remove duplicate lines." }, { status: 400 });
    }
    seen.add(line.productId);
  }
  if (process.env.ODOO_STOCKTAKE_WRITE_ENABLED !== "true") {
    return NextResponse.json({ message: "Stock adjustments are not enabled for this store." }, { status: 423 });
  }

  let writeAttempted = false;
  try {
    const sessionId = sessionCookie(request);
    const scope = await tenantScope(request, sessionId);
    if (scope.locationSource !== "tenant-binding") throw new StocktakeError("Bind this store to an explicit Odoo stock location before applying a count.", 409);
    const locations = await leafLocations(sessionId, scope);
    const location = selectLocation(locations, Number(body.locationId));
    const productIds = body.lines.map((line) => line.productId);
    const products = await rpc<Array<StocktakeProduct & { company_id: Relation }>>(sessionId, "product.product", "search_read", [[
      ["id", "in", productIds],
      ["company_id", "=", scope.companyId],
      ["available_in_pos", "=", true],
      ["active", "=", true],
    ]], {
      fields: ["id", "name", "default_code", "barcode", "tracking", "uom_id", "company_id"],
      limit: MAX_LINES,
      context: { ...scope.context, location: location.id },
    }, scope.correlationId) ?? [];
    if (products.length !== productIds.length) throw new StocktakeError("One or more products are no longer available to this store.", 409);
    const productById = new Map(products.map((product) => [product.id, product]));
    const quants = await rpc<StockQuant[]>(sessionId, "stock.quant", "search_read", [[
      ["product_id", "in", productIds],
      ["location_id", "=", location.id],
      ["company_id", "=", scope.companyId],
    ]], {
      fields: ["id", "product_id", "quantity", "lot_id", "package_id", "owner_id", "inventory_quantity_set"],
      limit: 5000,
      context: scope.context,
    }, scope.correlationId) ?? [];
    if (quants.length >= 5000) throw new StocktakeError("This stock location has too many inventory records to adjust safely.", 422);

    const adjustments: Array<{ productId: number; expectedQty: number; countedQty: number }> = [];
    for (const line of body.lines) {
      const product = productById.get(line.productId);
      const productQuants = quants.filter((quant) => relationId(quant.product_id) === line.productId);
      if (!product || (product.tracking && product.tracking !== "none")
        || productQuants.some((quant) => relationId(quant.lot_id) || relationId(quant.package_id) || relationId(quant.owner_id) || quant.inventory_quantity_set)) {
        throw new StocktakeError("A selected product now requires a lot, package, consignment, or pending-count workflow in Odoo.", 409);
      }
      const currentQty = productQuants.reduce((sum, quant) => sum + Number(quant.quantity || 0), 0);
      // An uncertain prior request may already have reached the requested quantity.
      // Observe that state without applying another adjustment.
      if (Math.abs(currentQty - line.countedQty) <= QUANTITY_EPSILON) continue;
      if (Math.abs(currentQty - line.expectedQty) > QUANTITY_EPSILON) {
        throw new StocktakeError(`${product.name} stock changed after it was counted. Refresh the count and review it again.`, 409);
      }
      if (Math.abs(currentQty - line.countedQty) > QUANTITY_EPSILON) {
        adjustments.push({ productId: line.productId, expectedQty: currentQty, countedQty: line.countedQty });
      }
    }

    if (!adjustments.length) {
      return NextResponse.json({ code: 0, message: "OK", data: { applied: 0, locationName: location.name, lines: [] } }, { headers: { "Cache-Control": "no-store" } });
    }

    const values = adjustments.map((line) => ({
      product_id: line.productId,
      location_id: location.id,
      inventory_quantity_auto_apply: line.countedQty,
    }));
    writeAttempted = true;
    const createdQuantIds = await rpc<number | number[]>(sessionId, "stock.quant", "create", [values], {
      context: { ...scope.context, inventory_mode: true },
    }, scope.correlationId);
    const adjustmentReferenceIds = (Array.isArray(createdQuantIds) ? createdQuantIds : [createdQuantIds])
      .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
    if (adjustmentReferenceIds.length !== adjustments.length) {
      throw new StocktakeError("Odoo did not return all inventory adjustment references. Reconcile the count in Odoo before continuing.", 502);
    }

    const verification = await rpc<StockQuant[]>(sessionId, "stock.quant", "search_read", [[
      ["product_id", "in", adjustments.map((line) => line.productId)],
      ["location_id", "=", location.id],
      ["company_id", "=", scope.companyId],
    ]], { fields: ["id", "product_id", "quantity"], limit: 5000, context: scope.context }, scope.correlationId);
    const lines = adjustments.map((line) => {
      const actualQty = (verification ?? [])
        .filter((quant) => relationId(quant.product_id) === line.productId)
        .reduce((sum, quant) => sum + Number(quant.quantity || 0), 0);
      if (Math.abs(actualQty - line.countedQty) > QUANTITY_EPSILON) {
        throw new StocktakeError("Odoo applied the adjustment but the refreshed quantity did not match. Reconcile this product in Odoo before continuing.", 502);
      }
      return { productId: line.productId, beforeQty: line.expectedQty, countedQty: line.countedQty, actualQty };
    });
    return NextResponse.json({ code: 0, message: "OK", data: {
      applied: lines.length,
      locationName: location.name,
      adjustmentReferenceIds,
      lines,
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (writeAttempted) return NextResponse.json({ code: 50290, resultState: "unknown", message: "Stock adjustment result is pending confirmation. Reconcile the count in Odoo before retrying.", data: null }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return responseError(error);
  }
}
