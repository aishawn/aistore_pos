"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, Mail, Pencil, Phone, Plus, RefreshCw, Search, UserRound, X } from "lucide-react";
import { createOdooCustomer, getOdooSession, searchOdooRecords, updateOdooCustomer, type OdooCustomerRecord } from "@/lib/odoo-api";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<OdooCustomerRecord | null>(null);
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
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Customers</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">Customer records available to your Odoo staff account.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setEditingCustomer(null); setCreateOpen(true); setCreateError(null); }} disabled={connected !== true} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New customer</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
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
            <Link href="/settings/integrations" className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 max-w-xl shrink-0 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or customer code" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {error && <p role="alert" className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="w-full min-w-[840px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading customers…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-[var(--oh-muted)]">{debouncedQuery ? "No customers match this search." : "No customers are available to this Odoo account."}</td></tr>
                ) : items.map((customer) => (
                  <tr key={customer.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-[var(--oh-text)]"><UserRound size={16} className="text-[var(--oh-muted)]" />{customer.name}</span><span className="ml-6 block text-xs text-[var(--oh-muted)]">Odoo #{customer.id}</span></td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.phone ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={14} />{customer.phone}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.email ? <a className="inline-flex items-center gap-1.5 hover:text-[var(--sf-link-blue)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={14} />{customer.email}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.ref || "—"}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditingCustomer(customer); setCreateError(null); setCreateOpen(true); }} disabled={connected !== true} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><Pencil size={14} /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="flex shrink-0 items-center justify-between text-sm text-[var(--oh-muted)]">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {createOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) { setCreateOpen(false); setEditingCustomer(null); } }}>
        <section role="dialog" aria-modal="true" aria-labelledby="customer-create-title" className="my-auto w-full max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="customer-create-title" className="text-lg font-semibold text-[var(--oh-text)]">{editingCustomer ? "Edit customer" : "New customer"}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingCustomer ? "Update this customer record in Odoo." : "Create a contact in Odoo for sales and customer lookup."}</p></div>
            <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key={editingCustomer?.id ?? "new-customer"} onSubmit={(event) => void submitCustomer(event)} className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Customer name <span className="text-red-700">*</span>
              <input name="name" autoFocus defaultValue={editingCustomer?.name ?? ""} maxLength={120} required className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone
                <input name="phone" type="tel" autoComplete="tel" defaultValue={editingCustomer?.phone || ""} maxLength={32} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email
                <input name="email" type="email" autoComplete="email" defaultValue={editingCustomer?.email || ""} maxLength={254} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Customer reference
              <input name="ref" defaultValue={editingCustomer?.ref || ""} maxLength={64} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
            </label>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex justify-end gap-2 border-t border-[var(--oh-border)] pt-4">
              <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} className="h-10 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={creating} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {editingCustomer ? "Save changes" : "Create customer"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
