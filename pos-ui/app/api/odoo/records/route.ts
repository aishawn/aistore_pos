import { scopedOdoo } from "@/lib/odoo-scope";
import { canReadBalances, companyDomain } from "@/lib/customer-access";
import { categoryScope, categoryDomain, categoryError, validateCategoryIds } from "@/lib/odoo-categories";
import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import { catalogueDomain } from "@/lib/product-catalogue";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { createHash } from "node:crypto";
import { INVENTORY_SORTS, inventoryTotals, sortInventory, type InventoryRow, type InventorySort, type InventoryDirection } from "@/lib/inventory-report";
import { findInventorySnapshot, getInventorySnapshot, saveInventorySnapshot, type InventoryShopfrontCoverage } from "@/lib/inventory-snapshot";
import { verifiedShopfrontSourceStoreFromHost } from "@/lib/shopfront-store-scope";
import { enrichShopfrontInventoryRows, resolveShopfrontCatalogueMappings, shopfrontCostFromPayload, shopfrontFieldStatus, summarizeShopfrontInventory } from "@/lib/shopfront-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LIMIT = 100;
const shopfrontCatalogueCache = new Map<string, {
  templateIds: number[];
  activeProductCount: number;
  productsWithCost?: number;
  zeroCostProducts?: number;
  mappedProductCount: number;
  unmappedProductCount: number;
  ambiguousReferenceCount: number;
  positiveInventoryUnits: number;
  negativeInventoryRows: number;
  inventoryProductRows: number;
  inventorySnapshotAt: string | null;
  expiresAt: number;
}>();

type ShopfrontProductRow = Record<string, unknown> & {
  product_tmpl_id?: [number, string] | false;
  default_code?: string | false;
  shopfront_legacy_duplicate?: boolean;
};

const RECORD_TYPES = {
  products: {
    model: "product.product",
    fields: ["id", "name", "display_name", "product_tmpl_id", "active", "barcode", "default_code", "list_price", "taxes_id", "qty_available", "free_qty", "uom_id", "pos_categ_ids", "available_in_pos"],
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
  const allProducts = items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const product of allProducts) {
    const key = JSON.stringify([product.list_price, product.taxes_id]);
    const group = groups.get(key);
    if (group) group.push(product); else groups.set(key, [product]);
  }
  const products = [...groups.values()].map((group) => group[0]);
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
  for (const group of groups.values()) for (const product of group.slice(1)) {
    product.price_included = group[0].price_included;
    product.price_tax = group[0].price_tax;
  }
  return items;
}

