"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { fetchOdooRoute } from "@/lib/odoo-api";
import type { PurchasingKind, ShopfrontPurchasingRecord } from "@/lib/shopfront-purchasing";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium disabled:opacity-50";
const money = (value: string | number | null) => value === null || value === "" || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value));

type DirectoryPage = {
  items: ShopfrontPurchasingRecord[]; total: number; sourceTotal: number; hasNext: boolean; statuses: string[];
};

/** Choose the verified store source before mounting an Odoo directory. Errors
 * stay visible; they must never expose unrelated test data as a fallback. */
export function ShopfrontPurchasingGate({ kind, children }: { kind: PurchasingKind; children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/shopfront/purchasing?type=${kind}&config=1`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || typeof body.enabled !== "boolean") throw new Error(body.message || "Could not check the store data source.");
      setEnabled(body.enabled); setError("");
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the store data source."); });
    return () => controller.abort();
  }, [kind, retry]);
  if (error) return <div role="alert" className="p-6"><p>{error}</p><button className={`${buttonClass} mt-3`} onClick={() => setRetry((value) => value + 1)}>Retry</button></div>;
  if (enabled === null) return <p role="status" className="p-6 text-sm text-[var(--oh-muted)]">Loading store data…</p>;
  return enabled ? <ShopfrontPurchasingDirectory kind={kind} /> : children;
}

function ShopfrontPurchasingDirectory({ kind }: { kind: PurchasingKind }) {
  const suppliers = kind === "suppliers";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DirectoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<ShopfrontPurchasingRecord | null>(null);
  useDialogFocus(detail !== null, () => setDetail(null));

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setOffset(0); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ type: kind, query: search, status, offset: String(offset) });
    void fetchOdooRoute(`/api/shopfront/purchasing?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.message || "Could not load Shopfront data.");
      if (!controller.signal.aborted) setPage(body);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load Shopfront data."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, search, status, offset, refresh]);

  return <section className="flex min-h-0 flex-col gap-4 bg-[var(--oh-surface)] p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="oh-type-title">{suppliers ? "Suppliers" : "Purchase orders"}{page && <span className="ml-2 text-[var(--oh-muted)]">{page.sourceTotal.toLocaleString("en-AU")}</span>}</h2>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">SKR · Shopfront · Read-only</p>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">{suppliers ? "Supplier contacts synced from Shopfront." : "Historical orders from Shopfront. Receiving and editing are unavailable here."}</p></div>
      <button className={buttonClass} disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /> Refresh</button>
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
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{page?.total ? `${offset + 1}–${Math.min(offset + 40, page.total)} of ${page.total.toLocaleString("en-AU")}` : "0 results"}</p><div className="flex gap-2"><button className={buttonClass} disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 40))}><ChevronLeft size={16} /> Previous</button><button className={buttonClass} disabled={!page?.hasNext} onClick={() => setOffset((value) => value + 40)}>Next <ChevronRight size={16} /></button></div></footer>
    </>}
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="shopfront-order-title" className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="shopfront-order-title" className="text-lg font-semibold">{detail.name}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Shopfront · Read-only · {detail.status}</p></div><button className={buttonClass} aria-label="Close order details" onClick={() => setDetail(null)}><X size={18} /></button></div>
      <p className="mt-4 text-sm">{detail.supplier || "Supplier unavailable"} · {detail.date || "Date unavailable"} · {money(detail.total)}</p>
      <p className="mt-2 break-all text-xs text-[var(--oh-muted)]">Shopfront #{detail.id}</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr>{["Product", "Ordered", "Received", "Ordered cost (AUD)"].map((label) => <th key={label} className="border-b px-2 py-3">{label}</th>)}</tr></thead><tbody>{detail.lines.map((line, index) => <tr key={index}><td className="border-b px-2 py-3">{line.name}</td><td className="border-b px-2 py-3">{line.ordered ?? "—"}</td><td className="border-b px-2 py-3">{line.received ?? "—"}</td><td className="border-b px-2 py-3">{money(line.cost)}</td></tr>)}</tbody></table></div>
    </div></div>}
  </section>;
}
