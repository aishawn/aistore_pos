import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import type { WorkspaceRecords } from "@/lib/workspace-records";
import { verifiedShopfrontSourceStoreFromHost } from "@/lib/shopfront-store-scope";
import { businessDayToday, shiftBusinessDay } from "@/lib/sales-daily";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STORE_TIMEZONE = "Australia/Adelaide";
const LINE_COLUMNS: WorkspaceRecords["columns"] = [
  { key: "date", label: "Date", format: "date" },
  { key: "receipt", label: "Receipt" },
  { key: "product_id", label: "Items" },
  { key: "qty", label: "Line count" },
  { key: "price_unit", label: "Avg unit", format: "money" },
  { key: "discount", label: "Discount" },
  { key: "price_subtotal_incl", label: "Total incl. tax", format: "money" },
];
const PAYMENT_COLUMNS: WorkspaceRecords["columns"] = [
  { key: "payment_date", label: "Date", format: "date" },
  { key: "receipt", label: "Receipt" },
  { key: "payment_method_id", label: "Status" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "session", label: "Sale id" },
];

function periodFromDay(period: string) {
  const today = businessDayToday(STORE_TIMEZONE);
  if (period === "24h") return shiftBusinessDay(today, -1);
  if (period === "7d") return shiftBusinessDay(today, -6);
  if (period === "30d") return shiftBusinessDay(today, -29);
  return shiftBusinessDay(today, -89);
}

async function shopfrontSalesRecords(store: string, type: "lines" | "payments", offset: number, period: string, query: string): Promise<WorkspaceRecords> {
  const base = (process.env.SHOPFRONT_CRAWLER_URL || "https://crawler.orithos.com.au").trim().replace(/\/+$/, "");
  const token = (process.env.SHOPFRONT_INTEGRATION_TOKEN || process.env.APP_SHOPFRONT_INTEGRATION_TOKEN || "").trim();
  if (!token) throw Object.assign(new Error("Shopfront source access is not configured."), { status: 503 });
  const pageSize = 40;
  const page = Math.floor(offset / pageSize) + 1;
  const target = new URL("/api/sales", `${base}/`);
  target.searchParams.set("store", store);
  target.searchParams.set("page", String(page));
  target.searchParams.set("size", String(pageSize));
  if (period !== "all") {
    target.searchParams.set("from", periodFromDay(period));
    target.searchParams.set("to", businessDayToday(STORE_TIMEZONE));
  }
  const upstream = await fetch(target, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!upstream.ok) throw Object.assign(new Error("Shopfront sales are unavailable."), { status: upstream.status >= 500 ? 503 : upstream.status });
  const payload = await upstream.json() as {
    data?: Array<Record<string, unknown>>;
    pagination?: { total?: number; page?: number; size?: number; returned?: number };
  };
  if (!Array.isArray(payload.data) || !payload.pagination || !Number.isSafeInteger(payload.pagination.total)) {
    throw Object.assign(new Error("Shopfront sales are unavailable."), { status: 502 });
  }
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? payload.data.filter((row) => {
      const invoice = String(row.invoice_id ?? "").toLowerCase();
      const saleId = String(row.shopfront_sale_id ?? "").toLowerCase();
      const status = String(row.status ?? "").toLowerCase();
      return invoice.includes(needle) || saleId.includes(needle) || status.includes(needle);
    })
    : payload.data;
  const items = filtered.map((row, index) => {
    const total = Number(row.total_price ?? 0);
    const tax = Number(row.total_tax ?? 0);
    const discount = Number(row.total_discount ?? 0);
    const lineCount = Array.isArray(row.sale_item_ids) ? row.sale_item_ids.length : null;
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    if (type === "payments") {
      return {
        id: offset + index + 1,
        payment_date: createdAt,
        receipt: row.invoice_id || row.shopfront_sale_id || "—",
        payment_method_id: row.status || "—",
        amount: total,
        session: row.shopfront_sale_id || "—",
      };
    }
    return {
      id: offset + index + 1,
      date: createdAt,
      receipt: row.invoice_id || row.shopfront_sale_id || "—",
      product_id: lineCount == null ? "Sale" : `${lineCount} line${lineCount === 1 ? "" : "s"}`,
      qty: lineCount,
      price_unit: lineCount && lineCount > 0 ? Math.round((total / lineCount) * 100) / 100 : total,
      discount,
      price_subtotal_incl: total,
      tax,
    };
  });
  return {
    columns: type === "payments" ? PAYMENT_COLUMNS : LINE_COLUMNS,
    items,
    hasNext: offset + pageSize < Number(payload.pagination.total),
    currency: "AUD",
    timezone: STORE_TIMEZONE,
  };
}

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
    const shopfrontStore = verifiedShopfrontSourceStoreFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
    if (!stock && shopfrontStore) {
      // Demo/SKR cutover: abandoned Odoo pos.order lines undercount after write-off.
      // Sales lines/payments must read the same Shopfront sale mirror as daily history.
      return NextResponse.json(await shopfrontSalesRecords(shopfrontStore, type, offset, period, query), {
        headers: { "Cache-Control": "no-store" },
      });
    }
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
