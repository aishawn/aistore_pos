import { cachedOdooRead, clearOdooReadCache } from "./odoo-read-cache";
import { isLocalPreviewSession } from "./api";
import { getOdooQuoteTimeoutMessage, ODOO_QUOTE_TIMEOUT_MS } from "./odoo-quote-timeout";

export type OdooRecordType =
  | "products"
  | "purchaseProducts"
  | "posCategories"
  | "customers"
  | "suppliers"
  | "outlets"
  | "registers"
  | "sessions"
  | "paymentMethods"
  | "taxes"
  | "sales";

export type OdooSalesStatusFilter = "all" | "completed" | "refunded" | "cancelled" | "draft";
export type OdooSalesPeriodFilter = "all" | "24h" | "7d" | "30d" | "90d" | "180d";

export interface OdooDailySaleRecord {
  date: string;
  salesTransactions: number;
  refundTransactions: number;
  salesAmount: number;
  refundAmount: number;
  netSales: number;
  tax: number;
}

export interface OdooDailySalesPage {
  generatedAt?: string;
  items: OdooDailySaleRecord[];
  limit: number;
  offset: number;
  hasNext: boolean;
  timezone: string;
  currency: string;
}

export interface OdooPage<T> {
  generatedAt?: string;
  cacheStatus?: "HIT" | "MISS";
  requestId?: string;
  items: T[];
  limit: number;
  offset: number;
  /** True when the server found at least one record after this page. */
  hasNext?: boolean;
  /** Exact number of records matching the current filters, when available. */
  total?: number;
  snapshotId?: string;
  totalItems?: number;
  totalQty?: number | null;
  negativeStockItems?: number;
  totalStockValue?: number | null;
  missingCostItems?: number;
  mixedUnits?: boolean;
  shopfrontCoverage?: {
    activeProducts: number;
    productsWithCost?: number;
    zeroCostProducts?: number;
    mappedProducts: number;
    unmappedProducts: number;
    ambiguousReferences: number;
    positiveInventoryUnits: number;
    negativeInventoryRows: number;
    inventoryProductRows: number;
    inventorySnapshotAt: string | null;
  };
}

export interface OdooProductRecord {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id?: [number, string] | false;
  active?: boolean;
  barcode: string | false;
  default_code: string | false;
  list_price: number;
  standard_price?: number | false;
  shopfront_cost?: number | null;
  shopfront_cost_status?: "available" | "missing" | "unavailable" | "restricted";
  shopfront_case_quantity?: number | null;
  shopfront_cost_synced_at?: string | null;
  shopfront_price?: number | null;
  shopfront_quantity?: number | null;
  shopfront_single_level?: number | null;
  shopfront_case_level?: number | null;
  shopfront_inventory_snapshot_at?: string | null;
  shopfront_inventory_status?: "available" | "missing" | "unavailable";
  shopfront_data_status?: "available" | "missing" | "unavailable";
  shopfront_source_ref?: string | null;
  shopfront_source_duplicate_count?: number;
  shopfront_source_canonical?: boolean;
  shopfront_source_name?: string | null;
  shopfront_source_sku?: string | false | null;
  shopfront_source_category?: string | false | null;
  shopfront_source_status?: string | false | null;
  shopfront_track_inventory?: boolean | null;
  shopfront_retail_tax_rate?: string | null;
  shopfront_purchase_tax_rate?: string | null;
  shopfront_price_tiers?: Array<{ quantity?: number; price?: number; priceEx?: number; price_ex?: number }>;
  shopfront_legacy_duplicate?: boolean;
  performance_30d?: number[] | null;
  performance_source?: "Shopfront" | "Odoo";
  taxes_id: number[];
  price_included: number | null;
  price_tax: number | null;
  qty_available: number;
  free_qty: number;
  uom_id: [number, string] | false;
  pos_categ_ids: number[];
  available_in_pos: boolean;
}

export interface OdooProductCategoryRecord {
  id: number;
  name: string;
  parent_id: [number, string] | false;
}

export interface OdooPriceRuleRecord {
  id: string;
  productId: number;
  productName: string;
  sku: string;
  priceSetName: string;
  source: string;
  sourceType: "PROVIDED" | "IMPORTED";
  startDate: string | null;
  endDate: string | null;
  quantity: number;
  cappedPrice: number | null;
  currentPrice: number | null;
  cost: number | null;
  ruleType: string;
}

export type OdooProductUpdate = Partial<Pick<OdooProductRecord, "name" | "barcode" | "default_code" | "list_price" | "pos_categ_ids" | "available_in_pos">> & { expectedListPrice?: number };

export interface OdooPosCategoryRecord {
  id: number;
  name: string;
  parent_id: [number, string] | false;
}

