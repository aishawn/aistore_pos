export type OdooRecordType =
  | "products"
  | "posCategories"
  | "customers"
  | "outlets"
  | "registers"
  | "sessions"
  | "paymentMethods"
  | "sales";

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
  qty_available: number;
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

export interface OdooNamedRecord {
  id: number;
  name: string;
}

export interface OdooPosBootstrap {
  configs: {
    id: number;
    name: string;
    company: [number, string] | false;
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
  lines: { productId: number; quantity: number }[];
}

export interface OdooCheckoutResult {
  saleId: number;
  receipt: string;
  total: number;
  gst: number;
  session: string;
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
    super(message);
    this.name = "OdooApiError";
  }
}

async function sessionRequest(
  method: "GET" | "POST" | "DELETE",
  body?: { username: string; password: string },
): Promise<OdooAuthUser | null> {
  const response = await fetch("/api/odoo/session", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: OdooAuthUser | null; message?: string }
    | null;
  if (!response.ok) {
    throw new OdooApiError(payload?.message || `Odoo login failed (${response.status})`, response.status);
  }
  return payload?.user ?? null;
}

export function loginToOdoo(username: string, password: string) {
  return sessionRequest("POST", { username, password });
}

export function getOdooSession() {
  return sessionRequest("GET");
}

export async function getOdooPosBootstrap(): Promise<OdooPosBootstrap> {
  const response = await fetch("/api/odoo/pos-bootstrap", {
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
  const response = await fetch("/api/odoo/checkout", {
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
  if (!payload || !("saleId" in payload) || typeof payload.saleId !== "number" || typeof payload.receipt !== "string") {
    throw new OdooApiError("Odoo did not confirm the sale", 502);
  }
  return payload as OdooCheckoutResult;
}

export function logoutFromOdoo() {
  return sessionRequest("DELETE");
}

/** Read a named, server-allowlisted dataset through the user's Odoo session. */
export async function searchOdooRecords<T>(
  type: OdooRecordType,
  options: { query?: string; limit?: number; offset?: number; categoryId?: number } = {},
): Promise<OdooPage<T>> {
  const response = await fetch("/api/odoo/records", {
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
    }),
  });
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

export async function updateOdooProduct(productId: number, values: Partial<OdooProductUpdate>): Promise<void> {
  const response = await fetch(`/api/odoo/products/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new OdooApiError(payload?.message || `Product update failed (${response.status})`, response.status);
}
