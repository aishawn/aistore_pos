import { cachedOdooRead, clearOdooReadCache } from "./odoo-read-cache";
import {
  ApiError,
  api,
  checkoutSale,
  closeRetailRegisterSession,
  getRetailRegisterSession,
  getRetailRegisterSessionSummary,
  isLocalPreviewSession,
  listRetailRegisters,
  openRetailRegisterSession,
  quoteSale,
  type CheckoutQuote,
  type Page,
  type RetailRegister,
  type RetailRegisterSession,
} from "./api";
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

async function fetchOdooTransport(input: RequestInfo | URL, init?: RequestInit, safeToRetry = false) {
  const method = init?.method?.toUpperCase() ?? (input instanceof Request ? input.method.toUpperCase() : "GET");
  const canReplay = ["GET", "HEAD", "OPTIONS"].includes(method) || safeToRetry;
  let response = await fetch(input, init);
  if ([404, 502, 503, 504].includes(response.status) && canReplay) {
    response = await fetch(input, init);
  }
  if (response.status !== 401 || isLocalPreviewSession()) return response;

  try {
    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await refreshed.json().catch(() => null) as { code?: number } | null;
    if (canReplay && refreshed.ok && payload?.code === 0) response = await fetch(input, init);
  } catch {
    // Orithos token refresh failed; leave the original 401 for the caller.
  }
  return response;
}

async function fetchOdooApi(input: RequestInfo | URL, init?: RequestInit, safeToRetry = false): Promise<Response> {
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;
  const response = await cachedOdooRead(path, init, options => fetchOdooTransport(input, options, safeToRetry));
  const method = init?.method?.toUpperCase() ?? "GET";
  if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(method)) clearOdooReadCache();
  return response;
}

export function fetchOdooRoute(input: RequestInfo | URL, init?: RequestInit) {
  return fetchOdooApi(input, init);
}

export async function loginToOdoo(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: OrithosAuthMe } | null;
  if (!response.ok || payload?.code !== 0 || !payload.data) {
    throw new OdooApiError(payload?.message || `Orithos login failed (${response.status})`, response.status || 502);
  }
  return mapOrithosAuthUser(payload.data);
}

type OrithosAuthMe = { id: number; username: string; name?: string; outletId?: number; vendorId?: number };

function mapOrithosAuthUser(user: OrithosAuthMe): OdooAuthUser {
  return {
    id: String(user.id),
    name: user.name || user.username,
    username: user.username,
    isAdmin: false,
    allowedCompanyIds: [],
  };
}

export async function getOdooSession() {
  try {
    const user = await getOrithosSession();
    return mapOrithosAuthUser(user);
  } catch {
    return null;
  }
}

export function getOrithosSession() {
  return api.get<OrithosAuthMe>("/api/auth/me");
}

export async function getOdooSessionStatus() {
  const user = await getOdooSession();
  return { user, autoRecoverConfigured: false };
}

type RetailPaymentMethodAssignment = {
  paymentMethodId?: number;
  payment_method_id?: number;
  name: string;
  type: string;
  registerId?: number;
  register_id?: number;
};

type NativeQuoteSignature = {
  expectedTotal: number;
  expectedGst: number;
  lines: Array<{ productId: number; quantity: number; unitPrice: number; lineTotal: number; expectedTaxRate: number; name: string }>;
};

function encodeQuoteSignature(quote: NativeQuoteSignature): string {
  return `orithos:${JSON.stringify(quote)}`;
}

function decodeQuoteSignature(signature?: string): NativeQuoteSignature | null {
  if (!signature?.startsWith("orithos:")) return null;
  try {
    return JSON.parse(signature.slice("orithos:".length)) as NativeQuoteSignature;
  } catch {
    return null;
  }
}

function tenderFromPaymentMethod(method: { id: number; name: string; type: string } | undefined): string {
  if (!method) return "CASH";
  const type = (method.type || "").toUpperCase();
  if (type === "CASH" || /cash/i.test(method.name)) return "CASH";
  if (type === "EFTPOS" || /eftpos|card|bank|terminal/i.test(method.name)) return "EFTPOS";
  return method.name || type || "CASH";
}

function mapCheckoutQuote(native: CheckoutQuote): OdooCheckoutQuote {
  const lines = native.lines.map((line) => ({
    productId: Number(line.productId),
    quantity: Number(line.quantity),
    uomFactor: 1,
    unitPrice: Number(line.unitPrice),
    priceSource: "orithos",
    subtotal: Number(line.total) - Number(line.gst),
    tax: Number(line.gst),
    total: Number(line.total),
  }));
  const signature = encodeQuoteSignature({
    expectedTotal: Number(native.total),
    expectedGst: Number(native.gst),
    lines: native.lines.map((line) => ({
      productId: Number(line.productId),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.total),
      expectedTaxRate: Number(line.taxRate),
      name: line.name,
    })),
  });
  return {
    signature,
    priceSource: "orithos",
    currency: "AUD",
    subtotal: Number(native.subtotalExGst),
    tax: Number(native.gst),
    total: Number(native.total),
    unroundedTotal: Number(native.total),
    lines,
  };
}

async function loadRetailPaymentMethods(): Promise<RetailPaymentMethodAssignment[]> {
  try {
    const payload = await api.get<{ nativePosEnabled?: boolean; assignments?: RetailPaymentMethodAssignment[] }>("/api/retail/payment-methods");
    return Array.isArray(payload.assignments) ? payload.assignments : [];
  } catch {
    return [];
  }
}

function paymentMethodsForRegister(registerId: number, assignments: RetailPaymentMethodAssignment[]) {
  const matched = assignments.filter((row) => Number(row.registerId ?? row.register_id) === registerId);
  const rows = matched.length ? matched : assignments;
  const unique = new Map<number, { id: number; name: string; type: string; is_cash_count: boolean }>();
  for (const row of rows) {
    const id = Number(row.paymentMethodId ?? row.payment_method_id);
    if (!Number.isSafeInteger(id) || id <= 0 || unique.has(id)) continue;
    const type = String(row.type || "CASH");
    unique.set(id, {
      id,
      name: row.name || type,
      type,
      is_cash_count: type.toUpperCase() === "CASH" || /cash/i.test(row.name || ""),
    });
  }
  if (!unique.size) {
    unique.set(1, { id: 1, name: "Cash", type: "CASH", is_cash_count: true });
  }
  return [...unique.values()];
}

