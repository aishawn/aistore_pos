"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { getOdooSession, searchOdooRecords, type OdooSaleRecord } from "@/lib/odoo-api";

const PAGE_SIZE = 40;
const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

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
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRevision = useRef(0);

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
      const page = await searchOdooRecords<OdooSaleRecord>("sales", { query, limit: PAGE_SIZE, offset });
      if (revision !== requestRevision.current) return;
      setItems(page.items);
      setHasNext(page.items.length === PAGE_SIZE);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo sales.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [offset, query, refreshKey]);

  useEffect(() => { void loadSales(); }, [loadSales]);

  function updateQuery(value: string) {
    setQuery(value);
    setOffset(0);
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Odoo Sales History</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Sales recorded by the Odoo register, newest first.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
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
                    <td className="px-4 py-3 font-semibold text-[var(--oh-text)]">{sale.pos_reference || sale.name}</td>
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
    </main>
  );
}