export interface OdooCustomerRecord {
  comment?: string | false;
  id: number;
  name: string;
  phone: string | false;
  email: string | false;
  customer_rank: number;
  ref: string | false;
  property_product_pricelist?: [number, string] | false;
  category_id?: number[];
  credit?: number;
  total_invoiced?: number;
  street?: string | false;
  city?: string | false;
  vat?: string | false;
  company_type?: "person" | "company" | string;
  active?: boolean;
}

export interface OdooPricelistRecord {
  id: number;
  name: string;
  currency: string | null;
  currencyId: number | null;
  company: string;
  companyId: number | null;
  active: boolean;
}

export interface OdooCustomerGroupRecord {
  writable?: boolean;
  id: number;
  name: string;
  color: number;
  parentId: number | null;
  parentName: string | null;
  customerCount: number;
}

export interface OdooCustomerBalanceRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  ref: string | null;
  credit: number;
  currency?: string | null;
  totalInvoiced: number;
  pricelist: string | null;
}

export interface OdooCustomerInvoiceRecord {
  id: number;
  name: string;
  moveType: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amountTotal: number;
  amountResidual: number;
  paymentState: string;
  currency: string | null;
}

export interface OdooGiftCardRecord {
  id: number;
  code: string;
  balance: number;
  currency?: string | null;
  partner: string | null;
  program: string | null;
  expiry: string | null;
  status: string;
}

export type OdooCustomerWriteValues = {
  comment?: string;
  name?: string;
  phone?: string;
  email?: string;
  ref?: string;
  street?: string;
  city?: string;
  vat?: string;
  company_type?: "person" | "company";
  property_product_pricelist?: number | null;
  category_id?: number[];
};

export interface OdooSaleRecord {
  id: number;
  name: string;
  pos_reference: string | false;
  date_order: string;
  amount_total: number;
  amount_tax: number;
  state: "draft" | "paid" | "done" | "invoiced" | "cancel" | string;
  partner_id: [number, string] | false;
  session_id: [number, string] | false;
  user_id: [number, string] | false;
}

export interface OdooSaleDetail {
  order: OdooSaleRecord & {
    amount_paid: number;
    amount_return: number;
    config_id: [number, string] | false;
    company_id: [number, string] | false;
  };
  lines: {
    id: number;
    product_id: [number, string] | false;
    qty: number;
    refunded_qty: number;
    price_unit: number;
    discount: number;
    tax_ids: number[];
    price_subtotal: number;
    price_subtotal_incl: number;
  }[];
  payments: {
    id: number;
    payment_method_id: [number, string] | false;
    amount: number;
    payment_date: string;
  }[];
  company: { id: number; name: string; currency_id: [number, string] | false; timezone?: string } | null;
}

export interface OdooPurchaseOrderRecord {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  state: string;
  amount_total: number;
  currency_id: [number, string] | false;
  company_id: [number, string] | false;
  order_line: number[];
}

export interface OdooPurchaseOrderDetail {
  order: OdooPurchaseOrderRecord & {
    date_planned?: string | false;
    receipt_status?: string | false;
    amount_untaxed: number;
    amount_tax: number;
    user_id: [number, string] | false;
    origin: string | false;
  };
  lines: Array<{
    id: number;
    product_id: [number, string] | false;
    name: string;
    product_qty: number;
    product_uom?: [number, string] | false;
    product_uom_id?: [number, string] | false;
    price_unit: number;
    price_subtotal: number;
    qty_received: number;
    date_planned: string | false;
  }>;
  receipts: Array<{
    id: number;
    name: string;
    state: string;
    scheduled_date: string | false;
    date_done: string | false;
    picking_type_id: [number, string] | false;
    location_id: [number, string] | false;
    location_dest_id: [number, string] | false;
    origin: string | false;
    url: string;
  }>;
  receiptsAvailable: boolean;
  receivable?: {
    pickingId: number;
    pickingName: string;
    pickingState: string;
    moves: Array<{
      id: number;
      product_id: [number, string] | false;
      product_uom_qty: number;
      qty_done: number;
      remaining: number;
    }>;
  } | null;
  approvalAudits: Array<{ id: number; date: string; body: string; author_id: [number, string] | false }>;
  approvalAuditAvailable: boolean;
  url: string;
}

export interface OdooPurchaseOrderPage {
  generatedAt?: string;
  scope?: string[];
  items: OdooPurchaseOrderRecord[];
  limit: number;
  offset: number;
  hasNext: boolean;
}

export interface OdooNamedRecord {
  id: number;
  name: string;
}

export interface OdooTaxRecord {
  id: number;
  name: string;
  amount: number;
  amount_type: "percent" | "fixed" | "division" | "group" | string;
  type_tax_use: "sale" | "purchase" | "none" | string;
  price_include: boolean;
  company_id: [number, string] | false;
}