async function buildNativeBootstrap(): Promise<OdooPosBootstrap> {
  const [registers, assignments] = await Promise.all([
    listRetailRegisters(),
    loadRetailPaymentMethods(),
  ]);
  const configs = await Promise.all(registers.map(async (register: RetailRegister) => {
    let session: RetailRegisterSession | null = null;
    let summary: Awaited<ReturnType<typeof getRetailRegisterSessionSummary>> | null = null;
    try {
      session = await getRetailRegisterSession(register.id);
      if (session) {
        try { summary = await getRetailRegisterSessionSummary(register.id); } catch { /* summary optional for open tills */ }
      }
    } catch { session = null; }
    return {
      id: Number(register.id),
      name: register.name,
      company: [Number(register.outletId) || 0, "Orithos"] as [number, string],
      timezone: "Australia/Adelaide",
      session: session ? {
        id: Number(session.id),
        name: `Session ${session.id}`,
        state: "opened" as const,
        config_id: [Number(register.id), register.name] as [number, string],
        user_id: false as const,
        start_at: (session.openedAt ? session.openedAt : false) as string | false,
        cashBalanceStart: Number(session.openingFloat ?? 0),
        cashBalanceEnd: summary ? Number(summary.expectedCash) : Number(session.openingFloat ?? 0),
      } : null,
      paymentMethods: paymentMethodsForRegister(Number(register.id), assignments),
      pricelistIds: [] as number[],
      cashRounding: { id: 1, rounding: 0.05, rounding_method: "HALF-UP" as const },
      onlyRoundCashMethod: true,
    };
  }));
  return {
    configs,
    activeSessionId: configs.find((config) => config.session)?.session?.id ?? null,
  };
}

export async function getOdooPosBootstrap(): Promise<OdooPosBootstrap> {
  try {
    return await buildNativeBootstrap();
  } catch (cause) {
    throw new OdooApiError(cause instanceof Error ? cause.message : "Orithos POS configuration failed", 502);
  }
}

/** Open an Orithos retail register session (opening float defaults to 0). */
export async function openOdooPosSession(configId: number): Promise<void> {
  try {
    await openRetailRegisterSession(configId, 0);
  } catch (cause) {
    // Idempotent reopen: an open session is success for the sell shell.
    try {
      const current = await getRetailRegisterSession(configId);
      if (current) return;
    } catch { /* fall through */ }
    throw new OdooApiError(cause instanceof Error ? cause.message : `Could not open the Orithos register`, 502);
  }
}

export class OdooCheckoutPendingError extends Error {
  constructor(public readonly order: OdooCheckoutRequest) {
    super("The payment result is pending confirmation. Do not take payment again. Check the saved order before continuing.");
  }
}

export async function recoverOdooPosOrder(order: Pick<OdooCheckoutRequest, "configId" | "orderUuid" | "expectedQuote" | "paymentMethodId" | "customerId" | "tendered" | "lines">): Promise<OdooCheckoutResult | null> {
  try {
    return await postOdooPosOrder(order as OdooCheckoutRequest);
  } catch {
    return null;
  }
}

async function postOdooPosOrder(order: OdooCheckoutRequest): Promise<OdooCheckoutResult> {
  const signed = decodeQuoteSignature(order.expectedQuote);
  if (!signed) throw new OdooApiError("Refresh the cart quote before taking payment.", 400);
  const bootstrap = await getOdooPosBootstrap();
  const config = bootstrap.configs.find((item) => item.id === order.configId);
  const method = config?.paymentMethods.find((item) => item.id === order.paymentMethodId);
  const tender = tenderFromPaymentMethod(method);
  try {
    const result = await checkoutSale({
      registerId: order.configId,
      customerId: order.customerId == null ? null : String(order.customerId),
      tender,
      tendered: order.tendered,
      expectedTotal: signed.expectedTotal,
      expectedGst: signed.expectedGst,
      idempotencyKey: order.orderUuid,
      items: signed.lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        expectedTaxRate: line.expectedTaxRate,
      })),
    });
    const saleId = Number(result.saleId);
    if (!Number.isSafeInteger(saleId) || saleId <= 0) {
      throw new OdooApiError("Orithos did not confirm the sale", 502);
    }
    return {
      saleId,
      receipt: result.invoiceId || `SALE-${saleId}`,
      total: Number(result.amountDue ?? signed.expectedTotal),
      gst: Number(result.gst ?? signed.expectedGst),
      subtotal: Number(result.subtotalExGst ?? (signed.expectedTotal - signed.expectedGst)),
      tendered: Number(result.tendered ?? order.tendered),
      change: Number(result.change ?? 0),
      lines: signed.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        subtotal: Math.round((line.lineTotal - (line.lineTotal * line.expectedTaxRate) / (100 + line.expectedTaxRate)) * 100) / 100,
        total: line.lineTotal,
        packFactor: 1,
      })),
      date: new Date().toISOString(),
      session: config?.session?.name || `Register ${order.configId}`,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Orithos checkout failed";
    const status = cause && typeof cause === "object" && "status" in cause ? Number((cause as { status?: number }).status) || 502 : 502;
    throw new OdooApiError(message, status);
  }
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
  try {
    const native = await quoteSale({
      registerId: input.configId,
      customerId: input.customerId == null ? null : String(input.customerId),
      items: input.lines.map((line) => ({
        productId: line.productId,
        name: `Product ${line.productId}`,
        quantity: line.quantity * (line.uomFactor && line.uomFactor > 0 ? line.uomFactor : 1),
        unitPrice: 0,
        lineTotal: 0,
      })),
    });
    return mapCheckoutQuote(native);
  } catch (error) {
    const timeoutMessage = getOdooQuoteTimeoutMessage(error);
    if (timeoutMessage) throw new OdooApiError(timeoutMessage, 504);
    throw new OdooApiError(error instanceof Error ? error.message : "Orithos cart quote failed", 502);
  }
}

export async function closeOdooPosSession(configId: number, countedCash?: number | null): Promise<OdooCloseSessionResult> {
  try {
    const summary = await getRetailRegisterSessionSummary(configId);
    const cash = countedCash == null || !Number.isFinite(countedCash) ? Number(summary.expectedCash) : Number(countedCash);
    const countedTenders: Record<number, number> = {};
    for (const tender of summary.tenders) {
      countedTenders[tender.paymentMethodId] = tender.type.toUpperCase() === "CASH"
        ? cash
        : Number(tender.expectedAmount);
    }
    const closure = await closeRetailRegisterSession(configId, {
      countedCash: cash,
      countedTenders,
    });
    const bootstrap = await getOdooPosBootstrap();
    const register = bootstrap.configs.find((item) => item.id === configId);
    return {
      sessionId: Number(closure.id),
      sessionName: `Session ${closure.id}`,
      registerName: register?.name || `Register ${configId}`,
      state: "closed",
      message: "Register closed on Orithos.",
    };
  } catch (cause) {
    throw new OdooApiError(cause instanceof Error ? cause.message : "Could not close the register", 502);
  }
}

