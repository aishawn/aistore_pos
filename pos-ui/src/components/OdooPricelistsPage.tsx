"use client";

import { ModalOverlay } from "@/components/ModalOverlay";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { PricelistDetails } from "@/components/PricelistDetails";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSearchInput,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import {
  AlertCircle,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import {
  archiveOdooPricelist,
  createOdooPricelist,
  getOdooPricelists,
  getOrithosSession,
  updateOdooPricelist,
  type OdooPricelistRecord,
} from "@/lib/odoo-api";
import { useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 40;

export function OdooPricelistsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("customers.pricelists");
  const [selected, setSelected] = useState<OdooPricelistRecord | null>(null);
  const revision = useRef(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooPricelistRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OdooPricelistRecord | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<OdooPricelistRecord | null>(null);

  useDialogFocus(dialogOpen, () => { if (!busy) setDialogOpen(false); });
  useDialogFocus(Boolean(archiving), () => { if (!busy) setArchiving(null); });

  useEffect(() => {
    void getOrithosSession().then((user) => setConnected(Boolean(user))).catch(() => setConnected(false));
  }, [refreshKey]);

  const load = useCallback(async () => {
    if (connected !== true) return;
    const request = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getOdooPricelists(debouncedQuery, offset, PAGE_SIZE);
      if (request !== revision.current) return;
      setItems(page.items);
      setTotal(page.total);
      setHasNext(page.hasNext);
    } catch (cause) {
      if (request !== revision.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load price lists.");
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setOffset(0); }, [debouncedQuery]);

  function openCreate() {
    setEditing(null);
    setName("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(list: OdooPricelistRecord) {
    setEditing(list);
    setName(list.name);
    setFormError(null);
    setDialogOpen(true);
  }

  async function saveList(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) await updateOdooPricelist(editing.id, { name: name.trim() });
      else await createOdooPricelist(name.trim());
      setDialogOpen(false);
      setEditing(null);
      setName("");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save this price list.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archiving || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await archiveOdooPricelist(archiving.id);
      setArchiving(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not delete this price list.");
    } finally {
      setBusy(false);
    }
  }

  if (connected === false) {
    return (
      <AdminPageLayout title="Price Lists" subtitle="Orithos product pricelists used at checkout">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <AlertCircle className="mb-2" size={20} />
          <p className="font-semibold">Connect Orithos to manage price lists</p>
          <Link href="/settings/integrations" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Orithos</Link>
        </section>
      </AdminPageLayout>
    );
  }

  const rowBusy = loading || Boolean(error);

  return (
    <AdminPageLayout
      compact={embedded}
      fullBleed
      title="Price Lists"
      count={loading && items.length === 0 ? undefined : total}
      countLabel="Results"
      actions={
        <>
          <AdminSecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </AdminSecondaryButton>
          {canManage && (
            <AdminPrimaryButton onClick={openCreate}>
              <Plus size={16} /> Add Price List
            </AdminPrimaryButton>
          )}
        </>
      }
      search={
        <AdminSearchInput
          label="Search"
          value={query}
          onChange={setQuery}
          placeholder="Search Price Lists..."
        />
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 font-semibold">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="bg-[var(--oh-primary)] text-xs font-semibold uppercase tracking-wide text-white">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Customer Count</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-[var(--oh-muted)]">
                  <LoaderCircle className="mr-2 inline animate-spin" size={15} />Loading price lists…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-[var(--oh-muted)]">
                  <Tag className="mx-auto mb-2" size={20} />No price lists found
                </td>
              </tr>
            ) : items.map((list) => (
              <tr key={list.id} className="hover:bg-[var(--oh-surface)]/70">
                <td className="px-4 py-3 font-medium text-[var(--oh-text)]">{list.name}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--oh-text)]">{list.customerCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-3 text-[13px] font-semibold">
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => setSelected(list)}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"
                    >
                      <Eye size={15} /> View
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          disabled={rowBusy || list.companyId === null}
                          onClick={() => openEdit(list)}
                          className="inline-flex min-h-11 items-center gap-1.5 text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={rowBusy || list.companyId === null || !list.active}
                          onClick={() => { setArchiving(list); setFormError(null); }}
                          className="inline-flex min-h-11 items-center gap-1.5 text-rose-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="divide-y divide-[var(--oh-border)] md:hidden">
          {loading && items.length === 0 && (
            <p role="status" className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">Loading price lists…</p>
          )}
          {!loading && items.length === 0 && (
            <p role="status" className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No price lists found</p>
          )}
          {items.map((list) => (
            <article key={list.id} className="px-4 py-3">
              <p className="font-semibold text-[var(--oh-text)]">{list.name}</p>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">{list.customerCount} customers</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={rowBusy}
                  onClick={() => setSelected(list)}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--oh-border)] text-sky-700 disabled:opacity-50"
                >
                  <Eye size={15} /> View
                </button>
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={rowBusy || list.companyId === null}
                      onClick={() => openEdit(list)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--oh-border)] text-emerald-700 disabled:opacity-50"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy || list.companyId === null || !list.active}
                      onClick={() => { setArchiving(list); setFormError(null); }}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--oh-border)] text-rose-700 disabled:opacity-50"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--oh-muted)]">
        <span>{items.length ? `Showing ${offset + 1}–${offset + items.length} of ${total}` : "No records"}</span>
        <div className="flex gap-2">
          <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Previous</button>
          <button type="button" disabled={!hasNext || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Next</button>
        </div>
      </footer>

      {dialogOpen && (
        <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialogOpen(false); }}>
          <form role="dialog" aria-modal="true" aria-label="Price list editor" onSubmit={(event) => void saveList(event)} className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--oh-text)]">{editing ? "Edit price list" : "New price list"}</h2>
            <label className="mt-4 grid gap-1.5 text-sm font-medium">Name
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="h-11 rounded-lg border border-[var(--oh-border)] px-3" />
            </label>
            {formError && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDialogOpen(false)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : null} Save</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {archiving && (
        <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--oh-text)]">Delete price list?</h2>
            <p className="mt-2 text-sm text-[var(--oh-muted)]">“{archiving.name}” will be removed from active Orithos price lists. Customers keep their history; POS configs that still reference it are not hard-deleted.</p>
            {formError && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setArchiving(null)} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirmArchive()} className="inline-flex h-11 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete</button>
            </div>
          </section>
        </ModalOverlay>
      )}
      {selected && <PricelistDetails list={selected} onClose={() => setSelected(null)} />}
    </AdminPageLayout>
  );
}
