type Entry = { response: Response; expires: number; timezone?: string; businessDay?: string };
type Flight = { promise: Promise<Response>; controller: AbortController; subscribers: number };
const entries = new Map<string, Entry>();
const flights = new Map<string, Flight>();
let identity: string | null = null;
let generation = 0;

export function clearOdooReadCache(reason: "data" | "identity" = "data") {
  generation++;
  entries.clear();
  for (const flight of flights.values()) flight.controller.abort();
  flights.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("orithos-read-cache-cleared", { detail: { reason, active: identity !== null } }));
}

export function setOdooReadIdentity(value: string | null) {
  if (identity === value) return;
  identity = value;
  clearOdooReadCache("identity");
}

function policy(path: string, init?: RequestInit): number | null {
  const url = new URL(path, "https://cache.invalid");
  const method = init?.method?.toUpperCase() ?? "GET";
  if (method === "POST" && url.pathname === "/api/odoo/sales-daily") return 30_000;
  if (method === "POST" && url.pathname === "/api/odoo/records") {
    try {
      const body = JSON.parse(String(init?.body));
      if (body.inventoryReport) return null; // The server's immutable inventory snapshot owns pagination.
      return ["sales", "customers", "suppliers", "products", "purchaseProducts"].includes(body.type) ? 30_000 : null;
    } catch { return null; }
  }
  if (method !== "GET") return null;
  if (url.searchParams.get("refresh") === "true" || url.searchParams.has("task")) return 0;
  if (url.pathname === "/api/odoo/session") return 15_000;
  if (url.pathname === "/api/odoo/pos-bootstrap") return 15_000;
  if (url.pathname === "/api/odoo/reporting-dashboard") return url.searchParams.has("period") ? 300_000 : 30_000;
  if (["/api/odoo/dead-stock", "/api/odoo/price-suggestions", "/api/odoo/replenishment", "/api/odoo/categories", "/api/odoo/customer-groups", "/api/odoo/pricelists", "/api/odoo/pricelist-items"].includes(url.pathname)) return 300_000;
  if (["/api/odoo/purchase-orders", "/api/odoo/suppliers", "/api/odoo/transfers"].includes(url.pathname)) return 30_000;
  return null;
}

function abortError() { return new DOMException("The request was aborted", "AbortError"); }

/** Explicit read whitelist. Shared transports survive until their final subscriber leaves. */
export async function cachedOdooRead(path: string, init: RequestInit | undefined, transport: (init: RequestInit | undefined) => Promise<Response>) {
  const ttl = policy(path, init);
  if (ttl === null || identity === null) return transport(init);
  const requested = new URL(path, "https://cache.invalid");
  if (requested.searchParams.get("refresh") === "true") {
    requested.searchParams.delete("refresh");
    const ordinaryKey = JSON.stringify([identity, typeof location === "undefined" ? "test" : location.host, requested.pathname + requested.search, init?.method ?? "GET", init?.body ?? null]);
    entries.delete(ordinaryKey);
    flights.get(ordinaryKey)?.controller.abort();
  }
  const key = JSON.stringify([identity, typeof location === "undefined" ? "test" : location.host, path, init?.method ?? "GET", init?.body ?? null]);
  if (init?.signal?.aborted) throw abortError();
  const entry = entries.get(key);
  if (entry && entry.expires > Date.now() && (!entry.timezone || entry.businessDay === new Intl.DateTimeFormat("en-CA", { timeZone: entry.timezone }).format(new Date()))) return entry.response.clone();
  if (entry) entries.delete(key);
  let flight = flights.get(key);
  if (!flight) {
    const controller = new AbortController();
    const revision = generation;
    const task: Flight = { controller, subscribers: 0, promise: Promise.resolve(new Response()) };
    task.promise = transport({ ...init, signal: controller.signal }).then(async original => {
      let response = original;
      if (revision !== generation || controller.signal.aborted) throw abortError();
      if (response.status === 401 || response.status === 403) { setOdooReadIdentity(null); return response; }
      if (response.status === 200 && ttl > 0) {
        const payload = await response.clone().json().catch(() => null);
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          const headers = new Headers(response.headers);
          headers.delete("content-length"); headers.delete("content-encoding");
          response = new Response(JSON.stringify({ ...payload, generatedAt: payload.generatedAt ?? new Date().toISOString() }), { status: response.status, headers });
        }
        // Stale snapshots must reach the server again so background completion becomes visible.
        const endpoint = new URL(path, "https://cache.invalid").pathname;
        const complete = payload && typeof payload === "object" && !payload.message
          && (endpoint !== "/api/odoo/reporting-dashboard" || (Number.isFinite(payload.revenue) && (new URL(path, "https://cache.invalid").searchParams.get("view") === "summary" || Array.isArray(payload.trend))))
          && (endpoint !== "/api/odoo/records" || Array.isArray(payload.items));
        if (complete && payload.cacheStatus !== "STALE") {
          let expires = Date.now() + ttl;
          if (payload?.timezone && ["yesterday", "last_week", "last_month"].includes(payload.period)) {
            // Store business date is rechecked on every lookup below via the response metadata.
            expires = Date.now() + 300_000;
          }
          if (entries.size >= 200) entries.delete(entries.keys().next().value!);
          entries.set(key, { response: response.clone(), expires, timezone: payload?.timezone, businessDay: payload?.timezone ? new Intl.DateTimeFormat("en-CA", { timeZone: payload.timezone }).format(new Date()) : undefined });
        }
      }
      return response;
    }).finally(() => { if (flights.get(key) === task) flights.delete(key); });
    flight = task;
    flights.set(key, task);
  }
  const shared = flight;
  shared.subscribers++;
  return new Promise<Response>((resolve, reject) => {
    let done = false;
    const finish = () => { if (done) return false; done = true; init?.signal?.removeEventListener("abort", onAbort); shared.subscribers--; return true; };
    const onAbort = () => { if (finish()) { if (!shared.subscribers) shared.controller.abort(); reject(abortError()); } };
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    shared.promise.then(response => { if (finish()) resolve(response.clone()); }, error => { if (finish()) reject(error); });
  });
}

export function cachedReadPolicy(path: string, init?: RequestInit) { return policy(path, init); }

if (typeof window !== "undefined") {
  window.addEventListener("storage", event => { if (event.key === "sf_user") setOdooReadIdentity(null); });
}
