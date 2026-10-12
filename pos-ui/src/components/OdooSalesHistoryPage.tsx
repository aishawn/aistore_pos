"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, LoaderCircle, Printer, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSaleDetail,
  getOdooSession,
  searchOdooRecords,
  submitOdooPosOrder,
  type OdooPosBootstrap,
  type OdooSaleDetail,
  type OdooSaleRecord,
} from "@/lib/odoo-api";

const PAGE_SIZE = 40;
const money = (amount: number, currency = "AUD") => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);

function formatOrderDate(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

export function OdooSalesHistoryPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooSaleRecord[]>([]);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saleDetail, setSaleDetail] = useState<OdooSaleDetail | null>(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [saleDetailError, setSaleDetailError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
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
        searchOdooRecords<OdooSaleRecord>("sales", { query, limit: PAGE_SIZE, offset }),
        getOdooPosBootstrap().catch(() => null),
      ]);
      if (revision !== requestRevision.current) return;
      setItems(page.items);
      setHasNext(page.items.length === PAGE_SIZE);
      if (pos) setBootstrap(pos);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo sales.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [offset, query]);

  useEffect(() => { void loadSales(); }, [loadSales]);

  function updateQuery(value: string) {
    setQuery(value);
    setOffset(0);
  }

  async function openSale(saleId: number) {
    const revision = ++detailRevision.current;
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
    detailRevision.current += 1;
    setSaleDetail(null);
    setSaleDetailLoading(false);
    setSaleDetailError(null);
    setRefundMessage(null);
    setRefundComplete(false);
  }

  async function refundSale() {
    if (!saleDetail || refundBusy) return;
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
    setRefundMessage(null);
    try {
      const amount = Math.abs(saleDetail.order.amount_total);
      const result = await submitOdooPosOrder({
        configId: openConfig.id,
        paymentMethodId,
        orderUuid: crypto.randomUUID(),
        customerId: Array.isArray(saleDetail.order.partner_id) ? saleDetail.order.partner_id[0] : null,
        tendered: amount,
        refundOfOrderId: saleDetail.order.id,
        lines,
      });
      setRefundMessage(`Refund recorded as ${result.receipt}. Total ${money(result.total)}.`);
      setRefundComplete(true);
      setConfirmingRefund(false);
      void loadSales();
    } catch (cause) {
      setRefundMessage(cause instanceof Error ? cause.message : "Refund failed.");
      setConfirmingRefund(false);
    } finally {
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
  const sourceConfigId = saleDetail && Array.isArray(saleDetail.order.config_id) ? saleDetail.order.config_id[0] : null;
  const refundConfig = bootstrap?.configs.find((item) => item.id === sourceConfigId && item.session && item.paymentMethods.length) ?? null;

  function requestRefundConfirmation() {
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
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Sales History</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Sales recorded by the Odoo register, newest first.</p>
        </div>
        <button type="button" onClick={() => void loadSales()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view sales</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect with your Odoo staff account to view the sales available to that account.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search receipt or order reference" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>

          {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Date &amp; time</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Register session</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading sales…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-16 text-center text-[var(--oh-muted)]">{query ? "No sales match this reference." : "No Odoo sales are available for this account."}</td></tr>
                ) : items.map((sale) => (
                  <tr key={sale.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3"><button type="button" onClick={() => void openSale(sale.id)} className="inline-flex items-center gap-1.5 font-semibold text-[var(--oh-orange-dark)] hover:underline"><FileText size={15} />{sale.pos_reference || sale.name}</button></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{formatOrderDate(sale.date_order)}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{sale.partner_id ? sale.partner_id[1] : "Walk-in customer"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{sale.session_id ? sale.session_id[1] : "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{stateLabel(sale.state)}</span></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(sale.amount_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="flex items-center justify-between text-sm text-[var(--oh-muted)]">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {(saleDetailLoading || saleDetailError || saleDetail) && <div className="receipt-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSale(); }}>
        {saleDetailLoading && <section role="status" className="rounded-xl bg-white p-8 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={22} className="mx-auto animate-spin" /><span className="mt-2 block">Loading sale details…</span></section>}
        {saleDetailError && <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-[var(--oh-text)]">Could not open receipt</h2><p className="mt-2 text-sm text-red-800">{saleDetailError}</p><button type="button" onClick={closeSale} className="mt-5 h-10 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Close</button></section>}
        {saleDetail && <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="receipt-print my-auto w-full max-w-2xl rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl md:p-7">
          <header className="receipt-print-hidden mb-4 flex items-start justify-between gap-4 border-b border-[var(--oh-border)] pb-4">
            <div><h2 id="receipt-title" className="text-lg font-semibold text-[var(--oh-text)]">Sale receipt</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Review this Odoo order or print a copy.</p></div>
            <button type="button" onClick={closeSale} aria-label="Close receipt" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"><X size={18} /></button>
          </header>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--oh-muted)]">{saleDetail.company?.name || "Orithos POS"}</p>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-[var(--oh-text)]">{saleDetail.order.pos_reference || saleDetail.order.name}</h3>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">{formatOrderDate(saleDetail.order.date_order)}</p>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">{saleDetail.order.session_id ? saleDetail.order.session_id[1] : "POS sale"} · {saleDetail.order.user_id ? saleDetail.order.user_id[1] : "Staff"}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
            <span className="text-[var(--oh-muted)]">Customer</span><span className="text-right font-medium text-[var(--oh-text)]">{saleDetail.order.partner_id ? saleDetail.order.partner_id[1] : "Walk-in customer"}</span>
            <span className="text-[var(--oh-muted)]">Status</span><span className="text-right font-medium text-[var(--oh-text)]">{stateLabel(saleDetail.order.state)}</span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><th className="py-2 text-left">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-[var(--oh-border)]">{saleDetail.lines.map((line) => <tr key={line.id}>
                <td className="py-2.5 pr-3 font-medium text-[var(--oh-text)]">{line.product_id ? line.product_id[1] : "Product"}</td>
                <td className="py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(line.qty)}</td>
                <td className="py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(line.price_unit, receiptCurrency)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-[var(--oh-text)]">{money(line.price_subtotal_incl, receiptCurrency)}</td>
              </tr>)}</tbody>
            </table>
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
          {refundMessage && <p role="status" className="receipt-print-hidden mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">{refundMessage}</p>}
          <footer className="receipt-print-hidden mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--oh-border)] pt-4">
            <button type="button" onClick={closeSale} className="h-10 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)]">Close</button>
            {canRefund && (
              <button
                type="button"
                onClick={requestRefundConfirmation}
                disabled={refundBusy}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                {refundBusy ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                {refundBusy ? "Refunding…" : "Refund full sale"}
              </button>
            )}
            {canRefund && !refundConfig && (
              <p role="status" className="receipt-print-hidden mr-auto self-center text-sm text-amber-800">
                Open the original Odoo register session to refund this sale.
              </p>
            )}
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><Printer size={16} /> Print receipt</button>
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
                className="h-10 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void refundSale()}
                disabled={refundBusy}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
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
