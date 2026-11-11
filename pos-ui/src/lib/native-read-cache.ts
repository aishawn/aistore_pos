type Entry = { response: Response; expires: number; timezone?: string; businessDay?: string };
type Flight = { promise: Promise<Response>; controller: AbortController; subscribers: number };
const entries = new Map<string, Entry>();
const flights = new Map<string, Flight>();
let identity: string | null = null;
let generation = 0;

export function clearNativeReadCache(reason: "data" | "identity" = "data") {
  generation++;
  entries.clear();
  for (const flight of flights.values()) flight.controller.abort();
  flights.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("orithos-read-cache-cleared", { detail: { reason, active: identity !== null } }));
}

export function setNativeReadIdentity(value: string | null) {
  if (identity === value) return;
  identity = value;
  clearNativeReadCache("identity");
}

/**
 * `/api/cached-read/*` keeps a small GET coalescing helper for explicit callers.
 */
function policy(path: string, init?: RequestInit): number | null {
  const url = new URL(path, "https://cache.invalid");
  const method = init?.method?.toUpperCase() ?? "GET";
  if (method !== "GET") return null;
  if (!url.pathname.startsWith("/api/cached-read/")) return null;
  if (url.searchParams.get("refresh") === "true" || url.searchParams.has("task")) return 0;
  return 30_000;
}

function abortError() { return new DOMException("The request was aborted", "AbortError"); }

/** Explicit read whitelist. Shared transports survive until their final subscriber leaves. */
export async function cachedNativeRead(path: string, init: RequestInit | undefined, transport: (init: RequestInit | undefined) => Promise<Response>) {
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
      if (response.status === 401 || response.status === 403) { setNativeReadIdentity(null); return response; }
      if (response.status === 200 && ttl > 0) {
        const payload = await response.clone().json().catch(() => null);
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          const headers = new Headers(response.headers);
          headers.delete("content-length"); headers.delete("content-encoding");
          response = new Response(JSON.stringify({ ...payload, generatedAt: payload.generatedAt ?? new Date().toISOString() }), { status: response.status, headers });
        }
        const complete = payload && typeof payload === "object" && !payload.message
          && (Array.isArray(payload.items) || Number.isFinite(payload.revenue) || Array.isArray(payload.rows) || payload.ok === true);
        if (complete && payload.cacheStatus !== "STALE") {
          if (entries.size >= 200) entries.delete(entries.keys().next().value!);
          entries.set(key, {
            response: response.clone(),
            expires: Date.now() + ttl,
            timezone: payload?.timezone,
            businessDay: payload?.timezone ? new Intl.DateTimeFormat("en-CA", { timeZone: payload.timezone }).format(new Date()) : undefined,
          });
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
  window.addEventListener("storage", event => { if (event.key === "sf_user") setNativeReadIdentity(null); });
}
