import { fetchOdooRoute, OdooApiError } from "./odoo-api";

/** Polling is visible-page-only, abortable, bounded, and never repeats a force-refresh request. */
export async function fetchPreparedReport(path: string, options: { refresh?: boolean; allowStale?: boolean; signal?: AbortSignal; correlationId?: string } = {}) {
  const url = new URL(path, location.origin);
  if (options.refresh) url.searchParams.set("refresh", "true");
  if (options.allowStale) url.searchParams.set("stale", "allow");
  let response: Response;
  const deadline = Date.now() + 120_000;
  for (;;) {
    options.signal?.throwIfAborted();
    response = await fetchOdooRoute(url.pathname + url.search, { credentials: "same-origin", cache: "no-store", signal: options.signal,
      headers: options.correlationId ? { "X-Correlation-ID": options.correlationId } : undefined });
    if (!response.headers.get("content-type")?.includes("json")) {
      const peek = (await response.clone().text()).trimStart();
      if (!peek.startsWith("{") && !peek.startsWith("[")) {
        throw new OdooApiError("The report service is temporarily unavailable. Please retry shortly.", response.status);
      }
    }
    if (response.status !== 202) return response;
    const status = await response.json() as { taskId?: string };
    if (!status.taskId || Date.now() >= deadline) throw new Error("Your report is still being prepared. Please retry shortly.");
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { options.signal?.removeEventListener("abort", aborted); resolve(); }, 2000);
      options.signal?.addEventListener("abort", aborted, { once: true });
    });
    while (document.visibilityState === "hidden") {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { document.removeEventListener("visibilitychange", visible); options.signal?.removeEventListener("abort", aborted); };
        const visible = () => { if (document.visibilityState !== "hidden") { cleanup(); resolve(); } };
        const aborted = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
        document.addEventListener("visibilitychange", visible);
        options.signal?.addEventListener("abort", aborted, { once: true });
      });
    }
    url.searchParams.delete("refresh");
    url.searchParams.set("task", status.taskId);
  }
}