async function odooRpc<T>(sessionId: string, request: NextRequest, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, timeoutMs = 12_000): Promise<T> {
  const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json() as { result?: T; error?: unknown };
  if (!response.ok || payload.error || payload.result === undefined) throw new Error(`Odoo ${model}.${method} is unavailable`);
  return payload.result;
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

  let body: { type?: string; groupId?: number; pricelistId?: number; query?: string; limit?: number; offset?: number; categoryId?: number; categoryIds?: number[]; stockOnly?: boolean; catalogueView?: string; status?: string; period?: string; filters?: Record<string, unknown>; inventoryReport?: boolean; inventoryFilter?: "all" | "zero" | "negative"; sortBy?: InventorySort; sortDirection?: InventoryDirection; snapshotId?: string; refresh?: boolean };
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
  let canReadProductCost = false;
  if (type === "products") {
    try {
      canReadProductCost = canReadBalances(await requirePermission(request, "stock.products.view"));
    } catch (error) {
      return NextResponse.json({ message: "Could not access this store's catalogue" }, { status: error instanceof StoreAccessError ? error.status : 503 });
    }
  }
  if (body.inventoryReport !== undefined || body.sortBy !== undefined || body.sortDirection !== undefined || body.snapshotId !== undefined) {
    if (type !== "products" || body.inventoryReport !== true
      || (body.sortBy !== undefined && !INVENTORY_SORTS.includes(body.sortBy))
      || (body.sortDirection !== undefined && !["asc", "desc"].includes(body.sortDirection))
      || (body.inventoryFilter !== undefined && !["all", "zero", "negative"].includes(body.inventoryFilter))
      || (body.snapshotId !== undefined && (typeof body.snapshotId !== "string" || body.snapshotId.length > 64))
      || (body.refresh !== undefined && typeof body.refresh !== "boolean")) {
      return NextResponse.json({ message: "Invalid inventory report options" }, { status: 400 });
    }
    try { await requirePermission(request, "stock.products.view"); }
    catch (error) { return NextResponse.json({ message: "Could not access this store's inventory" }, { status: error instanceof StoreAccessError ? error.status : 503 }); }
  }
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
      const total = await scope.rpc<number>("res.partner", "search_count", [domain]);
      return NextResponse.json({ items: rows.slice(0, limit), hasNext: rows.length > limit, limit, offset, total }, { headers: { "Cache-Control": "no-store" } });
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
  const sourceStore = type === "products"
    ? verifiedShopfrontSourceStoreFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"))
    : null;
  // Products and Inventory must use the same Shopfront canonical population.
  // Odoo-only variants belong in the separate Odoo catalogue views, not in
  // the Shopfront-backed inventory report.
  const includeSourceProducts = type === "products" && Boolean(sourceStore);
  let shopfrontCoverage: { activeProducts: number; productsWithCost?: number; zeroCostProducts?: number; mappedProducts: number; unmappedProducts: number; ambiguousReferences: number; positiveInventoryUnits: number; negativeInventoryRows: number; inventoryProductRows: number; inventorySnapshotAt: string | null } | undefined;
  if (includeSourceProducts && sourceStore) {
    try {
      const sourceScope = await scopedOdoo(request);
      const companyIds = sourceScope.companyIds;
      const companyContext = odooCompanyContext(companyIds);
      const cacheKey = createHash("sha256").update(JSON.stringify([sourceStore, companyIds])).digest("hex");
      const cached = shopfrontCatalogueCache.get(cacheKey);
      let catalogue = cached && cached.expiresAt > Date.now() ? cached : null;
      if (!catalogue) {
      const sourceFields = ["source_id", "source_status", "sku", ...(canReadProductCost ? ["cost"] : [])];
      const sourceRows = await odooRpc<Array<{ source_id: string; source_status?: string | false; sku?: string | false; cost?: number | false }>>(sessionId, request, "shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore] ]], { fields: sourceFields, limit: 15000, context: companyContext });
        const activeRows = sourceRows.filter((row) => String(row.source_status || "").toUpperCase() === "ACTIVE" && /^[0-9a-f]{24,64}$/i.test(row.source_id));
        const sourceRefs = [...new Set(activeRows.map((row) => `${sourceStore}:${row.source_id}`))];
        const templates = sourceRefs.length ? await odooRpc<Array<{ id: number; shopfront_source_ref?: string | false; active?: boolean; sale_ok?: boolean; default_code?: string | false }>>(sessionId, request, "product.template", "search_read", [[ ["shopfront_source_ref", "in", sourceRefs], ...companyDomain(companyIds, true) ]], { fields: ["id", "shopfront_source_ref", "active", "sale_ok", "default_code"], limit: sourceRefs.length * 2, context: companyContext }) : [];
        const mapping = resolveShopfrontCatalogueMappings(sourceStore, sourceRows, templates);
        const activeSourceIds = new Set(activeRows.map((row) => row.source_id));
        const inventoryRows = activeRows.length ? await odooRpc<Array<{ source_product_id: string; quantity?: number; snapshot_at?: string }>>(sessionId, request, "shopfront.sync.inventory", "search_read", [[ ["store_key", "=", sourceStore], ["source_product_id", "in", [...activeSourceIds]] ]], { fields: ["source_product_id", "quantity", "snapshot_at"], limit: activeRows.length * 2, context: companyContext }) : [];
        const inventorySummary = summarizeShopfrontInventory(inventoryRows, activeSourceIds);
        catalogue = {
          ...mapping,
          productsWithCost: canReadProductCost ? activeRows.filter((row) => typeof row.cost === "number" && Number.isFinite(row.cost) && row.cost > 0).length : undefined,
          zeroCostProducts: canReadProductCost ? activeRows.filter((row) => typeof row.cost === "number" && Number.isFinite(row.cost) && row.cost === 0).length : undefined,
          ...inventorySummary,
          expiresAt: Date.now() + 5 * 60_000,
        };
        if (shopfrontCatalogueCache.size > 1000) shopfrontCatalogueCache.clear();
        shopfrontCatalogueCache.set(cacheKey, catalogue);
      }
      shopfrontCoverage = {
        activeProducts: catalogue.activeProductCount,
        productsWithCost: catalogue.productsWithCost,
        zeroCostProducts: catalogue.zeroCostProducts,
        mappedProducts: catalogue.mappedProductCount,
        unmappedProducts: catalogue.unmappedProductCount,
        ambiguousReferences: catalogue.ambiguousReferenceCount,
        positiveInventoryUnits: catalogue.positiveInventoryUnits,
        negativeInventoryRows: catalogue.negativeInventoryRows,
        inventoryProductRows: catalogue.inventoryProductRows,
        inventorySnapshotAt: catalogue.inventorySnapshotAt,
      };
      const viewDomain = body.catalogueView === undefined ? [] : catalogueDomain(body.catalogueView).slice(1);
      domain.splice(0, domain.length, ["product_tmpl_id", "in", catalogue.templateIds], ...viewDomain);
    } catch {
      return NextResponse.json({ message: "Shopfront product mapping is unavailable. Refresh and try again." }, { status: 503 });
    }
  }
  if (type === "products" && body.categoryId !== undefined) {
    if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) {
      return NextResponse.json({ message: "Product category is invalid" }, { status: 400 });
    }
    domain.push(["pos_categ_ids", "in", [body.categoryId]]);
  }
  if (type === "products" && body.categoryIds !== undefined) {
    if (!Array.isArray(body.categoryIds) || body.categoryIds.length === 0 || body.categoryIds.length > 100 || body.categoryIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return NextResponse.json({ message: "Product categories are invalid" }, { status: 400 });
    }
    domain.push(["pos_categ_ids", "in", body.categoryIds]);
  }
  if (type === "products" && (body.categoryId !== undefined || body.categoryIds !== undefined)) {
    try {
      const scope = await categoryScope(request);
      await validateCategoryIds(scope, [...new Set([...(body.categoryIds ?? []), ...(body.categoryId === undefined ? [] : [body.categoryId])])]);
    } catch (error) { return categoryError(error); }
  }
  if (type === "products" && body.stockOnly !== undefined) {
    if (typeof body.stockOnly !== "boolean") {
      return NextResponse.json({ message: "Stock filter is invalid" }, { status: 400 });
    }
    if (body.stockOnly) domain.push(["qty_available", ">", 0]);
  }
  if (type === "products" && body.inventoryReport && body.inventoryFilter === "zero") domain.push(["qty_available", "=", 0]);
  if (type === "products" && body.inventoryReport && body.inventoryFilter === "negative") domain.push(["qty_available", "<", 0]);
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
    const companyContext = odooCompanyContext(companyIds);
    const context = type === "products" && forced.binding?.odooWarehouseId
      ? { ...companyContext, warehouse: forced.binding.odooWarehouseId }
      : companyContext;

    // Scope every dataset to the store's company. Shared company_id=False products
    // are excluded so a new empty company cannot inherit the demo catalog.
    if (type === "outlets") {
      domain.push(["id", "in", companyIds]);
    } else {
      domain.push(["company_id", "in", companyIds]);
    }

    if (body.inventoryReport) {
      const sortBy = body.sortBy ?? "name";
      const sortDirection = body.sortDirection ?? "asc";
      const key = createHash("sha256").update(JSON.stringify([sessionId, request.cookies.get("orithos_access_token")?.value, request.nextUrl.host, context, domain, sortBy, sortDirection])).digest("hex");
      const reused = !body.snapshotId && offset === 0 && !body.refresh ? findInventorySnapshot(key) : null;
      let snapshotId = body.snapshotId ?? reused?.id;
      let snapshot = snapshotId ? getInventorySnapshot(snapshotId, key) : null;
      if (snapshotId && !snapshot) return NextResponse.json({ message: "Inventory results expired. Refresh to load current stock." }, { status: 409 });
      if (!snapshot) {
        if (offset !== 0) return NextResponse.json({ message: "Refresh inventory before loading more results." }, { status: 409 });
        const rpc = async <T,>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> => {
          const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
            method: "POST", headers: correlationHeaders(sessionId, correlationId),
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { ...kwargs, context } }, id: Date.now() }),
            cache: "no-store", signal: AbortSignal.timeout(15_000),
          });
          const payload = await response.json() as { result?: T; error?: { data?: { name?: string } } };
          if (!response.ok || payload.error || payload.result === undefined) {
            const name = payload.error?.data?.name ?? "";
            const status = /session|authenticate/i.test(name) ? 401 : /AccessError|AccessDenied/.test(name) ? 403 : 502;
            throw Object.assign(new Error("Inventory data is unavailable. Try again."), { status });
          }
          return payload.result;
        };
        try {
          const rows: InventoryRow[] = [];
          let costReadable = true;
          let sourceCoverage: InventoryShopfrontCoverage | undefined;
          let afterId = 0;
          for (;;) {
            const readBatch = () => rpc<InventoryRow[]>(config.model, "search_read", [[...domain, ["id", ">", afterId]]], {
              fields: [...config.fields, ...(costReadable ? ["standard_price"] : [])], limit: 500, order: "id asc",
            });
            let batch: InventoryRow[];
            try { batch = await readBatch(); }
            catch (error) {
              if (!costReadable || !(error instanceof Error) || !("status" in error) || error.status !== 403) throw error;
              costReadable = false;
              batch = await readBatch();
            }
            if (!Array.isArray(batch)) throw new Error("Inventory data is unavailable.");
            rows.push(...batch);
            if (batch.length < 500) break;
            const nextId = batch[batch.length - 1]?.id;
            if (!Number.isSafeInteger(nextId) || nextId <= afterId) throw new Error("Inventory data is unavailable.");
            afterId = nextId;
          }
          const categories = sortBy === "category"
            ? await rpc<Array<{ id: number; name: string }>>("pos.category", "search_read", [categoryDomain(companyIds)], { fields: ["id", "name"] }) : [];
          if (sortBy === "price_included") await withTaxInclusivePrices(sessionId, rows, correlationId);
          const totals = inventoryTotals(rows);
          let enrichedRows: InventoryRow[] = rows;
          if (sourceStore) {
            try {
              const sourceFields = ["source_id", "source_status", "name", "sku", "category", "case_quantity", "price", "track_inventory"];
              if (canReadProductCost) sourceFields.push("cost", "raw_payload");
              const sourceProducts = await rpc<Array<{ source_id: string; source_status?: string | false; name?: string | false; sku?: string | false; category?: string | false; case_quantity?: number | false; cost?: number | false; price?: number | false; track_inventory?: boolean; raw_payload?: unknown }>>("shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore] ]], { fields: sourceFields, limit: 15000, context: companyContext });
              const activeSourceIds = sourceProducts.filter((product) => String(product.source_status || "").toUpperCase() === "ACTIVE").map((product) => product.source_id);
              const sourceRefs = activeSourceIds.map((sourceId) => `${sourceStore}:${sourceId}`);
              const templates = sourceRefs.length
                ? await rpc<Array<{ id: number; shopfront_source_ref?: string | false; active?: boolean; sale_ok?: boolean; default_code?: string | false }>>("product.template", "search_read", [[ ["shopfront_source_ref", "in", sourceRefs], ...companyDomain(companyIds, true) ]], { fields: ["id", "shopfront_source_ref", "active", "sale_ok", "default_code"], limit: sourceRefs.length * 2 })
                : [];
              const mapping = resolveShopfrontCatalogueMappings(sourceStore, sourceProducts, templates);
              const inventoryRows = activeSourceIds.length
                ? await rpc<Array<{ source_product_id: string; quantity?: number; snapshot_at?: string }>>("shopfront.sync.inventory", "search_read", [[ ["store_key", "=", sourceStore], ["source_product_id", "in", activeSourceIds] ]], { fields: ["source_product_id", "quantity", "snapshot_at"], limit: activeSourceIds.length * 2, context: companyContext })
                : [];
              const inventorySummary = summarizeShopfrontInventory(inventoryRows, new Set(activeSourceIds));
              sourceCoverage = {
                activeProducts: mapping.activeProductCount,
                ...(canReadProductCost ? {
                  productsWithCost: sourceProducts.filter((product) => String(product.source_status || "").toUpperCase() === "ACTIVE" && typeof shopfrontCostFromPayload(product.cost, product.raw_payload) === "number" && Number(shopfrontCostFromPayload(product.cost, product.raw_payload)) > 0).length,
                  zeroCostProducts: sourceProducts.filter((product) => String(product.source_status || "").toUpperCase() === "ACTIVE" && shopfrontCostFromPayload(product.cost, product.raw_payload) === 0).length,
                } : {}),
                mappedProducts: mapping.mappedProductCount,
                unmappedProducts: mapping.unmappedProductCount,
                ambiguousReferences: mapping.ambiguousReferenceCount,
                ...inventorySummary,
              };
              const inventoryLevels = activeSourceIds.length
                ? await rpc<Array<{ source_product_id: string; single_level?: number; case_level?: number }>>("shopfront.sync.inventory", "search_read", [[ ["store_key", "=", sourceStore], ["source_product_id", "in", activeSourceIds] ]], { fields: ["source_product_id", "single_level", "case_level"], limit: activeSourceIds.length * 2, context: companyContext }).catch(() => [])
                : [];
              const levelsBySource = new Map(inventoryLevels.map((item) => [item.source_product_id, item]));
              enrichedRows = enrichShopfrontInventoryRows(
                rows,
                sourceStore,
                sourceProducts,
                templates,
                inventoryRows.map((item) => ({ ...item, ...levelsBySource.get(item.source_product_id) })),
                canReadProductCost ? "available" : "restricted",
                "available",
              ) as InventoryRow[];
            } catch {
              enrichedRows = rows.map((row) => ({
                ...row,
                shopfront_data_status: "unavailable",
                shopfront_cost: null,
                shopfront_cost_status: canReadProductCost ? "unavailable" : "restricted",
                shopfront_inventory_status: "unavailable",
                shopfront_quantity: null,
                shopfront_price: null,
              })) as InventoryRow[];
            }
          }
          const sorted = sortInventory(enrichedRows, sortBy, sortDirection, new Map(categories.map((item) => [item.id, item.name])));
          for (const row of sorted) delete row.standard_price;
          snapshotId = saveInventorySnapshot(key, sorted, totals, Date.now(), sourceCoverage);
          snapshot = getInventorySnapshot(snapshotId, key)!;
        } catch (error) {
          const status = error instanceof Error && "status" in error ? Number(error.status) : 502;
          return NextResponse.json({ message: status === 401 ? "Orithos session expired" : "Could not load inventory. Try again." }, { status });
        }
      }
      let items: unknown[] = snapshot.rows.slice(offset, offset + limit).map((row) => ({ ...row }));
      if (sortBy !== "price_included") items = await withTaxInclusivePrices(sessionId, items, correlationId);
      return NextResponse.json({ items, limit, offset, hasNext: offset + limit < snapshot.rows.length, snapshotId, generatedAt: new Date(snapshot.expires - 300_000).toISOString(), total: snapshot.totals.totalItems, ...snapshot.totals, ...(snapshot.shopfrontCoverage ? { shopfrontCoverage: snapshot.shopfrontCoverage } : {}) }, { headers: { "Cache-Control": "no-store" } });
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
          kwargs: { fields: [...config.fields, ...(type === "products" && canReadProductCost ? ["standard_price"] : [])], limit: limit + 1, offset, order: config.order, context },
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
    if (type === "products") {
      items = await withTaxInclusivePrices(sessionId, items, correlationId);
      if (!body.inventoryReport && Array.isArray(items) && items.length) {
        const productRows = items as ShopfrontProductRow[];
        const productIds = productRows.map((item) => Number(item.id)).filter(Number.isSafeInteger);
        if (sourceStore) {
          let enrichmentStep = "page templates";
          try {
            const templateIds = [...new Set(productRows.map((item) => Array.isArray(item.product_tmpl_id) ? Number(item.product_tmpl_id[0]) : 0).filter((id) => Number.isSafeInteger(id) && id > 0))];
            const templateDomain: unknown[] = [["id", "in", templateIds]];
            const templates = templateIds.length ? await odooRpc<Array<{ id: number; name?: string; shopfront_source_ref?: string | false; shopfront_price_tiers?: unknown; pos_categ_ids?: number[]; categ_id?: [number, string] }>>(sessionId, request, "product.template", "search_read", [templateDomain], { fields: ["id", "shopfront_source_ref"], limit: templateIds.length, context: companyContext }) : [];
            const templateDetails = templateIds.length
              ? await odooRpc<Array<{ id: number; name?: string; shopfront_price_tiers?: unknown; pos_categ_ids?: number[]; categ_id?: [number, string] }>>(sessionId, request, "product.template", "search_read", [templateDomain], { fields: ["id", "name", "shopfront_price_tiers", "pos_categ_ids", "categ_id"], limit: templateIds.length, context: companyContext }).catch(() => [])
              : [];
            const sourceIds = templates.flatMap((template) => {
              const ref = typeof template.shopfront_source_ref === "string" ? template.shopfront_source_ref : "";
              return ref.startsWith(`${sourceStore}:`) ? [ref.slice(sourceStore.length + 1)] : [];
            });
            if (sourceIds.length) {
              enrichmentStep = "source products";
              const sourceProducts = await odooRpc<Array<{ source_id: string }>>(sessionId, request, "shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore], ["source_id", "in", sourceIds] ]], { fields: ["source_id"], limit: sourceIds.length, context: companyContext });
              const sourceDetails = await odooRpc<Array<{ source_id: string; name?: string; sku?: string | false; category?: string | false; source_status?: string | false; track_inventory?: boolean; raw_payload?: unknown; synced_at?: string }>>(sessionId, request, "shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore], ["source_id", "in", sourceIds] ]], { fields: ["source_id", "name", "sku", "category", "source_status", "track_inventory", "raw_payload", "synced_at"], limit: sourceIds.length, context: companyContext }).catch(() => []);
              const sourcePricing = await odooRpc<Array<{ source_id: string; case_quantity?: number; price?: number | false; prices?: unknown }>>(sessionId, request, "shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore], ["source_id", "in", sourceIds] ]], { fields: ["source_id", "case_quantity", "price", "prices"], limit: sourceIds.length, context: companyContext }).catch(() => []);
              let sourceCosts: Array<{ source_id: string; cost?: number | false }> = [];
              let sourceCostsAvailable = false;
              if (canReadProductCost) {
                try {
                  sourceCosts = await odooRpc(sessionId, request, "shopfront.sync.product", "search_read", [[ ["store_key", "=", sourceStore], ["source_id", "in", sourceIds] ]], { fields: ["source_id", "cost"], limit: sourceIds.length, context: companyContext });
                  sourceCostsAvailable = true;
                } catch { /* Isolate optional cost reads from other Shopfront fields. */ }
              }
              let sourceInventory: Array<{ source_product_id: string; quantity?: number; snapshot_at?: string }> = [];
              let sourceInventoryAvailable = false;
              try {
                sourceInventory = await odooRpc(sessionId, request, "shopfront.sync.inventory", "search_read", [[ ["store_key", "=", sourceStore], ["source_product_id", "in", sourceIds] ]], { fields: ["source_product_id", "quantity", "snapshot_at"], limit: sourceIds.length, context: companyContext });
                sourceInventoryAvailable = true;
              } catch { /* Isolate optional inventory reads from catalogue data. */ }
              const inventoryLevels = sourceInventoryAvailable
                ? await odooRpc<Array<{ source_product_id: string; single_level?: number; case_level?: number }>>(sessionId, request, "shopfront.sync.inventory", "search_read", [[ ["store_key", "=", sourceStore], ["source_product_id", "in", sourceIds] ]], { fields: ["source_product_id", "single_level", "case_level"], limit: sourceIds.length, context: companyContext }).catch(() => [])
                : [];
              const bySource = new Map(sourceProducts.map((row) => [row.source_id, row]));
              const detailsBySource = new Map(sourceDetails.map((row) => [row.source_id, row]));
              const pricingBySource = new Map(sourcePricing.map((row) => [row.source_id, row]));
              const templateDetailsById = new Map(templateDetails.map((row) => [row.id, row]));
              const costsBySource = new Map(sourceCosts.map((row) => [row.source_id, row]));
              const levelsBySource = new Map(inventoryLevels.map((row) => [row.source_product_id, row]));
              const inventoryBySource = new Map(sourceInventory.map((row) => [row.source_product_id, { ...row, ...levelsBySource.get(row.source_product_id) }]));
              enrichmentStep = "source mappings";
              const matchingTemplates = templateIds.length ? await odooRpc<Array<{ id: number; shopfront_source_ref?: string | false }>>(sessionId, request, "product.template", "search_read", [[ ["shopfront_source_ref", "in", sourceIds.map((id) => `${sourceStore}:${id}`)], ...companyDomain(companyIds, true) ]], { fields: ["id", "shopfront_source_ref"], limit: Math.max(sourceIds.length * 2, 100), context: companyContext }) : [];
              const templateCountByRef = new Map<string, number>();
              for (const template of matchingTemplates) {
                if (typeof template.shopfront_source_ref === "string") templateCountByRef.set(template.shopfront_source_ref, (templateCountByRef.get(template.shopfront_source_ref) ?? 0) + 1);
              }
              for (const template of templates) {
                const detail = templateDetailsById.get(template.id);
                if (detail) Object.assign(template, detail);
                if (Array.isArray(template.pos_categ_ids)) template.pos_categ_ids = template.pos_categ_ids.filter((id) => Number.isSafeInteger(id));
              }
              for (const product of productRows) {
                const templateId = Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0;
                const template = templates.find((item) => item.id === templateId);
                const sourceRef = typeof template?.shopfront_source_ref === "string" ? template.shopfront_source_ref : "";
                const sourceId = sourceRef.startsWith(`${sourceStore}:`) ? sourceRef.slice(sourceStore.length + 1) : "";
                const sourceProduct = sourceId ? bySource.get(sourceId) : undefined;
                const sourceDetail = sourceId ? detailsBySource.get(sourceId) : undefined;
                const sourcePrice = sourceId ? pricingBySource.get(sourceId) : undefined;
                const sourceCost = sourceId ? costsBySource.get(sourceId) : undefined;
                const sourceStock = sourceId ? inventoryBySource.get(sourceId) : undefined;
                product.shopfront_source_ref = sourceRef || null;
                product.shopfront_data_status = sourceProduct ? "available" : "missing";
                const duplicateCount = sourceRef ? templateCountByRef.get(sourceRef) ?? 0 : 0;
                product.shopfront_source_duplicate_count = duplicateCount;
                product.shopfront_source_canonical = Boolean(sourceRef) && duplicateCount <= 1;
                product.shopfront_cost = canReadProductCost ? shopfrontCostFromPayload(sourceCost?.cost, sourceDetail?.raw_payload) : null;
                product.shopfront_cost_status = shopfrontFieldStatus(!canReadProductCost ? "restricted" : sourceCostsAvailable ? "available" : "unavailable", product.shopfront_cost);
                product.shopfront_case_quantity = typeof sourcePrice?.case_quantity === "number" && Number.isFinite(sourcePrice.case_quantity) && sourcePrice.case_quantity > 0 ? sourcePrice.case_quantity : null;
                product.shopfront_cost_synced_at = sourceDetail?.synced_at ?? null;
                product.shopfront_source_name = sourceDetail?.name ?? null;
                product.shopfront_source_sku = sourceDetail?.sku ?? null;
                product.shopfront_source_category = sourceDetail?.category ?? null;
                product.shopfront_source_status = sourceDetail?.source_status ?? null;
                product.shopfront_track_inventory = typeof sourceDetail?.track_inventory === "boolean" ? sourceDetail.track_inventory : null;
                const sourcePayload = sourceDetail?.raw_payload && typeof sourceDetail.raw_payload === "object" && !Array.isArray(sourceDetail.raw_payload)
                  ? sourceDetail.raw_payload as Record<string, unknown>
                  : {};
                const sourceRetailTax = sourcePayload.taxRate ?? sourcePayload.tax_rate;
                const sourcePurchaseTax = sourcePayload.costTaxRate ?? sourcePayload.cost_tax_rate;
                const taxName = (rate: unknown, fallbackName: unknown, rateKeys: string[], nameKeys: string[]) => {
                  if (typeof rate === "string" && rate.trim()) return rate.trim();
                  if (rate && typeof rate === "object" && !Array.isArray(rate)) {
                    const name = (rate as { name?: unknown }).name;
                    return typeof name === "string" && name.trim() ? name.trim() : null;
                  }
                  if (typeof fallbackName === "string" && fallbackName.trim()) return fallbackName.trim();
                  const rateIsInherited = rateKeys.some((key) => Object.prototype.hasOwnProperty.call(sourcePayload, key) && (sourcePayload[key] === null || sourcePayload[key] === false));
                  const nameIsInherited = nameKeys.some((key) => Object.prototype.hasOwnProperty.call(sourcePayload, key) && (sourcePayload[key] === null || sourcePayload[key] === false || sourcePayload[key] === ""));
                  return rateIsInherited || nameIsInherited ? "Inherit" : null;
                };
                product.shopfront_retail_tax_rate = taxName(sourceRetailTax, sourcePayload.tax_rate_name, ["taxRate", "tax_rate"], ["tax_rate_name"]);
                product.shopfront_purchase_tax_rate = taxName(sourcePurchaseTax, sourcePayload.cost_tax_rate_name, ["costTaxRate", "cost_tax_rate"], ["cost_tax_rate_name"]);
                product.shopfront_price = typeof sourcePrice?.price === "number" && Number.isFinite(sourcePrice.price) ? sourcePrice.price : null;
                product.shopfront_price_tiers = Array.isArray(sourcePrice?.prices) ? sourcePrice.prices : Array.isArray(template?.shopfront_price_tiers) ? template.shopfront_price_tiers : [];
                product.shopfront_quantity = typeof sourceStock?.quantity === "number" && Number.isFinite(sourceStock.quantity) ? sourceStock.quantity : null;
                product.shopfront_inventory_status = shopfrontFieldStatus(sourceInventoryAvailable ? "available" : "unavailable", product.shopfront_quantity);
                product.shopfront_single_level = typeof sourceStock?.single_level === "number" && Number.isFinite(sourceStock.single_level) ? sourceStock.single_level : null;
                product.shopfront_case_level = typeof sourceStock?.case_level === "number" && Number.isFinite(sourceStock.case_level) ? sourceStock.case_level : null;
                product.shopfront_inventory_snapshot_at = sourceStock?.snapshot_at ?? null;
                if (Array.isArray(template?.pos_categ_ids) && template.pos_categ_ids.length) product.pos_categ_ids = template.pos_categ_ids;
                if (!product.shopfront_source_name && typeof template?.name === "string" && template.name) product.shopfront_source_name = template.name;
              }
              try {
                const storeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide" }).format(new Date());
                const [year, month, date] = storeDay.split("-").map(Number);
                const todayUtc = Date.UTC(year, month - 1, date);
                const from = new Date(todayUtc - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const saleLines = await odooRpc<Array<{ source_product_id?: string | false; quantity?: number; sale_id?: [number, string] | false }>>(sessionId, request, "shopfront.sync.sale.line", "search_read", [[ ["source_product_id", "in", sourceIds], ["sale_id.store_key", "=", sourceStore], ["sale_id.created_at", ">=", from] ]], { fields: ["source_product_id", "quantity", "sale_id"], limit: 20000, context: companyContext });
                if (saleLines.length >= 20000) throw new Error("Shopfront product sales exceed the safe per-page summary limit.");
                const saleIds = [...new Set(saleLines.flatMap((line) => Array.isArray(line.sale_id) ? [Number(line.sale_id[0])] : []).filter((id) => Number.isSafeInteger(id) && id > 0))];
                const sales = saleIds.length ? await odooRpc<Array<{ id: number; status?: string | false; created_at?: string | false }>>(sessionId, request, "shopfront.sync.sale", "search_read", [[ ["id", "in", saleIds], ["store_key", "=", sourceStore] ]], { fields: ["id", "status", "created_at"], limit: saleIds.length, context: companyContext }) : [];
                const completedSales = new Map(sales.filter((sale) => String(sale.status || "").toUpperCase() === "COMPLETED").map((sale) => [sale.id, String(sale.created_at || "").slice(0, 10)]));
                const pointsBySource = new Map<string, number[]>();
                for (const line of saleLines) {
                  if (typeof line.source_product_id !== "string" || !Array.isArray(line.sale_id)) continue;
                  const day = completedSales.get(Number(line.sale_id[0]));
                  const quantity = Number(line.quantity);
                  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(quantity)) continue;
                  const ageDays = Math.floor((todayUtc - Date.parse(`${day}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
                  if (ageDays < 0 || ageDays >= 30) continue;
                  let points = pointsBySource.get(line.source_product_id);
                  if (!points) { points = Array.from({ length: 30 }, () => 0); pointsBySource.set(line.source_product_id, points); }
                  points[29 - ageDays] += quantity;
                }
                for (const product of productRows) {
                  const templateId = Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0;
                  const ref = templates.find((item) => item.id === templateId)?.shopfront_source_ref;
                  const sourceId = typeof ref === "string" && ref.startsWith(`${sourceStore}:`) ? ref.slice(sourceStore.length + 1) : "";
                  product.performance_30d = sourceId ? pointsBySource.get(sourceId) ?? Array.from({ length: 30 }, () => 0) : null;
                  product.performance_source = "Shopfront";
                }
              } catch {
                for (const product of productRows) {
                  product.performance_30d = null;
                  product.performance_source = "Shopfront";
                }
              }
            }
          } catch (error) {
            console.error("Shopfront product enrichment failed", {
              store: sourceStore,
              step: enrichmentStep,
              error: error instanceof Error ? error.name : "unknown error",
            });
            for (const product of productRows) {
              product.shopfront_source_name = null;
              product.shopfront_source_sku = null;
              product.shopfront_source_category = null;
              product.shopfront_source_status = null;
              product.shopfront_track_inventory = null;
              product.shopfront_retail_tax_rate = null;
              product.shopfront_purchase_tax_rate = null;
              product.shopfront_price = null;
              product.shopfront_price_tiers = [];
              product.shopfront_quantity = null;
              product.shopfront_single_level = null;
              product.shopfront_case_level = null;
              product.shopfront_inventory_snapshot_at = null;
              product.shopfront_inventory_status = "unavailable";
              product.shopfront_cost = null;
              product.shopfront_cost_status = "unavailable";
              product.shopfront_case_quantity = null;
              product.shopfront_cost_synced_at = null;
              product.shopfront_data_status = "unavailable";
              product.performance_30d = null;
            }
          }
        }
        if (!sourceStore) {
          try {
            const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
            const performance = await odooRpc<Array<Record<string, unknown>>>(sessionId, request, "pos.order.line", "read_group", [[
              ["product_id", "in", productIds], ["order_id.company_id", "in", companyIds], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.date_order", ">=", from],
            ], ["qty:sum"], ["product_id", "order_id.date_order:day"]], { lazy: false, limit: 5000, context: { ...companyContext, ...(forced.binding?.odooWarehouseId ? { warehouse: forced.binding.odooWarehouseId } : {}) } }, 20_000);
            const byProduct = new Map<number, number[]>();
            for (const row of performance) {
              const productId = Array.isArray(row.product_id) ? Number(row.product_id[0]) : 0;
              const day = String(row["order_id.date_order:day"] ?? row["order_id.date_order"] ?? "").slice(0, 10);
              const point = Number(row.qty);
              if (!productId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(point)) continue;
              let points = byProduct.get(productId);
              if (!points) { points = Array.from({ length: 30 }, () => 0); byProduct.set(productId, points); }
              const ageDays = Math.floor((Date.now() - Date.parse(`${day}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
              if (ageDays >= 0 && ageDays < 30) points[29 - ageDays] += point;
            }
            for (const product of productRows) {
              product.performance_30d = byProduct.get(Number(product.id)) ?? Array.from({ length: 30 }, () => 0);
              product.performance_source = "Odoo";
            }
          } catch {
            for (const product of productRows) product.performance_30d = null;
          }
        }
      }
    }

    let total: number | undefined;
    if (type === "products") {
      try {
        const countResponse = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
          method: "POST",
          headers: correlationHeaders(sessionId, correlationId),
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {
              model: config.model,
              method: "search_count",
              args: [domain],
              kwargs: { context },
            },
            id: Date.now(),
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        const countPayload = await countResponse.json() as { result?: unknown; error?: unknown };
        const count = Number(countPayload.result);
        if (countResponse.ok && !countPayload.error && Number.isSafeInteger(count) && count >= 0) total = count;
      } catch {
        // Keep the paginated response usable if the optional count query times out.
      }
    }

    return NextResponse.json({ items, limit, offset, hasNext, ...(total === undefined ? {} : { total }), ...(shopfrontCoverage ? { shopfrontCoverage } : {}) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
