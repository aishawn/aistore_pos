"use client";

import { ModalOverlay } from "@/components/ModalOverlay";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { OdooRecordLink } from "@/components/OdooRecordLink";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { AlertCircle, ChevronLeft, LoaderCircle, RefreshCw, Search, Wallet, X } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import {
  getRetailCustomerBalances,
  getRetailCustomerInvoices,
  getOrithosSession,
  type RetailCustomerBalanceRecord,
  type RetailCustomerInvoiceRecord,
} from "@/lib/retail-api";
import { useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 40;
const money = (amount: number | null | undefined, currency?: string | null) =>
  amount == null || Number.isNaN(Number(amount))
    ? "—"
    : `${currency ?? ""} ${Number(amount).toFixed(2)}`;

export function OdooCustomerBalancesPage() {
  const revision = useRef(0);
  const invoiceRevision = useRef(0);
  const autoOpened = useRef(false);
  const [invoiceOffset, setInvoiceOffset] = useState(0);
  const [invoiceHasNext, setInvoiceHasNext] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<RetailCustomerBalanceRecord[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [owingOnly, setOwingOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<RetailCustomerBalanceRecord | null>(null);
  const [invoices, setInvoices] = useState<RetailCustomerInvoiceRecord[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useDialogFocus(Boolean(selected), () => { invoiceRevision.current++; setSelected(null); });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("q")) setQuery(params.get("q")!);
    if (params.get("customerId")) setOwingOnly(false);
  }, []);

  useEffect(() => {
    void getOrithosSession().then((user) => setConnected(Boolean(user))).catch(() => setConnected(false));
  }, [refreshKey]);

  const load = useCallback(async () => {
    if (connected !== true) return;
    const request = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getRetailCustomerBalances({
        query: debouncedQuery,
        owingOnly,
        offset,
        limit: PAGE_SIZE,
      });
      if (request !== revision.current) return;
      setItems(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      if (request !== revision.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load customer balances.");
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, owingOnly, offset]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setOffset(0); }, [debouncedQuery, owingOnly]);

  const openStatements = useCallback(async (customer: RetailCustomerBalanceRecord, nextOffset = 0) => {
    const request = ++invoiceRevision.current;
    setInvoiceOffset(nextOffset);
    setSelected(customer);
    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const result = await getRetailCustomerInvoices(customer.id, true, nextOffset);
      if (request !== invoiceRevision.current) return;
      setInvoices(result.items);
      setInvoiceHasNext(result.hasNext);
    } catch (cause) {
      if (request !== invoiceRevision.current) return;
      setInvoices([]);
      setInvoiceError(cause instanceof Error ? cause.message : "Could not load open invoices.");
    } finally {
      if (request === invoiceRevision.current) setInvoiceLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("customerId"));
    const customer = items.find((row) => row.id === id);
    if (!autoOpened.current && customer) { autoOpened.current = true; void openStatements(customer); }
  }, [items, openStatements]);

  if (connected === false) {
    return (
      <AdminPageLayout title="Receivables" subtitle="Customer receivable balances from Orithos">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <AlertCircle className="mb-2" size={20} />
          <p className="font-semibold">Connect Orithos to view balances</p>
          <Link href="/settings/integrations" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Orithos</Link>
        </section>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Receivables"
      subtitle="Customer balances (current owing). Total invoiced rebuild is not enabled yet."
      compact
      count={loading || error ? undefined : items.length}
      countLabel="Customers on this page"
      actions={
        <AdminSecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </AdminSecondaryButton>
      }
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-[var(--oh-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <OdooRecordLink model="account.move">Open Orithos Accounting</OdooRecordLink>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 sm:w-[min(28rem,42vw)]">
            <Search size={16} className="shrink-0 text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search customer balances" />
          </label>
          <label className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-[var(--oh-text)]">
            <input type="checkbox" checked={owingOnly} onChange={(event) => setOwingOnly(event.target.checked)} className="h-4 w-4" />
            Owing only
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 font-semibold">Retry</button>
        </div>
      )}

      {!error && items.length === 0 && <p role="status" className="mb-4 text-sm lg:hidden">{loading ? "Loading receivables…" : "No matching customer balances"}</p>}
      <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
        <table className="hidden w-full text-left text-sm lg:table">
          <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Price list</th>
              <th className="px-4 py-3 text-right">Invoiced total</th>
              <th className="px-4 py-3 text-right">Owing</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {loading && items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-[var(--oh-muted)]"><LoaderCircle className="mr-2 inline animate-spin" size={15} />Loading balances…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--oh-muted)]"><Wallet className="mx-auto mb-2" size={20} />{owingOnly ? "No customers currently owe a balance" : "No customer balances found"}</td></tr>
            ) : items.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--oh-text)]">{row.name}</p>
                  <p className="text-xs text-[var(--oh-muted)]">Orithos #{row.id}{row.ref ? ` · ${row.ref}` : ""}</p>
                </td>
                <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{row.pricelist ?? "—"}</td>
                <td className="px-4 py-3 text-right text-[var(--oh-text-secondary)]">{money(row.totalInvoiced, row.currency)}</td>
                <td className="px-4 py-3 text-right font-semibold text-[var(--oh-text)]">{money(row.credit, row.currency)}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" disabled={loading || Boolean(error)} onClick={() => void openStatements(row)} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] px-3">Open invoices</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--oh-border)] lg:hidden">
          {!items.length && !error && <p role="status" className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">{loading ? "Loading receivables…" : "No customers found"}</p>}
          {items.map((row) => (
            <article key={row.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--oh-text)]">{row.name}</p>
                  <p className="text-xs text-[var(--oh-muted)]">{row.pricelist ?? "No price list"}</p>
                </div>
                <p className="font-semibold text-[var(--oh-text)]">{money(row.credit, row.currency)}</p>
              </div>
              <button type="button" disabled={loading || Boolean(error)} onClick={() => void openStatements(row)} className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--oh-border)]">Open invoices</button>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 pr-32 text-sm text-[var(--oh-muted)]">
        <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Previous</button>
          <button type="button" disabled={!hasNext || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Next</button>
        </div>
      </footer>

      {selected && (
        <ModalOverlay className="fixed inset-0 z-[90] grid place-items-end bg-slate-950/40 p-0 sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="balance-invoices-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl sm:rounded-xl">
            <header className="flex items-start justify-between gap-3">
              <div>
                <button type="button" onClick={() => setSelected(null)} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--oh-primary)] sm:hidden"><ChevronLeft size={16} /> Back</button>
                <h2 id="balance-invoices-title" className="text-lg font-semibold text-[var(--oh-text)]">{selected.name}</h2>
                <p className="mt-1 text-sm text-[var(--oh-muted)]">Owing {money(selected.credit, selected.currency)} · open posted invoices</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="hidden h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:grid"><X size={18} /></button>
            </header>
            {invoiceLoading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading invoices…</p>
            ) : invoiceError ? (
              <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{invoiceError} <button type="button" onClick={() => void openStatements(selected, invoiceOffset)} className="min-h-11 underline">Retry invoices</button></p>
            ) : invoices.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--oh-muted)]">No open invoices for this customer.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)]">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-[var(--oh-text)]">{invoice.name}</p>
                      <p className="text-xs text-[var(--oh-muted)]">
                        {invoice.moveType === "out_refund" ? "Credit note" : "Invoice"}
                        {invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}
                        {` · ${invoice.paymentState.replaceAll("_", " ")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[var(--oh-text)]">{money(invoice.amountResidual, invoice.currency)}</p>
                      <p className="text-xs text-[var(--oh-muted)]">of {money(invoice.amountTotal, invoice.currency)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!invoiceLoading && !invoiceError && <div className="mt-4 flex justify-between"><button type="button" disabled={invoiceOffset === 0} onClick={() => void openStatements(selected, Math.max(0, invoiceOffset - 50))} className="min-h-11 disabled:opacity-40">Previous invoices</button><button type="button" disabled={!invoiceHasNext} onClick={() => void openStatements(selected, invoiceOffset + 50)} className="min-h-11 disabled:opacity-40">Next invoices</button></div>}
            <div className="mt-4"><OdooRecordLink model="res.partner" id={selected.id}>View account in Orithos</OdooRecordLink></div>
          </section>
        </ModalOverlay>
      )}
    </AdminPageLayout>
  );
}