export interface OdooPosBootstrap {
  configs: {
    id: number;
    name: string;
    company: [number, string] | false;
    timezone: string;
    session: {
      id: number;
      name: string;
      state: "opened";
      config_id: [number, string];
      user_id: [number, string] | false;
      start_at: string | false;
      cashBalanceStart: number | null;
      cashBalanceEnd: number | null;
    } | null;
    paymentMethods: {
      id: number;
      name: string;
      type: string;
      is_cash_count: boolean;
    }[];
    pricelistIds: number[];
    cashRounding: { id: number; rounding: number; rounding_method: "UP" | "DOWN" | "HALF-UP" } | null;
    onlyRoundCashMethod: boolean;
  }[];
  activeSessionId: number | null;
  message?: string;
}

export interface OdooCheckoutRequest {
  expectedQuote?: string;
  configId: number;
  paymentMethodId: number;
  orderUuid: string;
  customerId?: number | null;
  externalPaymentConfirmed?: boolean;
  tendered: number;
  /** When set, marks this checkout as a refund of a completed Odoo sale. */
  refundOfOrderId?: number | null;
  lines: { productId: number; quantity: number; /** Pack/case size multiplier (bottle→case). */ uomFactor?: number; discountPercent?: number; refundedOrderLineId?: number }[];
}

export interface OdooCheckoutResult {
  saleId: number;
  receipt: string;
  total: number;
  gst: number;
  subtotal: number;
  tendered: number;
  change: number;
  isRefund?: boolean;
  lines: Array<{ name: string; quantity: number; subtotal: number; total: number; packFactor?: number }>;
  date: string;
  session: string;
}

export interface OdooCheckoutQuote {
  signature: string;
  priceSource?: string;
  currency?: string;
  subtotal: number;
  tax: number;
  total: number;
  unroundedTotal: number;
  lines: { productId: number; quantity: number; uomFactor: number; unitPrice?: number; priceSource?: string; subtotal: number; tax: number; total: number }[];
}

export interface OdooCloseSessionResult {
  sessionId: number;
  sessionName: string;
  registerName: string;
  state: string;
  message: string;
}

export interface OdooAuthUser {
  id: string;
  name: string;
  username: string;
  isAdmin: false;
  allowedCompanyIds: number[];
}

export class OdooApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly correlationId: string | null = null,
  ) {
    // Gateway pages and connection failures often arrive without a JSON
    // payload. Replace only our generic status-suffixed fallbacks; preserve
    // actionable backend messages and validation errors.
    const gatewayFailure = [502, 503, 504].includes(status)
      && /\((?:502|503|504)\)$/.test(message);
    super(gatewayFailure ? "Odoo is temporarily unavailable. Try again shortly." : message);
    this.name = "OdooApiError";
  }
}

export type OdooSessionStatus = {
  user: OdooAuthUser | null;
  /** True when the server has ODOO_SERVICE_* configured (never exposes the password). */
  autoRecoverConfigured: boolean;
};

let odooRecoveryInFlight: Promise<boolean> | null = null;

async function recoverOdooSession() {
  if (!odooRecoveryInFlight) {
    odooRecoveryInFlight = fetch("/api/odoo/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (response.ok) {
            const payload = await response.json().catch(() => null) as { user?: OdooAuthUser | null; autoRecoverConfigured?: boolean } | null;
            // The service-account recovery endpoint can establish the HttpOnly
            // Odoo cookie while returning no UI user for this tenant. The
            // cookie is enough to safely replay a read-only request.
            if (payload?.user || payload?.autoRecoverConfigured) return true;
          }
          if (attempt === 0) {
            response = await fetch("/api/odoo/session", {
              method: "GET",
              credentials: "same-origin",
              cache: "no-store",
            });
          }
        }
        return false;
      })
      .catch(() => false)
      .finally(() => { odooRecoveryInFlight = null; });
  }
  return odooRecoveryInFlight;
}

async function fetchOdooTransport(input: RequestInfo | URL, init?: RequestInit, safeToRetry = false) {
  const method = init?.method?.toUpperCase() ?? (input instanceof Request ? input.method.toUpperCase() : "GET");
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  // These POSTs capture read-only reports; a 401 occurs before any capture.
  const reportRead = method === "POST" && ["/api/odoo/shopfront-margin", "/api/odoo/cost-reconciliation"].includes(path);
  const canReplay = ["GET", "HEAD", "OPTIONS"].includes(method) || safeToRetry || reportRead;
  const canRetryRoute = canReplay || (method === "POST" && path === "/api/odoo/session");
  let response = await fetch(input, init);
  // A complete replenishment calculation is expensive. Let its explicit Retry
  // action control retries instead of silently running a second full scan.
  const expensivePlan = reportRead || ["/api/odoo/replenishment", "/api/odoo/reporting-dashboard", "/api/odoo/dead-stock", "/api/odoo/sales-report"].some(route => path.split("?")[0].endsWith(route));
  if ([404, 502, 503, 504].includes(response.status) && canRetryRoute && !expensivePlan) {
    response = await fetch(input, init);
  }
  if (response.status !== 401 || isLocalPreviewSession()) return response;

  // Odoo-backed routes use their own session cookie. Recover it before refreshing
  // the unrelated Orithos access token, then replay only requests proven safe.
  if (canReplay && await recoverOdooSession()) {
    response = await fetch(input, init);
    if (response.status === 401 && canRetryRoute) response = await fetch(input, init);
    if (response.status !== 401) return response;
  }

  try {
    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await refreshed.json().catch(() => null) as { code?: number } | null;
    if (canReplay && refreshed.ok && payload?.code === 0) response = await fetch(input, init);
  } catch {
    // Odoo service-account recovery below is independent of Orithos token refresh.
  }

  if (response.status !== 401) return response;

  const recovered = await recoverOdooSession();
  if (recovered && canReplay) {
    response = await fetch(input, init);
    if (response.status === 401 && canRetryRoute) return fetch(input, init);
    return response;
  }

  // Recover credentials in the background, but never replay a write request.
  return response;
}

