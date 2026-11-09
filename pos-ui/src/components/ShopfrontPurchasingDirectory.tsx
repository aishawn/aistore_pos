"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { PurchasingKind, ShopfrontPurchasingRecord } from "@/lib/shopfront-purchasing";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium disabled:opacity-50";
const money = (value: string | number | null) => value === null || value === "" || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value));

type DirectoryPage = {
  items: ShopfrontPurchasingRecord[]; total: number; sourceTotal: number; hasNext: boolean; statuses: string[];
};

/** Historical source records are shown inline on the canonical purchasing pages. */
export function ShopfrontPurchasingSection({ kind }: { kind: PurchasingKind }) {
  const suppliers = kind === "suppliers";
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void fetch(`/api/shopfront/purchasing?type=${kind}&config=1`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || typeof body.enabled !== "boolean") throw new Error(body.message || "Could not check the store data source.");
      setEnabled(body.enabled); setError("");
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the store data source."); });
    return () => controller.abort();
  }, [expanded, kind, retry]);
  return <section className="shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">{suppliers ? "Archived supplier directory" : "Historical purchase orders"}</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Shopfront · read-only source records</p></div>
      <button type="button" aria-expanded={expanded} onClick={() => { const open = !expanded; if (open) { setEnabled(null); setError(""); setRetry((current) => current + 1); } setExpanded(open); }} className={buttonClass}>{expanded ? "Hide history" : "View history"} <ChevronDown size={15} aria-hidden="true" /></button>
    </header>
    {expanded && <div className="border-t border-[var(--oh-border)]">
      {error ? <div role="alert" className="p-4 text-sm"><p>{error}</p><button className={`${buttonClass} mt-3`} onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry</button></div>
        : enabled === null ? <p role="status" className="flex items-center gap-2 p-4 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" /> Checking source availability…</p>
          : enabled ? <ShopfrontPurchasingDirectory kind={kind} />
            : <p role="status" className="p-4 text-sm text-[var(--oh-muted)]">No archived Shopfront records are configured for this store.</p>}
    </div>}
  </section>;
}

function ShopfrontPurchasingDirectory({ kind }: { kind: PurchasingKind }) {
  const suppliers = kind === "suppliers";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DirectoryPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<ShopfrontPurchasingRecord | null>(null);
  const requestKey = JSON.stringify([kind, search, status, offset, refresh]);
  const [loadedKey, setLoadedKey] = useState("");
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const error = failed?.key === requestKey ? failed.message : "";
  const loading = loadedKey !== requestKey && !error;
  useDialogFocus(detail !== null, () => setDetail(null));

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setOffset(0); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ type: kind, query: search, status, offset: String(offset) });
    void fetch(`/api/shopfront/purchasing?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.message || "Could not load Shopfront data.");
      if (!controller.signal.aborted) { setPage(body); setLoadedKey(requestKey); }
    }).catch((cause) => { if (!controller.signal.aborted) setFailed({ key: requestKey, message: cause instanceof Error ? cause.message : "Could not load Shopfront data." }); });
    return () => controller.abort();
  }, [kind, search, status, offset, refresh, requestKey]);

  return <div className="flex flex-col gap-4 p-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-[var(--oh-text)]">{page ? `${page.sourceTotal.toLocaleString("en-AU")} source records` : "Shopfront · Read-only"}</h3>
        <p className="mt-0.5 text-xs text-[var(--oh-muted)]">{suppliers ? "Historical supplier details. Edit current supplier records in Orithos." : "Historical orders only. Receiving and editing are unavailable."}</p></div>
      <button className={buttonClass} disabled={loading} onClick={() => { setFailed(null); setRefresh((value) => value + 1); }}><RefreshCw size={16} /> Refresh</button>
    </header>
    <div className="flex flex-wrap gap-3">
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3"><Search size={17} aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label={suppliers ? "Search suppliers" : "Search purchase orders"} placeholder={suppliers ? "Search name, phone, email or ABN" : "Search reference, invoice or supplier"} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Filter status" className="min-h-11 max-w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="all">All statuses</option>{page?.statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>
    </div>
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-sm">{error}<button className={`${buttonClass} ml-3`} onClick={() => setRefresh((value) => value + 1)}>Retry</button></div> : loading ? <p role="status" className="p-6 text-sm">Loading {suppliers ? "suppliers" : "purchase orders"}…</p> : <>
      <div className="overflow-x-auto rounded-lg border border-[var(--oh-border)] bg-white">
        <table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{(suppliers ? ["Supplier", "Contact", "ABN / Tax ID", "Status"] : ["Reference / Invoice", "Supplier", "Order date", "Lines", "Total (AUD)", "Status", "Actions"]).map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead>
          <tbody>{page?.items.map((row) => <tr key={row.id} className="border-t border-[var(--oh-border)]">
            <td className="max-w-72 break-words px-4 py-4"><span className="font-medium">{row.name}</span><span className="mt-1 block text-xs text-[var(--oh-muted)]">Shopfront #{row.id}</span></td>
            {suppliers ? <><td className="px-4 py-4"><span className="block">{row.email || "—"}</span>{row.phone && <span className="block">{row.phone}</span>}</td><td className="px-4 py-4">{row.taxId || "—"}</td></> : <><td className="px-4 py-4">{row.supplier || "—"}</td><td className="whitespace-nowrap px-4 py-4">{row.date || "—"}</td><td className="px-4 py-4">{row.lines.length}</td><td className="whitespace-nowrap px-4 py-4">{money(row.total)}</td></>}
            <td className="px-4 py-4"><span className="rounded-full bg-[var(--oh-surface)] px-2 py-1 text-xs">{row.status}</span></td>
            {!suppliers && <td className="px-4 py-4"><button className={buttonClass} onClick={() => setDetail(row)}>View</button></td>}
          </tr>)}</tbody></table>
        {page?.items.length === 0 && <p role="status" className="p-8 text-center text-sm text-[var(--oh-muted)]">No matching {suppliers ? "suppliers" : "purchase orders"}.</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{page?.total ? `${offset + 1}–${Math.min(offset + 40, page.total)} of ${page.total.toLocaleString("en-AU")}` : "0 results"}</p><div className="flex gap-2"><button className={buttonClass} disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - 40))}><ChevronLeft size={16} /> Previous</button><button className={buttonClass} disabled={!page?.hasNext || loading} onClick={() => setOffset((value) => value + 40)}>Next <ChevronRight size={16} /></button></div></footer>
    </>}
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="shopfront-order-title" className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="shopfront-order-title" className="text-lg font-semibold">{detail.name}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Shopfront · Read-only · {detail.status}</p></div><button className={buttonClass} aria-label="Close order details" onClick={() => setDetail(null)}><X size={18} /></button></div>
      <p className="mt-4 text-sm">{detail.supplier || "Supplier unavailable"} · {detail.date || "Date unavailable"} · {money(detail.total)}</p>
      <p className="mt-2 break-all text-xs text-[var(--oh-muted)]">Shopfront #{detail.id}</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr>{["Product", "Ordered", "Received", "Ordered cost (AUD)"].map((label) => <th key={label} className="border-b px-2 py-3">{label}</th>)}</tr></thead><tbody>{detail.lines.map((line, index) => <tr key={index}><td className="border-b px-2 py-3">{line.name}</td><td className="border-b px-2 py-3">{line.ordered ?? "—"}</td><td className="border-b px-2 py-3">{line.received ?? "—"}</td><td className="border-b px-2 py-3">{money(line.cost)}</td></tr>)}</tbody></table></div>
    </div></div>}
  </div>;
}
