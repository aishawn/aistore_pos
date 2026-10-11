/**
 * Typed client for the Orithos Spring Boot backend.
 * Unwraps the `{ code, message, data }` envelope and attaches the JWT.
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

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  let url: URL;
  if (path.startsWith("http")) {
    url = new URL(path);
  } else {
    const base = getApiBase();
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

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
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

  if (!res.ok || !json) {
    throw new ApiError(json?.message ?? `Request failed (${res.status})`, json?.code ?? -1, res.status);
  }
  if (json.code !== 0) {
    throw new ApiError(json.message, json.code, res.status);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
};

// ---- Sell-pad checkout (tender a cart against the backend) ----

/** A cart line sent to the checkout endpoint. */
export interface CheckoutItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
  return api.post<CheckoutResponse>("/api/sales/checkout", payload);
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

export interface ParkedSale {
  id: string;
  status: string;
  totalPrice: number;
  totalQuantity: number;
  customerName: string | null;
  createdAt: string;
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

/** Unified product + customer search for the Sell-pad search bar. */
export function searchSell(q: string): Promise<SellSearchResult> {
  return api.get<SellSearchResult>("/api/sell/search", { q });
}

/** Resolve a quick-key label (e.g. "carlton") to a product. */
export function quickKeyProduct(key: string): Promise<SellProductHit | null> {
  return api.get<SellProductHit | null>(`/api/sell/quick-key/${encodeURIComponent(key)}`);
}

/** List parked (suspended) sales. */
export function listParkedSales(): Promise<ParkedSale[]> {
  return api.get<ParkedSale[]>("/api/sell/parked");
}

/** Park the current cart on the backend. */
export function parkSale(payload: ParkSalePayload): Promise<ParkedSale> {
  return api.post<ParkedSale>("/api/sell/park", payload);
}

/** Resume a parked sale — returns cart lines and removes it from the parked list. */
export function resumeParkedSale(id: string): Promise<ParkedSale> {
  return api.post<ParkedSale>(`/api/sell/parked/${id}/resume`);
}

/** Execute a register action (open drawer, case quantity, etc.). */
export function sellAction(action: string, productId?: string | null): Promise<SellActionResult> {
  return api.post<SellActionResult>("/api/sell/actions", { action, productId });
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