async function fetchOdooApi(input: RequestInfo | URL, init?: RequestInit, safeToRetry = false): Promise<Response> {
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;
  const response = await cachedOdooRead(path, init, options => fetchOdooTransport(input, options, safeToRetry));
  const method = init?.method?.toUpperCase() ?? "GET";
  if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(method) && !(method === "POST" && ["/api/odoo/records", "/api/odoo/sales-daily"].includes(path)) && !path.includes("/checkout/quote")) clearOdooReadCache();
  return response;
}

export function fetchOdooRoute(input: RequestInfo | URL, init?: RequestInit) {
  return fetchOdooApi(input, init);
}

async function sessionRequest(
  method: "GET" | "POST" | "DELETE",
  body?: { username: string; password: string },
): Promise<OdooSessionStatus> {
  const response = await fetchOdooApi("/api/odoo/session", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: OdooAuthUser | null; autoRecoverConfigured?: boolean; message?: string }
    | null;
  if (!response.ok) {
    throw new OdooApiError(payload?.message || `Odoo login failed (${response.status})`, response.status);
  }
  return {
    user: payload?.user ?? null,
    autoRecoverConfigured: Boolean(payload?.autoRecoverConfigured),
  };
}

export async function loginToOdoo(username: string, password: string) {
  return (await sessionRequest("POST", { username, password })).user;
}

export async function getOdooSession() {
  return (await sessionRequest("GET")).user;
}

export function getOdooSessionStatus() {
  return sessionRequest("GET");
}

export async function getOdooPosBootstrap(): Promise<OdooPosBootstrap> {
  const response = await fetchOdooApi("/api/odoo/pos-bootstrap", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (OdooPosBootstrap & { message?: string })
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new OdooApiError(payload?.message || `Odoo POS configuration failed (${response.status})`, response.status);
  }
  if (!payload || !("configs" in payload) || !Array.isArray(payload.configs)) {
    throw new OdooApiError("Odoo returned an invalid POS configuration", 502);
  }
  return payload as OdooPosBootstrap;
}

/** Open a register through the server-side Odoo service account. */
export async function openOdooPosSession(configId: number): Promise<void> {
  const response = await fetchOdooApi("/api/odoo/session/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ configId }),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Could not open the Orithos register (${response.status})`, response.status);
}

export class OdooCheckoutPendingError extends Error {
  constructor(public readonly order: OdooCheckoutRequest) {
    super("The payment result is pending confirmation. Do not take payment again. Check the saved order before continuing.");
  }
}

export async function recoverOdooPosOrder(order: Pick<OdooCheckoutRequest, "configId" | "orderUuid">): Promise<OdooCheckoutResult | null> {
  try {
    const response = await fetchOdooApi(`/api/odoo/checkout/status?configId=${order.configId}&orderUuid=${encodeURIComponent(order.orderUuid)}`, { cache: "no-store" });
    const payload = response.ok ? await response.json() : null;
    return payload?.resultState === "confirmed" && typeof payload.result?.saleId === "number" && Array.isArray(payload.result?.lines)
      ? payload.result as OdooCheckoutResult : null;
  } catch { return null; }
}

async function postOdooPosOrder(order: OdooCheckoutRequest): Promise<OdooCheckoutResult> {
  const response = await fetchOdooApi("/api/odoo/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(order),
  });
  const payload = (await response.json().catch(() => null)) as
    | (OdooCheckoutResult & { message?: string })
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new OdooApiError(payload?.message || `Odoo checkout failed (${response.status})`, response.status);
  }
  if (!payload || !("saleId" in payload) || typeof payload.saleId !== "number" || typeof payload.receipt !== "string" || typeof payload.change !== "number" || !Array.isArray(payload.lines)) {
    throw new OdooApiError("Odoo did not confirm the sale", 502);
  }
  return payload as OdooCheckoutResult;
}

