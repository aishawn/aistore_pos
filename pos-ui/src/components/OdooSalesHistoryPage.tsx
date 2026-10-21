"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Printer, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSaleDetail,
  getOdooSession,
  searchOdooRecords,
  submitOdooPosOrder,
  recoverOdooPosOrder,
  OdooCheckoutPendingError,
  type OdooCheckoutRequest,
  type OdooPosBootstrap,
  type OdooSaleDetail,
  type OdooSaleRecord,
  type OdooSalesPeriodFilter,
  type OdooSalesStatusFilter,
} from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";

const PAGE_SIZE = 40;
const money = (amount: number, currency = "AUD") => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);

type R2Receipt = {
  id: string;
  invoiceNumber: string;
  date: string;
  time: string;
  dateTime: string;
  status: string;
  total: number;
  tax: number;
  savings: number;
  discount: number;
  items: Array<{ id: string; name: string; quantity: number; amount: number }>;
  payments: Array<{ id: string; method: string; amount: number; status: string }>;
};

function R2ArchivePanel({ query }: { query: string }) {
  const [items, setItems] = useState<R2Receipt[]>([]);
  const [databaseSha256, setDatabaseSha256] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<R2Receipt | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  useDialogFocus(Boolean(selected), () => setSelected(null));

  useEffect(() => {
    let active = true;
    void fetch("/api/r2-archive/sales", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) throw new Error("Archive unavailable");
        return response.json() as Promise<{ items?: R2Receipt[]; databaseSha256?: string }>;
      })
      .then((payload) => {
        if (!active || !payload) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setDatabaseSha256(payload.databaseSha256 ?? "");
        setError(null);
      })
      .catch(() => { if (active) setError("R2 test receipts are temporarily unavailable."); });
    return () => { active = false; };
  }, [retryKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = items.filter((item) => !normalizedQuery
    || item.invoiceNumber.toLowerCase().includes(normalizedQuery)
    || item.items.some((line) => line.name.toLowerCase().includes(normalizedQuery)));
  if (!items.length && !error) return null;

  return (
    <>
      <section className="shrink-0 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">Shopfront R2 source archive</h2>
            <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Read-only crawl snapshot. Not the sales ledger — use the Odoo table below for refunds and reporting.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">R2 · TEST</span>
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="min-h-11 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-[var(--oh-text)]">
              {expanded ? "Hide" : `Show ${filtered.length}`}
            </button>
          </div>
        </header>
        {error && <div role="status" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-100"><RefreshCw size={14} /> Retry archive</button></div>}
        {expanded && !error && (
          <div className="max-h-72 divide-y divide-amber-100 overflow-y-auto bg-white/70">
            {filtered.length ? filtered.map((receipt) => (
              <button key={receipt.id} type="button" onClick={() => setSelected(receipt)} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--oh-primary)]">
                <span className="min-w-32 font-semibold text-[var(--oh-primary)]">{receipt.invoiceNumber}</span>
                <span className="text-sm text-[var(--oh-text-secondary)]">{receipt.date} {receipt.time}</span>
                <span className="text-xs text-[var(--oh-muted)]">{receipt.items.length} lines · GST {money(receipt.tax)}</span>
                <span className="font-semibold tabular-nums text-[var(--oh-text)]">{money(receipt.total)}</span>
              </button>
            )) : <p className="px-4 py-6 text-center text-sm text-[var(--oh-muted)]">No R2 receipts match this search.</p>}
          </div>
        )}
        {expanded && databaseSha256 && <p className="border-t border-amber-100 px-4 py-2 text-[11px] text-[var(--oh-muted)]">Snapshot SHA-256: {databaseSha256}</p>}
      </section>

      {selected && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-3 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="r2-receipt-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-6">
            <header className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
              <div><h2 id="r2-receipt-title" className="text-lg font-semibold text-[var(--oh-text)]">R2 receipt {selected.invoiceNumber}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{selected.date} {selected.time} · Imported read-only test data</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close R2 receipt" className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text)]"><X size={18} /></button>
            </header>
            <div className="mt-4 overflow-x-auto">
              <table aria-label="Archived receipt items" className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--oh-muted)]"><tr><th scope="col" className="py-2">Product</th><th scope="col" className="py-2 text-right">Qty</th><th scope="col" className="py-2 text-right">Line total</th></tr></thead>
                <tbody className="divide-y divide-[var(--oh-border)]">{selected.items.map((line) => <tr key={line.id}><td className="py-2.5 pr-3">{line.name}</td><td className="py-2.5 text-right tabular-nums">{line.quantity}</td><td className="py-2.5 text-right font-medium tabular-nums">{money(line.amount)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-2 text-sm"><span className="text-[var(--oh-muted)]">GST (receipt total)</span><span className="text-right tabular-nums">{money(selected.tax)}</span><span className="border-t border-[var(--oh-border)] pt-2 font-semibold">Receipt total</span><span className="border-t border-[var(--oh-border)] pt-2 text-right font-bold tabular-nums">{money(selected.total)}</span></div>
            <p className="mt-3 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">The archive provides GST at receipt level only. Matching Completed receipts are also imported as Odoo POS orders for the demo store; refunds must use the Odoo history rows, not this archive panel.</p>
            <section className="mt-4 border-t border-[var(--oh-border)] pt-4"><h3 className="text-sm font-semibold">Payments</h3>{selected.payments.length ? <ul className="mt-2 space-y-1.5 text-sm">{selected.payments.map((payment) => <li key={payment.id} className="flex justify-between gap-4"><span>{payment.method}{payment.status ? ` · ${payment.status}` : ""}</span><span className="tabular-nums">{money(payment.amount)}</span></li>)}</ul> : <p className="mt-2 text-sm text-[var(--oh-muted)]">No payment details in this receipt.</p>}</section>
          </section>
        </div>
      )}
    </>
  );
}