export async function logoutFromOdoo(): Promise<OdooSessionStatus> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => undefined);
  clearOdooReadCache();
  return { user: null, autoRecoverConfigured: false };
}

type NativeProductRow = {
  id: number;
  name: string;
  status?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  brandName?: string | null;
  price?: number | null;
  cost?: number | null;
  caseQuantity?: number | null;
  stockQuantity?: number | null;
  trackInventory?: boolean | null;
  barcodes?: Array<{ code?: string | null }> | null;
};

function mapNativeProduct(product: NativeProductRow): OdooProductRecord {
  const barcode = product.barcodes?.find((row) => row.code)?.code || false;
  const price = Number(product.price ?? 0);
  const cost = product.cost == null ? null : Number(product.cost);
  const qty = product.stockQuantity == null ? 0 : Number(product.stockQuantity);
  const categoryId = product.categoryId == null ? null : Number(product.categoryId);
  return {
    id: Number(product.id),
    name: product.name,
    display_name: product.name,
    active: (product.status || "ACTIVE").toUpperCase() === "ACTIVE",
    barcode,
    default_code: false,
    list_price: price,
    standard_price: cost ?? false,
    shopfront_cost: cost,
    shopfront_cost_status: cost == null ? "missing" : "available",
    shopfront_case_quantity: product.caseQuantity == null ? null : Number(product.caseQuantity),
    shopfront_price: price,
    shopfront_quantity: qty,
    shopfront_inventory_status: product.stockQuantity == null ? "missing" : "available",
    shopfront_data_status: product.stockQuantity == null ? "missing" : "available",
    shopfront_source_name: product.name,
    shopfront_source_category: product.categoryName || false,
    shopfront_track_inventory: product.trackInventory ?? true,
    taxes_id: [],
    price_included: null,
    price_tax: null,
    qty_available: qty,
    free_qty: qty,
    uom_id: false,
    pos_categ_ids: categoryId ? [categoryId] : [],
    available_in_pos: (product.status || "ACTIVE").toUpperCase() === "ACTIVE",
  };
}

/** Read a named dataset. Prefer Orithos ledger APIs after the native cutover. */
export async function searchOdooRecords<T>(
  type: OdooRecordType,
  options: { groupId?: number; pricelistId?: number; query?: string; limit?: number; offset?: number; categoryId?: number; categoryIds?: number[]; stockOnly?: boolean; catalogueView?: import("./product-catalogue").CatalogueView; status?: OdooSalesStatusFilter; period?: OdooSalesPeriodFilter; inventoryReport?: boolean; inventoryFilter?: "all" | "zero" | "negative"; sortBy?: import("./inventory-report").InventorySort; sortDirection?: import("./inventory-report").InventoryDirection; snapshotId?: string; refresh?: boolean } = {},
): Promise<OdooPage<T>> {
  if (type === "customers") {
    const pageNumber = Math.floor((options.offset ?? 0) / (options.limit ?? 40)) + 1;
    const size = options.limit ?? 40;
    const page = await api.get<Page<{
      id: number; name: string; code?: string | null; phone?: string | null; email?: string | null;
      customerGroupId?: number | null; customerGroupName?: string | null; priceListId?: number | null;
      currentOwing?: number | null;
    }>>("/api/customers", {
      name: options.query, groupId: options.groupId, priceListId: options.pricelistId,
      page: pageNumber, size,
    });
    const priceLists = await getOdooPricelists(undefined, 0, 500).catch(() => ({ items: [] as OdooPricelistRecord[], hasNext: false }));
    const priceListNames = new Map(priceLists.items.map((item) => [item.id, item.name]));
    const items = page.items.map((customer) => ({
      id: Number(customer.id), name: customer.name, phone: customer.phone || false,
      email: customer.email || false, customer_rank: 0, ref: customer.code || false,
      category_id: customer.customerGroupId ? [customer.customerGroupId] : [],
      property_product_pricelist: customer.priceListId ? [customer.priceListId, priceListNames.get(customer.priceListId) ?? `Price list #${customer.priceListId}`] as [number, string] : false,
      credit: Number(customer.currentOwing ?? 0), active: true,
    } as OdooCustomerRecord));
    return { items: items as T[], total: page.total, limit: size, offset: options.offset ?? 0, hasNext: pageNumber * size < page.total, generatedAt: new Date().toISOString() };
  }
  if (type === "products" || type === "purchaseProducts") {
    const size = options.limit ?? 40;
    const pageNumber = Math.floor((options.offset ?? 0) / size) + 1;
    const page = await api.get<Page<NativeProductRow>>("/api/products", {
      name: options.query,
      categoryId: options.categoryId ?? options.categoryIds?.[0],
      page: pageNumber,
      size,
      status: "ACTIVE",
    });
    const items = page.items.map(mapNativeProduct);
    return {
      items: items as T[],
      total: page.total,
      limit: size,
      offset: options.offset ?? 0,
      hasNext: pageNumber * size < page.total,
      generatedAt: new Date().toISOString(),
    };
  }
  if (type === "posCategories") {
    const filters = await api.get<{ categories?: Array<{ id: string | number; name: string }> }>("/api/products/filter-options");
    const all = (filters.categories || []).map((category) => ({
      id: Number(category.id),
      name: category.name,
      parent_id: false as const,
    } satisfies OdooPosCategoryRecord));
    const size = options.limit ?? all.length;
    const offset = options.offset ?? 0;
    const items = all.slice(offset, offset + size);
    return {
      items: items as T[],
      total: all.length,
      limit: size,
      offset,
      hasNext: offset + size < all.length,
      generatedAt: new Date().toISOString(),
    };
  }
  if (type === "suppliers") {
    const size = options.limit ?? 40;
    const pageNumber = Math.floor((options.offset ?? 0) / size) + 1;
    const page = await api.get<Page<{ id: number; name: string; phone?: string | null; email?: string | null }>>("/api/suppliers", {
      name: options.query,
      page: pageNumber,
      size,
    });
    const items = page.items.map((supplier) => ({
      id: Number(supplier.id),
      name: supplier.name,
      phone: supplier.phone || false,
      email: supplier.email || false,
    }));
    return {
      items: items as T[],
      total: page.total,
      limit: size,
      offset: options.offset ?? 0,
      hasNext: pageNumber * size < page.total,
      generatedAt: new Date().toISOString(),
    };
  }
  if (type === "outlets") {
    const rows = await api.get<Array<{ id: number; name: string }>>("/api/outlets");
    const offset = options.offset ?? 0;
    const size = options.limit ?? rows.length;
    const slice = rows.slice(offset, offset + size).map((outlet) => ({ id: Number(outlet.id), name: outlet.name }));
    return {
      items: slice as T[],
      total: rows.length,
      limit: size,
      offset,
      hasNext: offset + size < rows.length,
      generatedAt: new Date().toISOString(),
    };
  }
  if (type === "registers") {
    const registers = await listRetailRegisters();
    const offset = options.offset ?? 0;
    const size = options.limit ?? registers.length;
    const items = registers.slice(offset, offset + size).map((register) => ({
      id: Number(register.id),
      name: register.name,
      company_id: [Number(register.outletId) || 0, "Orithos outlet"] as [number, string],
      current_session_id: false as const,
      payment_method_ids: [] as number[],
      available_pricelist_ids: [] as number[],
    }));
    return {
      items: items as T[],
      total: registers.length,
      limit: size,
      offset,
      hasNext: offset + size < registers.length,
      generatedAt: new Date().toISOString(),
    };
  }
  if (type === "taxes") {
    const rates = await api.get<Array<{ id: number; name: string; amount?: number | null; outletId?: number | null }>>("/api/tax-rates");
    const mapped = rates.map((tax) => ({
      id: Number(tax.id),
      name: tax.name,
      amount: Number(tax.amount ?? 0),
      amount_type: "percent" as const,
      type_tax_use: "sale" as const,
      price_include: true,
      company_id: [Number(tax.outletId ?? 0), "Orithos"] as [number, string],
    } satisfies OdooTaxRecord));
    const offset = options.offset ?? 0;
    const size = options.limit ?? mapped.length;
    const items = mapped.slice(offset, offset + size);
    return {
      items: items as T[],
      total: mapped.length,
      limit: size,
      offset,
      hasNext: offset + size < mapped.length,
      generatedAt: new Date().toISOString(),
    };
  }
  throw new OdooApiError(`Orithos does not support the "${type}" record type.`, 501);
}

