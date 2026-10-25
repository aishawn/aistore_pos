import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LINES = 40;

type RpcError = { message?: string; data?: { message?: string; name?: string } };
type Relation = number | [number, string] | false | null;

class TransferError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new TransferError("Orithos connection is not configured.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new TransferError("Orithos connection must use HTTPS.", 503);
  }
  return value;
}

function relationId(value: Relation): number | null {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function relationName(value: Relation): string | null {
  return Array.isArray(value) && typeof value[1] === "string" ? value[1] : null;
}

async function rpc<T>(
  sessionId: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
  correlationId?: string | null,
): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${baseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new TransferError("Orithos could not complete the transfer request.", 502);
  const payload = await response.json() as { result?: T; error?: RpcError };
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new TransferError("Orithos session expired.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new TransferError("Your Orithos account cannot move stock.", 403);
    throw new TransferError("Orithos rejected the transfer. Check locations, products, and quantities.", 422);
  }
  return payload.result as T;
}

async function tenantScope(request: NextRequest, sessionId: string) {
  const correlationId = request.headers.get("x-correlation-id");
  const response = await fetch(`${baseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new TransferError("Orithos session expired.", 401);
  const payload = await response.json() as {
    result?: { uid?: number; user_context?: { allowed_company_ids?: number[] } };
    error?: RpcError;
  };
  if (payload.error || !payload.result?.uid) throw new TransferError("Orithos session expired.", 401);
  const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, payload.result, correlationId);
  const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
  if (forced.error) throw new TransferError(forced.error, forced.status);
  const companyId = forced.companyIds[0];
  if (!companyId) throw new TransferError("No Orithos company is available to this account.", 403);
  return { companyId, context: odooCompanyContext([companyId]), correlationId };
}

function jsonError(error: unknown) {
  if (error instanceof StoreAccessError || error instanceof TransferError) {
    const response = NextResponse.json({ message: error.message }, { status: error.status });
    if (error.status === 401) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  const message = error instanceof Error ? error.message : "Orithos is unavailable";
  const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
  return NextResponse.json({ message }, { status });
}

async function loadWarehouses(sessionId: string, companyId: number, context: Record<string, unknown>, correlationId?: string | null) {
  const warehouses = await rpc<Array<{
    id: number;
    name: string;
    lot_stock_id: Relation;
    int_type_id: Relation;
  }>>(sessionId, "stock.warehouse", "search_read", [[["company_id", "=", companyId]]], {
    fields: ["id", "name", "lot_stock_id", "int_type_id"],
    limit: 40,
    order: "id asc",
    context,
  }, correlationId) ?? [];

  return warehouses
    .map((warehouse) => {
      const locationId = relationId(warehouse.lot_stock_id);
      const pickingTypeId = relationId(warehouse.int_type_id);
      if (!locationId || !pickingTypeId) return null;
      return {
        id: warehouse.id,
        name: warehouse.name,
        locationId,
        locationName: relationName(warehouse.lot_stock_id) || warehouse.name,
        pickingTypeId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });

  try {
    await requirePermission(request, "stock.receive");
    const { companyId, context, correlationId } = await tenantScope(request, sessionId);
    const warehouses = await loadWarehouses(sessionId, companyId, context, correlationId);
    const locationIds = warehouses.map((row) => row.locationId);
    const pickingTypeIds = warehouses.map((row) => row.pickingTypeId);

    let items: Array<Record<string, unknown>> = [];
    if (pickingTypeIds.length) {
      const pickings = await rpc<Array<{
        id: number;
        name: string;
        state: string;
        location_id: Relation;
        location_dest_id: Relation;
        scheduled_date: string | false;
        origin: string | false;
      }>>(sessionId, "stock.picking", "search_read", [[
        ["company_id", "=", companyId],
        ["picking_type_id", "in", pickingTypeIds],
      ]], {
        fields: ["id", "name", "state", "location_id", "location_dest_id", "scheduled_date", "origin"],
        limit: 40,
        order: "id desc",
        context,
      }, correlationId) ?? [];
      items = pickings.map((picking) => ({
        id: picking.id,
        name: picking.name,
        state: picking.state,
        fromLocation: relationName(picking.location_id),
        toLocation: relationName(picking.location_dest_id),
        scheduledDate: picking.scheduled_date || null,
        origin: picking.origin || null,
      }));
    }

    return NextResponse.json({
      writeEnabled: true,
      companyId,
      warehouses,
      locations: warehouses.map((row) => ({ id: row.locationId, name: row.locationName, warehouseId: row.id, pickingTypeId: row.pickingTypeId })),
      items,
      note: locationIds.length < 2
        ? "Need at least two stock locations (warehouses) in this Orithos company to transfer between outlets."
        : "Same-company internal transfers only. Cross-company store moves stay in Orithos.",
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid transfer request" }, { status: 400 });
  }

  if (Object.keys(body).some((key) => !["fromLocationId", "toLocationId", "note", "lines", "validate"].includes(key))) {
    return NextResponse.json({ message: "Unsupported transfer fields" }, { status: 400 });
  }

  const fromLocationId = body.fromLocationId;
  const toLocationId = body.toLocationId;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const validate = body.validate === true;
  const lines = body.lines;
  if (!Number.isSafeInteger(fromLocationId) || !Number.isSafeInteger(toLocationId) || fromLocationId === toLocationId) {
    return NextResponse.json({ message: "Choose two different stock locations" }, { status: 400 });
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) {
    return NextResponse.json({ message: `Choose between 1 and ${MAX_LINES} products` }, { status: 400 });
  }

  const lineMap = new Map<number, number>();
  for (const raw of lines) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ message: "Invalid product line" }, { status: 400 });
    const line = raw as Record<string, unknown>;
    const productId = line.productId;
    const quantity = line.quantity;
    if (!Number.isSafeInteger(productId) || Number(productId) < 1 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) {
      return NextResponse.json({ message: "Enter a valid quantity above zero for each product" }, { status: 400 });
    }
    lineMap.set(Number(productId), (lineMap.get(Number(productId)) ?? 0) + quantity);
  }

  try {
    await requirePermission(request, "stock.receive");
    const { companyId, context, correlationId } = await tenantScope(request, sessionId);
    const warehouses = await loadWarehouses(sessionId, companyId, context, correlationId);
    const from = warehouses.find((row) => row.locationId === Number(fromLocationId));
    const to = warehouses.find((row) => row.locationId === Number(toLocationId));
    if (!from || !to) return NextResponse.json({ message: "Selected locations are not available in this company" }, { status: 422 });

    const products = await rpc<Array<{ id: number; name?: string; display_name?: string; uom_id: Relation; type?: string; is_storable?: boolean }>>(
      sessionId,
      "product.product",
      "search_read",
      [[["id", "in", Array.from(lineMap.keys())]]],
      { fields: ["id", "name", "display_name", "uom_id", "type", "is_storable"], limit: MAX_LINES, context },
      correlationId,
    ) ?? [];
    if (products.length !== lineMap.size) return NextResponse.json({ message: "One or more products are unavailable" }, { status: 422 });

    const moveCommands = products.map((product) => {
      const uomId = relationId(product.uom_id);
      if (!uomId) throw new TransferError("A selected product has no unit of measure.", 422);
      const qty = lineMap.get(product.id) ?? 0;
      return [0, 0, {
        name: product.display_name || product.name || `Product ${product.id}`,
        product_id: product.id,
        product_uom_qty: qty,
        product_uom: uomId,
        location_id: from.locationId,
        location_dest_id: to.locationId,
      }];
    });

    const pickingId = await rpc<number>(sessionId, "stock.picking", "create", [{
      picking_type_id: from.pickingTypeId,
      location_id: from.locationId,
      location_dest_id: to.locationId,
      origin: note || "Orithos internal transfer",
      move_ids_without_package: moveCommands,
    }], { context }, correlationId);

    await rpc(sessionId, "stock.picking", "action_confirm", [[pickingId]], { context }, correlationId);
    try {
      await rpc(sessionId, "stock.picking", "action_assign", [[pickingId]], { context }, correlationId);
    } catch {
      /* reservation optional */
    }

    let state = "assigned";
    if (validate) {
      const moveFields = await rpc<Record<string, { type?: string }>>(sessionId, "stock.move", "fields_get", [], { attributes: ["type"] }, correlationId);
      const qtyField = moveFields && Object.hasOwn(moveFields, "quantity")
        ? "quantity"
        : moveFields && Object.hasOwn(moveFields, "quantity_done")
          ? "quantity_done"
          : null;
      if (!qtyField) throw new TransferError("Orithos did not expose a writable done-quantity field.", 422);
      const moves = await rpc<Array<{ id: number; product_uom_qty: number }>>(sessionId, "stock.move", "search_read", [[
        ["picking_id", "=", pickingId],
      ]], { fields: ["id", "product_uom_qty"], limit: MAX_LINES, context }, correlationId) ?? [];
      for (const move of moves) {
        await rpc(sessionId, "stock.move", "write", [[move.id], { [qtyField]: move.product_uom_qty }], { context }, correlationId);
      }
      const validateResult = await rpc<unknown>(sessionId, "stock.picking", "button_validate", [[pickingId]], { context }, correlationId);
      if (validateResult && typeof validateResult === "object" && !Array.isArray(validateResult)) {
        const action = validateResult as { res_model?: string; res_id?: number; context?: Record<string, unknown> };
        const wizardContext = { ...context, ...(action.context ?? {}) };
        if (action.res_model === "stock.immediate.transfer") {
          const wizardId = Number.isSafeInteger(action.res_id)
            ? action.res_id
            : await rpc<number>(sessionId, "stock.immediate.transfer", "create", [{}], { context: wizardContext }, correlationId);
          if (Number.isSafeInteger(wizardId)) {
            await rpc(sessionId, "stock.immediate.transfer", "process", [[wizardId]], { context: wizardContext }, correlationId);
          }
        } else if (action.res_model === "stock.backorder.confirmation") {
          const wizardId = Number.isSafeInteger(action.res_id)
            ? action.res_id
            : await rpc<number>(sessionId, "stock.backorder.confirmation", "create", [{
              pick_ids: [[6, 0, [pickingId]]],
              backorder_confirmation_line_ids: [[0, 0, { picking_id: pickingId, to_backorder: false }]],
            }], { context: wizardContext }, correlationId);
          if (Number.isSafeInteger(wizardId)) {
            await rpc(sessionId, "stock.backorder.confirmation", "process_cancel_backorder", [[wizardId]], { context: wizardContext }, correlationId)
              .catch(async () => rpc(sessionId, "stock.backorder.confirmation", "process", [[wizardId]], { context: wizardContext }, correlationId));
          }
        }
      }
      state = "done";
    }

    const refreshed = await rpc<Array<{ id: number; name: string; state: string }>>(sessionId, "stock.picking", "search_read", [[
      ["id", "=", pickingId],
    ]], { fields: ["id", "name", "state"], limit: 1, context }, correlationId);
    const picking = refreshed?.[0];

    return NextResponse.json({
      id: pickingId,
      name: picking?.name || `Transfer ${pickingId}`,
      state: picking?.state || state,
      fromLocation: from.locationName,
      toLocation: to.locationName,
    });
  } catch (error) {
    return jsonError(error);
  }
}