function SalesEmptyState({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return (
    <div role="status" className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><FileText size={20} aria-hidden="true" /></span>
      <h2 className="mt-4 text-sm font-semibold text-[var(--oh-text)]">{searching ? "No matching sales" : "No sales yet"}</h2>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">{searching ? "Try another search or filter." : "Sales available to this Odoo account will appear here."}</p>
      {searching && <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button>}
    </div>
  );
}

function formatOrderDate(value: string, timezone: string) {
  return formatOdooDateTime(value, timezone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    paid: "Paid",
    done: "Completed",
    invoiced: "Invoiced",
    cancel: "Cancelled",
  };
  return labels[state] ?? state;
}

function stateClass(state: string) {
  const styles: Record<string, string> = {
    draft: "border border-amber-200 bg-amber-50 text-amber-800",
    paid: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    done: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    invoiced: "border border-indigo-200 bg-indigo-50 text-indigo-700",
    cancel: "border border-neutral-200 bg-neutral-100 text-neutral-600",
  };
  return styles[state] ?? "border border-[var(--oh-border)] bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]";
}

export function OdooSalesHistoryPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooSaleRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<OdooSalesStatusFilter>("all");
  const [period, setPeriod] = useState<OdooSalesPeriodFilter>("all");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saleDetail, setSaleDetail] = useState<OdooSaleDetail | null>(null);
  const [saleDetailId, setSaleDetailId] = useState<number | null>(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [saleDetailError, setSaleDetailError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const [refundBusy, setRefundBusy] = useState(false);
  const pendingRefund = useRef<OdooCheckoutRequest | null>(null);
  const refundLock = useRef(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [refundComplete, setRefundComplete] = useState(false);
  const [refundPaymentMethodId, setRefundPaymentMethodId] = useState<number | null>(null);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const detailRevision = useRef(0);

  const loadSales = useCallback(async () => {
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
      const [page, pos] = await Promise.all([
        searchOdooRecords<OdooSaleRecord>("sales", { query: debouncedQuery, status, period, limit: PAGE_SIZE + 1, offset }),
        getOdooPosBootstrap().catch(() => null),
      ]);
      if (revision !== requestRevision.current) return;
      setItems(page.items.slice(0, PAGE_SIZE));
      setHasNext(page.items.length > PAGE_SIZE);
      setLastLoadedAt(Date.now());
      if (pos) {
        setBootstrap(pos);
        setStoreTimezone(pos.configs.find((config) => config.session)?.timezone ?? pos.configs[0]?.timezone ?? "UTC");
      }
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo sales.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [debouncedQuery, offset, period, status]);

  useEffect(() => { void loadSales(); }, [loadSales]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function updateQuery(value: string) {
    setQuery(value);
  }

  function clearSearch() {
    setQuery("");
    setDebouncedQuery("");
    setStatus("all");
    setPeriod("all");
    setOffset(0);
  }

  function exportVisibleSales() {
    if (!items.length) return;
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/gu, '""')}"`;
    const rows = [
      ["Receipt", "Date", "Customer", "Register session", "Status", "Total", "Tax"],
      ...items.map((sale) => [
        sale.pos_reference || sale.name,
        formatOrderDate(sale.date_order, storeTimezone),
        sale.partner_id ? sale.partner_id[1] : "Walk-in customer",
        sale.session_id ? sale.session_id[1] : "",
        stateLabel(sale.state),
        sale.amount_total.toFixed(2),
        sale.amount_tax.toFixed(2),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orithos-sales-${debouncedQuery ? "search" : "page"}-${offset / PAGE_SIZE + 1}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const hasActiveSearch = Boolean(debouncedQuery || status !== "all" || period !== "all");

  async function openSale(saleId: number) {
    if (pendingRefund.current && pendingRefund.current.refundOfOrderId !== saleId) { setRefundMessage("Resolve the pending refund before opening another sale."); return; }
    try {
      const saved = JSON.parse(sessionStorage.getItem(`orithos-pending-refund:${saleId}`) ?? "null");
      if (saved?.refundOfOrderId === saleId && typeof saved.orderUuid === "string" && Number.isSafeInteger(saved.configId)) pendingRefund.current = saved;
    } catch { /* The write path below refuses to submit without durable browser storage. */ }
    const revision = ++detailRevision.current;
    setSaleDetailId(saleId);
    setSaleDetail(null);
    setSaleDetailError(null);
    setSaleDetailLoading(true);
    setRefundComplete(false);
    setRefundMessage(null);
    try {
      const detail = await getOdooSaleDetail(saleId);
      if (revision === detailRevision.current) setSaleDetail(detail);
    } catch (cause) {
      if (revision === detailRevision.current) setSaleDetailError(cause instanceof Error ? cause.message : "Could not load sale details.");
    } finally {
      if (revision === detailRevision.current) setSaleDetailLoading(false);
    }
  }

  function closeSale() {
    if (pendingRefund.current) { setRefundMessage("Refund result is pending. Check the saved refund before closing."); return; }
    detailRevision.current += 1;
    setSaleDetailId(null);
    setSaleDetail(null);
    setSaleDetailLoading(false);
    setSaleDetailError(null);
    setRefundMessage(null);
    setRefundComplete(false);
  }

  async function refundSale() {
    if (!saleDetail || refundLock.current) return;
    if (pendingRefund.current) {
      refundLock.current = true; setRefundBusy(true);
      try {
        const result = await recoverOdooPosOrder(pendingRefund.current);
        if (!result) { setRefundMessage("Refund result is still pending. Do not return funds again; check Odoo."); return; }
        pendingRefund.current = null;
        try { sessionStorage.removeItem(`orithos-pending-refund:${saleDetail.order.id}`); } catch { /* Keep the confirmed result visible. */ }
        setRefundMessage(`Refund confirmed as ${result.receipt}. Total ${money(result.total)}.`);
        setRefundComplete(true); setConfirmingRefund(false); void loadSales();
      } finally { refundLock.current = false; setRefundBusy(false); }
      return;
    }
    const refundable = ["paid", "done", "invoiced"].includes(saleDetail.order.state);
    if (!refundable) {
      setRefundMessage("Only paid, completed or invoiced sales can be refunded.");
      return;
    }
    const openConfig = refundConfig;
    const paymentMethodId = refundPaymentMethodId ?? openConfig?.paymentMethods[0]?.id;
    if (!openConfig?.session || !paymentMethodId) {
      setRefundMessage("Open an Odoo POS session with a payment method before refunding.");
      return;
    }
    if (!canRefund) {
      setRefundMessage("This sale has already been refunded, or a sale item is unavailable for refund.");
      return;
    }
    const lines = saleDetail.lines
      .filter((line) => Array.isArray(line.product_id) && line.qty > 0)
      .map((line) => ({
        productId: (line.product_id as [number, string])[0],
        quantity: -Math.abs(line.qty),
        refundedOrderLineId: line.id,
      }));
    if (!lines.length) {
      setRefundMessage("This sale has no refundable product lines.");
      return;
    }
    setRefundBusy(true);
    refundLock.current = true;
    setRefundMessage(null);
    try {
      const amount = Math.abs(saleDetail.order.amount_total);
      const request: OdooCheckoutRequest = {
        externalPaymentConfirmed: true,
        configId: openConfig.id,
        paymentMethodId,
        orderUuid: crypto.randomUUID(),
        customerId: Array.isArray(saleDetail.order.partner_id) ? saleDetail.order.partner_id[0] : null,
        tendered: amount,
        refundOfOrderId: saleDetail.order.id,
        lines,
      };
      sessionStorage.setItem(`orithos-pending-refund:${saleDetail.order.id}`, JSON.stringify(request));
      const result = await submitOdooPosOrder(request);
      try { sessionStorage.removeItem(`orithos-pending-refund:${saleDetail.order.id}`); } catch { /* Keep the confirmed result visible. */ }
      setRefundMessage(`Refund recorded as ${result.receipt}. Total ${money(result.total)}.`);
      setRefundComplete(true);
      setConfirmingRefund(false);
      void loadSales();
    } catch (cause) {
      if (cause instanceof OdooCheckoutPendingError) pendingRefund.current = cause.order;
      else { try { sessionStorage.removeItem(`orithos-pending-refund:${saleDetail.order.id}`); } catch { /* Preserve the original error. */ } }
      setRefundMessage(cause instanceof Error ? cause.message : "Refund failed.");
      setConfirmingRefund(false);
    } finally {
      refundLock.current = false;
      setRefundBusy(false);
    }
  }

  const receiptCurrency = saleDetail && Array.isArray(saleDetail.company?.currency_id) ? saleDetail.company.currency_id[1] : "AUD";
  const canRefund = Boolean(
    saleDetail
    && ["paid", "done", "invoiced"].includes(saleDetail.order.state)
    && saleDetail.order.amount_total > 0
    && !refundComplete
    && saleDetail.lines.length > 0
    && saleDetail.lines.every((line) => line.qty <= 0 || (Array.isArray(line.product_id) && line.refunded_qty === 0)),
  );
  useDialogFocus(Boolean((saleDetailLoading || saleDetailError || saleDetail) && !confirmingRefund), closeSale, saleDetail ? "detail" : saleDetailError ? "error" : "loading");
  useDialogFocus(confirmingRefund && Boolean(saleDetail && canRefund), () => setConfirmingRefund(false));
  const sourceConfigId = saleDetail && Array.isArray(saleDetail.order.config_id) ? saleDetail.order.config_id[0] : null;
  const refundConfig = bootstrap?.configs.find((item) => item.id === sourceConfigId && item.session && item.paymentMethods.length) ?? null;
  const refundAlreadyRecorded = Boolean(refundComplete || saleDetail?.lines.some(
    (line) => line.qty > 0 && line.refunded_qty > 0,
  ));

  function requestRefundConfirmation() {
    if (pendingRefund.current) { void refundSale(); return; }
    if (!saleDetail) return;
    if (!refundConfig) {
      setRefundMessage("Open the original Odoo register session before issuing this refund.");
      return;
    }
    const originalPayment = saleDetail.payments.find((payment) => payment.amount > 0 && Array.isArray(payment.payment_method_id));
    const originalMethodId = originalPayment && Array.isArray(originalPayment.payment_method_id)
      ? originalPayment.payment_method_id[0]
      : null;
    const matchingMethod = refundConfig.paymentMethods.find((method) => method.id === originalMethodId);
    setRefundPaymentMethodId(matchingMethod?.id ?? refundConfig.paymentMethods[0]?.id ?? null);
    setRefundMessage(null);
    setConfirmingRefund(true);
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Sales History</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">
            Formal ledger is Odoo POS orders below (demo includes imported R2 history). The amber panel is a read-only Shopfront archive for cross-check only — refunds use Odoo rows, not the archive.
          </p>
          {lastLoadedAt !== null && <p className="mt-1 text-xs text-[var(--oh-muted)]">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</p>}
          <p className="mt-1 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">TEST · aipos demo data</p>
        </div>
        <button type="button" onClick={() => void loadSales()} disabled={loading} aria-label={loading ? "Refreshing sales" : "Refresh sales"} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view sales</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect with your Odoo staff account to view the sales available to that account.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="flex w-full max-w-3xl shrink-0 flex-wrap gap-2">
            <label aria-label="Search sales" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input aria-label="Search sales by receipt or order reference" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search receipt or order reference" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <label className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)]">
              <span className="sr-only">Filter sales by time</span>
              <select value={period} onChange={(event) => { setPeriod(event.target.value as OdooSalesPeriodFilter); setOffset(0); }} className="h-full bg-transparent outline-none">
                <option value="all">All time</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            <label className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)]">
              <span className="sr-only">Filter sales by status</span>
              <select value={status} onChange={(event) => { setStatus(event.target.value as OdooSalesStatusFilter); setOffset(0); }} className="h-full bg-transparent outline-none">
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <button type="button" onClick={exportVisibleSales} disabled={!items.length || loading} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] disabled:cursor-not-allowed disabled:opacity-50" title="Export the currently visible sales rows as CSV">
              <Download size={16} /> Export visible
            </button>
          </div>

          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => void loadSales()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <R2ArchivePanel query={debouncedQuery} />

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Odoo sales history" className="hidden w-full min-w-[850px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Receipt</th>
                  <th scope="col" className="px-4 py-3">Date &amp; time</th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Register session</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => <tr key={`sales-skeleton-${index}`} aria-hidden="true">
                  <td colSpan={6} className="px-4 py-3"><div className="grid grid-cols-[1fr_1.15fr_1fr_1.1fr_.8fr_.65fr] items-center gap-4">
                    <span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-6 animate-pulse rounded-full bg-[var(--oh-border)]" /><span className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--oh-border)]" />
                  </div></td>
                </tr>) : items.length === 0 ? (
                  <tr><td colSpan={6} className="p-0"><SalesEmptyState searching={hasActiveSearch} onClear={clearSearch} /></td></tr>
                ) : items.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                    <td className="px-4 py-3"><button type="button" onClick={() => void openSale(sale.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-[var(--oh-orange-dark)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><FileText size={15} aria-hidden="true" />{sale.pos_reference || sale.name}</button></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{formatOrderDate(sale.date_order, storeTimezone)}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{sale.partner_id ? sale.partner_id[1] : "Walk-in customer"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{sale.session_id ? sale.session_id[1] : "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass(sale.state)}`}>{stateLabel(sale.state)}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`font-semibold tabular-nums ${sale.amount_total < 0 ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]"}`}>{money(sale.amount_total)}</span>
                        {sale.amount_total < 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[var(--oh-danger)]">Refund</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" aria-label="Loading sales" className="divide-y divide-[var(--oh-border)]">
                  {Array.from({ length: 6 }, (_, index) => <div key={`sales-mobile-skeleton-${index}`} aria-hidden="true" className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3"><span className="h-4 w-36 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 w-20 animate-pulse rounded bg-[var(--oh-border)]" /></div>
                    <div className="mt-3 flex justify-between gap-3"><span className="h-3 w-28 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-3 w-32 animate-pulse rounded bg-[var(--oh-border)]" /></div>
                    <div className="mt-2 flex justify-between gap-3"><span className="h-3 w-24 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-6 w-20 animate-pulse rounded-full bg-[var(--oh-border)]" /></div>
                  </div>)}
                  <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading sales…</p>
                </div>
              ) : items.length === 0 ? (
                <SalesEmptyState searching={hasActiveSearch} onClear={clearSearch} />
              ) : items.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => void openSale(sale.id)}
                  aria-label={`View receipt ${sale.pos_reference || sale.name}`}
                  className="block min-h-11 w-full px-4 py-3.5 text-left transition-colors hover:bg-[var(--oh-surface)]/70 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--oh-primary)]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-[var(--oh-primary)]">{sale.pos_reference || sale.name}</span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-sm font-semibold tabular-nums ${sale.amount_total < 0 ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]"}`}>{money(sale.amount_total)}</span>
                      {sale.amount_total < 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[var(--oh-danger)]">Refund</span>}
                    </span>
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--oh-muted)]">
                    <span>{formatOrderDate(sale.date_order, storeTimezone)}</span>
                    <span className="max-w-[55%] truncate text-right">{sale.partner_id ? sale.partner_id[1] : "Walk-in customer"}</span>
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-[var(--oh-text-secondary)]">{sale.session_id ? sale.session_id[1] : "—"}</span>
                    <span className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass(sale.state)}`}>{stateLabel(sale.state)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {items.length > 0 && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-[var(--oh-muted)]">
            <span>Showing {offset + 1}–{offset + items.length}</span>
            <nav aria-label="Sales history pagination" className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={16} /></button>
            </nav>
          </footer>}
        </>
      )}

      {(saleDetailLoading || saleDetailError || saleDetail) && <div className="receipt-overlay fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSale(); }}>
        {saleDetailLoading && <section role="status" className="rounded-xl bg-white p-8 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={22} className="mx-auto animate-spin" /><span className="mt-2 block">Loading sale details…</span></section>}
        {saleDetailError && <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-[var(--oh-text)]">Could not open receipt</h2><p className="mt-2 text-sm text-red-800">{saleDetailError}</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={closeSale} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Close</button>{saleDetailId !== null && <button type="button" onClick={() => void openSale(saleDetailId)} className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={15} /> Retry</button>}</div></section>}
        {saleDetail && <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="receipt-print my-auto max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-7">
          <header className="receipt-print-hidden mb-4 flex items-start justify-between gap-4 border-b border-[var(--oh-border)] pb-4">
            <div><h2 id="receipt-title" className="text-lg font-semibold text-[var(--oh-text)]">Sale receipt</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Review this Odoo order or print a copy.</p></div>
            <button type="button" onClick={closeSale} aria-label="Close receipt" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
          </header>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--oh-muted)]">{saleDetail.company?.name || "Orithos POS"}</p>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-[var(--oh-text)]">{saleDetail.order.pos_reference || saleDetail.order.name}</h3>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">{formatOrderDate(saleDetail.order.date_order, saleDetail.company?.timezone ?? storeTimezone)}</p>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">{saleDetail.order.session_id ? saleDetail.order.session_id[1] : "POS sale"} · {saleDetail.order.user_id ? saleDetail.order.user_id[1] : "Staff"}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
            <span className="text-[var(--oh-muted)]">Customer</span><span className="text-right font-medium text-[var(--oh-text)]">{saleDetail.order.partner_id ? saleDetail.order.partner_id[1] : "Walk-in customer"}</span>
            <span className="text-[var(--oh-muted)]">Status</span><span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass(saleDetail.order.state)}`}>{stateLabel(saleDetail.order.state)}</span>
          </div>
          <div className="mt-5">
            <table aria-label="Sale line items" className="hidden w-full min-w-[420px] text-sm md:table">
              <thead><tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><th scope="col" className="py-2 text-left">Item</th><th scope="col" className="py-2 text-right">Qty</th><th scope="col" className="py-2 text-right">Unit</th><th scope="col" className="py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-[var(--oh-border)]">{saleDetail.lines.map((line) => <tr key={line.id}>
                <td className="py-2.5 pr-3 font-medium text-[var(--oh-text)]">{line.product_id ? line.product_id[1] : "Product"}</td>
                <td className="py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(line.qty)}</td>
                <td className="py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(line.price_unit, receiptCurrency)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-[var(--oh-text)]">{money(line.price_subtotal_incl, receiptCurrency)}</td>
              </tr>)}</tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] md:hidden">
              {saleDetail.lines.map((line) => (
                <div key={line.id} className="py-3">
                  <p className="break-words text-sm font-medium text-[var(--oh-text)]">{line.product_id ? line.product_id[1] : "Product"}</p>
                  <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--oh-muted)]">{new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(line.qty)} × {money(line.price_unit, receiptCurrency)}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--oh-text)]">{money(line.price_subtotal_incl, receiptCurrency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-2 text-sm">
            <span className="text-[var(--oh-muted)]">Subtotal</span><span className="text-right tabular-nums text-[var(--oh-text)]">{money(saleDetail.order.amount_total - saleDetail.order.amount_tax, receiptCurrency)}</span>
            <span className="text-[var(--oh-muted)]">Tax</span><span className="text-right tabular-nums text-[var(--oh-text)]">{money(saleDetail.order.amount_tax, receiptCurrency)}</span>
            <span className="border-t border-[var(--oh-border)] pt-2 font-semibold text-[var(--oh-text)]">Total</span><span className="border-t border-[var(--oh-border)] pt-2 text-right font-bold tabular-nums text-[var(--oh-text)]">{money(saleDetail.order.amount_total, receiptCurrency)}</span>
          </div>
          <section className="mt-5 border-t border-dashed border-[var(--oh-border)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--oh-text)]">Payments</h4>
            {saleDetail.payments.length ? <ul className="mt-2 grid gap-1.5 text-sm">{saleDetail.payments.map((payment) => <li key={payment.id} className="flex justify-between gap-3 text-[var(--oh-text-secondary)]"><span>{payment.payment_method_id ? payment.payment_method_id[1] : "Payment"}</span><span className="font-medium tabular-nums">{money(payment.amount, receiptCurrency)}</span></li>)}</ul> : <p className="mt-2 text-sm text-[var(--oh-muted)]">No payment lines recorded.</p>}
            {saleDetail.order.amount_return > 0 && <p className="mt-2 flex justify-between gap-3 text-sm text-[var(--oh-text-secondary)]"><span>Change returned</span><span>{money(saleDetail.order.amount_return, receiptCurrency)}</span></p>}
          </section>
          {refundAlreadyRecorded && <p role="status" className="receipt-print-hidden mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">A refund has already been recorded for one or more items. Additional refunds are unavailable from this full-sale refund flow.</p>}
          {refundMessage && <p role="status" className="receipt-print-hidden mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">{refundMessage}</p>}
          <footer className="receipt-print-hidden mt-6 flex flex-col gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={closeSale} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] sm:w-auto">Close</button>
            {(canRefund || pendingRefund.current) && (
              <button
                type="button"
                onClick={requestRefundConfirmation}
                disabled={refundBusy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 sm:w-auto"
              >
                {refundBusy ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                {refundBusy ? "Checking…" : pendingRefund.current ? "Check saved refund" : "Refund full sale"}
              </button>
            )}
            {canRefund && !refundConfig && (
              <p role="status" className="receipt-print-hidden mr-auto self-center text-sm text-amber-800">
                Open the original Odoo register session to refund this sale.
              </p>
            )}
            <button type="button" onClick={() => window.print()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] sm:w-auto"><Printer size={16} /> Print receipt</button>
          </footer>
        </section>}
      </div>}

      {confirmingRefund && saleDetail && canRefund && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="refund-sale-title"
            aria-describedby="refund-sale-description"
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl"
          >
            <h2 id="refund-sale-title" className="text-lg font-semibold text-[var(--oh-text)]">Confirm full refund</h2>
            <p id="refund-sale-description" className="mt-2 text-sm leading-6 text-[var(--oh-text-secondary)]">
              Record a refund against <strong>{saleDetail.order.pos_reference || saleDetail.order.name}</strong> for <strong>{money(Math.abs(saleDetail.order.amount_total), receiptCurrency)}</strong>?
              This creates a financial transaction in Odoo and cannot be undone from this page.
              For a non-cash refund, return the funds on the external terminal first. Confirming here records that refund and does not send funds to the card.
            </p>
            {refundConfig && refundConfig.paymentMethods.length > 1 && (
              <label className="mt-4 grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
                Refund payment method
                <select
                  value={refundPaymentMethodId ?? ""}
                  onChange={(event) => setRefundPaymentMethodId(Number(event.target.value))}
                  className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal"
                >
                  {refundConfig.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                </select>
              </label>
            )}
            {refundMessage && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{refundMessage}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingRefund(false)}
                disabled={refundBusy}
                className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void refundSale()}
                disabled={refundBusy}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {refundBusy && <LoaderCircle size={16} className="animate-spin" />}
                {refundBusy ? "Recording…" : "Record full refund"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