export async function searchOdooDailySales(options: {
  status?: OdooSalesStatusFilter;
  period?: OdooSalesPeriodFilter;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<OdooDailySalesPage> {
  void options.status;
  const timezone = "Australia/Adelaide";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const shift = (day: string, days: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  let to = options.toDate || today;
  let from = options.fromDate || "";
  if (!from) {
    if (options.period === "24h") { from = today; to = today; }
    else if (options.period === "7d") from = shift(today, -6);
    else if (options.period === "30d") from = shift(today, -29);
    else if (options.period === "90d") from = shift(today, -89);
    else if (options.period === "180d") from = shift(today, -179);
    else from = shift(today, -89);
  }
  const overview = await api.get<{
    dailyTrend?: Array<{ date: string; revenue?: number; transaction_count?: number; tax?: number | null }>;
    currency?: string;
  }>("/api/reports/native-overview", { from, to });
  const all: OdooDailySaleRecord[] = (overview.dailyTrend ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      date: String(row.date),
      salesTransactions: Number(row.transaction_count ?? 0),
      refundTransactions: 0,
      salesAmount: Number(row.revenue ?? 0),
      refundAmount: 0,
      netSales: Number(row.revenue ?? 0),
      tax: Number(row.tax ?? 0),
    }));
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 40;
  const items = all.slice(offset, offset + limit);
  return {
    items,
    limit,
    offset,
    hasNext: offset + limit < all.length,
    timezone,
    currency: overview.currency || "AUD",
    generatedAt: new Date().toISOString(),
  };
}

/** Download the current store product catalogue from the Odoo source of truth. */
export async function exportOdooProductsCsv(): Promise<void> {
  const rows: Array<{ id: number; name: string; price?: number | null; stockQuantity?: number | null; categoryName?: string | null }> = [];
  let pageNumber = 1;
  for (;;) {
    const page = await api.get<Page<{ id: number; name: string; price?: number | null; stockQuantity?: number | null; categoryName?: string | null }>>("/api/products", {
      page: pageNumber,
      size: 200,
      status: "ACTIVE",
    });
    rows.push(...page.items);
    if (pageNumber * 200 >= page.total || !page.items.length) break;
    pageNumber += 1;
    if (pageNumber > 100) break;
  }
  const csv = [
    "id,name,category,price,stock",
    ...rows.map((row) => [row.id, JSON.stringify(row.name), JSON.stringify(row.categoryName || ""), row.price ?? "", row.stockQuantity ?? ""].join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "orithos-products.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function getOdooPriceRules(query?: string, offset = 0, limit = 30): Promise<{ items: OdooPriceRuleRecord[]; hasNext: boolean }> {
  const lists = await api.get<Page<{ id: number; name: string }>>("/api/price-lists", {
    name: query?.trim() || undefined,
    page: 1,
    size: 50,
  });
  const details = await Promise.all(
    lists.items.map((list) =>
      api.get<{ id: number; name: string; items?: Array<{ id?: number; itemId?: number; amount?: number; rule?: string; classificationType?: string }> }>(`/api/price-lists/${list.id}`)
        .catch(() => ({ id: list.id, name: list.name, items: [] })),
    ),
  );
  const rules: OdooPriceRuleRecord[] = details.flatMap((list) =>
    (list.items ?? [])
      .filter((item) => item.itemId != null)
      .map((item, index) => ({
        id: String(item.id ?? `${list.id}-${item.itemId}-${index}`),
        productId: Number(item.itemId),
        productName: `Product #${item.itemId}`,
        sku: String(item.itemId),
        priceSetName: list.name,
        source: list.name,
        sourceType: "PROVIDED" as const,
        startDate: null,
        endDate: null,
        quantity: 1,
        cappedPrice: Number(item.amount ?? 0),
        currentPrice: Number(item.amount ?? 0),
        cost: null,
        ruleType: item.rule || item.classificationType || "fixed",
      })),
  );
  const filtered = query?.trim()
    ? rules.filter((rule) =>
      rule.productName.toLowerCase().includes(query.trim().toLowerCase())
      || rule.priceSetName.toLowerCase().includes(query.trim().toLowerCase())
      || rule.sku.includes(query.trim()))
    : rules;
  return { items: filtered.slice(offset, offset + limit), hasNext: offset + limit < filtered.length };
}

export async function updateOdooProduct(productId: number, values: Partial<OdooProductUpdate> & { image_1920?: string }): Promise<void> {
  const current = await api.get<NativeProductRow & { image?: string | null; type?: string | null }>(`/api/products/${productId}`);
  await api.put(`/api/products/${productId}`, {
    ...current,
    name: values.name ?? current.name,
    price: values.list_price ?? current.price,
    categoryId: values.pos_categ_ids?.[0] ?? current.categoryId,
    status: values.available_in_pos === false ? "INACTIVE" : values.available_in_pos === true ? "ACTIVE" : (current.status || "ACTIVE"),
    image: values.image_1920 ?? current.image ?? null,
  });
  const barcode = typeof values.barcode === "string" ? values.barcode.trim() : "";
  if (barcode) {
    await api.post(`/api/products/${productId}/barcodes`, { barcode }).catch(() => undefined);
  }
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
  const created = await api.post<{ id: number; name: string }>("/api/products", {
    name: values.name,
    price: values.list_price,
    categoryId: values.pos_categ_ids[0] ?? null,
    status: values.available_in_pos ? "ACTIVE" : "INACTIVE",
    type: "STANDARD",
    trackInventory: true,
    image: values.image_1920 ?? null,
  });
  if (values.barcode.trim()) {
    await api.post(`/api/products/${created.id}/barcodes`, { barcode: values.barcode.trim() }).catch(() => undefined);
  }
  return { id: Number(created.id), name: created.name };
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
  const skipped: Array<{ line: number; reason: string }> = [];
  let created = 0;
  for (const row of products) {
    try {
      await createOdooProduct({
        name: row.name,
        list_price: row.list_price,
        default_code: row.default_code,
        barcode: row.barcode,
        pos_categ_ids: row.pos_categ_ids,
        available_in_pos: true,
      });
      created += 1;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Orithos rejected this product row.";
      skipped.push({ line: row.line, reason });
    }
  }
  return { created, skipped };
}

export interface OdooSupplierOption {
  id: number;
  name: string;
  email?: string | false;
}

export async function getOdooSuppliers(): Promise<OdooSupplierOption[]> {
  const page = await api.get<Page<{ id: number; name: string; email?: string | null }>>("/api/suppliers", { page: 1, size: 200 });
  return page.items.map((supplier) => ({
    id: Number(supplier.id),
    name: supplier.name,
    email: supplier.email || false,
  }));
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

type NativePurchaseOrderRow = {
  id: number;
  status?: string | null;
  fromId?: number | null;
  toId?: number | null;
  fromName?: string | null;
  toName?: string | null;
  orderDate?: string | null;
  dueDate?: string | null;
  invoiceNumber?: string | null;
  reference?: string | null;
  notes?: string | null;
  totalCost?: number | null;
  expectedTotal?: number | null;
  lineCount?: number | null;
  products?: Array<{
    id: number;
    productId?: number | null;
    supplierCode?: string | null;
    orderedQuantity?: number | null;
    receivedQuantity?: number | null;
    orderedCost?: number | null;
    baseCost?: number | null;
    caseQuantity?: number | null;
  }>;
};

async function resolveNativePurchaseOutletId(): Promise<number> {
  try {
    const session = await getOrithosSession();
    if (session.outletId) return Number(session.outletId);
  } catch { /* fall through */ }
  const outlets = await api.get<Array<{ id: number }>>("/api/outlets");
  const outletId = outlets[0]?.id;
  if (!Number.isSafeInteger(outletId) || !outletId || outletId <= 0) {
    throw new OdooApiError("No Orithos outlet is available for purchase orders.", 409);
  }
  return Number(outletId);
}

function nativePurchaseInvoiceNumber(prefix: string, preferred?: string | null) {
  const trimmed = preferred?.trim();
  if (trimmed) return trimmed.slice(0, 128);
  return `${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
}

function mapNativePurchaseState(status?: string | null): string {
  switch ((status || "OPEN").toUpperCase()) {
    case "OPEN": return "draft";
    case "SENT": return "sent";
    case "PARTIALLY_RECEIVED": return "purchase";
    case "RECEIVED": return "done";
    case "CANCELLED": return "cancel";
    default: return String(status || "draft").toLowerCase();
  }
}

function nativePurchaseStatusFilter(state?: string): string | undefined {
  switch (state) {
    case "draft": return "OPEN";
    case "sent": return "SENT";
    case "purchase": return "PARTIALLY_RECEIVED";
    case "done": return "RECEIVED";
    case "cancel": return "CANCELLED";
    default: return undefined;
  }
}

function purchaseReceiptStatus(status?: string | null): "full" | "partial" | "pending" | false {
  const normalized = (status || "").toUpperCase();
  if (normalized === "RECEIVED") return "full";
  if (normalized === "PARTIALLY_RECEIVED") return "partial";
  if (normalized === "SENT") return "pending";
  return false;
}

async function loadProductNames(productIds: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(productIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const names = new Map<number, string>();
  await Promise.all(unique.map(async (productId) => {
    try {
      const product = await api.get<{ id: number; name: string }>(`/api/products/${productId}`);
      names.set(productId, product.name);
    } catch {
      names.set(productId, `Product #${productId}`);
    }
  }));
  return names;
}