export async function submitOdooPosOrder(order: OdooCheckoutRequest): Promise<OdooCheckoutResult> {
  try { return await postOdooPosOrder(order); }
  catch (error) {
    if (error instanceof OdooApiError && error.status < 500) throw error;
    const recovered = await recoverOdooPosOrder(order);
    if (recovered) return recovered;
    throw new OdooCheckoutPendingError(order);
  }
}

export async function quoteOdooPosOrder(input: Pick<OdooCheckoutRequest, "configId" | "paymentMethodId" | "customerId" | "lines">): Promise<OdooCheckoutQuote> {
  let response: Response;
  try {
    response = await fetchOdooApi("/api/odoo/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(ODOO_QUOTE_TIMEOUT_MS),
    }, true);
  } catch (error) {
    const timeoutMessage = getOdooQuoteTimeoutMessage(error);
    if (timeoutMessage) throw new OdooApiError(timeoutMessage, 504);
    throw error;
  }
  const payload = await response.json().catch(() => null) as (OdooCheckoutQuote & { message?: string }) | null;
  if (!response.ok || !payload || typeof payload.total !== "number") {
    throw new OdooApiError(payload?.message || `Odoo cart quote failed (${response.status})`, response.status);
  }
  return payload;
}

export async function closeOdooPosSession(configId: number, countedCash?: number | null): Promise<OdooCloseSessionResult> {
  const response = await fetchOdooApi("/api/odoo/session/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ configId, countedCash: countedCash ?? null }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (OdooCloseSessionResult & { message?: string })
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new OdooApiError(payload?.message || `Could not close the register (${response.status})`, response.status);
  }
  if (!payload || !("sessionId" in payload) || typeof payload.sessionId !== "number") {
    throw new OdooApiError("Odoo did not confirm the register close", 502);
  }
  return payload as OdooCloseSessionResult;
}

export function logoutFromOdoo() {
  return sessionRequest("DELETE");
}

/** Read a named, server-allowlisted dataset through the user's Odoo session. */
export async function searchOdooRecords<T>(
  type: OdooRecordType,
  options: { groupId?: number; pricelistId?: number; query?: string; limit?: number; offset?: number; categoryId?: number; categoryIds?: number[]; stockOnly?: boolean; catalogueView?: import("./product-catalogue").CatalogueView; status?: OdooSalesStatusFilter; period?: OdooSalesPeriodFilter; inventoryReport?: boolean; inventoryFilter?: "all" | "zero" | "negative"; sortBy?: import("./inventory-report").InventorySort; sortDirection?: import("./inventory-report").InventoryDirection; snapshotId?: string; refresh?: boolean } = {},
): Promise<OdooPage<T>> {
  const response = await fetchOdooApi("/api/odoo/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      type,
      groupId: options.groupId,
      pricelistId: options.pricelistId,
      query: options.query,
      limit: options.limit,
      offset: options.offset,
      categoryId: options.categoryId,
      categoryIds: options.categoryIds,
      stockOnly: options.stockOnly,
      catalogueView: options.catalogueView,
      status: options.status,
      period: options.period,
      inventoryReport: options.inventoryReport,
      inventoryFilter: options.inventoryFilter,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
      snapshotId: options.snapshotId,
      refresh: options.refresh,
    }),
  }, true);
  const payload = (await response.json().catch(() => null)) as
    | OdooPage<T>
    | { message?: string }
    | null;
  if (!response.ok) {
    const message = payload && "message" in payload ? payload.message : undefined;
    throw new OdooApiError(message || `Odoo request failed (${response.status})`, response.status);
  }
  if (!payload || !("items" in payload) || !Array.isArray(payload.items)) {
    throw new OdooApiError("Odoo returned an invalid records response", 502);
  }
  return payload as OdooPage<T>;
}

export async function searchOdooDailySales(options: {
  status?: OdooSalesStatusFilter;
  period?: OdooSalesPeriodFilter;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<OdooDailySalesPage> {
  const response = await fetchOdooApi("/api/odoo/sales-daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(options),
  }, true);
  const payload = await response.json().catch(() => null) as (OdooDailySalesPage & { message?: string }) | null;
  if (!response.ok || !payload || !Array.isArray(payload.items) || typeof payload.timezone !== "string") {
    throw new OdooApiError(payload?.message || `Daily sales request failed (${response.status})`, response.status || 502);
  }
  return payload;
}

/** Download the current store product catalogue from the Odoo source of truth. */
export async function exportOdooProductsCsv(): Promise<void> {
  const response = await fetchOdooApi("/api/odoo/products/export", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  }, true);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new OdooApiError(payload?.message || `Product export failed (${response.status})`, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "products.csv";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function getOdooPriceRules(query?: string, offset = 0, limit = 30): Promise<{ items: OdooPriceRuleRecord[]; hasNext: boolean }> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query?.trim()) params.set("query", query.trim());
  const response = await fetchOdooApi(`/api/odoo/pricelist-items?${params.toString()}`, { credentials: "same-origin", cache: "no-store" }, true);
  const payload = await response.json().catch(() => null) as { items?: OdooPriceRuleRecord[]; hasNext?: boolean; message?: string } | null;
  if (!response.ok || !payload || !Array.isArray(payload.items)) throw new OdooApiError(payload?.message || `Odoo price rules failed (${response.status})`, response.status);
  return { items: payload.items, hasNext: Boolean(payload.hasNext) };
}

