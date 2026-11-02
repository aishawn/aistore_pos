import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import type { WorkspaceRecords } from "@/lib/workspace-records";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Fixed read-only datasets. Browser input never selects an arbitrary model or field.
const datasets = {
  catalogue: {
    model: "product.product", orderField: "", date: "",
    fields: ["id", "name", "default_code", "barcode", "qty_available", "free_qty"],
    search: ["name", "default_code", "barcode"],
    columns: [
      { key: "name", label: "Product" }, { key: "default_code", label: "SKU" }, { key: "barcode", label: "Barcode" },
      { key: "qty_available", label: "On hand" }, { key: "free_qty", label: "Available" },
    ],
  },
  lines: {
    model: "pos.order.line", orderField: "order_id", date: "order_id.date_order",
    fields: ["id", "order_id", "product_id", "qty", "price_unit", "discount", "price_subtotal_incl"],
    search: ["order_id.pos_reference", "order_id.name", "product_id.name", "product_id.default_code", "product_id.barcode"],
    columns: [
      { key: "date", label: "Date", format: "date" }, { key: "receipt", label: "Receipt" },
      { key: "product_id", label: "Product" }, { key: "qty", label: "Quantity" },
      { key: "price_unit", label: "Unit price", format: "money" }, { key: "discount", label: "Discount %" },
      { key: "price_subtotal_incl", label: "Total incl. tax", format: "money" },
    ],
  },
  payments: {
    model: "pos.payment", orderField: "pos_order_id", date: "payment_date",
    fields: ["id", "pos_order_id", "payment_method_id", "payment_date", "amount"],
    search: ["pos_order_id.pos_reference", "pos_order_id.name", "payment_method_id.name"],
    columns: [
      { key: "payment_date", label: "Date", format: "date" }, { key: "receipt", label: "Receipt" },
      { key: "payment_method_id", label: "Payment method" }, { key: "amount", label: "Amount", format: "money" },
      { key: "session", label: "Register session" },
    ],
  },
  inventory: {
    model: "stock.quant", orderField: "", date: "",
    fields: ["id", "product_id", "location_id", "quantity", "reserved_quantity"],
    search: ["product_id.name", "product_id.default_code", "product_id.barcode", "location_id.complete_name"],
    columns: [
      { key: "product_id", label: "Product" }, { key: "location_id", label: "Location" },
      { key: "quantity", label: "On hand" }, { key: "reserved_quantity", label: "Reserved" },
      { key: "available", label: "Available" },
    ],
  },
} satisfies Record<string, { model: string; orderField: string; date: string; fields: string[]; search: string[]; columns: WorkspaceRecords["columns"] }>;

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "lines" && type !== "payments" && type !== "inventory" && type !== "catalogue") return NextResponse.json({ message: "Unknown records view" }, { status: 400 });
  const stock = type === "inventory" || type === "catalogue";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  const period = request.nextUrl.searchParams.get("period") ?? "all";
  const hours = { all: 0, "24h": 24, "7d": 168, "30d": 720 };
  if (!Number.isSafeInteger(offset) || offset < 0 || !Object.hasOwn(hours, period)) return NextResponse.json({ message: "Invalid records filter" }, { status: 400 });
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  try {
    await requirePermission(request, ...(stock ? ["stock.products.view"] : ["sell.checkout", "sell.refund", "reports.dashboard"]));
    const scope = await scopedOdoo(request);
    const config = datasets[type];
    const domain: unknown[] = [[stock ? "company_id" : `${config.orderField}.company_id`, "in", scope.companyIds]];
    if (type === "inventory") {
      domain.push(["location_id.usage", "=", "internal"]);
      if (scope.binding?.odooStockLocationId) domain.push(["location_id", "child_of", scope.binding.odooStockLocationId]);
      else if (scope.binding?.odooWarehouseId) {
        const warehouses = await scope.rpc<{ view_location_id: [number, string] }[]>("stock.warehouse", "search_read", [[
          ["id", "=", scope.binding.odooWarehouseId], ["company_id", "in", scope.companyIds],
        ]], { fields: ["view_location_id"], limit: 1 });
        if (!warehouses[0]?.view_location_id) throw new OdooScopeError("Store warehouse is unavailable.", 403);
        domain.push(["location_id", "child_of", warehouses[0].view_location_id[0]]);
      }
    } else if (!stock) {
      if (scope.binding?.sampleDataClearedAt) domain.push("!", [`${config.orderField}.uuid`, "=like", `demo-seed-${scope.companyIds[0]}-%`]);
      const periodHours = hours[period as keyof typeof hours];
      if (periodHours) domain.push([config.date, ">=", new Date(Date.now() - periodHours * 3600000).toISOString().slice(0, 19).replace("T", " ")]);
    }
    if (query) domain.push(...Array(config.search.length - 1).fill("|"), ...config.search.map((field) => [field, "ilike", query]));
    const rows = await scope.rpc<WorkspaceRecords["items"]>(config.model, "search_read", [domain], {
      fields: config.fields, limit: 41, offset, order: "id desc",
    });
    let items = rows.slice(0, 40);
    if (type === "inventory") items = items.map((row) => ({ ...row, available: Number(row.quantity) - Number(row.reserved_quantity) }));
    else if (!stock && items.length) {
      const orderIds = [...new Set(items.map((row) => (row[config.orderField] as [number, string])[0]))];
      const orders = await scope.rpc<WorkspaceRecords["items"]>("pos.order", "search_read", [[
        ["id", "in", orderIds], ["company_id", "in", scope.companyIds],
      ]], { fields: ["id", "name", "pos_reference", "date_order", "session_id"], limit: 40 });
      const byId = new Map(orders.map((order) => [order.id, order]));
      items = items.map((row) => {
        const order = byId.get((row[config.orderField] as [number, string])[0]);
        return { ...row, receipt: order?.pos_reference || order?.name || "—", date: order?.date_order, session: order?.session_id };
      });
    }
    const companies = await scope.rpc<{ currency_id: [number, string]; partner_id: [number, string] }[]>("res.company", "search_read", [[
      ["id", "in", scope.companyIds],
    ]], { fields: ["currency_id", "partner_id"], limit: 1 });
    const partnerId = companies[0]?.partner_id?.[0];
    const partners = partnerId ? await scope.rpc<{ country_id: [number, string] | false; state_id: [number, string] | false }[]>("res.partner", "search_read", [[["id", "=", partnerId]]], { fields: ["country_id", "state_id"], limit: 1 }) : [];
    return NextResponse.json({ columns: config.columns, items, hasNext: rows.length > 40,
      currency: companies[0]?.currency_id?.[1] ?? "AUD", timezone: getOdooCompanyTimezone(partners[0]?.country_id, partners[0]?.state_id),
    } satisfies WorkspaceRecords, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof StoreAccessError || error instanceof OdooScopeError ? error.status : 502;
    return NextResponse.json({ message: status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "You do not have access to these records." : "Records are unavailable. Please retry." }, { status });
  }
}
