import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

type InvoiceRow = {
  id: number;
  name: string;
  move_type: string;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
  state: string;
  currency_id: Many2One;
};

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.balances");
    const scope = await scopedOdoo(request);
    const rawId = (await context.params).id;
    const partnerId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    if (!Number.isSafeInteger(partnerId) || partnerId < 1) {
      return NextResponse.json({ message: "Invalid customer ID" }, { status: 400 });
    }

    const partners = await scope.rpc<Array<{ id: number; name: string; credit: number }>>("res.partner", "search_read", [[
      ["id", "=", partnerId],
      ["customer_rank", ">", 0],
    ]], { fields: ["id", "name", "credit"], limit: 1 });
    if (!partners?.length) return NextResponse.json({ message: "Customer was not found" }, { status: 404 });

    const openOnly = request.nextUrl.searchParams.get("openOnly") !== "false";
    const domain: unknown[] = [
      ["partner_id", "=", partnerId],
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      "|",
      ["company_id", "=", false],
      ["company_id", "in", scope.companyIds],
    ];
    if (openOnly) domain.push(["payment_state", "in", ["not_paid", "partial", "in_payment"]]);

    const rows = await scope.rpc<InvoiceRow[]>("account.move", "search_read", [domain], {
      fields: ["id", "name", "move_type", "invoice_date", "invoice_date_due", "amount_total", "amount_residual", "payment_state", "state", "currency_id"],
      limit: 50,
      order: "invoice_date_due asc, id desc",
    });

    const items = (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      moveType: row.move_type,
      invoiceDate: row.invoice_date || null,
      dueDate: row.invoice_date_due || null,
      amountTotal: Number(row.amount_total) || 0,
      amountResidual: Number(row.amount_residual) || 0,
      paymentState: row.payment_state,
      currency: Array.isArray(row.currency_id) ? row.currency_id[1] : null,
    }));

    return NextResponse.json({
      customer: { id: partners[0].id, name: partners[0].name, credit: Number(partners[0].credit) || 0 },
      items,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo customer invoices are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