async function createNativePurchaseOrder(input: {
  supplierId: number;
  invoiceNumber?: string | null;
  orderDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines?: Array<{ productId: number; quantity: number; priceUnit?: number | null; description?: string | null; note?: string | null }>;
  idempotencyKey?: string;
}): Promise<OdooDraftRfq> {
  const toId = await resolveNativePurchaseOutletId();
  const invoiceNumber = nativePurchaseInvoiceNumber("RFQ", input.invoiceNumber);
  const created = await api.post<NativePurchaseOrderRow>("/api/orders", {
    fromId: input.supplierId,
    toId,
    orderDate: input.orderDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    invoiceNumber,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    lines: (input.lines ?? []).map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.priceUnit ?? 0,
      description: line.description ?? line.note ?? null,
      caseQuantity: 1,
    })),
  }, input.idempotencyKey ? { headers: { "Idempotency-Key": input.idempotencyKey } } : undefined);
  return {
    id: Number(created.id),
    name: created.invoiceNumber || `PO ${created.id}`,
    supplier: created.fromName || `Supplier ${input.supplierId}`,
    url: `/orders/${created.id}/view`,
    auditSaved: true,
    readbackVerified: true,
  };
}

export async function createOdooDraftRfq(input: {
  requestId: string;
  supplierId: number;
  coverageDays: number;
  method: string;
  lines: Array<{ productId: number; quantity: number; suggestedQuantity: number; reason: string }>;
}): Promise<OdooDraftRfq> {
  return createNativePurchaseOrder({
    supplierId: input.supplierId,
    reference: `Replenishment ${input.coverageDays}d`,
    invoiceNumber: nativePurchaseInvoiceNumber("REPL"),
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity || line.suggestedQuantity,
      note: line.reason || null,
    })),
    idempotencyKey: input.requestId,
  });
}

