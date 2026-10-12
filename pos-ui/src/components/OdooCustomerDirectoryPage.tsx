"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, Mail, Phone, RefreshCw, Search, UserRound } from "lucide-react";
import { getOdooSession, searchOdooRecords, type OdooCustomerRecord } from "@/lib/odoo-api";

const PAGE_SIZE = 40;

export function OdooCustomerDirectoryPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooCustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRevision = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    void getOdooSession().then((user) => {
      if (!cancelled) setConnected(Boolean(user));
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check the Odoo connection.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const loadCustomers = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooCustomerRecord>("customers", { query: debouncedQuery, limit: PAGE_SIZE, offset });
      if (revision !== requestRevision.current) return;
      setItems(page.items);
      setHasNext(page.items.length === PAGE_SIZE);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo customers.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset, refreshKey]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Customers</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Customer records available to your Odoo staff account.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view customers</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Odoo staff account to see customers used by the Odoo register.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or customer code" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading customers…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center text-[var(--oh-muted)]">{debouncedQuery ? "No customers match this search." : "No customers are available to this Odoo account."}</td></tr>
                ) : items.map((customer) => (
                  <tr key={customer.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-[var(--oh-text)]"><UserRound size={16} className="text-[var(--oh-muted)]" />{customer.name}</span><span className="ml-6 block text-xs text-[var(--oh-muted)]">Odoo #{customer.id}</span></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.phone ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={14} />{customer.phone}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.email ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={14} />{customer.email}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.ref || "—"}</td>
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