export async function updateOdooProduct(productId: number, values: Partial<OdooProductUpdate> & { image_1920?: string }): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/products/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Product update failed (${response.status})`, response.status);
}

export async function createOdooProduct(values: {
  name: string;
  list_price: number;
  default_code: string;
  barcode: string;
  pos_categ_ids: number[];
  available_in_pos: boolean;
  image_1920?: string;
}): Promise<{ id: number; name: string }> {
  const response = await fetchOdooApi("/api/odoo/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { id?: number; name?: string; message?: string } | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string") {
    throw new OdooApiError(payload?.message || `Product creation failed (${response.status})`, response.status || 502);
  }
  return { id: payload.id, name: payload.name };
}

export interface OdooProductImportRow {
  line: number;
  name: string;
  list_price: number;
  default_code: string;
  barcode: string;
  standard_price?: number;
  pos_categ_ids: number[];
}

export interface OdooProductImportResult {
  created: number;
  skipped: Array<{ line: number; reason: string }>;
}

export async function importOdooProducts(products: OdooProductImportRow[]): Promise<OdooProductImportResult> {
  const response = await fetchOdooApi("/api/odoo/products/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ products }),
  });
  const payload = await response.json().catch(() => null) as (OdooProductImportResult & { message?: string }) | null;
  if (!response.ok || !payload || typeof payload.created !== "number" || !Array.isArray(payload.skipped)) {
    throw new OdooApiError(payload?.message || `Product import failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export interface OdooSupplierOption {
  id: number;
  name: string;
  email?: string | false;
}

export async function getOdooSuppliers(): Promise<OdooSupplierOption[]> {
  const response = await fetchOdooApi("/api/odoo/purchase-requests", { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as { suppliers?: OdooSupplierOption[]; message?: string } | null;
  if (!response.ok || !payload || !Array.isArray(payload.suppliers)) {
    throw new OdooApiError(payload?.message || `Supplier list failed (${response.status})`, response.status || 502);
  }
  return payload.suppliers;
}

export interface OdooDraftRfq {
  id: number;
  name: string;
  supplier: string;
  url: string;
  auditSaved: boolean;
  readbackVerified?: boolean;
  warning?: string;
}

export async function createOdooDraftRfq(input: {
  requestId: string;
  supplierId: number;
  coverageDays: number;
  method: string;
  lines: Array<{ productId: number; quantity: number; suggestedQuantity: number; reason: string }>;
}): Promise<OdooDraftRfq> {
  const response = await fetchOdooApi("/api/odoo/purchase-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.requestId },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ supplierId: input.supplierId, coverageDays: input.coverageDays, method: input.method, lines: input.lines }),
  });
  const payload = await response.json().catch(() => null) as (OdooDraftRfq & { message?: string }) | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string" || typeof payload.supplier !== "string" || typeof payload.url !== "string" || typeof payload.auditSaved !== "boolean") {
    throw new OdooApiError(payload?.message || `Draft RFQ creation failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function createOdooDraftRfqFromInvoice(input: {
  supplierId: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  notes?: string | null;
  lines: Array<{ productId: number; quantity: number; priceUnit?: number | null; description?: string | null }>;
}): Promise<OdooDraftRfq> {
  const response = await fetchOdooApi("/api/odoo/purchase-requests/from-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as (OdooDraftRfq & { message?: string }) | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string" || typeof payload.supplier !== "string" || typeof payload.url !== "string" || typeof payload.auditSaved !== "boolean") {
    throw new OdooApiError(payload?.message || `Invoice RFQ creation failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function createOdooCustomer(values: OdooCustomerWriteValues & { name: string }): Promise<{ id: number; name: string }> {
  const response = await fetchOdooApi("/api/odoo/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { id?: number; name?: string; message?: string } | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string") {
    throw new OdooApiError(payload?.message || `Customer creation failed (${response.status})`, response.status || 502);
  }
  return { id: payload.id, name: payload.name };
}

export async function updateOdooCustomer(customerId: number, values: OdooCustomerWriteValues): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/customers/${customerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Customer update failed (${response.status})`, response.status);
}

export async function archiveOdooCustomer(customerId: number): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/customers/${customerId}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Customer archive failed (${response.status})`, response.status);
}

async function readOdooListPage<T>(path: string): Promise<{ items: T[]; hasNext: boolean }> {
  const response = await fetchOdooApi(path, { credentials: "same-origin", cache: "no-store" }, true);
  const payload = await response.json().catch(() => null) as { items?: T[]; hasNext?: boolean; message?: string } | null;
  if (!response.ok || !payload || !Array.isArray(payload.items)) {
    throw new OdooApiError(payload?.message || `Odoo request failed (${response.status})`, response.status || 502);
  }
  return { items: payload.items, hasNext: Boolean(payload.hasNext) };
}

export async function getOdooPricelists(query?: string, offset = 0, limit = 50) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query?.trim()) params.set("query", query.trim());
  return readOdooListPage<OdooPricelistRecord>(`/api/odoo/pricelists?${params}`);
}