export async function createOdooDraftRfqFromInvoice(input: {
  supplierId: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  notes?: string | null;
  lines: Array<{ productId: number; quantity: number; priceUnit?: number | null; description?: string | null }>;
}): Promise<OdooDraftRfq> {
  return createNativePurchaseOrder({
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber,
    orderDate: input.invoiceDate,
    notes: input.notes,
    reference: input.invoiceNumber ? `Invoice ${input.invoiceNumber}` : "Supplier invoice",
    lines: input.lines,
  });
}

export async function createOdooCustomer(values: OdooCustomerWriteValues & { name: string }): Promise<{ id: number; name: string }> {
  const payload = await api.post<{ id: number; name: string }>("/api/customers", nativeCustomerPayload(values));
  return { id: Number(payload.id), name: payload.name };
}

export async function updateOdooCustomer(customerId: number, values: OdooCustomerWriteValues): Promise<void> {
  await api.put(`/api/customers/${customerId}`, nativeCustomerPayload(values));
}

export async function archiveOdooCustomer(customerId: number): Promise<void> {
  await api.del(`/api/customers/${customerId}`);
}

function nativeCustomerPayload(values: OdooCustomerWriteValues) {
  return {
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    comments: values.comment || null,
    code: values.ref || null,
    billingStreetAddress1: values.street || null,
    billingSuburb: values.city || null,
    businessNumber: values.vat || null,
    priceListId: values.property_product_pricelist || null,
    customerGroupId: values.category_id?.[0] ?? null,
  };
}

export async function getOdooPricelists(query?: string, offset = 0, limit = 50) {
  const pageNumber = Math.floor(offset / limit) + 1;
  const page = await api.get<Page<{ id: number; name: string; outletId: number }>>("/api/price-lists", {
    name: query?.trim() || undefined, page: pageNumber, size: limit,
  });
  return {
    items: page.items.map((item) => ({ id: Number(item.id), name: item.name, currency: "AUD", currencyId: null, company: "Orithos store", companyId: Number(item.outletId), active: true })),
    hasNext: pageNumber * limit < page.total,
  };
}

export async function createOdooPricelist(name: string): Promise<{ id: number; name: string }> {
  const payload = await api.post<{ id: number; name: string }>("/api/price-lists", { name });
  return { id: Number(payload.id), name: payload.name };
}

export async function updateOdooPricelist(id: number, values: { name?: string; active?: boolean }): Promise<void> {
  if (values.active === false) return archiveOdooPricelist(id);
  const current = await api.get<{ id: number; name: string; allowHigherPrice?: boolean; allowDiscountingPromotions?: boolean; items?: unknown[] }>(`/api/price-lists/${id}`);
  await api.put(`/api/price-lists/${id}`, { ...current, ...values, items: current.items ?? [] });
}

export async function archiveOdooPricelist(id: number): Promise<void> {
  await api.del(`/api/price-lists/${id}`);
}

export async function getOdooCustomerGroups(query?: string, offset = 0, limit = 50) {
  const pageNumber = Math.floor(offset / limit) + 1;
  const page = await api.get<Page<{ id: number; name: string; customerCount?: number | null }>>("/api/customers/groups", {
    name: query?.trim() || undefined, page: pageNumber, size: limit,
  });
  return {
    items: page.items.map((group) => ({ id: Number(group.id), name: group.name, color: 0, parentId: null, parentName: null, customerCount: Number(group.customerCount ?? 0), writable: true })),
    hasNext: pageNumber * limit < page.total,
  };
}

export async function createOdooCustomerGroup(name: string): Promise<{ id: number; name: string }> {
  const group = await api.post<{ id: number; name: string }>("/api/customers/groups", { name });
  return { id: Number(group.id), name: group.name };
}

export async function updateOdooCustomerGroup(id: number, name: string): Promise<void> {
  await api.put(`/api/customers/groups/${id}`, { name });
}

export async function deleteOdooCustomerGroup(id: number): Promise<void> {
  await api.del(`/api/customers/groups/${id}`);
}

export async function getOdooCustomerBalances(options: { query?: string; owingOnly?: boolean; offset?: number; limit?: number } = {}) {
  const size = options.limit ?? 40;
  const pageNumber = Math.floor((options.offset ?? 0) / size) + 1;
  const page = await api.get<Page<{
    id: number; name: string; phone?: string | null; email?: string | null; code?: string | null;
    currentOwing?: number | null; priceListName?: string | null;
  }>>("/api/customers", {
    name: options.query,
    page: pageNumber,
    size,
  });
  let items: OdooCustomerBalanceRecord[] = page.items.map((customer) => ({
    id: Number(customer.id),
    name: customer.name,
    phone: customer.phone || null,
    email: customer.email || null,
    ref: customer.code || null,
    credit: Number(customer.currentOwing ?? 0),
    currency: "AUD",
    totalInvoiced: 0,
    pricelist: customer.priceListName || null,
  }));
  if (options.owingOnly) items = items.filter((item) => item.credit > 0);
  return {
    items,
    limit: size,
    offset: options.offset ?? 0,
    hasNext: pageNumber * size < page.total,
    generatedAt: new Date().toISOString(),
  };
}

export async function getOdooCustomerInvoices(customerId: number, openOnly = true, offset = 0, limit = 50): Promise<{
  customer: { id: number; name: string; credit: number };
  items: OdooCustomerInvoiceRecord[];
  hasNext: boolean;
}> {
  const detail = await api.get<{ id: number; name: string; currentOwing?: number | null }>(`/api/customers/${customerId}`);
  const sales = await api.get<Array<{ timestamp?: string; item?: string; price?: number; quantity?: number }>>(`/api/customers/${customerId}/recent-sales`, { limit: Math.min(100, offset + limit) }).catch(() => []);
  const slice = (Array.isArray(sales) ? sales : []).slice(offset, offset + limit);
  void openOnly;
  return {
    customer: { id: Number(detail.id), name: detail.name, credit: Number(detail.currentOwing ?? 0) },
    items: slice.map((sale, index) => ({
      id: offset + index + 1,
      name: sale.item || `Sale line ${offset + index + 1}`,
      moveType: "out_invoice",
      invoiceDate: sale.timestamp ? sale.timestamp.slice(0, 10) : null,
      dueDate: null,
      amountTotal: Number(sale.price ?? 0),
      amountResidual: Number(detail.currentOwing ?? 0) > 0 ? Number(sale.price ?? 0) : 0,
      paymentState: Number(detail.currentOwing ?? 0) > 0 ? "not_paid" : "paid",
      currency: "AUD",
    })),
    hasNext: (Array.isArray(sales) ? sales.length : 0) > offset + limit,
  };
}

