"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { AdminPageLayout, AdminPrimaryButton, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import {
  createOdooCustomerGroup,
  deleteOdooCustomerGroup,
  getOdooCustomerGroups,
  getOdooSession,
  updateOdooCustomerGroup,
  type OdooCustomerGroupRecord,
} from "@/lib/odoo-api";
import { useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 40;

export function OdooCustomerGroupsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooCustomerGroupRecord[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OdooCustomerGroupRecord | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OdooCustomerGroupRecord | null>(null);

  useEffect(() => {
    void getOdooSession().then((user) => setConnected(Boolean(user))).catch(() => setConnected(false));
  }, [refreshKey]);

  const load = useCallback(async () => {
    if (connected !== true) return;
    setLoading(true);
    setError(null);
    try {
      const page = await getOdooCustomerGroups(debouncedQuery, offset, PAGE_SIZE);
      setItems(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load customer groups.");
    } finally {
      setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setOffset(0); }, [debouncedQuery]);

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) await updateOdooCustomerGroup(editing.id, name.trim());
      else await createOdooCustomerGroup(name.trim());
      setDialogOpen(false);
      setEditing(null);
      setName("");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save this group.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await deleteOdooCustomerGroup(deleting.id);
      setDeleting(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not delete this group.");
    } finally {
      setBusy(false);
    }
  }

  if (connected === false) {
    return (
      <AdminPageLayout title="Customer Groups" subtitle="Odoo partner tags used for pricing and reporting">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <AlertCircle className="mb-2" size={20} />
          <p className="font-semibold">Connect Odoo to manage customer groups</p>
          <Link href="/settings/integrations" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Odoo</Link>
        </section>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Customer Groups"
      subtitle="Odoo partner tags (res.partner.category) for organising customers"
      count={loading || error ? undefined : items.length}
      countLabel="Groups on this page"
      actions={
        <>
          <AdminSecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </AdminSecondaryButton>
          <AdminPrimaryButton onClick={() => { setEditing(null); setName(""); setFormError(null); setDialogOpen(true); }}>
            <Plus size={16} /> Add group
          </AdminPrimaryButton>
        </>
      }
    >
      <label className="mb-4 flex h-11 max-w-xl items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3">
        <Search size={16} className="text-[var(--oh-muted)]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search groups" className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search customer groups" />
      </label>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 font-semibold">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            <tr><th className="px-4 py-3">Group</th><th className="px-4 py-3">Customers</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {loading && items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-[var(--oh-muted)]"><LoaderCircle className="mr-2 inline animate-spin" size={15} />Loading groups…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-[var(--oh-muted)]"><Users className="mx-auto mb-2" size={20} />No customer groups yet</td></tr>
            ) : items.map((group) => (
              <tr key={group.id}>
                <td className="px-4 py-3 font-medium text-[var(--oh-text)]">{group.name}<span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Odoo #{group.id}</span></td>
                <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{group.customerCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button type="button" onClick={() => { setEditing(group); setName(group.name); setFormError(null); setDialogOpen(true); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3"><Pencil size={14} /> Edit</button>
                    <button type="button" onClick={() => { setDeleting(group); setFormError(null); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-rose-800"><Trash2 size={14} /> Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[var(--oh-border)] md:hidden">
          {items.map((group) => (
            <article key={group.id} className="px-4 py-3">
              <p className="font-semibold text-[var(--oh-text)]">{group.name}</p>
              <p className="text-xs text-[var(--oh-muted)]">{group.customerCount} customers · Odoo #{group.id}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setEditing(group); setName(group.name); setDialogOpen(true); }} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)]"><Pencil size={14} /> Edit</button>
                <button type="button" onClick={() => setDeleting(group)} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 text-rose-800"><Trash2 size={14} /> Delete</button>
              </div>
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

      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialogOpen(false); }}>
          <form onSubmit={(event) => void saveGroup(event)} className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--oh-text)]">{editing ? "Edit group" : "New group"}</h2>
            <label className="mt-4 grid gap-1.5 text-sm font-medium">Name
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="h-11 rounded-lg border border-[var(--oh-border)] px-3" />
            </label>
            {formError && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDialogOpen(false)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : null} Save</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--oh-text)]">Delete group?</h2>
            <p className="mt-2 text-sm text-[var(--oh-muted)]">Remove “{deleting.name}” from Odoo. Customers keep their other tags.</p>
            {formError && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDeleting(null)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirmDelete()} className="inline-flex h-11 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : null} Delete</button>
            </div>
          </section>
        </div>
      )}
    </AdminPageLayout>
  );
}
