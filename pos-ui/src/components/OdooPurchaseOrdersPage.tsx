"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, LoaderCircle, RefreshCw, Search, ShoppingCart, X } from "lucide-react";
import { confirmOdooPurchaseOrder, getOdooPurchaseOrderDetail, getOdooSession, searchOdooPurchaseOrders, type OdooPurchaseOrderDetail, type OdooPurchaseOrderRecord } from "@/lib/odoo-api";

const PAGE_SIZE = 40;
const STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["draft", "RFQ draft"],
  ["sent", "RFQ sent"],
  ["to approve", "Awaiting approval"],
  ["purchase", "Purchase order"],
  ["done", "Locked"],
  ["cancel", "Cancelled"],
] as const;

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status;
}

function statusClass(status: string) {
  if (status === "purchase" || status === "done") return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "sent" || status === "to approve") return "border border-sky-200 bg-sky-50 text-sky-800";
  if (status === "cancel") return "border border-slate-200 bg-slate-100 text-slate-600";
  return "border border-amber-200 bg-amber-50 text-amber-900";
}

function receiptStatusLabel(status: string) {
  if (status === "done") return "Received";
  if (status === "cancel") return "Cancelled";
  if (status === "assigned") return "Ready to receive";
  if (status === "waiting") return "Waiting for another step";
  if (status === "confirmed") return "Waiting";
  if (status === "draft") return "Draft";
  return status.replaceAll("_", " ");
}

function receiptStatusClass(status: string) {
  if (status === "done") return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "cancel") return "border border-slate-200 bg-slate-100 text-slate-600";
  if (status === "assigned") return "border border-sky-200 bg-sky-50 text-sky-800";
  return "border border-amber-200 bg-amber-50 text-amber-900";
}

function purchaseReceiptLabel(status?: string | false) {
  if (status === "full") return "Received in full";
  if (status === "partial") return "Partially received";
  if (status === "pending") return "Awaiting receipt";
  return null;
}

function formatDate(value?: string | false) {
  if (!value) return "—";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatMoney(value: number, currency?: [number, string] | false) {
  const code = currency && /^[A-Z]{3}$/.test(currency[1]) ? currency[1] : "AUD";
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: code }).format(value || 0); }
  catch { return `${code} ${(value || 0).toFixed(2)}`; }
}