export async function getOdooGiftCards(query?: string, offset = 0, limit = 40): Promise<{
  available: boolean;
  module: string | null;
  message?: string;
  items: OdooGiftCardRecord[];
  hasNext: boolean;
}> {
  void query;
  void offset;
  void limit;
  return {
    available: false,
    module: null,
    message: "Orithos gift-card ledger is not enabled for this store yet. Issuing and balances will return when loyalty cards are migrated.",
    items: [],
    hasNext: false,
  };
}

export async function getOdooSaleDetail(saleId: number): Promise<OdooSaleDetail> {
  const sale = await api.get<{
    id: number;
    invoiceId?: string | null;
    status?: string | null;
    createdAt?: string | null;
    localSoldAt?: string | null;
    totalPrice?: number | null;
    totalTax?: number | null;
    totalChange?: number | null;
    customerId?: number | null;
    customerName?: string | null;
    registerId?: number | null;
    userName?: string | null;
    items?: Array<{
      id?: number;
      productId?: number | null;
      quantity?: number | null;
      basePrice?: number | null;
      totalPrice?: number | null;
      tax?: number | null;
      note?: string | null;
    }>;
  }>(`/api/sales/${saleId}`);
  if (!sale?.id) throw new OdooApiError("Sale not found.", 404);
  const productNames = await loadProductNames((sale.items ?? []).map((line) => Number(line.productId)));
  const soldAt = sale.localSoldAt || sale.createdAt || new Date().toISOString();
  const total = Number(sale.totalPrice ?? 0);
  const tax = Number(sale.totalTax ?? 0);
  const state = (sale.status || "paid").toLowerCase() === "void" ? "cancel" : "done";
  return {
    order: {
      id: Number(sale.id),
      name: sale.invoiceId || `SALE-${sale.id}`,
      pos_reference: sale.invoiceId || false,
      date_order: soldAt,
      amount_total: total,
      amount_tax: tax,
      amount_paid: total,
      amount_return: Number(sale.totalChange ?? 0),
      state,
      partner_id: sale.customerId ? [Number(sale.customerId), sale.customerName || `Customer ${sale.customerId}`] as [number, string] : false,
      session_id: sale.registerId ? [Number(sale.registerId), `Register ${sale.registerId}`] as [number, string] : false,
      user_id: sale.userName ? [0, sale.userName] as [number, string] : false,
      config_id: sale.registerId ? [Number(sale.registerId), `Register ${sale.registerId}`] as [number, string] : false,
      company_id: false,
    },
    lines: (sale.items ?? []).map((line, index) => {
      const productId = Number(line.productId);
      const qty = Number(line.quantity ?? 0);
      const lineTotal = Number(line.totalPrice ?? 0);
      const lineTax = Number(line.tax ?? 0);
      return {
        id: Number(line.id ?? index + 1),
        product_id: productId ? [productId, productNames.get(productId) || `Product #${productId}`] as [number, string] : false,
        qty,
        refunded_qty: 0,
        price_unit: Number(line.basePrice ?? (qty ? lineTotal / qty : 0)),
        discount: 0,
        tax_ids: [],
        price_subtotal: lineTotal - lineTax,
        price_subtotal_incl: lineTotal,
      };
    }),
    payments: [],
    company: { id: 0, name: "Orithos", currency_id: [0, "AUD"] as [number, string] },
  };
}

export async function searchOdooPurchaseOrders(options: { query?: string; state?: string; limit?: number; offset?: number } = {}): Promise<OdooPurchaseOrderPage> {
  const size = options.limit ?? 40;
  const pageNumber = Math.floor((options.offset ?? 0) / size) + 1;
  const nativeStatus = options.state && options.state !== "all" ? nativePurchaseStatusFilter(options.state) : undefined;
  const page = await api.get<Page<NativePurchaseOrderRow>>("/api/orders", {
    type: "ORDER",
    page: pageNumber,
    size,
    status: nativeStatus,
    invoiceNumber: options.query?.trim() || undefined,
  });
  const items: OdooPurchaseOrderRecord[] = page.items.map((order) => ({
    id: Number(order.id),
    name: order.invoiceNumber || `PO ${order.id}`,
    partner_id: order.fromId ? [Number(order.fromId), order.fromName || `Supplier ${order.fromId}`] as [number, string] : false,
    date_order: order.orderDate ? `${order.orderDate}T00:00:00` : new Date().toISOString(),
    state: mapNativePurchaseState(order.status),
    amount_total: Number(order.totalCost ?? order.expectedTotal ?? 0),
    currency_id: [0, "AUD"] as [number, string],
    company_id: order.toId ? [Number(order.toId), order.toName || "Orithos outlet"] as [number, string] : false,
    order_line: Array.from({ length: Math.max(0, Number(order.lineCount ?? 0)) }, (_, index) => index + 1),
  }));
  return {
    items,
    limit: size,
    offset: options.offset ?? 0,
    hasNext: pageNumber * size < page.total,
    generatedAt: new Date().toISOString(),
    scope: page.items.map((order) => order.toName).filter((name): name is string => Boolean(name)),
  };
}

