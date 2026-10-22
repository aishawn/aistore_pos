"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, LoaderCircle, RefreshCw, Search, Wallet } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import {
  getOdooCustomerBalances,
  getOdooCustomerInvoices,
  getOdooSession,
  type OdooCustomerBalanceRecord,
  type OdooCustomerInvoiceRecord,
} from "@/lib/odoo-api";
import { useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 40;
const money = (amount: number) => `$${Number(amount).toFixed(2)}`;

export function OdooCustomerBalancesPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooCustomerBalanceRecord[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [owingOnly, setOwingOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<OdooCustomerBalanceRecord | null>(null);
  const [invoices, setInvoices] = useState<OdooCustomerInvoiceRecord[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useEffect(() => {
    void getOdooSession().then((user) => setConnected(Boolean(user))).catch(() => setConnected(false));
  }, [refreshKey]);

  const load = useCallback(async () => {
    if (connected !== true) return;
    setLoading(true);
    setError(null);
    try {
      const page = await getOdooCustomerBalances({
        query: debouncedQuery,
        owingOnly,
        offset,
        limit: PAGE_SIZE,
      });
      setItems(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load customer balances.");
    } finally {
      setLoading(false);
    }
  }, [connected, debouncedQuery, owingOnly, offset]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setOffset(0); }, [debouncedQuery, owingOnly]);

  async function openStatements(customer: OdooCustomerBalanceRecord) {
    setSelected(customer);
    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const result = await getOdooCustomerInvoices(customer.id, true);
      setInvoices(result.items);
    } catch (cause) {
      setInvoices([]);
      setInvoiceError(cause instanceof Error ? cause.message : "Could not load open invoices.");
    } finally {
      setInvoiceLoading(false);
    }
  }

  if (connected === false) {
    return (
      <AdminPageLayout title="Balances" subtitle="Customer receivable balances from Odoo">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <AlertCircle className="mb-2" size={20} />
          <p className="font-semibold">Connect Odoo to view balances</p>
          <Link href="/settings/integrations" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Odoo</Link>
        </section>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Balances"
      subtitle="Odoo total receivable (credit) and open customer invoices. Payments stay in Odoo Accounting for this pilot."
      count={loading || error ? undefined : items.length}
      countLabel="Customers on this page"
      actions={
        <AdminSecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </AdminSecondaryButton>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-11 max-w-xl flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3">
          <Search size={16} className="text-[var(--oh-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search customer balances" />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--oh-text)]">
          <input type="checkbox" checked={owingOnly} onChange={(event) => setOwingOnly(event.target.checked)} className="h-4 w-4" />
          Owing only
        </label>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 font-semibold">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
        <table className="hidden w-full text-left text-sm lg:table">
          <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Price list</th>
              <th className="px-4 py-3 text-right">Total invoiced</th>
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
                  <p className="text-xs text-[var(--oh-muted)]">Odoo #{row.id}{row.ref ? ` · ${row.ref}` : ""}</p>
                </td>
                <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{row.pricelist ?? "—"}</td>
                <td className="px-4 py-3 text-right text-[var(--oh-text-secondary)]">{money(row.totalInvoiced)}</td>
                <td className="px-4 py-3 text-right font-semibold text-[var(--oh-text)]">{money(row.credit)}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => void openStatements(row)} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] px-3">Open invoices</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--oh-border)] lg:hidden">
          {items.map((row) => (
            <article key={row.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--oh-text)]">{row.name}</p>
                  <p className="text-xs text-[var(--oh-muted)]">{row.pricelist ?? "No price list"}</p>
                </div>
                <p className="font-semibold text-[var(--oh-text)]">{money(row.credit)}</p>
              </div>
              <button type="button" onClick={() => void openStatements(row)} className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--oh-border)]">Open invoices</button>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-4 flex items-center justify-between gap-2 text-sm text-[var(--oh-muted)]">
        <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Previous</button>
          <button type="button" disabled={!hasNext || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Next</button>
        </div>
      </footer>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/40 p-0 sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="balance-invoices-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl sm:rounded-xl">
            <header className="flex items-start justify-between gap-3">
              <div>
                <button type="button" onClick={() => setSelected(null)} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--oh-primary)] sm:hidden"><ChevronLeft size={16} /> Back</button>
                <h2 id="balance-invoices-title" className="text-lg font-semibold text-[var(--oh-text)]">{selected.name}</h2>
                <p className="mt-1 text-sm text-[var(--oh-muted)]">Owing {money(selected.credit)} · open posted invoices</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="hidden h-11 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold sm:inline-flex sm:items-center">Close</button>
            </header>
            {invoiceLoading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading invoices…</p>
            ) : invoiceError ? (
              <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{invoiceError}</p>
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
                      <p className="font-semibold text-[var(--oh-text)]">{money(invoice.amountResidual)}</p>
                      <p className="text-xs text-[var(--oh-muted)]">of {money(invoice.amountTotal)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminPageLayout>
  );
}