export async function createOdooPricelist(name: string): Promise<{ id: number; name: string }> {
  const response = await fetchOdooApi("/api/odoo/pricelists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => null) as { id?: number; name?: string; message?: string } | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string") {
    throw new OdooApiError(payload?.message || `Price list creation failed (${response.status})`, response.status || 502);
  }
  return { id: payload.id, name: payload.name };
}

export async function updateOdooPricelist(id: number, values: { name?: string; active?: boolean }): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/pricelists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Price list update failed (${response.status})`, response.status);
}

export async function archiveOdooPricelist(id: number): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/pricelists/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Price list archive failed (${response.status})`, response.status);
}

export async function getOdooCustomerGroups(query?: string, offset = 0, limit = 50) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query?.trim()) params.set("query", query.trim());
  return readOdooListPage<OdooCustomerGroupRecord>(`/api/odoo/customer-groups?${params}`);
}

export async function createOdooCustomerGroup(name: string): Promise<{ id: number; name: string }> {
  const response = await fetchOdooApi("/api/odoo/customer-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => null) as { id?: number; name?: string; message?: string } | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string") {
    throw new OdooApiError(payload?.message || `Customer group creation failed (${response.status})`, response.status || 502);
  }
  return { id: payload.id, name: payload.name };
}

export async function updateOdooCustomerGroup(id: number, name: string): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/customer-groups/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Customer group update failed (${response.status})`, response.status);
}

export async function deleteOdooCustomerGroup(id: number): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/customer-groups/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Customer group delete failed (${response.status})`, response.status);
}

export async function getOdooCustomerBalances(options: { query?: string; owingOnly?: boolean; offset?: number; limit?: number } = {}) {
  const params = new URLSearchParams({
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 40),
  });
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.owingOnly) params.set("owingOnly", "true");
  return readOdooListPage<OdooCustomerBalanceRecord>(`/api/odoo/customer-balances?${params}`);
}

