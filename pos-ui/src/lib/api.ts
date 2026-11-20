import { clearNativeReadCache } from "./native-read-cache";
/**
 * Typed client for the Orithos Spring Boot backend.
 * Unwraps the `{ code, message, data }` envelope. The same-origin Next BFF
 * attaches the HttpOnly access token before forwarding API requests.
 */

/**
 * Resolve the API base URL.
 * Business API calls always go through the same-origin BFF, including in local
 * development, so browser JavaScript never needs access to the JWT.
 */
function getApiBase(): string {
  return "";
}

const TOKEN_COOKIE = "sf_token";

/** Paged list payload returned by the backend (PageResult). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly status: number,
    public readonly correlationId: string | null = null,
  ) {
    super(message);
  }
}

/** Prefer the backend message; keep a short fallback for network / non-JSON failures. */
export function apiFailureMessage(e: unknown, fallback: string, unauthorized: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return unauthorized;
    if (e.message) return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function aiGatewayFailureMessage(subject: string, status: number, fallback: string): string {
  return status === 502 || status === 503 || status === 504
    ? `${subject} is temporarily unavailable. Try again shortly.`
    : fallback;
}

function gatewayFailureMessage(status: number, fallback: string): string {
  return status === 502 || status === 503 || status === 504
    ? "The service is temporarily unavailable. Try again shortly."
    : fallback;
}

// ---- token helpers (cookie-based so it survives reloads) ----
export function getToken(): string | null {
  // Expire the legacy JavaScript-readable token left by older releases.
  setToken(null);
  return null;
}

export function setToken(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)};path=/;max-age=${60 * 60 * 24 * 14};samesite=lax`;
  } else {
    document.cookie = `${TOKEN_COOKIE}=;path=/;max-age=0`;
  }
}

const USER_KEY = "sf_user";

type AuthFailureHandler = () => void;
let onAuthFailure: AuthFailureHandler | null = null;

/** Called by AuthProvider so React state stays in sync when the session expires. */
export function registerAuthFailureHandler(handler: AuthFailureHandler): () => void {
  onAuthFailure = handler;
  return () => {
    if (onAuthFailure === handler) onAuthFailure = null;
  };
}

function clearSession() {
  setToken(null);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(USER_KEY);
  }
  onAuthFailure?.();
}

function isAuthExemptPath(path: string): boolean {
  return path.startsWith("/api/auth/login")
    || path.startsWith("/api/auth/staff")
    || path.startsWith("/api/auth/logout")
    || path.startsWith("/api/auth/refresh")
    || path.startsWith("/api/auth/change-password")
    || path.startsWith("/api/auth/forgot-password")
    || path.startsWith("/api/auth/reset-password")
    || path.startsWith("/api/auth/reset-token")
    || path.startsWith("/api/auth/bootstrap")
    || path.startsWith("/api/public/");
}

function canRetryTransientRoute(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" && path === "/api/auth/me") return true;
  // Login only creates a new token and is safe to replay when an old route
  // returns a transient gateway/route response.
  return normalizedMethod === "POST" && path === "/api/auth/login";
}

/** The development preview has no backend session to refresh or expire. */
export function isLocalPreviewSession(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return localHost && document.cookie.split(";").some((cookie) => cookie.trim() === "orithos_local_preview=1");
}

let authLogoutInFlight: Promise<void> | null = null;

/** Orithos POS JWT expiry — not Odoo integration 401s or unrelated HTTP 401s. */
function isPosSessionExpired(status: number, code: number, path: string): boolean {
  if (code === 40101) return false;
  if (code === 40100 || code === 40102 || code === 40103) return true;
  if (path.startsWith("/api/odoo/")) return false;
  return false;
}

function handleAuthFailure(path: string, status: number, code: number) {
  if (isLocalPreviewSession()) return;
  if (isAuthExemptPath(path)) return;
  if (!isPosSessionExpired(status, code, path)) return;
  if (authLogoutInFlight) return;

  authLogoutInFlight = (async () => {
    try {
      const recovered = await refreshAccessToken();
      if (recovered === "ok" || recovered === "transient") return;
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    } finally {
      authLogoutInFlight = null;
    }
  })();
}

type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  let url: URL;
  if (path.startsWith("http")) {
    url = new URL(path);
  } else {
    // Keep credential-bearing endpoints on this origin so Next can hold the
    // refresh token in an HttpOnly cookie, even when business APIs use a
    // separately configured backend origin.
    const base = path.startsWith("/api/") ? "" : getApiBase();
    url = base
      ? new URL(path, base.endsWith("/") ? base : `${base}/`)
      : new URL(
          path,
          typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
        );
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export type RefreshAccessResult = "ok" | "transient" | "expired";

let refreshInFlight: Promise<RefreshAccessResult> | null = null;

export async function refreshAccessToken(): Promise<RefreshAccessResult> {
  if (typeof window === "undefined" || isLocalPreviewSession()) return "expired";
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(new URL("/api/auth/refresh", window.location.origin), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as
        | { code?: number }
        | null;
      if (response.ok && payload?.code === 0) return "ok";
      if ([502, 503, 504].includes(response.status) || payload?.code === 50200) return "transient";
      if (payload?.code === 40100 || payload?.code === 40102 || payload?.code === 40103) return "expired";
      return "transient";
    } catch {
      return "transient";
    }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: unknown; signal?: AbortSignal; headers?: HeadersInit } = {},
  retriedAfterRefresh = false,
  retriedAfterRoute = false,
): Promise<T> {
  getToken();
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(opts.headers).entries()) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
    signal: opts.signal,
  });

  let json: { code: number; message: string; data: T } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  const transientRoute = [404, 502, 503, 504].includes(res.status);
  if (transientRoute && !retriedAfterRoute && canRetryTransientRoute(method, path)) {
    return request<T>(method, path, opts, retriedAfterRefresh, true);
  }

  const authExpired = !isLocalPreviewSession()
    && isPosSessionExpired(res.status, json?.code ?? -1, path);
  const canReplay = ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  let sessionRecovered = false;
  let refreshDeferred = false;
  // Never replay a write after an auth refresh: the server may have accepted
  // the original request before the response was interrupted.
  if (authExpired && canReplay && !retriedAfterRefresh && !isAuthExemptPath(path)) {
    const refreshResult = await refreshAccessToken();
    refreshDeferred = refreshResult === "transient";
    if (refreshResult === "ok") {
      return request<T>(method, path, opts, true, retriedAfterRoute);
    }
  }
  if (authExpired && !canReplay && !retriedAfterRefresh && !isAuthExemptPath(path)) {
    const refreshResult = await refreshAccessToken();
    refreshDeferred = refreshResult === "transient";
    sessionRecovered = refreshResult === "ok";
  }

  if (!res.ok || !json) {
    if (!sessionRecovered && !refreshDeferred) handleAuthFailure(path, res.status, json?.code ?? -1);
    throw new ApiError(
      json?.message ?? gatewayFailureMessage(res.status, `Request failed (${res.status})`),
      json?.code ?? -1,
      res.status,
      res.headers.get("x-correlation-id"),
    );
  }
  if (json.code !== 0) {
    if (!sessionRecovered && !refreshDeferred) handleAuthFailure(path, res.status, json.code);
    throw new ApiError(json.message, json.code, res.status, res.headers.get("x-correlation-id"));
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && !path.startsWith("/api/auth/refresh")) clearNativeReadCache();
  return json.data;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal; headers?: HeadersInit }) =>
    request<T>("POST", path, { body, signal: opts?.signal, headers: opts?.headers }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
};

/** Download a protected file, refreshing the access token once after a 401. */
async function downloadFile(path: string, filename: string, query?: Record<string, QueryValue>): Promise<void> {
  const requestFile = () => fetch(buildUrl(path, query), {
    cache: "no-store",
    credentials: "same-origin",
  });
  let res = await requestFile();
  let refreshDeferred = false;
  if (res.status === 401) {
    const refreshResult = await refreshAccessToken();
    refreshDeferred = refreshResult === "transient";
    if (refreshResult === "ok") res = await requestFile();
  }

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    let code = -1;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      code = json.code ?? code;
    } catch {
      // Keep the HTTP fallback for non-JSON proxy errors.
    }
    if (!refreshDeferred) handleAuthFailure(path, res.status, code);
    throw new ApiError(message, code, res.status);
  }

  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type CustomerExportLevel = "simple" | "full";

export interface CustomerExportQuery {
  level: CustomerExportLevel;
  name?: string;
  groupIds?: string;
}

/** Download customers as CSV (respects current list filters when provided). */
export async function exportCustomersCsv(query: CustomerExportQuery): Promise<void> {
  await downloadFile(
    "/api/customers/export",
    query.level === "full" ? "customers-full.csv" : "customers-simple.csv",
    { ...query },
  );
}

export interface CustomerImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface ProductImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface SupplierProductImportResult {
  imported: number;
  skipped: number;
  errors: { line: number; message: string }[];
}

/** Import supplier products by supplier codes (one per line). */
export async function importSupplierProducts(body: {
  supplierId: string;
  productList: string;
}): Promise<SupplierProductImportResult> {
  return api.post<SupplierProductImportResult>("/api/suppliers/import-products", {
    supplierId: body.supplierId,
    productList: body.productList,
  });
}

/** Download the customer Excel import template. */
export async function downloadCustomersImportTemplate(): Promise<void> {
  await downloadFile("/api/customers/import-template", "customers-import-template.xlsx");
}

/** Upload a CSV or Excel file and import customers in batch. */
export async function importCustomersCsv(file: File): Promise<CustomerImportResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/customers/import"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: CustomerImportResult } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/customers/import", res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Import failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/customers/import", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

/** Download the product Excel import template. */
export async function downloadProductsImportTemplate(): Promise<void> {
  await downloadFile("/api/products/import-template", "products-import-template.xlsx");
}

/** Upload a CSV or Excel file and import products in batch. */
export async function importProductsCsv(file: File): Promise<ProductImportResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/products/import"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: ProductImportResult } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/products/import", res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Import failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/products/import", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export interface GiftCardExportQuery {
  code?: string;
  redeemedExpiredOnly?: boolean;
  outletId?: string;
}

export interface StockListExportQuery {
  search?: string;
  categoryId?: string;
  inStockOnly?: boolean;
}

/** Download stock list as CSV (respects current filters when provided). */
export async function exportStockListCsv(query: StockListExportQuery = {}): Promise<void> {
  const params: Record<string, string> = {};
  if (query.search) params.search = query.search;
  if (query.categoryId) params.categoryId = query.categoryId;
  if (query.inStockOnly !== undefined) params.inStockOnly = String(query.inStockOnly);

  await downloadFile("/api/stock-list/export", "stock-list.csv", params);
}

/** Download external stocktakes as xlsx for an outlet. */
export async function exportExternalStocktakesXlsx(query: {
  outletId: string;
  includeNoBarcode?: boolean;
}): Promise<void> {
  const params: Record<string, string> = {
    outletId: query.outletId,
    includeNoBarcode: String(query.includeNoBarcode ?? false),
  };

  await downloadFile("/api/external-stocktakes/export", "external-stocktake.xlsx", params);
}

/** Download external stocktake import template (xlsx). */
export async function downloadExternalStocktakeImportTemplate(): Promise<void> {
  await downloadFile("/api/external-stocktakes/import-template", "external-stocktake-import-template.xlsx");
}

/** Upload an external stocktake file. */
export async function importExternalStocktakeFile(file: File): Promise<void> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/external-stocktakes/import"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/external-stocktakes/import", res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Import failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/external-stocktakes/import", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
}

/** Download gift cards as xlsx (respects current list filters when provided). */
export async function exportGiftCardsXlsx(query: GiftCardExportQuery = {}): Promise<void> {
  const params: Record<string, string> = {};
  if (query.code) params.code = query.code;
  if (query.redeemedExpiredOnly !== undefined) {
    params.redeemedExpiredOnly = String(query.redeemedExpiredOnly);
  }
  if (query.outletId) params.outletId = query.outletId;

  await downloadFile("/api/gift-cards/export", "gift-cards.xlsx", params);
}

export interface GiftCardImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** Upload an Excel or CSV file and import gift cards in batch. */
export async function importGiftCardsCsv(file: File): Promise<GiftCardImportResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/gift-cards/import"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: GiftCardImportResult } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/gift-cards/import", res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Import failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/gift-cards/import", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

/** Download the gift card Excel import template. */
export async function downloadGiftCardsTemplate(): Promise<void> {
  await downloadFile("/api/gift-cards/import-template", "gift-cards-import-template.xlsx");
}

export interface CappedPriceImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const CAPPED_PRICE_TEMPLATE_HEADERS = [
  "Product",
  "Capped Pricing",
  "Start Date",
  "End Date",
  "Quantity",
  "Capped Price",
];

/** Download the capped pricing CSV import template. */
export function downloadCappedPricingTemplate(): void {
  const csv = `\uFEFF${CAPPED_PRICE_TEMPLATE_HEADERS.join(",")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "capped-pricing-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Upload a CSV file and import capped pricing rows. */
export async function importCappedPricingCsv(file: File): Promise<CappedPriceImportResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(buildUrl("/api/capped-pricing/import"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: CappedPriceImportResult } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/capped-pricing/import", res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Import failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/capped-pricing/import", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

// ---- Sell-pad checkout (tender a cart against the backend) ----

/** Numeric database ids only; non-numeric cart ids are dropped before POST. */
function toOptionalLong(id: string | number | null | undefined): number | null {
  if (id == null || id === "") return null;
  const s = String(id).trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** A cart line sent to the checkout endpoint. */
export interface CheckoutItem {
  productId: number | string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Cent-rounded line net. Authoritative charge so qty × unit cannot drift. */
  lineTotal: number;
  discountPercent?: number;
  /** GST rate from the server quote used to authorize the payment. */
  expectedTaxRate?: number;
}

/** Request body for `POST /api/sales/checkout`. */
export interface CheckoutPayload {
  registerId?: number | string | null;
  tender: string;
  customerId?: string | null;
  /** When set, record another tender against an open sale. */
  saleId?: string | number | null;
  tendered?: number | null;
  cashout?: number | null;
  /** Server quote values required to reject a stale price or GST at checkout. */
  expectedTotal?: number | null;
  expectedGst?: number | null;
  /** Required on the first tender; omitted when continuing with saleId. */
  items?: CheckoutItem[];
  /** Stable across network retries of the same tender attempt. */
  idempotencyKey?: string;
}

/** Response from `POST /api/sales/checkout` (money maths computed server-side). */
export interface CheckoutResponse {
  saleId: string | number | null;
  invoiceId: string | null;
  paymentMethod: string | null;
  tenderType: string;
  amountDue: number;
  /** GST included in the sale total. */
  gst?: number | null;
  subtotalExGst?: number | null;
  /** Cash rounding for this tender. Zero for card. */
  rounding?: number | null;
  /** Cash due after nearest-5c rounding. */
  cashDue?: number | null;
  /** Amount recorded for this tender. */
  tendered: number;
  change: number;
  cashout: number;
  /** Balance still owed after this tender. */
  remaining: number;
  completed: boolean;
}

export interface CheckoutQuote {
  lines: Array<{
    productId: number;
    name: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    total: number;
    taxRate: number;
    gst: number;
  }>;
  subtotalExGst: number;
  gst: number;
  total: number;
}

export interface SaleLineForRefund {
  id: number;
  productId: number | null;
  quantity: number;
  refundableQuantity: number;
  refundableAmount: number;
  refundableTax: number;
  totalPrice: number | null;
  tax: number | null;
  note: string | null;
}

export interface SaleForRefund {
  id: number;
  invoiceId: string | null;
  status: string;
  totalPrice: number;
  createdAt: string;
  items?: SaleLineForRefund[];
}

export interface SaleRefundResponse {
  refundSaleId: number;
  originalSaleId: number;
  invoiceId: string;
  amount: number;
  gst: number;
  cashPaid: number;
  reason: string;
}

export function refundSale(
  saleId: number,
  payload: { registerId: number; reason: string; lines: Array<{ saleItemId: number; quantity: number }> },
  idempotencyKey = crypto.randomUUID(),
): Promise<SaleRefundResponse> {
  return api.post<SaleRefundResponse>(`/api/sales/${saleId}/refunds`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export interface RetailRegister {
  id: number;
  name: string;
  outletId: number;
  closed: boolean;
}

export interface RetailRegisterSession {
  id: number;
  registerId: number;
  openedAt: string;
  openingFloat: number;
  closedAt: string | null;
}

export interface RetailRegisterSessionSummary {
  sessionId: number;
  registerId: number;
  openedAt: string;
  openingFloat: number;
  cashMovements: number;
  expectedCash: number;
  transactionCount: number;
  unsettledSales: number;
  unmappedPayments: number;
  tenders: Array<{ paymentMethodId: number; name: string; type: string; expectedAmount: number }>;
}

export interface RetailRegisterClosure {
  id: number;
  registerId: number;
  totalExpected: number;
  totalReceived: number;
  movement: number;
  totalTransactions: number;
  closedAt: string;
}

export function listRetailRegisters(): Promise<RetailRegister[]> {
  return api.get<RetailRegister[]>("/api/retail/registers");
}

export function getRetailRegisterSession(registerId: number): Promise<RetailRegisterSession | null> {
  return api.get<RetailRegisterSession | null>(`/api/retail/registers/${registerId}/sessions/current`);
}

export function getRetailRegisterSessionSummary(registerId: number): Promise<RetailRegisterSessionSummary> {
  return api.get<RetailRegisterSessionSummary>(`/api/retail/registers/${registerId}/sessions/current/summary`);
}

export function openRetailRegisterSession(registerId: number, openingFloat: number, idempotencyKey = crypto.randomUUID()): Promise<RetailRegisterSession> {
  return api.post<RetailRegisterSession>(`/api/retail/registers/${registerId}/sessions`, { openingFloat }, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function closeRetailRegisterSession(
  registerId: number,
  payload: { countedCash: number; countedTenders: Record<number, number>; note?: string },
  idempotencyKey = crypto.randomUUID(),
): Promise<RetailRegisterClosure> {
  return api.post<RetailRegisterClosure>(`/api/retail/registers/${registerId}/sessions/close`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function quoteSale(payload: Pick<CheckoutPayload, "registerId" | "customerId" | "items">): Promise<CheckoutQuote> {
  return api.post<CheckoutQuote>("/api/sales/quote", payload);
}

/** Finalise the current cart with the chosen tender; returns the change owed. */
export function checkoutSale(payload: CheckoutPayload): Promise<CheckoutResponse> {
  const { idempotencyKey, ...body } = payload;
  return api.post<CheckoutResponse>("/api/sales/checkout", {
    ...body,
    registerId: toOptionalLong(body.registerId),
    customerId: toOptionalLong(body.customerId),
    saleId: body.saleId == null || body.saleId === "" ? null : toOptionalLong(body.saleId),
    items: body.items?.map((item) => ({
      ...item,
      productId: toOptionalLong(item.productId),
    })),
  }, { headers: { "Idempotency-Key": idempotencyKey ?? crypto.randomUUID() } });
}

// ---- Sell-pad POS flows (search, park, actions) ----

export interface SellProductHit {
  id: string;
  name: string;
  price: number;
  caseQuantity: number;
}

export interface SellCustomerHit {
  id: string;
  name: string;
  groupName: string | null;
  loyaltyPoints: number;
}

export interface SellSearchResult {
  products: SellProductHit[];
  customers: SellCustomerHit[];
}

/** Customer row from GET /api/customers (admin list). */
export interface CustomerListItem {
  id: string | number;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  customerGroupName?: string | null;
  loyaltyPoints?: number | null;
  currentOwing?: number | null;
  performance30d?: number[] | null;
}

/** Search customers via the dedicated customers API (not sell unified search). */
export async function searchCustomers(name: string): Promise<SellCustomerHit[]> {
  const page = await api.get<Page<CustomerListItem>>("/api/customers", {
    name,
    page: 1,
    size: 20,
  });
  return (page.items ?? []).map((c) => ({
    id: String(c.id),
    name: c.name,
    groupName: c.customerGroupName ?? null,
    loyaltyPoints: Number(c.loyaltyPoints ?? 0),
  }));
}

/** Product row from GET /api/products (admin list). */
export interface ProductListItem {
  id: string | number;
  name: string;
  price?: number | null;
  caseQuantity?: number | null;
}

/** Search products via the dedicated products API (not sell unified search). */
export async function searchProducts(name: string): Promise<SellProductHit[]> {
  const page = await api.get<Page<ProductListItem>>("/api/products", {
    name,
    page: 1,
    size: 20,
  });
  return (page.items ?? []).map((p) => ({
    id: String(p.id),
    name: p.name,
    price: Number(p.price ?? 0),
    caseQuantity: Number(p.caseQuantity ?? 1),
  }));
}

export interface ParkedSale {
  id: string;
  status: string;
  totalPrice: number;
  totalQuantity: number;
  customerId?: string | number | null;
  customerName: string | null;
  note?: string | null;
  createdAt: string;
  /** Previous Sydney business day; still listed, highlighted as overdue. */
  stale?: boolean;
  /** Sydney date (yyyy-mm-dd) when this parked sale is auto-voided. */
  clearsOn?: string | null;
  items?: Array<{
    id: string;
    productId: string | null;
    quantity: number;
    basePrice: number;
    totalPrice: number;
    note: string | null;
  }>;
}

export interface SellActionResult {
  action: string;
  message: string;
  caseQuantity: number | null;
  success: boolean;
}

export interface ParkSalePayload {
  customerId?: string | null;
  note?: string | null;
  items: CheckoutItem[];
}

/** Phase A AI assistant: intent + slots + UI instructions. */
export interface AssistantUiAction {
  panel?: string | null;
  view?: string | null;
  route?: string | null;
  action?: string | null;
}

export interface AssistantReportTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface AssistantCard {
  type: string;
  title: string;
  summary?: string | null;
  items?: Record<string, unknown>[];
  source?: string | null;
  generatedAt?: string | null;
  dataAsOf?: string | null;
  dataSource?: string | null;
  storeScope?: string | null;
  reportPeriodFrom?: string | null;
  reportPeriodTo?: string | null;
  reportTimeZone?: string | null;
  reportDataStatus?: string | null;
  emptyReason?: string | null;
  status?: "ready" | "empty" | "unavailable" | string;
  ctaLabel?: string | null;
  ctaRoute?: string | null;
  cta?: { label?: string | null; route?: string | null } | null;
  retryable?: boolean | null;
  supplierGapCount?: number | null;
  inventoryGapCount?: number | null;
  actionableItemCount?: number | null;
}

export interface AssistantResponse {
  threadId: string;
  intent: string;
  intentSummary: string;
  answer: string;
  slots: Record<string, string>;
  ui: AssistantUiAction | null;
  table?: AssistantReportTable | null;
  reportId?: number | null;
  cards?: AssistantCard[] | null;
  writeRequests?: string[] | null;
  fastPathId?: string | null;
  source?: string | null;
  llmFallback?: boolean;
  /** Optional explainability and confirmation metadata from newer providers. */
  confidence?: number | null;
  clarificationRequired?: boolean;
  clarifyingQuestion?: string | null;
  dataAsOf?: string | null;
  dataSource?: string | null;
  storeScope?: string | null;
  reportPeriodFrom?: string | null;
  reportPeriodTo?: string | null;
  reportTimeZone?: string | null;
  reportDataStatus?: string | null;
  suggestedFollowUps?: string[] | null;
  requiresConfirmation?: boolean;
  actionPreview?: Record<string, unknown> | null;
}

export interface AiReportSnapshot {
  id: number;
  intent: string | null;
  question: string | null;
  title: string | null;
  table: AssistantReportTable;
  slots: Record<string, string>;
  createdAt: string | null;
}

export function fetchAiReportSnapshot(id: string | number): Promise<AiReportSnapshot> {
  return api.get<AiReportSnapshot>(`/api/ai/reports/${id}`);
}

export interface AiReportMetrics {
  windowHours: number;
  since: string;
  generatedAt: string;
  summary: {
    requests: number;
    allowed: number;
    rejected: number;
    allowedRate: number;
    averageLatencyMs: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    estimatedTokens: number;
    estimatedTokensOnly: boolean;
  };
  byPath: Array<{
    path: string;
    requests: number;
    allowed: number;
    rejected: number;
    allowedRate: number;
    averageLatencyMs: number;
      p50LatencyMs: number | null;
      p95LatencyMs: number | null;
    estimatedTokens: number;
  }>;
  highlights?: {
    last24hRequests: number;
    last24hRejected: number;
    last24hRejectedRate: number;
    topIntents: Array<{
      path: string;
      requests: number;
      allowed: number;
      rejected: number;
      allowedRate: number;
      averageLatencyMs: number;
      p50LatencyMs: number | null;
      p95LatencyMs: number | null;
      estimatedTokens: number;
    }>;
  };
}

/** Admin-only, vendor-scoped AI report audit metrics. Token values are estimates. */
export function fetchAiReportMetrics(hours = 24): Promise<AiReportMetrics> {
  return api.get<AiReportMetrics>("/api/ai/metrics", { hours });
}

export function askAssistant(
  question: string,
  threadId?: string | null,
  signal?: AbortSignal,
  surface?: string | null,
): Promise<AssistantResponse> {
  return api.post<AssistantResponse>(
    "/api/ai/assistant",
    {
      question,
      threadId: threadId || undefined,
      surface: surface || undefined,
    },
    { signal },
  );
}

export interface AiChatThreadSummary {
  id: number | string;
  sessionKey: string;
  title: string;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface AiChatThreadDetail {
  id: number;
  sessionKey: string;
  title: string | null;
  updatedAt: string | null;
  messages: Array<{
    id: number;
    role: string;
    text: string;
    intent: string | null;
    cards?: AssistantCard[] | null;
    reportId?: number | null;
    table?: AssistantReportTable | null;
    createdAt: string | null;
    source?: string | null;
    dataAsOf?: string | null;
    dataSource?: string | null;
    storeScope?: string | null;
    reportPeriodFrom?: string | null;
    reportPeriodTo?: string | null;
    reportTimeZone?: string | null;
    reportDataStatus?: string | null;
    suggestedFollowUps?: string[] | null;
    clarificationRequired?: boolean;
    clarifyingQuestion?: string | null;
    requiresConfirmation?: boolean;
  }>;
}

/** Cashier-owned floating-assistant chat history (current user only). */
export function fetchAiChatThreads(): Promise<AiChatThreadSummary[]> {
  return api.get<AiChatThreadSummary[]>("/api/ai/threads");
}

export function fetchAiChatThread(id: number | string): Promise<AiChatThreadDetail> {
  return api.get<AiChatThreadDetail>(`/api/ai/threads/${encodeURIComponent(String(id))}`);
}

export interface PlatformAiUsageStoreRow {
  vendorId: number;
  storeName: string;
  subdomain: string;
  status: string | null;
  requests: number;
  allowed: number;
  rejected: number;
  allowedRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number | null;
  estimatedTokens: number;
  lastSeenAt: string | null;
}

export interface PlatformAiUsageMetrics {
  windowHours: number;
  since: string;
  generatedAt: string;
  summary: {
    storesWithActivity: number;
    requests: number;
    allowed: number;
    rejected: number;
    allowedRate: number;
    averageLatencyMs: number;
    p95LatencyMs: number | null;
    estimatedTokens: number;
  };
  byStore: PlatformAiUsageStoreRow[];
}

/** Platform-operator control-plane AI usage rollup (aggregates only). */
export function fetchPlatformAiUsage(hours = 24): Promise<PlatformAiUsageMetrics> {
  return api.get<PlatformAiUsageMetrics>("/api/platform/metrics/ai", { hours });
}

export interface PlatformStoreAiKpi {
  vendorId: number;
  windowHours: number;
  requests: number;
  allowedRate: number;
  p95LatencyMs: number | null;
  lastSeenAt: string | null;
}

export function fetchPlatformStoreAiKpi(vendorId: number, hours = 24): Promise<PlatformStoreAiKpi> {
  return api.get<PlatformStoreAiKpi>(`/api/platform/metrics/ai/stores/${vendorId}`, { hours });
}

export interface AiClientConfig {
  /** Store AI_ENABLED flag (vision / ASR / chat feature gate). */
  enabled: boolean;
  /** True when the NLQ graph bean is actually registered. */
  assistantAvailable?: boolean;
  transcriptionAvailable?: boolean;
  labelVisionAvailable?: boolean;
  invoiceVisionAvailable?: boolean;
  aiTriggerKeywords: string[];
}

/** Sell panel: DB-backed keywords that route search-mode input to AI. */
export function fetchAiClientConfig(): Promise<AiClientConfig> {
  return api.get<AiClientConfig>("/api/ai/config/client");
}

export interface TranscriptionResponse {
  text: string;
  lang: string;
}

/** Cloud STT via the POS backend's remote AI Gateway (POST multipart). */
export async function transcribeAudio(
  blob: Blob,
  lang?: string | null,
  filename = "voice.webm",
): Promise<TranscriptionResponse> {
  const token = getToken();
  const form = new FormData();
  form.append("file", blob, filename);
  if (lang) form.append("lang", lang);

  const res = await fetch(buildUrl("/api/ai/transcribe"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: TranscriptionResponse } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/ai/transcribe", res.status, json?.code ?? -1);
    throw new ApiError(
      json?.message ?? aiGatewayFailureMessage("Voice transcription", res.status, `Transcription failed (${res.status})`),
      json?.code ?? -1,
      res.status,
    );
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/ai/transcribe", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export type AiCommandType = "UPDATE_PRODUCT" | "UPDATE_CUSTOMER" | "PREVIEW_PRICE_CHANGE" | "PREVIEW_REPLENISHMENT";
export type AiCommandStatus = "DRAFT" | "PREVIEWED" | "CONFIRMED" | "EXECUTING" | "APPLIED" | "REJECTED" | "FAILED" | "EXPIRED" | "STALE" | "CANCELLED";
export interface AiCommandItem {
  id: number | null;
  name: string;
  field: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
  status?: string | null;
}
export interface AiCommandResponse {
  commandId: string;
  type: AiCommandType;
  status: AiCommandStatus;
  confidence: number;
  requiresConfirmation: boolean;
  summary: string;
  items: AiCommandItem[];
  excludedItems: AiCommandItem[];
  changes: Record<string, unknown>;
  expiresAt: string;
  version: string;
  writeRequests: string[];
}
export function parseAiCommand(text: string, threadId?: string | null, surface?: string | null) {
  return api.post<AiCommandResponse>("/api/ai/commands/parse", { text, threadId, surface });
}
export function previewAiCommand(id: string) {
  return api.post<AiCommandResponse>("/api/ai/commands/" + encodeURIComponent(id) + "/preview");
}
export function confirmAiCommand(id: string, confirmationText: string, confirmationMode: "VOICE" | "TEXT" = "TEXT", expectedVersion?: string) {
  return api.post<AiCommandResponse>("/api/ai/commands/" + encodeURIComponent(id) + "/confirm", { confirmationText, confirmationMode, expectedVersion });
}
export function cancelAiCommand(id: string) {
  return api.post<AiCommandResponse>("/api/ai/commands/" + encodeURIComponent(id) + "/cancel");
}
export function getAiCommand(id: string) {
  return api.get<AiCommandResponse>("/api/ai/commands/" + encodeURIComponent(id));
}

/** Unified product + customer search for the Sell-pad search bar. */
export function searchSell(q: string): Promise<SellSearchResult> {
  return api.get<SellSearchResult>("/api/sell/search", { q });
}

/** Resolve a quick-key label to a product by exact catalogue name. */
export function quickKeyProduct(key: string): Promise<SellProductHit | null> {
  return api.get<SellProductHit | null>(`/api/sell/quick-key/${encodeURIComponent(key)}`);
}

/** Catalogue price for a sale key bound to a product id. */
export function quickKeyProductById(productId: number): Promise<SellProductHit | null> {
  return api.get<SellProductHit | null>(`/api/sell/quick-key/product/${productId}`);
}

/** List parked (suspended) sales. */
export function listParkedSales(): Promise<ParkedSale[]> {
  return api.get<ParkedSale[]>("/api/sell/parked");
}

/** Park the current cart on the backend. */
export function parkSale(payload: ParkSalePayload): Promise<ParkedSale> {
  return api.post<ParkedSale>("/api/sell/park", {
    ...payload,
    customerId: toOptionalLong(payload.customerId),
    items: (payload.items ?? []).map((item) => ({
      ...item,
      productId: toOptionalLong(item.productId),
    })),
  });
}

/** Resume a parked sale — returns cart lines and removes it from the parked list. */
export function resumeParkedSale(id: string): Promise<ParkedSale> {
  return api.post<ParkedSale>(`/api/sell/parked/${id}/resume`);
}

/** Discard a parked sale without restoring it. */
export function voidParkedSale(id: string): Promise<void> {
  return api.del(`/api/sell/parked/${id}`);
}

/** Execute a register action (open drawer, case quantity, etc.). */
export function sellAction(action: string, productId?: string | null): Promise<SellActionResult> {
  return api.post<SellActionResult>("/api/sell/actions", {
    action,
    productId: toOptionalLong(productId),
  });
}

export type PromotionPeriod = "current" | "future" | "all";

export interface PromotionBrowseItem {
  productId: string;
  productName: string;
  price: number;
  categoryName: string | null;
  brandName: string | null;
  promotionId: string;
  promotionName: string;
  promotionCategoryName: string | null;
  discountAmount: number | null;
}

export interface ProductBrowseItem {
  id: string;
  name: string;
  price: number;
  categoryName: string | null;
  caseQuantity?: number | null;
}

/** View Promotions panel — products on active promotions. */
export function browsePromotions(period: PromotionPeriod = "current", q?: string) {
  return api.get<{ items: PromotionBrowseItem[] }>("/api/sell/promotions/browse", { period, q });
}

/** Products / Beer / Wines / Spirits folder on the Sell pad. */
export function browseProducts(category?: string, q?: string) {
  return api.get<{ folderName: string; items: ProductBrowseItem[] }>("/api/sell/products/browse", {
    category,
    q,
  });
}

export interface SommelierProfilePayload {
  wineType?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  dryness?: number | null;
  body?: number | null;
  fruitiness?: number | null;
  oak?: number | null;
  tannin?: number | null;
  food?: string[];
  occasion?: string | null;
}

export interface SommelierRecommendCard {
  productId: number;
  name: string;
  tier: string;
  badge: string;
  listPrice: number;
  sellPrice: number;
  onPromotion: boolean;
  stockQuantity: number;
  caseQuantity: number | null;
  matchPct: number;
  drynessPct: number;
  bodyPct: number;
  foodPct: number;
  businessFitPct: number;
  confidencePct: number;
  wineType: string | null;
  varietal: string | null;
  drynessLabel: string | null;
  bodyLabel: string | null;
  aromaTags: string[];
  palateTags: string[];
  foodTags: string[];
  finishNote: string | null;
  pitch: string;
  whyUpgrade: string | null;
  inferred: boolean;
}

export interface SommelierRecommendResponse {
  profile: SommelierProfilePayload;
  recommendations: SommelierRecommendCard[];
  emptyReason: string | null;
}

export interface SommelierWine {
  productId: number;
  name: string;
  brandName: string | null;
  categoryName: string | null;
  image: string | null;
  listPrice: number;
  sellPrice: number;
  onPromotion: boolean;
  stockQuantity: number;
  caseQuantity: number | null;
  wineType: string | null;
  varietal: string | null;
  region: string | null;
  vintage: string | null;
  drynessLabel: string | null;
  bodyLabel: string | null;
  aromaTags: string[];
  palateTags: string[];
  foodTags: string[];
  finishNote: string | null;
  pitch: string;
  pitch10s: string | null;
  pitch30s: string | null;
  inferred: boolean;
}

export function sommelierRecommend(profile: SommelierProfilePayload) {
  return api.post<SommelierRecommendResponse>("/api/ai/sommelier/recommend", profile);
}

export interface GroceryRecommendPayload {
  category?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  occasion?: string | null;
}

export interface GroceryRecommendCard {
  productId: number;
  name: string;
  tier: string;
  badge: string;
  category: string | null;
  listPrice: number;
  sellPrice: number;
  stockQuantity: number;
  caseQuantity: number | null;
  matchPct: number;
  reason: string;
}

export interface GroceryRecommendResponse {
  profile: GroceryRecommendPayload;
  recommendations: GroceryRecommendCard[];
  emptyReason: string | null;
}

export function groceryRecommend(profile: GroceryRecommendPayload) {
  return api.post<GroceryRecommendResponse>("/api/ai/recommend/grocery", profile);
}

export function sommelierIdentify(q: string) {
  return api.get<{ items: SommelierWine[] }>("/api/ai/sommelier/identify", { q });
}

export interface SommelierIdentifyImageResponse {
  extractedName: string | null;
  brand: string | null;
  vintage: string | null;
  varietal: string | null;
  barcode: string | null;
  queries: string[];
  items: SommelierWine[];
  note: string | null;
}

/** Photograph a wine label: Qwen-VL OCR, then match this store's catalogue. */
export async function sommelierIdentifyImage(file: Blob, filename = "label.jpg"): Promise<SommelierIdentifyImageResponse> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(buildUrl("/api/ai/sommelier/identify-image"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: SommelierIdentifyImageResponse } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok || !json) {
    handleAuthFailure("/api/ai/sommelier/identify-image", res.status, json?.code ?? -1);
    throw new ApiError(
      json?.message ?? aiGatewayFailureMessage("Label recognition", res.status, `Label recognition failed (${res.status})`),
      json?.code ?? -1,
      res.status,
    );
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/ai/sommelier/identify-image", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export interface InvoiceScanLine {
  productId?: number | null;
  description?: string | null;
  brand?: string | null;
  packQty?: number | null;
  qtyCases?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  createProduct?: boolean;
}

export interface InvoiceScanPayload {
  supplierId?: number | null;
  supplierName?: string | null;
  supplierAbn?: string | null;
  supplierWebsite?: string | null;
  createSupplier?: boolean;
  toId?: number | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  attn?: string | null;
  phone?: string | null;
  deliveryFee?: number | null;
  gstIncluded?: number | null;
  totalPayable?: number | null;
  totalCases?: number | null;
  notes?: string | null;
  internalNotes?: string | null;
  lines?: InvoiceScanLine[];
}

export type InvoiceScanSourceType = "upload" | "camera" | "pdf" | "api";
export type InvoiceScanStatus = "draft" | "matched" | "po_created" | "received" | "failed" | "discarded";
export type InvoiceLineMatchStatus = "unmatched" | "suggested" | "confirmed" | "skipped";

export interface InvoiceScanSessionLine {
  id?: number;
  lineIndex?: number;
  description?: string | null;
  brand?: string | null;
  packQty?: number | null;
  qtyCases?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  productId?: number | null;
  productName?: string | null;
  matchStatus?: InvoiceLineMatchStatus | string | null;
  confidence?: number | null;
}

export interface InvoiceScanSession {
  id: number;
  status: InvoiceScanStatus | string;
  sourceType?: InvoiceScanSourceType | string | null;
  supplierName?: string | null;
  supplierAbn?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  totalPayable?: number | null;
  gstIncluded?: number | null;
  supplierId?: number | null;
  outletId?: number | null;
  purchaseOrderId?: number | null;
  purchaseOrderName?: string | null;
  receiptId?: number | null;
  receiptName?: string | null;
  sourceFilename?: string | null;
  sourceContentType?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  duplicateIds?: number[];
  createdAt?: string | null;
  updatedAt?: string | null;
  confirmedAt?: string | null;
  lines?: InvoiceScanSessionLine[];
}

export interface InvoiceScanSessionList {
  items: InvoiceScanSession[];
  total: number;
  limit: number;
  offset: number;
}

export interface InvoiceScanSavePayload {
  sourceType?: InvoiceScanSourceType;
  sourceFilename?: string | null;
  sourceContentType?: string | null;
  supplierName?: string | null;
  supplierAbn?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  totalPayable?: number | null;
  gstIncluded?: number | null;
  supplierId?: number | null;
  outletId?: number | null;
  notes?: string | null;
  internalNotes?: string | null;
  lines?: InvoiceScanSessionLine[];
}

/** Photograph or upload a supplier tax invoice for OCR preview (image or PDF). */
export async function scanInvoiceImage(file: Blob, filename = "invoice.jpg"): Promise<InvoiceScanPayload> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file, filename);

  const route = "/api/ai/invoice/preview";
  const res = await fetch(buildUrl(route), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: InvoiceScanPayload } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok || !json) {
    handleAuthFailure(route, res.status, json?.code ?? -1);
    const message = json?.message ?? (
      aiGatewayFailureMessage("Invoice scanning", res.status, `Invoice scan failed (${res.status})`)
      + (res.status === 502 || res.status === 503 || res.status === 504 ? " Save the invoice and retry from Orithos Purchases when service is available." : "")
    );
    throw new ApiError(
      message,
      json?.code ?? -1,
      res.status,
    );
  }
  if (json.code !== 0) {
    handleAuthFailure(route, res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export function listInvoiceScans(params?: { status?: string; query?: string; limit?: number; offset?: number }) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.query) search.set("query", params.query);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  return api.get<InvoiceScanSessionList>(`/api/invoice-scans${qs ? `?${qs}` : ""}`);
}

export function getInvoiceScan(id: number) {
  return api.get<InvoiceScanSession>(`/api/invoice-scans/${id}`);
}

export function createInvoiceScan(payload: InvoiceScanSavePayload) {
  return api.post<InvoiceScanSession>("/api/invoice-scans", payload);
}

export function updateInvoiceScan(id: number, payload: InvoiceScanSavePayload) {
  return api.put<InvoiceScanSession>(`/api/invoice-scans/${id}`, payload);
}

export function linkInvoiceScanPurchase(
  id: number,
  payload: { purchaseOrderId?: number; purchaseOrderName?: string; receiptId?: number; receiptName?: string; status?: string },
) {
  return api.post<InvoiceScanSession>(`/api/invoice-scans/${id}/link-purchase`, payload);
}

export function discardInvoiceScan(id: number) {
  return api.del<null>(`/api/invoice-scans/${id}`);
}

export function suggestedInvoiceSupplierByAbn(abn: string) {
  return api.get<number | null>(`/api/invoice-scans/abn-map?abn=${encodeURIComponent(abn)}`);
}

export function sommelierWine(id: string | number) {
  return api.get<SommelierWine>(`/api/ai/sommelier/wines/${id}`);
}

export function sommelierPitch(productId: number, length: "card" | "10s" | "30s", profile?: SommelierProfilePayload) {
  return api.post<{ productId: number; length: string; text: string }>("/api/ai/sommelier/pitch", {
    productId,
    length,
    profile,
  });
}

export function sommelierSimilar(productId: number, direction: "cheaper" | "upgrade") {
  return api.post<{ productId: number; direction: string; items: SommelierRecommendCard[] }>(
    "/api/ai/sommelier/similar",
    { productId, direction },
  );
}

export function sommelierAsk(productId: number, question: string) {
  return api.post<{ answer: string; alternatives: SommelierRecommendCard[] }>("/api/ai/sommelier/ask", {
    productId,
    question,
  });
}

export function sommelierFeedback(productId: number, reaction: "liked" | "rejected" | "bought", profile?: SommelierProfilePayload) {
  return api.post<void>("/api/ai/sommelier/feedback", { productId, reaction, profile });
}
