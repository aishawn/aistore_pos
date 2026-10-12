/**
 * Typed client for the Orithos Spring Boot backend.
 * Unwraps the `{ code, message, data }` envelope and attaches the JWT.
 */

/**
 * Resolve the API base URL.
 * - Docker / production: leave NEXT_PUBLIC_API_BASE_URL empty; browser uses same-origin /api (rewrites).
 * - Local dev with separate backend: set NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 in .env.local
 */
function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.BACKEND_URL || "http://localhost:8080";
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

// ---- token helpers (cookie-based so it survives reloads) ----
export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)sf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
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
    || path.startsWith("/api/auth/logout")
    || path.startsWith("/api/auth/refresh")
    || path.startsWith("/api/auth/change-password");
}

function handleAuthFailure(path: string, status: number, code: number) {
  if (isAuthExemptPath(path)) return;
  // Wrong password is HTTP 200 + code 40101 — not a session expiry.
  if (code === 40101) return;
  const expired = status === 401 || code === 40100 || code === 40103;
  if (!expired) return;

  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
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
    const authBff = /^\/api\/auth\/(login|refresh|logout|change-password)$/.test(path);
    const base = authBff ? "" : getApiBase();
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

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(new URL("/api/auth/refresh", window.location.origin), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as
        | { code?: number; data?: { accessToken?: string } }
        | null;
      if (!response.ok || payload?.code !== 0 || !payload.data?.accessToken) return false;
      setToken(payload.data.accessToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: unknown } = {},
  retriedAfterRefresh = false,
): Promise<T> {
  const token = getToken();
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  let json: { code: number; message: string; data: T } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  const authExpired = res.status === 401 || json?.code === 40100 || json?.code === 40103;
  if (authExpired && !retriedAfterRefresh && !isAuthExemptPath(path) && await refreshAccessToken()) {
    return request<T>(method, path, opts, true);
  }

  if (!res.ok || !json) {
    handleAuthFailure(path, res.status, json?.code ?? -1);
    throw new ApiError(json?.message ?? `Request failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    handleAuthFailure(path, res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
};

export type CustomerExportLevel = "simple" | "full";

export interface CustomerExportQuery {
  level: CustomerExportLevel;
  name?: string;
  groupIds?: string;
}

/** Download customers as CSV (respects current list filters when provided). */
export async function exportCustomersCsv(query: CustomerExportQuery): Promise<void> {
  const token = getToken();
  const res = await fetch(buildUrl("/api/customers/export", { ...query }), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/customers/export", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/customers/export", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const filename =
    query.level === "full" ? "customers-full.csv" : "customers-simple.csv";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const token = getToken();
  const res = await fetch(buildUrl("/api/customers/import-template"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/customers/import-template", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/customers/import-template", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "customers-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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
  const token = getToken();
  const res = await fetch(buildUrl("/api/products/import-template"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/products/import-template", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/products/import-template", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "products-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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
  const token = getToken();
  const params: Record<string, string> = {};
  if (query.search) params.search = query.search;
  if (query.categoryId) params.categoryId = query.categoryId;
  if (query.inStockOnly !== undefined) params.inStockOnly = String(query.inStockOnly);

  const res = await fetch(buildUrl("/api/stock-list/export", params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/stock-list/export", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/stock-list/export", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "stock-list.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Download external stocktakes as xlsx for an outlet. */
export async function exportExternalStocktakesXlsx(query: {
  outletId: string;
  includeNoBarcode?: boolean;
}): Promise<void> {
  const token = getToken();
  const params: Record<string, string> = {
    outletId: query.outletId,
    includeNoBarcode: String(query.includeNoBarcode ?? false),
  };

  const res = await fetch(buildUrl("/api/external-stocktakes/export", params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/external-stocktakes/export", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/external-stocktakes/export", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "external-stocktake.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Download external stocktake import template (xlsx). */
export async function downloadExternalStocktakeImportTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(buildUrl("/api/external-stocktakes/import-template"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/external-stocktakes/import-template", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/external-stocktakes/import-template", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "external-stocktake-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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
  const token = getToken();
  const params: Record<string, string> = {};
  if (query.code) params.code = query.code;
  if (query.redeemedExpiredOnly !== undefined) {
    params.redeemedExpiredOnly = String(query.redeemedExpiredOnly);
  }
  if (query.outletId) params.outletId = query.outletId;

  const res = await fetch(buildUrl("/api/gift-cards/export", params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/gift-cards/export", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/gift-cards/export", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gift-cards.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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
  const token = getToken();
  const res = await fetch(buildUrl("/api/gift-cards/import-template"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string; code?: number };
      message = json.message ?? message;
      handleAuthFailure("/api/gift-cards/import-template", res.status, json.code ?? -1);
      throw new ApiError(message, json.code ?? -1, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      handleAuthFailure("/api/gift-cards/import-template", res.status, -1);
      throw new ApiError(message, -1, res.status);
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gift-cards-import-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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
}

/** Request body for `POST /api/sales/checkout`. */
export interface CheckoutPayload {
  tender: string;
  customerId?: string | null;
  /** When set, record another tender against an open sale. */
  saleId?: string | number | null;
  tendered?: number | null;
  cashout?: number | null;
  /** Required on the first tender; omitted when continuing with saleId. */
  items?: CheckoutItem[];
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

/** Finalise the current cart with the chosen tender; returns the change owed. */
export function checkoutSale(payload: CheckoutPayload): Promise<CheckoutResponse> {
  return api.post<CheckoutResponse>("/api/sales/checkout", {
    ...payload,
    customerId: toOptionalLong(payload.customerId),
    saleId: payload.saleId == null || payload.saleId === "" ? null : toOptionalLong(payload.saleId),
    items: payload.items?.map((item) => ({
      ...item,
      productId: toOptionalLong(item.productId),
    })),
  });
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
  customerGroupName?: string | null;
  loyaltyPoints?: number | null;
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

export interface AssistantResponse {
  threadId: string;
  intent: string;
  intentSummary: string;
  answer: string;
  slots: Record<string, string>;
  ui: AssistantUiAction | null;
  table?: AssistantReportTable | null;
  reportId?: number | null;
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

export function askAssistant(
  question: string,
  threadId?: string | null,
): Promise<AssistantResponse> {
  return api.post<AssistantResponse>("/api/ai/assistant", {
    question,
    threadId: threadId || undefined,
  });
}

export interface AiClientConfig {
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

/** Cloud STT via DashScope (POST multipart). Caller should fall back to Web Speech on failure. */
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
      json?.message ?? `Transcription failed (${res.status})`,
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
      json?.message ?? `Label recognition failed (${res.status})`,
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

/** Photograph a supplier tax invoice: Qwen-VL OCR, then match supplier / products. */
export async function scanInvoiceImage(file: Blob, filename = "invoice.jpg"): Promise<InvoiceScanPayload> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(buildUrl("/api/orders/receives/scan"), {
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
    handleAuthFailure("/api/orders/receives/scan", res.status, json?.code ?? -1);
    throw new ApiError(
      json?.message ?? `Invoice scan failed (${res.status})`,
      json?.code ?? -1,
      res.status,
    );
  }
  if (json.code !== 0) {
    handleAuthFailure("/api/orders/receives/scan", res.status, json.code);
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export function saveScannedInvoice(payload: InvoiceScanPayload) {
  return api.post<{ id: number | string; invoiceNumber?: string }>("/api/orders/receives/from-scan", payload);
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