export async function getOdooCustomerInvoices(customerId: number, openOnly = true, offset = 0, limit = 50): Promise<{
  customer: { id: number; name: string; credit: number };
  items: OdooCustomerInvoiceRecord[];
  hasNext: boolean;
}> {
  const params = new URLSearchParams({ openOnly: openOnly ? "true" : "false", offset: String(offset), limit: String(limit) });
  const response = await fetchOdooApi(`/api/odoo/customer-balances/${customerId}/invoices?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  }, true);
  const payload = await response.json().catch(() => null) as {
    customer?: { id: number; name: string; credit: number };
    items?: OdooCustomerInvoiceRecord[];
    hasNext?: boolean;
    message?: string;
  } | null;
  if (!response.ok || !payload?.customer || !Array.isArray(payload.items)) {
    throw new OdooApiError(payload?.message || `Customer invoices failed (${response.status})`, response.status || 502);
  }
  return { customer: payload.customer, items: payload.items, hasNext: Boolean(payload.hasNext) };
}

export async function getOdooGiftCards(query?: string, offset = 0, limit = 40): Promise<{
  available: boolean;
  module: string | null;
  message?: string;
  items: OdooGiftCardRecord[];
  hasNext: boolean;
}> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query?.trim()) params.set("query", query.trim());
  const response = await fetchOdooApi(`/api/odoo/gift-cards?${params}`, { credentials: "same-origin", cache: "no-store" }, true);
  const payload = await response.json().catch(() => null) as {
    available?: boolean;
    module?: string | null;
    message?: string;
    items?: OdooGiftCardRecord[];
    hasNext?: boolean;
  } | null;
  if (!response.ok || !payload || typeof payload.available !== "boolean" || !Array.isArray(payload.items)) {
    throw new OdooApiError(payload?.message || `Gift cards request failed (${response.status})`, response.status || 502);
  }
  return {
    available: payload.available,
    module: payload.module ?? null,
    message: payload.message,
    items: payload.items,
    hasNext: Boolean(payload.hasNext),
  };
}

export async function getOdooSaleDetail(saleId: number): Promise<OdooSaleDetail> {
  const response = await fetchOdooApi(`/api/odoo/sales/${saleId}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as (OdooSaleDetail & { message?: string }) | { message?: string } | null;
  if (!response.ok || !payload || !("order" in payload) || !Array.isArray(payload.lines) || !Array.isArray(payload.payments)) {
    throw new OdooApiError(payload && "message" in payload ? payload.message || `Sale details failed (${response.status})` : `Sale details failed (${response.status})`, response.status || 502);
  }
  return payload as OdooSaleDetail;
}

export async function searchOdooPurchaseOrders(options: { query?: string; state?: string; limit?: number; offset?: number } = {}): Promise<OdooPurchaseOrderPage> {
  const params = new URLSearchParams();
  if (options.query) params.set("query", options.query);
  if (options.state) params.set("state", options.state);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  const response = await fetchOdooApi(`/api/odoo/purchase-orders?${params.toString()}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as (OdooPurchaseOrderPage & { message?: string }) | null;
  if (!response.ok || !payload || !Array.isArray(payload.items) || typeof payload.hasNext !== "boolean") {
    throw new OdooApiError(payload?.message || `Odoo purchase list failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function getOdooPurchaseOrderDetail(purchaseId: number): Promise<OdooPurchaseOrderDetail> {
  const response = await fetchOdooApi(`/api/odoo/purchase-orders/${purchaseId}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as (OdooPurchaseOrderDetail & { message?: string }) | null;
  if (!response.ok || !payload || !payload.order || !Array.isArray(payload.lines) || typeof payload.url !== "string") {
    throw new OdooApiError(payload?.message || `Purchase order details failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function confirmOdooPurchaseOrder(purchaseId: number): Promise<void> {
  const response = await fetchOdooApi(`/api/odoo/purchase-orders/${purchaseId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ confirm: true }),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Purchase confirmation failed (${response.status})`, response.status || 502);
}

export async function receiveOdooPurchaseOrder(
  purchaseId: number,
  body: { pickingId?: number; lines: Array<{ moveId: number; qtyDone: number }> },
): Promise<{ pickingName: string; pickingState: string }> {
  const response = await fetchOdooApi(`/api/odoo/purchase-orders/${purchaseId}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ confirm: true, pickingId: body.pickingId, lines: body.lines }),
  });
  const payload = await response.json().catch(() => null) as {
    message?: string;
    pickingName?: string;
    pickingState?: string;
  } | null;
  if (!response.ok || !payload?.pickingName) {
    throw new OdooApiError(payload?.message || `Purchase receive failed (${response.status})`, response.status || 502, response.headers.get("x-correlation-id"));
  }
  return { pickingName: payload.pickingName, pickingState: payload.pickingState || "" };
}

export interface OdooTransferLocation {
  id: number;
  name: string;
  warehouseId: number;
  pickingTypeId: number;
}

export interface OdooTransferListItem {
  id: number;
  name: string;
  state: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  scheduledDate?: string | null;
  origin?: string | null;
}

export interface OdooTransfersBootstrap {
  writeEnabled: boolean;
  companyId: number;
  warehouses: Array<{ id: number; name: string; locationId: number; locationName: string; pickingTypeId: number }>;
  locations: OdooTransferLocation[];
  items: OdooTransferListItem[];
  note?: string;
}

export async function getOdooTransfers(): Promise<OdooTransfersBootstrap> {
  const response = await fetchOdooApi("/api/odoo/transfers", { credentials: "same-origin", cache: "no-store" }, true);
  const payload = await response.json().catch(() => null) as (OdooTransfersBootstrap & { message?: string }) | null;
  if (!response.ok || !payload || !Array.isArray(payload.locations) || !Array.isArray(payload.items)) {
    throw new OdooApiError(payload?.message || `Transfer list failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function createOdooStockTransfer(input: {
  fromLocationId: number;
  toLocationId: number;
  note?: string;
  validate?: boolean;
  lines: Array<{ productId: number; quantity: number }>;
}): Promise<{ id: number; name: string; state: string; fromLocation: string; toLocation: string }> {
  const response = await fetchOdooApi("/api/odoo/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as {
    id?: number;
    name?: string;
    state?: string;
    fromLocation?: string;
    toLocation?: string;
    message?: string;
  } | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string") {
    throw new OdooApiError(payload?.message || `Transfer create failed (${response.status})`, response.status || 502);
  }
  return {
    id: payload.id,
    name: payload.name,
    state: payload.state || "",
    fromLocation: payload.fromLocation || "",
    toLocation: payload.toLocation || "",
  };
}

export async function postOdooSessionCash(body: {
  configId: number;
  direction: "in" | "out";
  amount: number;
  reason?: string;
}): Promise<{ sessionName: string; recordedAt: string }> {
  const response = await fetchOdooApi("/api/odoo/session/cash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as {
    message?: string;
    sessionName?: string;
    recordedAt?: string;
  } | null;
  if (!response.ok || !payload?.sessionName) {
    throw new OdooApiError(payload?.message || `Cash adjustment failed (${response.status})`, response.status || 502);
  }
  return { sessionName: payload.sessionName, recordedAt: payload.recordedAt || new Date().toISOString() };
}
