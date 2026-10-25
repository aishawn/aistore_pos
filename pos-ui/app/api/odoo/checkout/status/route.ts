import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";

export const dynamic = "force-dynamic";
type Relation = [number, string] | false;

/** Reconcile an uncertain checkout without issuing another business write. */
export async function GET(request: NextRequest) {
  const uuid = request.nextUrl.searchParams.get("orderUuid") ?? "";
  const configId = Number(request.nextUrl.searchParams.get("configId"));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    || !Number.isSafeInteger(configId) || configId < 1) return NextResponse.json({ message: "Invalid order identity." }, { status: 400 });
  try {
    const scope = await scopedOdoo(request);
    const orders = await scope.rpc<Array<{
      id: number; name: string; pos_reference: string; state: string; amount_total: number;
      amount_tax: number; amount_paid: number; amount_return: number; lines: number[];
      date_order: string; session_id: Relation;
    }>>("pos.order", "search_read", [[
      ["uuid", "=", uuid], ["config_id", "=", configId], ["company_id", "in", scope.companyIds],
    ]], { fields: ["id", "name", "pos_reference", "state", "amount_total", "amount_tax", "amount_paid", "amount_return", "lines", "date_order", "session_id"], limit: 2 });
    if (orders.length !== 1 || !["paid", "done", "invoiced"].includes(orders[0].state)) {
      return NextResponse.json({ resultState: "unknown", message: "No single completed order is confirmed yet. Keep the order open and check history before retrying." }, { headers: { "Cache-Control": "no-store" } });
    }
    const order = orders[0];
    const lines = order.lines.length ? await scope.rpc<Array<{ full_product_name: string; qty: number; price_subtotal: number; price_subtotal_incl: number }>>("pos.order.line", "search_read", [[
      ["id", "in", order.lines], ["order_id", "=", order.id],
    ]], { fields: ["full_product_name", "qty", "price_subtotal", "price_subtotal_incl"], limit: 80 }) : [];
    return NextResponse.json({ resultState: "confirmed", result: {
      saleId: order.id, receipt: order.pos_reference || order.name,
      total: Math.abs(order.amount_total), gst: Math.abs(order.amount_tax),
      subtotal: Math.round((Math.abs(order.amount_total) - Math.abs(order.amount_tax)) * 100) / 100,
      // Orithos amount_paid is net of the negative cash-change payment line.
      tendered: order.amount_total < 0 ? Math.abs(order.amount_paid) : Math.round((order.amount_paid + Math.abs(order.amount_return)) * 100) / 100,
      change: order.amount_total < 0 ? 0 : Math.abs(order.amount_return), isRefund: order.amount_total < 0,
      lines: lines.map((line) => ({ name: line.full_product_name, quantity: line.qty, subtotal: line.price_subtotal, total: line.price_subtotal_incl })),
      date: order.date_order, session: Array.isArray(order.session_id) ? order.session_id[1] : "",
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ resultState: "unknown", message: "Could not confirm the order. Check sales history before retrying." }, {
      status: error instanceof OdooScopeError ? error.status : 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