function relationName(value: [number, string] | false | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

function noteText(value: string | false | undefined) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, " · ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, value: string) => Number(value) <= 0x10ffff ? String.fromCodePoint(Number(value)) : match)
    .replace(/&#x([\da-f]+);/gi, (match, value: string) => Number.parseInt(value, 16) <= 0x10ffff ? String.fromCodePoint(Number.parseInt(value, 16)) : match)
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function OdooPurchaseOrdersPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooPurchaseOrderRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [state, setState] = useState("all");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<OdooPurchaseOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const detailRevision = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadOrders = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const user = await getOdooSession();
      if (revision !== requestRevision.current) return;
      setConnected(Boolean(user));
      if (!user) {
        setItems([]);
        setHasNext(false);
        return;
      }
      const page = await searchOdooPurchaseOrders({ query: debouncedQuery, state, limit: PAGE_SIZE, offset });
      if (revision !== requestRevision.current) return;
      setItems(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo purchase orders.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [debouncedQuery, offset, state]);

  useEffect(() => { void loadOrders(); }, [loadOrders, refreshKey]);

  async function openDetail(purchaseId: number) {
    const revision = ++detailRevision.current;
    setDetail(null);
    setDetailError(null);
    setConfirmError(null);
    setDetailLoading(true);
    try {
      const result = await getOdooPurchaseOrderDetail(purchaseId);
      if (revision === detailRevision.current) setDetail(result);
    } catch (cause) {
      if (revision === detailRevision.current) setDetailError(cause instanceof Error ? cause.message : "Could not load this purchase order.");
    } finally {
      if (revision === detailRevision.current) setDetailLoading(false);
    }
  }

  function closeDetail() {
    detailRevision.current += 1;
    setDetail(null);
    setDetailError(null);
    setConfirmOpen(false);
    setConfirmError(null);
  }

  async function confirmOrder() {
    if (!detail || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmOdooPurchaseOrder(detail.order.id);
      setConfirmOpen(false);
      setRefreshKey((value) => value + 1);
      await openDetail(detail.order.id);
    } catch (cause) {
      setConfirmError(cause instanceof Error ? cause.message : "Could not confirm this purchase order.");
    } finally {
      setConfirming(false);
    }
  }

  if (connected === false && !loading) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <ShoppingCart className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to view purchases</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Purchase orders and supplier records come from the Odoo account connected to this workspace.</p>
        <Link href="/settings/integrations" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Odoo</Link>
      </section>
    </main>
  );

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:gap-5 md:p-6">
      <header className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock management · Odoo</p><h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Purchases</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Review requests for quotation and purchase orders from your current Odoo companies.</p></div>
        <div className="flex items-center gap-2">
          <Link href="/stock/replenishment" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><ShoppingCart size={16} /> Replenishment plan</Link>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh purchases" title="Refresh purchases" className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <label className="flex h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15"><Search size={17} className="text-[var(--oh-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search RFQ, order or supplier" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" /></label>
        <label className="grid w-full min-w-0 gap-1 text-xs font-medium text-[var(--oh-muted)] sm:w-[210px] sm:flex-none">Status<select value={state} onChange={(event) => { setState(event.target.value); setOffset(0); }} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] outline-none transition-colors focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15">{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
        <table className="hidden w-full min-w-[900px] border-collapse text-left text-sm xl:table">
          <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Order date</th><th className="px-4 py-3 text-right">Lines</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {loading && !items.length ? <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading purchases…</span></td></tr>
              : !items.length ? <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--oh-muted)]">{debouncedQuery || state !== "all" ? "No purchase orders match these filters." : "No RFQs or purchase orders are available to this Odoo account."}</td></tr>
                : items.map((order) => <tr key={order.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                  <td className="px-4 py-3"><button type="button" onClick={() => void openDetail(order.id)} className="rounded font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">{order.name}</button><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Odoo #{order.id}</span></td>
                  <td className="px-4 py-3 font-medium text-[var(--oh-text)]">{order.partner_id ? order.partner_id[1] : "No supplier"}</td>
                  <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{formatDate(order.date_order)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{order.order_line.length}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--oh-text)]">{formatMoney(order.amount_total, order.currency_id)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.state)}`}>{statusLabel(order.state)}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => void openDetail(order.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-xs font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><FileText size={14} /> View</button></td>
                </tr>)}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--oh-border)] xl:hidden">
          {loading && !items.length ? (
            <div role="status" className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading purchases…</span></div>
          ) : !items.length ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]">{debouncedQuery || state !== "all" ? "No purchase orders match these filters." : "No RFQs or purchase orders are available to this Odoo account."}</div>
          ) : items.map((order) => (
            <article key={order.id} className="px-4 py-3.5">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0"><button type="button" onClick={() => void openDetail(order.id)} className="font-semibold text-[var(--oh-primary)] hover:underline">{order.name}</button><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo #{order.id} · {formatDate(order.date_order)}</p></div>
                <span className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.state)}`}>{statusLabel(order.state)}</span>
              </header>
              <p className="mt-2 break-words text-sm font-medium text-[var(--oh-text)]">{order.partner_id ? order.partner_id[1] : "No supplier"}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex items-baseline gap-1.5"><dt className="shrink-0 text-[var(--oh-muted)]">Lines</dt><dd className="tabular-nums text-[var(--oh-text-secondary)]">{order.order_line.length}</dd></div>
                <div className="flex items-baseline justify-end gap-1.5"><dt className="text-[var(--oh-muted)]">Total</dt><dd className="font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(order.amount_total, order.currency_id)}</dd></div>
              </dl>
              <footer className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3"><button type="button" onClick={() => void openDetail(order.id)} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><FileText size={15} /> View order</button></footer>
            </article>
          ))}
        </div>
      </section>

      <footer className="flex shrink-0 flex-col gap-2 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between"><span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span><nav aria-label="Purchase orders pagination" className="flex w-full items-center gap-2 sm:w-auto"><button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button><button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button></nav></footer>

      {(detail || detailLoading || detailError) && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirming) closeDetail(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title" className="my-auto flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl">
          {detailLoading ? <div role="status" className="grid min-h-56 place-items-center text-sm text-[var(--oh-muted)]"><span><LoaderCircle className="mx-auto animate-spin" /><span className="mt-2 block">Loading purchase details…</span></span></div> : detailError ? <div className="p-6"><div className="flex justify-between gap-4"><h2 id="purchase-detail-title" className="text-lg font-semibold text-[var(--oh-text)]">Purchase details</h2><button type="button" onClick={closeDetail} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button></div><p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{detailError}</p></div> : detail && <>
            <header className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] p-4 sm:gap-4 sm:p-5 md:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="purchase-detail-title" className="text-lg font-semibold text-[var(--oh-text)]">{detail.order.name}</h2><span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(detail.order.state)}`}>{statusLabel(detail.order.state)}</span>{purchaseReceiptLabel(detail.order.receipt_status) && <span className="inline-flex min-h-6 items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{purchaseReceiptLabel(detail.order.receipt_status)}</span>}</div><p className="mt-1 break-words text-sm text-[var(--oh-muted)]">{relationName(detail.order.partner_id) || "No supplier"} · {formatDate(detail.order.date_order)}</p></div><button type="button" onClick={closeDetail} disabled={confirming} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button></header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 md:px-6">
              <div className="overflow-hidden rounded-lg border border-[var(--oh-border)]">
                <table className="hidden w-full min-w-[680px] border-collapse text-left text-sm xl:table">
                  <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5 text-right">Quantity</th><th className="px-3 py-2.5 text-right">Received</th><th className="px-3 py-2.5 text-right">Unit price</th><th className="px-3 py-2.5 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">{detail.lines.map((line) => { const unit = relationName(line.product_uom) || relationName(line.product_uom_id); return <tr key={line.id}><td className="px-3 py-3"><span className="block font-medium text-[var(--oh-text)]">{relationName(line.product_id) || line.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Expected {formatDate(line.date_planned)}</span></td><td className="px-3 py-3 text-right tabular-nums">{line.product_qty} {unit}</td><td className="px-3 py-3 text-right tabular-nums">{line.qty_received}</td><td className="px-3 py-3 text-right tabular-nums">{formatMoney(line.price_unit, detail.order.currency_id)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{formatMoney(line.price_subtotal, detail.order.currency_id)}</td></tr>; })}{!detail.lines.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--oh-muted)]">This RFQ has no product lines.</td></tr>}</tbody>
                </table>
                <div className="divide-y divide-[var(--oh-border)] xl:hidden">
                  {detail.lines.map((line) => {
                    const unit = relationName(line.product_uom) || relationName(line.product_uom_id);
                    return <article key={line.id} className="p-3">
                      <p className="break-words text-sm font-semibold text-[var(--oh-text)]">{relationName(line.product_id) || line.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Expected {formatDate(line.date_planned)}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div><dt className="text-[var(--oh-muted)]">Quantity</dt><dd className="mt-0.5 tabular-nums text-[var(--oh-text-secondary)]">{line.product_qty} {unit}</dd></div>
                        <div><dt className="text-[var(--oh-muted)]">Received</dt><dd className="mt-0.5 tabular-nums text-[var(--oh-text-secondary)]">{line.qty_received} {unit}</dd></div>
                        <div><dt className="text-[var(--oh-muted)]">Unit price</dt><dd className="mt-0.5 tabular-nums text-[var(--oh-text-secondary)]">{formatMoney(line.price_unit, detail.order.currency_id)}</dd></div>
                        <div><dt className="text-[var(--oh-muted)]">Subtotal</dt><dd className="mt-0.5 font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(line.price_subtotal, detail.order.currency_id)}</dd></div>
                      </dl>
                    </article>;
                  })}
                  {!detail.lines.length && <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">This RFQ has no product lines.</p>}
                </div>
              </div>
              <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-8 gap-y-2 text-sm"><dt className="text-[var(--oh-muted)]">Untaxed</dt><dd className="text-right tabular-nums text-[var(--oh-text)]">{formatMoney(detail.order.amount_untaxed, detail.order.currency_id)}</dd><dt className="text-[var(--oh-muted)]">Tax</dt><dd className="text-right tabular-nums text-[var(--oh-text)]">{formatMoney(detail.order.amount_tax, detail.order.currency_id)}</dd><dt className="font-semibold text-[var(--oh-text)]">Total</dt><dd className="text-right font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(detail.order.amount_total, detail.order.currency_id)}</dd></dl>
              <section aria-labelledby="purchase-approval-title" className="rounded-lg border border-[var(--oh-border)] px-4 py-3"><h3 id="purchase-approval-title" className="text-sm font-semibold text-[var(--oh-text)]">Replenishment approval audit</h3>
                {!detail.approvalAuditAvailable ? <p role="status" className="mt-2 text-sm text-[var(--oh-muted)]">Internal Odoo approval notes are not available to this account. Open the purchase order in Odoo to review its chatter.</p>
                  : detail.approvalAudits.length ? <ul className="mt-2 space-y-3">{detail.approvalAudits.map((audit) => <li key={audit.id} className="border-t border-[var(--oh-border)] pt-3 first:border-0 first:pt-0"><p className="text-xs text-[var(--oh-muted)]">{relationName(audit.author_id) || "Odoo user"} · {formatDate(audit.date)}</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--oh-text-secondary)]">{noteText(audit.body)}</p></li>)}</ul>
                    : <p className="mt-2 text-sm text-[var(--oh-muted)]">No Orithos replenishment approval is attached to this purchase order.</p>}
              </section>
              <section aria-labelledby="receipt-list-title" className="rounded-lg border border-[var(--oh-border)]">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-4 py-3">
                  <div><h3 id="receipt-list-title" className="text-sm font-semibold text-[var(--oh-text)]">Incoming receipts</h3><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Receipt status and quantities are managed in Odoo Inventory.</p></div>
                  <span className="text-xs text-[var(--oh-muted)]">{detail.receipts.length} {detail.receipts.length === 1 ? "receipt" : "receipts"}</span>
                </header>
                {!detail.receiptsAvailable ? <p role="status" className="px-4 py-4 text-sm text-[var(--oh-muted)]">Receipt details are not available for this account. Open the purchase order in Odoo to review its deliveries.</p>
                  : detail.receipts.length ? <ul className="divide-y divide-[var(--oh-border)]">{detail.receipts.map((receipt) => <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><a href={receipt.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--oh-primary)] hover:underline">{receipt.name}</a><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${receiptStatusClass(receipt.state)}`}>{receiptStatusLabel(receipt.state)}</span></div><p className="mt-1 text-xs text-[var(--oh-muted)]">{relationName(receipt.picking_type_id) || "Incoming transfer"} · {relationName(receipt.location_id) || "Vendor"} → {relationName(receipt.location_dest_id) || "Stock"}</p></div><div className="flex items-center gap-3 text-right"><div><span className="block text-xs text-[var(--oh-muted)]">{receipt.state === "done" ? "Received" : "Scheduled"}</span><span className="text-sm tabular-nums text-[var(--oh-text-secondary)]">{formatDate(receipt.date_done || receipt.scheduled_date)}</span></div><a href={receipt.url} target="_blank" rel="noreferrer" aria-label={`Open receipt ${receipt.name} in Odoo`} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]"><ExternalLink size={15} /></a></div></li>)}</ul>
                  : <p className="px-4 py-4 text-sm text-[var(--oh-muted)]">No incoming receipts are linked yet. Confirm the purchase order in Odoo to start the receiving workflow.</p>}
              </section>
              {detail.order.origin && <p className="text-xs text-[var(--oh-muted)]">Source: {detail.order.origin}</p>}
              {detail.order.state === "to approve" && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm leading-5 text-sky-950">This RFQ is waiting for approval in Odoo.</p>}
              {detail.order.state === "draft" && detail.lines.some((line) => line.price_unit <= 0) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">At least one line has no supplier price yet. Review the quote with the supplier before confirming.</p>}
              {confirmError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{confirmError}</p>}
            </div>
            <footer className="flex flex-col gap-2 border-t border-[var(--oh-border)] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:px-6"><a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:justify-start">Open in Odoo <ExternalLink size={15} /></a><div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"><button type="button" onClick={closeDetail} disabled={confirming} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50">Close</button>{(detail.order.state === "draft" || detail.order.state === "sent") && <button type="button" onClick={() => { setConfirmError(null); setConfirmOpen(true); }} disabled={confirming} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"><Check size={15} /> Confirm purchase order</button>}</div></footer>
          </>}
        </section>
      </div>}

      {confirmOpen && detail && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirming) setConfirmOpen(false); }}><section role="alertdialog" aria-modal="true" aria-labelledby="confirm-purchase-title" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5"><h2 id="confirm-purchase-title" className="text-lg font-semibold text-[var(--oh-text)]">Confirm this purchase order?</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Confirm <strong className="text-[var(--oh-text)]">{detail.order.name}</strong> for <strong className="text-[var(--oh-text)]">{relationName(detail.order.partner_id) || "this supplier"}</strong>. Odoo will move it out of RFQ status and may create an incoming receipt.</p><p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Check supplier prices and delivery terms before confirming. This action follows your Odoo user permissions.</p>{confirmError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{confirmError}</p>}<footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmOpen(false)} disabled={confirming} className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Go back</button><button type="button" onClick={() => void confirmOrder()} disabled={confirming} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60 sm:w-auto">{confirming ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUpRight size={15} />} {confirming ? "Confirming…" : "Confirm order"}</button></footer></section></div>}
    </main>
  );
}
