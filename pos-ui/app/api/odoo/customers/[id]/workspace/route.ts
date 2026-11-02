import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { canReadBalances, companyDomain } from "@/lib/customer-access";
import { customerAmount, customerHistoryDomain, type CustomerSource, type CustomerTransaction } from "@/lib/customer-workspace";
import type { OdooCustomerRecord } from "@/lib/odoo-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Relation = [number, string] | false;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const me = await requirePermission(request, "customers.view", "customers.edit");
    const scope = await scopedOdoo(request);
    const rawId = (await context.params).id;
    const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    const section = request.nextUrl.searchParams.get("section") ?? "overview";
    const source = request.nextUrl.searchParams.get("source") ?? "odoo";
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(offset) || offset < 0 ||
        !["overview", "sales", "activity"].includes(section) || !["odoo", "shopfront"].includes(source)) {
      return NextResponse.json({ message: "Invalid customer request" }, { status: 400 });
    }
    const balanceAccess = canReadBalances(me);
    const fields = ["id", "name", "phone", "email", "ref", "street", "city", "vat", "comment", "category_id", "property_product_pricelist", "company_type", "active"];
    if (balanceAccess) fields.push("credit");
    const partners = await scope.rpc<OdooCustomerRecord[]>("res.partner", "search_read", [[
      ["id", "=", id], ["customer_rank", ">", 0], ...companyDomain(scope.companyIds),
    ]], { fields, limit: 1, active_test: false });
    if (!partners.length) return NextResponse.json({ message: "Customer was not found in this store." }, { status: 404 });
    const customer = partners[0];
    const headers = { "Cache-Control": "no-store" };
    const limit = section === "overview" ? 10 : 20;
    if (section === "activity") {
      const domain = [["partner_id", "=", id], ...companyDomain(scope.companyIds)];
      const rows = await scope.rpc<unknown[]>("shopfront.customer.activity", "search_read", [domain], {
        fields: ["id", "create_date", "kind", "summary", "create_uid"], offset, limit: limit + 1, order: "create_date desc, id desc",
      });
      return NextResponse.json({ activities: rows.slice(0, limit), hasNext: rows.length > limit }, { headers });
    }
    const sourceFields = ["id", "store_key", "source_id", "client_id", "source_group", "source_pricelist", "pricing_status", "source_updated_at", "history_synced_at", "synced_at", "conflicts"];
    if (balanceAccess) sourceFields.push("balance_known", "source_balance");
    const mappings = await scope.rpc<CustomerSource[]>("shopfront.sync.customer", "search_read", [[
      ["partner_id", "=", id], ...companyDomain(scope.companyIds),
    ]], { fields: sourceFields, limit: 2 });
    if (mappings.length > 1) throw new OdooScopeError("Customer source needs reconciliation.", 409);
    const mapping = mappings[0] ?? null;
    if (section === "sales" && source === "shopfront") {
      if (!mapping) return NextResponse.json({ items: [], hasNext: false, state: "unmapped" }, { headers });
      if (!mapping.history_synced_at) return NextResponse.json({ items: [], hasNext: false, state: "not_synced" }, { headers });
      const domain = customerHistoryDomain(mapping);
      type Mirror = { id: number; external_id: string; invoice_id: string; created_at: string; status: string; total_price: number; raw_payload: Record<string, unknown> };
      const [rows, total, mirrorCount] = await Promise.all([
        scope.rpc<Mirror[]>("shopfront.sync.sale", "search_read", [domain], { fields: ["id", "external_id", "invoice_id", "created_at", "status", "total_price", "raw_payload"], limit: limit + 1, offset, order: "created_at desc, id desc" }),
        scope.rpc<number>("shopfront.sync.sale", "search_count", [domain]),
        scope.rpc<number>("shopfront.sync.sale", "search_count", [[["store_key", "=", mapping.store_key]]]),
      ]);
      const page = rows.slice(0, limit);
      const ids = page.map(row => row.id);
      type Line = { id: number; sale_id: Relation; product_name: string; quantity: number; line_total: number; raw_payload: Record<string, unknown> };
      type Payment = { id: number; sale_id: Relation; payment_key: string; amount: number; status: string; raw_payload: Record<string, unknown> };
      const [lines, payments] = ids.length ? await Promise.all([
        scope.rpc<Line[]>("shopfront.sync.sale.line", "search_read", [[["sale_id", "in", ids]]], { fields: ["id", "sale_id", "product_name", "quantity", "line_total", "raw_payload"], limit: 2001 }),
        balanceAccess ? scope.rpc<Payment[]>("shopfront.sync.payment", "search_read", [[["sale_id", "in", ids]]], { fields: ["id", "sale_id", "payment_key", "amount", "status", "raw_payload"], limit: 2001 }) : Promise.resolve([]),
      ]) : [[], []];
      if (lines.length > 2000 || payments.length > 2000) throw new OdooScopeError("History page is too large. Contact support to inspect this order.", 422);
      const items: CustomerTransaction[] = page.map(row => ({ id: row.id, reference: row.invoice_id || row.external_id,
        date: row.created_at, status: row.status,
        amount: customerAmount(row.raw_payload.total_price ?? row.raw_payload.totalPrice),
        operator: typeof (row.raw_payload.raw_payload as { user?: { name?: string } } | undefined)?.user?.name === "string" ? (row.raw_payload.raw_payload as { user: { name: string } }).user.name : null,
        lines: lines.filter(line => Array.isArray(line.sale_id) && line.sale_id[0] === row.id).map(line => ({ id: line.id, product: line.product_name,
          quantity: customerAmount(line.raw_payload.quantity), amount: customerAmount(line.raw_payload.line_total ?? line.raw_payload.total_price ?? line.raw_payload.totalPrice) })),
        payments: payments.filter(payment => Array.isArray(payment.sale_id) && payment.sale_id[0] === row.id).map(payment => ({ id: payment.id, reference: payment.payment_key,
          amount: customerAmount(payment.raw_payload.amount), status: payment.status })),
      }));
      return NextResponse.json({ items, total, hasNext: rows.length > limit, state: mirrorCount ? "ready" : "not_synced" }, { headers });
    }
    type Order = { id: number; name: string; date_order: string; amount_total: number; state: string; user_id: Relation };
    const domain = [["partner_id", "=", id], ...companyDomain(scope.companyIds)];
    const [rows, total] = await Promise.all([
      scope.rpc<Order[]>("pos.order", "search_read", [domain], { fields: ["id", "name", "date_order", "amount_total", "state", "user_id"], limit: limit + 1, offset, order: "date_order desc, id desc" }),
      scope.rpc<number>("pos.order", "search_count", [domain]),
    ]);
    const page = rows.slice(0, limit);
    const ids = page.map(row => row.id);
    type Line = { id: number; order_id: Relation; full_product_name: string; qty: number; price_subtotal_incl: number };
    type Payment = { id: number; pos_order_id: Relation; payment_method_id: Relation; amount: number };
    const [lines, payments] = ids.length ? await Promise.all([
      scope.rpc<Line[]>("pos.order.line", "search_read", [[["order_id", "in", ids], ...companyDomain(scope.companyIds)]], { fields: ["id", "order_id", "full_product_name", "qty", "price_subtotal_incl"], limit: 2001 }),
      balanceAccess ? scope.rpc<Payment[]>("pos.payment", "search_read", [[["pos_order_id", "in", ids], ...companyDomain(scope.companyIds)]], { fields: ["id", "pos_order_id", "payment_method_id", "amount"], limit: 2001 }) : Promise.resolve([]),
    ]) : [[], []];
    if (lines.length > 2000 || payments.length > 2000) throw new OdooScopeError("Order page is too large. Contact support to inspect this order.", 422);
    const items: CustomerTransaction[] = page.map(row => ({ id: row.id, reference: row.name, date: row.date_order, status: row.state,
      amount: customerAmount(row.amount_total), operator: Array.isArray(row.user_id) ? row.user_id[1] : null,
      lines: lines.filter(line => Array.isArray(line.order_id) && line.order_id[0] === row.id).map(line => ({ id: line.id, product: line.full_product_name, quantity: customerAmount(line.qty), amount: customerAmount(line.price_subtotal_incl) })),
      payments: payments.filter(payment => Array.isArray(payment.pos_order_id) && payment.pos_order_id[0] === row.id).map(payment => ({ id: payment.id, reference: Array.isArray(payment.payment_method_id) ? payment.payment_method_id[1] : "Payment", amount: customerAmount(payment.amount), status: row.state })),
    }));
    if (section === "sales") return NextResponse.json({ items, total, hasNext: rows.length > limit, state: "ready" }, { headers });
    const [groups, companies, users] = await Promise.all([
      scope.rpc<{ name: string }[]>("res.partner.category", "search_read", [[["id", "in", customer.category_id ?? []], ...companyDomain(scope.companyIds, true)]], { fields: ["name"], limit: 100 }),
      scope.rpc<{ currency_id: Relation; partner_id: Relation }[]>("res.company", "search_read", [[["id", "in", scope.companyIds]]], { fields: ["currency_id", "partner_id"], limit: 1 }),
      scope.rpc<{ tz: string | false }[]>("res.users", "search_read", [[["id", "=", scope.uid]]], { fields: ["tz"], limit: 1 }),
    ]);
    // Company contact timezone takes precedence over the integration user's location.
    const companyPartner = companies[0]?.partner_id;
    const companyContacts = Array.isArray(companyPartner) ? await scope.rpc<{ tz: string | false }[]>("res.partner", "search_read", [[["id", "=", companyPartner[0]]]], { fields: ["tz"], limit: 1 }) : [];
    return NextResponse.json({ customer, groups: groups.map(group => group.name), source: mapping, canBalance: balanceAccess,
      timezone: companyContacts[0]?.tz || users[0]?.tz || "Australia/Adelaide",
      currency: Array.isArray(companies[0]?.currency_id) ? companies[0].currency_id[1] : "AUD", items, total, hasNext: rows.length > limit }, { headers });
  } catch (error) {
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message: status === 401 || status === 403 || status === 404 ? (error as Error).message : "Customer data could not be loaded. Retry or contact support." }, { status });
  }
}
