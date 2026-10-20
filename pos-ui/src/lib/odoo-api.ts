export type OdooRecordType =
  | "products"
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
export type OdooSalesPeriodFilter = "all" | "24h" | "7d" | "30d";

export interface OdooPage<T> {
  items: T[];
  limit: number;
  offset: number;
}

export interface OdooProductRecord {
  id: number;
  name: string;
  display_name: string;
  barcode: string | false;
  default_code: string | false;
  list_price: number;
  taxes_id: number[];
  price_included: number | null;
  price_tax: number | null;
  qty_available: number;
  free_qty: number;
  uom_id: [number, string] | false;
  pos_categ_ids: number[];
  available_in_pos: boolean;
}

export type OdooProductUpdate = Pick<OdooProductRecord, "barcode" | "default_code" | "list_price" | "pos_categ_ids" | "available_in_pos">;

export interface OdooPosCategoryRecord {
  id: number;
  name: string;
  parent_id: [number, string] | false;
}

export interface OdooCustomerRecord {
  id: number;
  name: string;
  phone: string | false;
  email: string | false;
  customer_rank: number;
  ref: string | false;
}

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
  configId: number;
  paymentMethodId: number;
  orderUuid: string;
  customerId?: number | null;
  tendered: number;
  /** When set, marks this checkout as a refund of a completed Odoo sale. */
  refundOfOrderId?: number | null;
  lines: { productId: number; quantity: number; /** Pack/case size multiplier (bottle→case). */ uomFactor?: number; refundedOrderLineId?: number }[];
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
  subtotal: number;
  tax: number;
  total: number;
  unroundedTotal: number;
  lines: { productId: number; quantity: number; uomFactor: number; subtotal: number; tax: number; total: number }[];
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
        if (!response.ok) return false;
        const payload = await response.json().catch(() => null) as { user?: OdooAuthUser | null } | null;
        return Boolean(payload?.user);
      })
      .catch(() => false)
      .finally(() => { odooRecoveryInFlight = null; });
  }
  return odooRecoveryInFlight;
}

async function fetchOdooApi(input: RequestInfo | URL, init?: RequestInit, safeToRetry = false) {
  const method = init?.method?.toUpperCase() ?? (input instanceof Request ? input.method.toUpperCase() : "GET");
  const canReplay = ["GET", "HEAD", "OPTIONS"].includes(method) || safeToRetry;
  let response = await fetch(input, init);
  if (response.status !== 401) return response;

  // Odoo-backed routes use their own session cookie. Recover it before refreshing
  // the unrelated Orithos access token, then replay only requests proven safe.
  if (canReplay && await recoverOdooSession()) {
    response = await fetch(input, init);
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
    return fetch(input, init);
  }

  // Recover credentials in the background, but never replay a write request.
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

export async function submitOdooPosOrder(order: OdooCheckoutRequest): Promise<OdooCheckoutResult> {
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

export async function quoteOdooPosOrder(input: Pick<OdooCheckoutRequest, "configId" | "paymentMethodId" | "customerId" | "lines">): Promise<OdooCheckoutQuote> {
  const response = await fetchOdooApi("/api/odoo/checkout/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
  }, true);
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
  options: { query?: string; limit?: number; offset?: number; categoryId?: number; status?: OdooSalesStatusFilter; period?: OdooSalesPeriodFilter } = {},
): Promise<OdooPage<T>> {
  const response = await fetchOdooApi("/api/odoo/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      type,
      query: options.query,
      limit: options.limit,
      offset: options.offset,
      categoryId: options.categoryId,
      status: options.status,
      period: options.period,
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
  warning?: string;
}

export async function createOdooDraftRfq(input: {
  supplierId: number;
  coverageDays: number;
  method: string;
  lines: Array<{ productId: number; quantity: number; suggestedQuantity: number; reason: string }>;
}): Promise<OdooDraftRfq> {
  const response = await fetchOdooApi("/api/odoo/purchase-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as (OdooDraftRfq & { message?: string }) | null;
  if (!response.ok || !payload || typeof payload.id !== "number" || typeof payload.name !== "string" || typeof payload.supplier !== "string" || typeof payload.url !== "string" || typeof payload.auditSaved !== "boolean") {
    throw new OdooApiError(payload?.message || `Draft RFQ creation failed (${response.status})`, response.status || 502);
  }
  return payload;
}

export async function createOdooCustomer(values: { name: string; phone: string; email: string; ref: string }): Promise<{ id: number; name: string }> {
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

export async function updateOdooCustomer(customerId: number, values: { name: string; phone: string; email: string; ref: string }): Promise<void> {
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
    throw new OdooApiError(payload?.message || `Purchase receive failed (${response.status})`, response.status || 502);
  }
  return { pickingName: payload.pickingName, pickingState: payload.pickingState || "" };
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