export async function getOdooPurchaseOrderDetail(purchaseId: number): Promise<OdooPurchaseOrderDetail> {
  const order = await api.get<NativePurchaseOrderRow>(`/api/orders/${purchaseId}`);
  if (!order?.id) throw new OdooApiError("Purchase order not found.", 404);
  const productIds = (order.products ?? []).map((line) => Number(line.productId)).filter((id) => id > 0);
  const productNames = await loadProductNames(productIds);
  const currency: [number, string] = [0, "AUD"];
  const mappedState = mapNativePurchaseState(order.status);
  const lines: OdooPurchaseOrderDetail["lines"] = (order.products ?? []).map((line) => {
    const productId = Number(line.productId);
    const ordered = Number(line.orderedQuantity ?? 0);
    const received = Number(line.receivedQuantity ?? 0);
    const unitCost = Number(line.orderedCost ?? line.baseCost ?? 0);
  const productRef: [number, string] | false = productId
    ? [productId, productNames.get(productId) || `Product #${productId}`]
    : false;
    return {
      id: Number(line.id),
      product_id: productRef,
      name: productNames.get(productId) || line.supplierCode || `Line ${line.id}`,
      product_qty: ordered,
      product_uom: false,
      product_uom_id: false,
      price_unit: unitCost,
      price_subtotal: unitCost * ordered,
      qty_received: received,
      date_planned: order.dueDate ? `${order.dueDate}T00:00:00` : false,
    };
  });
  const openMoves: NonNullable<OdooPurchaseOrderDetail["receivable"]>["moves"] = lines
    .map((line) => {
      const remaining = Math.max(0, line.product_qty - line.qty_received);
      return {
        id: line.id,
        product_id: line.product_id,
        product_uom_qty: line.product_qty,
        qty_done: line.qty_received,
        remaining,
      };
    })
    .filter((move) => move.remaining > 0);
  const canReceive = openMoves.length > 0 && ["SENT", "PARTIALLY_RECEIVED"].includes((order.status || "").toUpperCase());
  const amountUntaxed = Number(order.totalCost ?? order.expectedTotal ?? 0);
  return {
    order: {
      id: Number(order.id),
      name: order.invoiceNumber || `PO ${order.id}`,
      partner_id: order.fromId ? [Number(order.fromId), order.fromName || `Supplier ${order.fromId}`] as [number, string] : false,
      date_order: order.orderDate ? `${order.orderDate}T00:00:00` : new Date().toISOString(),
      state: mappedState,
      amount_total: amountUntaxed,
      currency_id: currency,
      company_id: order.toId ? [Number(order.toId), order.toName || "Orithos outlet"] as [number, string] : false,
      order_line: lines.map((line) => line.id),
      date_planned: order.dueDate ? `${order.dueDate}T00:00:00` : false,
      receipt_status: purchaseReceiptStatus(order.status),
      amount_untaxed: amountUntaxed,
      amount_tax: 0,
      user_id: false,
      origin: order.reference || false,
    },
    lines,
    receipts: canReceive ? [{
      id: Number(order.id),
      name: `Receipt ${order.invoiceNumber || order.id}`,
      state: "assigned",
      scheduled_date: order.dueDate ? `${order.dueDate}T00:00:00` : false,
      date_done: false,
      picking_type_id: false,
      location_id: order.fromId ? [Number(order.fromId), order.fromName || "Supplier"] as [number, string] : false,
      location_dest_id: order.toId ? [Number(order.toId), order.toName || "Stock"] as [number, string] : false,
      origin: order.reference || false,
      url: `/orders/${order.id}/view`,
    }] : [],
    receiptsAvailable: true,
    receivable: canReceive ? {
      pickingId: Number(order.id),
      pickingName: `Receipt ${order.invoiceNumber || order.id}`,
      pickingState: "assigned",
      moves: openMoves,
    } : null,
    approvalAudits: order.notes
      ? [{ id: 1, date: order.orderDate ? `${order.orderDate}T00:00:00` : new Date().toISOString(), body: order.notes, author_id: false }]
      : [],
    approvalAuditAvailable: Boolean(order.notes),
    url: `/orders/${order.id}/view`,
  };
}

export async function confirmOdooPurchaseOrder(purchaseId: number): Promise<void> {
  await api.put(`/api/orders/${purchaseId}/send`);
}

export async function receiveOdooPurchaseOrder(
  purchaseId: number,
  body: { pickingId?: number; lines: Array<{ moveId: number; qtyDone: number }> },
): Promise<{ pickingName: string; pickingState: string }> {
  void body.pickingId;
  const idempotencyKey = crypto.randomUUID();
  try {
    const result = await api.post<{ receiptId?: number; status?: string }>(`/api/orders/${purchaseId}/receipts`, {
      lines: body.lines
        .filter((line) => line.qtyDone > 0)
        .map((line) => ({ orderProductId: line.moveId, quantity: line.qtyDone })),
    }, { headers: { "Idempotency-Key": idempotencyKey } });
    return {
      pickingName: result.receiptId ? `Receipt ${result.receiptId}` : `Receipt ${purchaseId}`,
      pickingState: (result.status || "updated").toLowerCase(),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Purchase receive failed";
    const status = cause instanceof ApiError ? cause.status : 502;
    const correlationId = cause instanceof ApiError ? cause.correlationId : null;
    throw new OdooApiError(message, status, correlationId);
  }
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
  const [outlets, orders] = await Promise.all([
    api.get<Array<{ id: number; name: string }>>("/api/outlets"),
    api.get<Page<{ id: number; invoiceNumber?: string; status?: string; fromName?: string; toName?: string; orderDate?: string; reference?: string }>>("/api/orders", {
      page: 1,
      size: 100,
      type: "TRANSFER",
    }),
  ]);
  const locations: OdooTransferLocation[] = (Array.isArray(outlets) ? outlets : []).map((outlet) => ({
    id: Number(outlet.id),
    name: outlet.name,
    warehouseId: Number(outlet.id),
    pickingTypeId: Number(outlet.id),
  }));
  return {
    writeEnabled: locations.length >= 2,
    companyId: 0,
    warehouses: locations.map((location) => ({
      id: location.id,
      name: location.name,
      locationId: location.id,
      locationName: location.name,
      pickingTypeId: location.pickingTypeId,
    })),
    locations,
    items: orders.items.map((order) => ({
      id: Number(order.id),
      name: order.invoiceNumber || `Transfer ${order.id}`,
      state: (order.status || "OPEN").toLowerCase(),
      fromLocation: order.fromName || null,
      toLocation: order.toName || null,
      scheduledDate: order.orderDate || null,
      origin: order.reference || null,
    })),
    note: locations.length < 2 ? "Add a second Orithos outlet before creating stock transfers." : undefined,
  };
}

export async function createOdooStockTransfer(input: {
  fromLocationId: number;
  toLocationId: number;
  note?: string;
  validate?: boolean;
  lines: Array<{ productId: number; quantity: number }>;
}): Promise<{ id: number; name: string; state: string; fromLocation: string; toLocation: string }> {
  const created = await api.post<{ id: number; invoiceNumber?: string; status?: string; fromName?: string; toName?: string }>("/api/orders/transfers", {
    fromOutletId: input.fromLocationId,
    toOutletId: input.toLocationId,
    note: input.note || null,
    lines: input.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
  });
  return {
    id: Number(created.id),
    name: created.invoiceNumber || `Transfer ${created.id}`,
    state: (created.status || "OPEN").toLowerCase(),
    fromLocation: created.fromName || String(input.fromLocationId),
    toLocation: created.toName || String(input.toLocationId),
  };
}

export async function postOdooSessionCash(body: {
  configId: number;
  direction: "in" | "out";
  amount: number;
  reason?: string;
}): Promise<{ sessionName: string; recordedAt: string }> {
  const session = await getRetailRegisterSession(body.configId);
  if (!session?.id) throw new OdooApiError("Open a register session before recording cash movements.", 409);
  try {
    await api.post(`/api/retail/registers/sessions/${session.id}/cash-movements`, {
      type: body.direction === "in" ? "CASH_IN" : "CASH_OUT",
      amount: body.amount,
      reason: body.reason?.trim() || (body.direction === "in" ? "Cash in" : "Cash out"),
    }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
    return { sessionName: `Session ${session.id}`, recordedAt: new Date().toISOString() };
  } catch (cause) {
    throw new OdooApiError(cause instanceof Error ? cause.message : "Cash adjustment failed", 502);
  }
}
