"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, LoaderCircle, Mail, Phone, Plus, RefreshCw, Search, Store, X } from "lucide-react";
import { api, type Page } from "@/lib/api";
import { useDialogFocus } from "@/hooks/useDialogFocus";

const PAGE_SIZE = 40;

interface SupplierRecord {
  id: string | number;
  name: string;
  phone?: string | null;
  email?: string | null;
  businessNumber?: string | null;
  accountNumber?: string | null;
}

function SupplierEmptyState({ hasSearch, onClear, onAdd }: { hasSearch: boolean; onClear: () => void; onAdd: () => void }) {
  return (
    <div role="status" className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><Store size={20} aria-hidden="true" /></span>
      <h2 className="mt-4 text-sm font-semibold text-[var(--oh-text)]">{hasSearch ? "No suppliers found" : "No suppliers yet"}</h2>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">{hasSearch ? "Try a different name, phone, email or reference." : "Add a distributor to use it when preparing purchase requests."}</p>
      {hasSearch ? (
        <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear search</button>
      ) : (
        <button type="button" onClick={onAdd} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Plus size={15} /> Add supplier</button>
      )}
    </div>
  );
}

export function SupplierDirectoryPage() {
  return <SupplierDirectory />;
}

function SupplierDirectory() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [items, setItems] = useState<SupplierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const nextOffset = useRef(0);
  const requestBusy = useRef(false);
  const loadedFilters = useRef("");
  const failedAppend = useRef(false);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollRoot = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery !== null) setQuery(initialQuery);
  }, [searchParams]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", phone: "", email: "", vat: "", ref: "" });
  const requestRevision = useRef(0);
  const supplierNameInputRef = useRef<HTMLInputElement>(null);
  useDialogFocus(createOpen, () => {
    if (!creating) setCreateOpen(false);
  }, undefined, supplierNameInputRef);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setCheckingConnection(true);
    void api.get<unknown>("/api/auth/me").then(() => {
      if (!cancelled) setConnected(true);
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check your Orithos session.");
      }
    }).finally(() => {
      if (!cancelled) setCheckingConnection(false);
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey]);

  const loadSuppliers = useCallback(async (append = false) => {
    if (connected !== true) return;
    if (append && requestBusy.current) return;
    requestBusy.current = true;
    const offset = append ? nextOffset.current : 0;
    const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
    if (!append) { setHasNext(false); nextOffset.current = 0; }
    const revision = ++requestRevision.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const page = await api.get<Page<SupplierRecord>>("/api/suppliers", {
        name: debouncedQuery || undefined,
        page: pageNumber,
        size: PAGE_SIZE,
      });
      if (revision !== requestRevision.current) return;
      if (append && !page.items.length && offset < page.total) throw new Error("The next batch was empty. Retry to continue.");
      setItems((previous) => append ? [...previous, ...page.items.filter((row) => !previous.some((item) => item.id === row.id))] : page.items);
      nextOffset.current = offset + page.items.length;
      setHasNext(nextOffset.current < page.total);
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) { failedAppend.current = append; setError(cause instanceof Error ? cause.message : "Could not load Orithos suppliers."); }
    } finally {
      if (revision === requestRevision.current) { requestBusy.current = false; setLoading(false); setLoadingMore(false); }
    }
  }, [connected, debouncedQuery]);

  useEffect(() => {
    const filters = JSON.stringify([connected, debouncedQuery]);
    if (loadedFilters.current !== filters) { setItems([]); loadedFilters.current = filters; }
    scrollRoot.current?.scrollTo({ top: 0 });
    void loadSuppliers();
    return () => { requestRevision.current += 1; requestBusy.current = false; };
  }, [loadSuppliers, refreshKey, connected, debouncedQuery]);
  useEffect(() => {
    const node = sentinel.current; const root = scrollRoot.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasNext && !loading && !loadingMore && !error) void loadSuppliers(true);
    }, { root, rootMargin: "480px 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, [hasNext, loading, loadingMore, error, loadSuppliers]);

  async function createSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.post("/api/suppliers", {
        name: createForm.name,
        phone: createForm.phone || null,
        email: createForm.email || null,
        businessNumber: createForm.vat || null,
        accountNumber: createForm.ref || null,
      });
      setCreateOpen(false);
      setCreateForm({ name: "", phone: "", email: "", vat: "", ref: "" });
      setQuery("");
      setDebouncedQuery("");

      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Could not create the supplier.");
    } finally {
      setCreating(false);
    }
  }

  function openCreateSupplier() {
    setCreateError(null);
    setCreateOpen(true);
  }

  function clearSearch() {
    setQuery("");
    setDebouncedQuery("");

  }

  return (
    <main ref={scrollRoot} data-testid="supplier-results-scroll" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain bg-[var(--oh-surface)] px-4 pb-4 md:px-6 md:pb-6">
      <header className="mt-4 flex flex-col items-stretch gap-3 md:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Suppliers</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Supplier contacts available to your Orithos staff account.{lastLoadedAt !== null && <span className="ml-2">Last refreshed {new Date(lastLoadedAt).toLocaleTimeString()}.</span>}</p>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-2 sm:flex">
          <Link href="/stock/replenishment" className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:px-3"><span className="sm:hidden">Replenish</span><span className="hidden sm:inline">Open replenishment</span></Link>
          <button type="button" onClick={openCreateSupplier} disabled={connected !== true} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"><Plus size={16} /> Add supplier</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={connected !== true || loading} aria-label="Refresh suppliers" title="Refresh suppliers" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:gap-2 sm:px-3">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}<span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Supplier service unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Your signed-in Orithos account could not load suppliers. Retry the connection.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setConnectionRetryKey((value) => value + 1)} disabled={checkingConnection} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">{checkingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {checkingConnection ? "Retrying…" : "Retry connection"}</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 w-full max-w-xl items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input aria-label="Search suppliers by name, phone, email, ABN or reference" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or ABN" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => void loadSuppliers(failedAppend.current)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <section className="shrink-0 overflow-visible rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Orithos suppliers" className="hidden w-full min-w-[760px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]">
                <tr><th scope="col" className="px-4 py-3">Supplier</th><th scope="col" className="px-4 py-3">Contact</th><th scope="col" className="px-4 py-3">ABN / Tax ID</th><th scope="col" className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => <tr key={`supplier-skeleton-${index}`} aria-hidden="true">
                  <td colSpan={4} className="px-4 py-3"><div className="grid grid-cols-[1.3fr_1.35fr_1fr_1fr] items-center gap-4">
                    <span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" />
                  </div></td>
                </tr>) : items.length === 0 ? (
                  <tr><td colSpan={4} className="p-0"><SupplierEmptyState hasSearch={Boolean(debouncedQuery)} onClear={clearSearch} onAdd={openCreateSupplier} /></td></tr>
                ) : items.map((supplier) => (
                  <tr key={supplier.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-[var(--oh-text)]"><Store size={16} className="text-[var(--oh-muted)]" />{supplier.name}</span><span className="ml-6 block text-xs text-[var(--oh-muted)]">Orithos #{supplier.id}</span></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">
                      {supplier.phone && <a className="mb-1 inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`tel:${encodeURIComponent(supplier.phone)}`}><Phone size={14} />{supplier.phone}</a>}
                      {supplier.email && <a className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded px-1 text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(supplier.email)}`}><Mail size={14} /><span className="break-all">{supplier.email}</span></a>}
                      {!supplier.phone && !supplier.email && "—"}
                    </td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{supplier.businessNumber || "—"}</td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{supplier.accountNumber || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" aria-label="Loading suppliers" className="divide-y divide-[var(--oh-border)]">
                  {Array.from({ length: 6 }, (_, index) => <div key={`supplier-mobile-skeleton-${index}`} aria-hidden="true" className="px-4 py-4">
                    <div className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)]" />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2"><span className="h-11 animate-pulse rounded-lg bg-[var(--oh-surface)]" /><span className="h-11 animate-pulse rounded-lg bg-[var(--oh-surface)]" /></div>
                    <div className="mt-2 grid grid-cols-2 gap-2"><span className="h-10 animate-pulse rounded-lg bg-[var(--oh-surface)]" /><span className="h-10 animate-pulse rounded-lg bg-[var(--oh-surface)]" /></div>
                  </div>)}
                  <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading suppliers…</p>
                </div>
              ) : items.length === 0 ? (
                <SupplierEmptyState hasSearch={Boolean(debouncedQuery)} onClear={clearSearch} onAdd={openCreateSupplier} />
              ) : items.map((supplier) => (
                <article key={supplier.id} className="px-4 py-3.5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--oh-text)]">{supplier.name}</p><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Orithos #{supplier.id}</p></div>
                  </header>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {supplier.phone ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`tel:${encodeURIComponent(supplier.phone)}`}><Phone size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{supplier.phone}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Phone size={15} />No phone</p>}
                    {supplier.email ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] transition-colors hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(supplier.email)}`}><Mail size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{supplier.email}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Mail size={15} />No email</p>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0 rounded-lg bg-[var(--oh-surface)] px-3 py-2"><dt className="text-[var(--oh-muted)]">ABN / Tax ID</dt><dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{supplier.businessNumber || "—"}</dd></div>
                    <div className="min-w-0 rounded-lg bg-[var(--oh-surface)] px-3 py-2"><dt className="text-[var(--oh-muted)]">Reference</dt><dd className="mt-0.5 break-words text-[var(--oh-text-secondary)]">{supplier.accountNumber || "—"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {items.length > 0 && <footer ref={sentinel} className="flex shrink-0 flex-wrap items-center justify-center gap-3 py-3 text-sm text-[var(--oh-muted)]" aria-live="polite">
            {loadingMore ? "Loading more suppliers…" : hasNext ? `Loaded ${items.length} suppliers` : `${items.length} suppliers loaded`}

            {hasNext && <button type="button" disabled={loading || loadingMore || Boolean(error)} onClick={() => void loadSuppliers(true)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] disabled:opacity-60">{loadingMore ? "Loading…" : "Load more"}</button>}
          </footer>}
        </>
      )}
      {createOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="supplier-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] p-4 sm:p-5"><div><h2 id="supplier-create-title" className="text-lg font-semibold text-[var(--oh-text)]">Add supplier to Orithos</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Use the distributor’s real business details. This creates a company contact in Orithos.</p></div><button type="button" onClick={() => setCreateOpen(false)} disabled={creating} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button></header>
          <form onSubmit={(event) => void createSupplier(event)} className="grid gap-3 p-4 sm:gap-4 sm:p-5">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Business name <span className="text-red-700">*</span></span><input ref={supplierNameInputRef} required maxLength={120} value={createForm.name} onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone<input maxLength={32} type="tel" autoComplete="tel" value={createForm.phone} onChange={(event) => setCreateForm((form) => ({ ...form, phone: event.target.value }))} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email<input maxLength={254} type="email" autoComplete="email" value={createForm.email} onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label></div>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">ABN / Tax ID<input maxLength={32} value={createForm.vat} onChange={(event) => setCreateForm((form) => ({ ...form, vat: event.target.value }))} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Internal reference<input maxLength={64} value={createForm.ref} onChange={(event) => setCreateForm((form) => ({ ...form, ref: event.target.value }))} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label></div>
            {createError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{createError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateOpen(false)} disabled={creating} className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button><button type="submit" disabled={creating} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{creating ? "Saving…" : "Create supplier"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
