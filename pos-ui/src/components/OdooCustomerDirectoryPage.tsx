"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, Mail, Pencil, Phone, Plus, RefreshCw, Search, UserRound, X } from "lucide-react";
import { createOdooCustomer, getOdooPosBootstrap, getOdooSession, searchOdooRecords, updateOdooCustomer, type OdooCustomerRecord } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";

const PAGE_SIZE = 40;

function CustomerEmptyState({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return (
    <div role="status" className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
        <UserRound size={19} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[var(--oh-text)]">
        {searching ? "No customers match this search" : "No customers available"}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">
        {searching ? "Try another name, phone number, email or customer code." : "Customer records available to this Odoo account will appear here."}
      </p>
      {searching && (
        <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          Clear search
        </button>
      )}
    </div>
  );
}

export function OdooCustomerDirectoryPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [items, setItems] = useState<OdooCustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<OdooCustomerRecord | null>(null);
  const requestRevision = useRef(0);
  useDialogFocus(createOpen, () => {
    if (!creating) {
      setCreateOpen(false);
      setEditingCustomer(null);
    }
  });

  function clearSearch() {
    setQuery("");
    setDebouncedQuery("");
    setOffset(0);
  }

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
        setConnected(null);
        setError(cause instanceof Error ? cause.message : "Could not check the Odoo connection.");
      }
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey]);

  useEffect(() => {
    if (connected !== true) return;
    let cancelled = false;
    void getOdooPosBootstrap().then((bootstrap) => {
      if (cancelled) return;
      const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
      if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
    }).catch(() => {
      // Keep Adelaide as the display fallback when bootstrap is unavailable.
    });
    return () => { cancelled = true; };
  }, [connected]);

  const loadCustomers = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooCustomerRecord>("customers", { query: debouncedQuery, limit: PAGE_SIZE + 1, offset });
      if (revision !== requestRevision.current) return;
      setItems(page.items.slice(0, PAGE_SIZE));
      setHasNext(page.items.length > PAGE_SIZE);
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo customers.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers, refreshKey]);

  async function submitCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    setCreating(true);
    setCreateError(null);
    try {
      const values = {
        name,
        phone: String(form.get("phone") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        ref: String(form.get("ref") ?? "").trim(),
      };
      if (editingCustomer) {
        await updateOdooCustomer(editingCustomer.id, values);
      } else {
        await createOdooCustomer(values);
      }
      setCreateOpen(false);
      setEditingCustomer(null);
      setOffset(0);
      if (!editingCustomer) setQuery(name);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : `Could not ${editingCustomer ? "update" : "create"} this Odoo customer.`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex shrink-0 flex-col items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Customers</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">
            Customer records available to your Odoo staff account.
            {lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setEditingCustomer(null); setCreateOpen(true); setCreateError(null); }} disabled={connected !== true} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New customer</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh customers" title="Refresh customers" className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view customers</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Odoo staff account to see customers used by the Odoo register.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 w-full max-w-xl shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input aria-label="Search customers by name, phone, email or customer code" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or customer code" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => { setConnectionRetryKey((value) => value + 1); setRefreshKey((value) => value + 1); }} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Odoo customers" className="hidden w-full min-w-[840px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th scope="col" className="px-4 py-3">Customer</th><th scope="col" className="px-4 py-3">Phone</th><th scope="col" className="px-4 py-3">Email</th><th scope="col" className="px-4 py-3">Reference</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => <tr key={`customer-skeleton-${index}`} aria-hidden="true">
                  <td colSpan={5} className="px-4 py-3"><div className="grid grid-cols-[1.3fr_1fr_1.25fr_1fr_.55fr] items-center gap-4">
                    <span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="ml-auto h-11 w-16 animate-pulse rounded-lg bg-[var(--oh-border)]" />
                  </div></td>
                </tr>) : items.length === 0 ? (
                  <tr><td colSpan={5} className="p-0"><CustomerEmptyState searching={Boolean(debouncedQuery)} onClear={clearSearch} /></td></tr>
                ) : items.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-[var(--oh-text)]"><UserRound size={16} className="text-[var(--oh-muted)]" />{customer.name}</span><span className="ml-6 block text-xs text-[var(--oh-muted)]">Odoo #{customer.id}</span></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.phone ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={14} />{customer.phone}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.email ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={14} />{customer.email}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.ref || "—"}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditingCustomer(customer); setCreateError(null); setCreateOpen(true); }} disabled={connected !== true} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><Pencil size={14} /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" aria-label="Loading customers" className="divide-y divide-[var(--oh-border)]">
                  {Array.from({ length: 6 }, (_, index) => <div key={`customer-mobile-skeleton-${index}`} aria-hidden="true" className="px-4 py-4">
                    <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)]" />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2"><span className="h-11 animate-pulse rounded-lg bg-[var(--oh-surface)]" /><span className="h-11 animate-pulse rounded-lg bg-[var(--oh-surface)]" /></div>
                    <div className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3"><span className="h-11 w-16 animate-pulse rounded-lg bg-[var(--oh-border)]" /></div>
                  </div>)}
                  <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading customers…</p>
                </div>
              ) : items.length === 0 ? (
                <CustomerEmptyState searching={Boolean(debouncedQuery)} onClear={clearSearch} />
              ) : items.map((customer) => (
                <article key={customer.id} className="px-4 py-3.5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-[var(--oh-text)]">{customer.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo #{customer.id}{customer.ref ? ` · ${customer.ref}` : ""}</p>
                    </div>
                  </header>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {customer.phone ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{customer.phone}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Phone size={15} />No phone</p>}
                    {customer.email ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{customer.email}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Mail size={15} />No email</p>}
                  </div>
                  <footer className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3">
                    <button type="button" onClick={() => { setEditingCustomer(customer); setCreateError(null); setCreateOpen(true); }} disabled={connected !== true} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><Pencil size={14} /> Edit</button>
                  </footer>
                </article>
              ))}
            </div>
          </section>

          <footer className="flex shrink-0 flex-col gap-2 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{items.length ? `Page ${Math.floor(offset / PAGE_SIZE) + 1} · Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {createOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) { setCreateOpen(false); setEditingCustomer(null); } }}>
        <section role="dialog" aria-modal="true" aria-labelledby="customer-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="customer-create-title" className="text-lg font-semibold text-[var(--oh-text)]">{editingCustomer ? "Edit customer" : "New customer"}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingCustomer ? "Update this customer record in Odoo." : "Create a contact in Odoo for sales and customer lookup."}</p></div>
            <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key={editingCustomer?.id ?? "new-customer"} onSubmit={(event) => void submitCustomer(event)} className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Customer name <span className="text-red-700">*</span></span>
              <input name="name" autoFocus defaultValue={editingCustomer?.name ?? ""} maxLength={120} required className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone
                <input name="phone" type="tel" autoComplete="tel" defaultValue={editingCustomer?.phone || ""} maxLength={32} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email
                <input name="email" type="email" autoComplete="email" defaultValue={editingCustomer?.email || ""} maxLength={254} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Customer reference
              <input name="ref" defaultValue={editingCustomer?.ref || ""} maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={creating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {editingCustomer ? "Save changes" : "Create customer"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
