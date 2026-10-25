import { scopedOdoo } from "@/lib/odoo-scope";
import { canReadBalances, companyDomain } from "@/lib/customer-access";
import { categoryScope, categoryDomain, categoryError } from "@/lib/odoo-categories";
import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import { catalogueDomain } from "@/lib/product-catalogue";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LIMIT = 100;

const RECORD_TYPES = {
  products: {
    model: "product.product",
    fields: ["id", "name", "display_name", "barcode", "default_code", "list_price", "taxes_id", "qty_available", "free_qty", "uom_id", "pos_categ_ids", "available_in_pos"],
    order: "name asc, id asc",
    searchFields: ["name", "barcode", "default_code"],
    baseDomain: [["available_in_pos", "=", true]],
  },
  purchaseProducts: {
    model: "product.product",
    fields: ["id", "name", "display_name", "barcode", "default_code", "list_price", "uom_id", "purchase_ok"],
    order: "name asc, id asc",
    searchFields: ["name", "barcode", "default_code"],
    baseDomain: [["purchase_ok", "=", true]],
  },
  posCategories: {
    model: "pos.category",
    fields: ["id", "name", "parent_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  customers: {
    model: "res.partner",
    fields: [
      "id",
      "name",
      "phone",
      "email",
      "customer_rank",
      "ref",
      "property_product_pricelist",
      "category_id",
      "credit",
      "total_invoiced",
      "street",
      "city",
      "vat",
      "company_type",
      "active",
    ],
    order: "name asc, id asc",
    searchFields: ["name", "phone", "email", "ref"],
    baseDomain: [["customer_rank", ">", 0]],
  },
  suppliers: {
    model: "res.partner",
    fields: ["id", "name", "phone", "email", "vat", "ref", "supplier_rank"],
    order: "name asc, id asc",
    searchFields: ["name", "phone", "email", "vat", "ref"],
    baseDomain: [["supplier_rank", ">", 0]],
  },
  outlets: {
    model: "res.company",
    fields: ["id", "name", "currency_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  registers: {
    model: "pos.config",
    fields: ["id", "name", "company_id", "current_session_id", "payment_method_ids", "available_pricelist_ids"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  sessions: {
    model: "pos.session",
    fields: ["id", "name", "state", "config_id", "user_id", "start_at", "stop_at"],
    order: "start_at desc, id desc",
    searchFields: ["name"],
    baseDomain: [],
  },
  paymentMethods: {
    model: "pos.payment.method",
    fields: ["id", "name", "type", "journal_id", "is_cash_count"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  taxes: {
    model: "account.tax",
    fields: ["id", "name", "amount", "amount_type", "type_tax_use", "price_include", "company_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [["type_tax_use", "=", "sale"], ["active", "=", true]],
  },
  sales: {
    model: "pos.order",
    fields: ["id", "name", "pos_reference", "date_order", "amount_total", "amount_tax", "state", "partner_id", "session_id", "user_id"],
    order: "date_order desc, id desc",
    searchFields: ["name", "pos_reference"],
    baseDomain: [],
  },
} as const;

type RecordType = keyof typeof RECORD_TYPES;

async function withTaxInclusivePrices(sessionId: string, items: unknown[], correlationId?: string | null) {
  const products = items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  let cursor = 0;
  const worker = async () => {
    while (cursor < products.length) {
      const product = products[cursor++];
      const taxIds = Array.isArray(product.taxes_id) ? product.taxes_id.filter((id): id is number => Number.isSafeInteger(id)) : [];
      if (!taxIds.length) {
        product.price_included = Number(product.list_price);
        product.price_tax = 0;
        continue;
      }
      try {
        const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
          method: "POST",
          headers: correlationHeaders(sessionId, correlationId),
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: { model: "account.tax", method: "compute_all", args: [taxIds, Number(product.list_price), null, 1, false, false], kwargs: {} },
            id: Date.now(),
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        const payload = await response.json() as { result?: { total_included?: number; total_excluded?: number }; error?: unknown };
        const included = Number(payload.result?.total_included);
        const excluded = Number(payload.result?.total_excluded);
        if (!response.ok || payload.error || !Number.isFinite(included) || !Number.isFinite(excluded)) throw new Error("tax quote unavailable");
        product.price_included = Math.round(included * 100) / 100;
        product.price_tax = Math.round((included - excluded) * 100) / 100;
      } catch {
        // Keep an explicit null so the UI can label the fallback as ex GST.
        product.price_included = null;
        product.price_tax = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, products.length) }, worker));
  return items;
}

function correlationHeaders(sessionId: string, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  return headers;
}

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Orithos connection must use HTTPS");
  }
  return value;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  let body: { type?: string; groupId?: number; pricelistId?: number; query?: string; limit?: number; offset?: number; categoryId?: number; stockOnly?: boolean; catalogueView?: string; status?: string; period?: string; filters?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid records request" }, { status: 400 });
  }

  const type = body.type as RecordType | undefined;
  if (!type || !(type in RECORD_TYPES)) {
    return NextResponse.json({ message: "Unsupported Orithos record type" }, { status: 400 });
  }
  const config = RECORD_TYPES[type];
  const requestedLimit = body.limit === undefined ? 40 : Number(body.limit);
  const requestedOffset = body.offset === undefined ? 0 : Number(body.offset);
  if (!Number.isFinite(requestedLimit) || !Number.isFinite(requestedOffset)) {
    return NextResponse.json({ message: "Record pagination values must be finite numbers" }, { status: 400 });
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(requestedLimit)));
  const offset = Math.max(0, Math.floor(requestedOffset));
  const query = body.query?.trim().slice(0, 120);
  if (type === "customers") {
    if (body.catalogueView !== undefined || body.status !== undefined || body.period !== undefined) return NextResponse.json({ message: "Unsupported customer filter" }, { status: 400 });
    try {
      const me = await requirePermission(request, "customers.view", "customers.edit", "sell.checkout", "sell.refund");
      const scope = await scopedOdoo(request);
      const domain: unknown[] = [["customer_rank", ">", 0], ...companyDomain(scope.companyIds)];
      for (const [key, field] of [["groupId", "category_id"], ["pricelistId", "property_product_pricelist"]] as const) {
        const value = body[key];
        if (value !== undefined) {
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return NextResponse.json({ message: "Invalid customer filter" }, { status: 400 });
          domain.push([field, "=", value]);
        }
      }
      if (query) domain.push("|", "|", "|", ["name", "ilike", query], ["phone", "ilike", query], ["email", "ilike", query], ["ref", "ilike", query]);
      const fields: string[] = [...RECORD_TYPES.customers.fields].filter((field) => !["credit", "total_invoiced"].includes(field));
      if (canReadBalances(me)) fields.push("credit", "total_invoiced");
      const rows = await scope.rpc<unknown[]>("res.partner", "search_read", [domain], { fields, limit: limit + 1, offset, order: "name asc, id asc" });
      return NextResponse.json({ items: rows.slice(0, limit), hasNext: rows.length > limit, limit, offset }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "Customers are unavailable" }, { status: error && typeof error === "object" && "status" in error ? Number(error.status) : 502 });
    }
  }

  if (type === "posCategories") {
    try {
      const scope = await categoryScope(request);
      const items = await scope.rpc<unknown[]>("pos.category", "search_read", [[...categoryDomain(scope.companyIds), ...(query ? [["name", "ilike", query]] : [])]], { fields: ["id", "name", "parent_id"], limit: limit + 1, offset, order: "name asc, id asc" });
      return NextResponse.json({ items: items.slice(0, limit), hasNext: items.length > limit }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return categoryError(error); }
  }

  const domain: unknown[] = [...config.baseDomain];
  if (body.catalogueView !== undefined) {
    if (type !== "products") return NextResponse.json({ message: "Catalogue views require products" }, { status: 400 });
    try {
      domain.splice(0, domain.length, ...catalogueDomain(body.catalogueView));
    } catch {
      return NextResponse.json({ message: "Product catalogue view is invalid" }, { status: 400 });
    }
    try {
      await requirePermission(request, "stock.products.view");
    } catch (error) {
      return NextResponse.json({ message: "Could not access this store's catalogue" }, { status: error instanceof StoreAccessError ? error.status : 503 });
    }
  }
  if (type === "products" && body.categoryId !== undefined) {
    if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) {
      return NextResponse.json({ message: "Product category is invalid" }, { status: 400 });
    }
    domain.push(["pos_categ_ids", "in", [body.categoryId]]);
  }
  if (type === "products" && body.stockOnly !== undefined) {
    if (typeof body.stockOnly !== "boolean") {
      return NextResponse.json({ message: "Stock filter is invalid" }, { status: 400 });
    }
    if (body.stockOnly) domain.push(["qty_available", ">", 0]);
  }
  if (query) {
    const clauses = config.searchFields.map((field) => [field, "ilike", query]);
    if (clauses.length === 1) domain.push(clauses[0]);
    else {
      domain.push(...Array(clauses.length - 1).fill("|"), ...clauses);
    }
  }

  if (body.status !== undefined) {
    if (type !== "sales" || !["all", "completed", "refunded", "cancelled", "draft"].includes(body.status)) {
      return NextResponse.json({ message: "Sales status filter is invalid" }, { status: 400 });
    }
    if (body.status === "completed") domain.push(["state", "in", ["paid", "done", "invoiced"]]);
    if (body.status === "refunded") domain.push(["amount_total", "<", 0]);
    if (body.status === "cancelled") domain.push(["state", "=", "cancel"]);
    if (body.status === "draft") domain.push(["state", "=", "draft"]);
  }

  if (body.period !== undefined) {
    const periodHours: Record<string, number> = {
      "24h": 24,
      "7d": 168,
      "30d": 720,
      "90d": 2160,
      "180d": 4320,
    };
    if (type !== "sales" || !["all", ...Object.keys(periodHours)].includes(body.period)) {
      return NextResponse.json({ message: "Sales period filter is invalid" }, { status: 400 });
    }
    const hours = periodHours[body.period] ?? 0;
    if (hours) {
      const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
      domain.push(["date_order", ">=", from]);
    }
  }

  // Filters are deliberately not forwarded from the browser. The initial
  // bridge only exposes named, read-only datasets with fixed model/field lists.
  try {
    const sessionInfoResponse = await fetch(`${getOdooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = (await sessionInfoResponse.json()) as {
      result?: { uid?: number; user_context?: { allowed_company_ids?: number[] } };
      error?: unknown;
    };
    if (!sessionInfoResponse.ok || sessionInfo.error || !sessionInfo.result?.uid) {
      return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
    }
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, sessionInfo.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) {
      return NextResponse.json({ message: forced.error }, { status: forced.status });
    }
    const companyIds = forced.companyIds;
    if (!companyIds.length) {
      return NextResponse.json({ message: "No accessible Orithos company is mapped to this store." }, { status: 403 });
    }
    const context = odooCompanyContext(companyIds);

    // Scope every dataset to the store's company. Shared company_id=False products
    // are excluded so a new empty company cannot inherit the demo catalog.
    if (type === "outlets") {
      domain.push(["id", "in", companyIds]);
    } else {
      domain.push(["company_id", "in", companyIds]);
    }

    // After sample purge, hide seeded demo POS orders so History matches Reporting.
    if (type === "sales" && forced.binding?.sampleDataClearedAt) {
      const companyId = companyIds[0];
      if (companyId) {
        domain.push(["!", ["uuid", "=like", `demo-seed-${companyId}-%`]]);
      }
    }

    // Fetch one extra record so the client can render a truthful next-page
    // state without guessing from a full page. The extra row is discarded
    // before tax enrichment and never leaves this route.
    const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST",
      headers: correlationHeaders(sessionId, correlationId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: config.model,
          method: "search_read",
          args: [domain],
          kwargs: { fields: [...config.fields], limit: limit + 1, offset, order: config.order, context },
        },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Orithos records are unavailable" }, { status: 502 });
    const payload = (await response.json()) as {
      result?: unknown[];
      error?: { message?: string; data?: { message?: string } };
    };
    if (payload.error) {
      const detail = `${payload.error.message ?? ""} ${payload.error.data?.message ?? ""}`;
      const status = /(session expired|invalid session|not authenticated|please log in|\bauthenticate\b)/i.test(detail)
        && !/pos\.session/i.test(detail)
        ? 401
        : 502;
      return NextResponse.json({ message: status === 401 ? "Orithos session expired" : "Orithos could not load records" }, { status });
    }
    const rawItems = payload.result ?? [];
    const hasNext = rawItems.length > limit;
    let items = rawItems.slice(0, limit);
    if (type === "products") items = await withTaxInclusivePrices(sessionId, items, correlationId);

    return NextResponse.json({ items, limit, offset, hasNext }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
