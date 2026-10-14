"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, Mail, Phone, Plus, RefreshCw, Search, Store, X } from "lucide-react";
import { getOdooSession, searchOdooRecords } from "@/lib/odoo-api";

const PAGE_SIZE = 40;

interface OdooSupplierRecord {
  id: number;
  name: string;
  phone: string | false;
  email: string | false;
  vat: string | false;
  ref: string | false;
  supplier_rank: number;
}

export function OdooSupplierDirectoryPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooSupplierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", phone: "", email: "", vat: "", ref: "" });
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

  const loadSuppliers = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooSupplierRecord>("suppliers", { query: debouncedQuery, limit: PAGE_SIZE, offset });
      if (revision !== requestRevision.current) return;
      setItems(page.items);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo suppliers.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void loadSuppliers(); }, [loadSuppliers, refreshKey]);

  async function createSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/odoo/suppliers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "Could not create the supplier.");
      setCreateOpen(false);
      setCreateForm({ name: "", phone: "", email: "", vat: "", ref: "" });
      setQuery("");
      setDebouncedQuery("");
      setOffset(0);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Could not create the supplier.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Suppliers</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Supplier contacts available to your Odoo staff account.</p>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-2 sm:flex">
          <Link href="/stock/replenishment" className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] sm:px-3"><span className="sm:hidden">Replenish</span><span className="hidden sm:inline">Open replenishment</span></Link>
          <button type="button" onClick={() => { setCreateError(null); setCreateOpen(true); }} disabled={connected !== true} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"><Plus size={16} /> Add supplier</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={connected !== true || loading} aria-label="Refresh suppliers" title="Refresh suppliers" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:gap-2 sm:px-3">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}<span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view suppliers</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Odoo staff account to see suppliers used for purchase orders.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 w-full max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email, ABN or reference" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="hidden w-full min-w-[760px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">ABN / Tax ID</th><th className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading suppliers…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center text-[var(--oh-muted)]">{debouncedQuery ? "No suppliers match this search." : <span className="mx-auto block max-w-md"><span className="block font-medium text-[var(--oh-text)]">No suppliers are available to this Odoo account.</span><span className="mt-1 block">Add a real wine distributor here, then return to replenishment to create a draft RFQ.</span></span>}</td></tr>
                ) : items.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-[var(--oh-text)]"><Store size={16} className="text-[var(--oh-muted)]" />{supplier.name}</span><span className="ml-6 block text-xs text-[var(--oh-muted)]">Odoo #{supplier.id}</span></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">
                      {supplier.phone && <a className="mb-1 flex items-center gap-1.5 hover:text-[var(--oh-primary)]" href={`tel:${encodeURIComponent(supplier.phone)}`}><Phone size={14} />{supplier.phone}</a>}
                      {supplier.email && <a className="flex items-center gap-1.5 hover:text-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(supplier.email)}`}><Mail size={14} />{supplier.email}</a>}
                      {!supplier.phone && !supplier.email && "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{supplier.vat || "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{supplier.ref || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading suppliers…</span></div>
              ) : items.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]">{debouncedQuery ? "No suppliers match this search." : <span className="mx-auto block max-w-md"><span className="block font-medium text-[var(--oh-text)]">No suppliers are available to this Odoo account.</span><span className="mt-1 block">Add a real wine distributor here, then return to replenishment to create a draft RFQ.</span></span>}</div>
              ) : items.map((supplier) => (
                <article key={supplier.id} className="px-4 py-3.5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--oh-text)]">{supplier.name}</p><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo #{supplier.id}</p></div>
                  </header>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {supplier.phone ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] hover:text-[var(--oh-primary)]" href={`tel:${encodeURIComponent(supplier.phone)}`}><Phone size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{supplier.phone}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Phone size={15} />No phone</p>}
                    {supplier.email ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)] hover:text-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(supplier.email)}`}><Mail size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{supplier.email}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Mail size={15} />No email</p>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0 rounded-md bg-[var(--oh-surface)] px-3 py-2"><dt className="text-[var(--oh-muted)]">ABN / Tax ID</dt><dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{supplier.vat || "—"}</dd></div>
                    <div className="min-w-0 rounded-md bg-[var(--oh-surface)] px-3 py-2"><dt className="text-[var(--oh-muted)]">Reference</dt><dd className="mt-0.5 break-words text-[var(--oh-text-secondary)]">{supplier.ref || "—"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <footer className="flex shrink-0 flex-col gap-2 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={items.length < PAGE_SIZE || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}
      {createOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="supplier-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] p-4 sm:p-5"><div><h2 id="supplier-create-title" className="text-lg font-semibold text-[var(--oh-text)]">Add supplier to Odoo</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Use the distributor’s real business details. This creates a company contact in Odoo.</p></div><button type="button" onClick={() => setCreateOpen(false)} disabled={creating} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"><X size={18} /></button></header>
          <form onSubmit={(event) => void createSupplier(event)} className="grid gap-3 p-4 sm:gap-4 sm:p-5">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Business name <span className="text-red-700">*</span></span><input required maxLength={120} autoFocus value={createForm.name} onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100" /></label>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone<input maxLength={32} type="tel" value={createForm.phone} onChange={(event) => setCreateForm((form) => ({ ...form, phone: event.target.value }))} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100" /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email<input maxLength={254} type="email" value={createForm.email} onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100" /></label></div>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">ABN / Tax ID<input maxLength={32} value={createForm.vat} onChange={(event) => setCreateForm((form) => ({ ...form, vat: event.target.value }))} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100" /><span className="text-xs font-normal text-[var(--oh-muted)]">Existing matching ABN is blocked to help avoid duplicates.</span></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Internal reference<input maxLength={64} value={createForm.ref} onChange={(event) => setCreateForm((form) => ({ ...form, ref: event.target.value }))} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-blue-100" /></label></div>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{createError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateOpen(false)} disabled={creating} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50 sm:w-auto">Cancel</button><button type="submit" disabled={creating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{creating ? "Saving…" : "Create supplier"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
