import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
type RpcError = { message?: string; data?: { message?: string; name?: string } };
type RpcEnvelope<T> = { result?: T; error?: RpcError };

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

class ReceiveError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ReceiveError("Odoo purchase receive service is unavailable", 502);
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new ReceiveError("Your Odoo session has expired. Sign in to Odoo again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new ReceiveError("Your Odoo account does not have permission to receive this purchase order.", 403);
    throw new ReceiveError(payload.error.data?.message || payload.error.message || "Odoo could not complete this receive request.", 422);
  }
  return payload.result as T;
}

async function getCompanyIds(request: NextRequest, sessionId: string) {
  const response = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ReceiveError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const payload = await response.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
  if (payload.error || !payload.result?.uid) throw new ReceiveError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, payload.result);
  const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
  if (forced.error) throw new ReceiveError(forced.error, forced.status);
  if (!forced.companyIds.length) throw new ReceiveError("No Odoo companies are available to this user.", 403);
  return forced.companyIds;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Odoo is unavailable";
  const status = error instanceof ReceiveError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
  const response = NextResponse.json({ message }, { status });
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

type ReceiveLine = { moveId: number; qtyDone: number };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const { id: rawId } = await context.params;
  const purchaseId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(purchaseId) || purchaseId < 1) return NextResponse.json({ message: "Invalid purchase order" }, { status: 400 });

  let body: { confirm?: unknown; pickingId?: unknown; lines?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid receive request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.confirm !== true) {
    return NextResponse.json({ message: "Explicit confirmation is required" }, { status: 400 });
  }

  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines: ReceiveLine[] = [];
  for (const row of linesRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return NextResponse.json({ message: "Each receive line must include moveId and qtyDone" }, { status: 400 });
    }
    const moveId = Number((row as { moveId?: unknown }).moveId);
    const qtyDone = Number((row as { qtyDone?: unknown }).qtyDone);
    if (!Number.isSafeInteger(moveId) || moveId < 1 || !Number.isFinite(qtyDone) || qtyDone < 0) {
      return NextResponse.json({ message: "Each receive line must include a valid moveId and non-negative qtyDone" }, { status: 400 });
    }
    lines.push({ moveId, qtyDone: Math.round(qtyDone * 10000) / 10000 });
  }
  if (!lines.length) return NextResponse.json({ message: "Add at least one receive line" }, { status: 400 });

  const pickingIdHint = body.pickingId == null ? null : Number(body.pickingId);
  if (pickingIdHint != null && (!Number.isSafeInteger(pickingIdHint) || pickingIdHint < 1)) {
    return NextResponse.json({ message: "Invalid pickingId" }, { status: 400 });
  }

  try {
    const companyIds = await getCompanyIds(request, sessionId);
    const companyContext = { allowed_company_ids: companyIds, force_company: companyIds[0] };

    const orders = await rpc<Array<{ id: number; name: string; state: string; picking_ids?: number[] }>>(sessionId, "purchase.order", "search_read", [[
      ["id", "=", purchaseId], ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "state", "picking_ids"], limit: 1, context: companyContext });
    const order = orders?.[0];
    if (!order) return NextResponse.json({ message: "Purchase order not found or you do not have access to it." }, { status: 404 });
    if (order.state !== "purchase" && order.state !== "done") {
      return NextResponse.json({ message: "Confirm the purchase order before receiving stock." }, { status: 409 });
    }

    const pickingIds = Array.isArray(order.picking_ids) ? order.picking_ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
    if (!pickingIds.length) {
      return NextResponse.json({ message: "No incoming receipts are linked to this purchase order yet." }, { status: 409 });
    }

    const pickingFields = await rpc<Record<string, { type?: string }>>(sessionId, "stock.picking", "fields_get", [], { attributes: ["type"] });
    const moveRelationField = Object.hasOwn(pickingFields ?? {}, "move_ids_without_package")
      ? "move_ids_without_package"
      : Object.hasOwn(pickingFields ?? {}, "move_ids")
        ? "move_ids"
        : null;
    if (!moveRelationField) throw new ReceiveError("Odoo did not expose stock moves for this receipt.", 422);

    const pickings = await rpc<Array<Record<string, unknown>>>(sessionId, "stock.picking", "search_read", [[
      ["id", "in", pickingIds],
      ["company_id", "in", companyIds],
      ["state", "in", ["assigned", "confirmed", "waiting"]],
    ]], {
      fields: ["id", "name", "state", "picking_type_code", moveRelationField],
      limit: 50,
      context: companyContext,
    }) ?? [];

    const incoming = pickings.filter((picking) => !picking.picking_type_code || picking.picking_type_code === "incoming");
    if (!incoming.length) {
      return NextResponse.json({ message: "No open incoming receipts are ready to receive." }, { status: 409 });
    }

    const picking = pickingIdHint
      ? incoming.find((row) => Number(row.id) === pickingIdHint)
      : incoming.length === 1
        ? incoming[0]
        : null;
    if (!picking) {
      return NextResponse.json({
        message: pickingIdHint
          ? "The selected receipt is not an open incoming transfer for this purchase order."
          : "Multiple open receipts exist. Pass pickingId to choose one.",
        openPickingIds: incoming.map((row) => Number(row.id)),
      }, { status: 409 });
    }
    const selectedPickingId = Number(picking.id);
    const selectedPickingName = String(picking.name || "");
    const selectedPickingState = String(picking.state || "");

    const moveIds = Array.isArray(picking[moveRelationField])
      ? (picking[moveRelationField] as unknown[])
        .filter((id) => Number.isSafeInteger(id) && Number(id) > 0)
        .map((id) => Number(id))
      : [];
    const moveFields = await rpc<Record<string, { type?: string }>>(sessionId, "stock.move", "fields_get", [], { attributes: ["type"] });
    const qtyField = moveFields && Object.hasOwn(moveFields, "quantity")
      ? "quantity"
      : moveFields && Object.hasOwn(moveFields, "quantity_done")
        ? "quantity_done"
        : null;
    if (!qtyField) throw new ReceiveError("Odoo did not expose a writable received quantity field.", 422);
    const moves = moveIds.length
      ? await rpc<Array<{
          id: number;
          product_uom_qty: number;
          quantity?: number;
          quantity_done?: number;
          product_id: [number, string] | false;
        }>>(sessionId, "stock.move", "search_read", [[
          ["id", "in", moveIds],
          ["picking_id", "=", selectedPickingId],
        ]], {
          fields: ["id", "product_uom_qty", qtyField, "product_id"],
          limit: 200,
          context: companyContext,
        }) ?? []
      : [];

    const moveById = new Map(moves.map((move) => [move.id, move]));
    for (const line of lines) {
      const move = moveById.get(line.moveId);
      if (!move) throw new ReceiveError(`Move ${line.moveId} is not on receipt ${selectedPickingName}.`, 400);
      if (line.qtyDone > move.product_uom_qty + 1e-9) {
        throw new ReceiveError(`Quantity for ${Array.isArray(move.product_id) ? move.product_id[1] : "a line"} exceeds ordered quantity.`, 400);
      }
    }

    for (const line of lines) {
      await rpc<boolean>(sessionId, "stock.move", "write", [[line.moveId], { [qtyField]: line.qtyDone }], { context: companyContext });
    }

    const validateResult = await rpc<unknown>(sessionId, "stock.picking", "button_validate", [[selectedPickingId]], { context: companyContext });

    // Odoo may return a wizard action for backorders / immediate transfer.
    if (validateResult && typeof validateResult === "object" && !Array.isArray(validateResult)) {
      const action = validateResult as { res_model?: string; res_id?: number; context?: Record<string, unknown> };
      const wizardContext = { ...companyContext, ...(action.context ?? {}) };
      if (action.res_model === "stock.immediate.transfer") {
        const wizardId = Number.isSafeInteger(action.res_id)
          ? action.res_id
          : await rpc<number>(sessionId, "stock.immediate.transfer", "create", [{}], { context: wizardContext });
        if (Number.isSafeInteger(wizardId)) {
          await rpc<unknown>(sessionId, "stock.immediate.transfer", "process", [[wizardId]], { context: wizardContext });
        }
      } else if (action.res_model === "stock.backorder.confirmation") {
        const wizardId = Number.isSafeInteger(action.res_id)
          ? action.res_id
          : await rpc<number>(sessionId, "stock.backorder.confirmation", "create", [{
            pick_ids: [[6, 0, [selectedPickingId]]],
            backorder_confirmation_line_ids: [[0, 0, { picking_id: selectedPickingId, to_backorder: true }]],
          }], { context: wizardContext });
        if (Number.isSafeInteger(wizardId)) {
          await rpc<unknown>(sessionId, "stock.backorder.confirmation", "process", [[wizardId]], { context: wizardContext });
        }
      }
    }

    const refreshed = await rpc<Array<{ id: number; name: string; state: string }>>(sessionId, "stock.picking", "search_read", [[
      ["id", "=", selectedPickingId],
    ]], { fields: ["id", "name", "state"], limit: 1, context: companyContext });

    return NextResponse.json({
      ok: true,
      purchaseId,
      purchaseName: order.name,
      pickingId: selectedPickingId,
      pickingName: refreshed?.[0]?.name || selectedPickingName,
      pickingState: refreshed?.[0]?.state || selectedPickingState,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
