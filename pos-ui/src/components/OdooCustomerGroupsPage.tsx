"use client";

import { ModalOverlay } from "@/components/ModalOverlay";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useAuth } from "@/lib/auth";
import {
  createOdooCustomerGroup,
  deleteOdooCustomerGroup,
  getOdooCustomerGroups,
  getOrithosSession,
  updateOdooCustomerGroup,
  type OdooCustomerGroupRecord,
} from "@/lib/odoo-api";

const PAGE_SIZE = 40;

export function OdooCustomerGroupsPage({ onClose }: { onClose?: () => void } = {}) {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission("customers.groups");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetry, setConnectionRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [groups, setGroups] = useState<OdooCustomerGroupRecord[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OdooCustomerGroupRecord | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OdooCustomerGroupRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const queryPending = query.trim() !== debouncedQuery;
  const resultsBusy = loading || queryPending;
  const rowActionsDisabled = resultsBusy || Boolean(error);

  useDialogFocus(editorOpen, () => {
    if (!busy) closeEditor();
  });
  useDialogFocus(Boolean(deleting), () => {
    if (!busy) setDeleting(null);
  });

  useEffect(() => {
    let active = true;
    void getOrithosSession().then((session) => {
      if (active) setConnected(Boolean(session));
    }).catch(() => {
      if (active) setConnected(false);
    });
    return () => { active = false; };
  }, [connectionRetry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadGroups = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getOdooCustomerGroups(debouncedQuery, offset, PAGE_SIZE);
      if (revision !== requestRevision.current) return;
      setGroups(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load Orithos customer groups.");
      }
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void loadGroups(); }, [loadGroups, refreshKey]);

  function closeEditor() {
    setEditorOpen(false);
    setEditing(null);
    setName("");
    setFormError(null);
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(group: OdooCustomerGroupRecord) {
    setEditing(group);
    setName(group.name);
    setFormError(null);
    setEditorOpen(true);
  }

  async function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing) await updateOdooCustomerGroup(editing.id, nextName);
      else await createOdooCustomerGroup(nextName);
      closeEditor();
      setOffset(0);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save this Orithos customer group.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteOdooCustomerGroup(deleting.id);
      setDeleting(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete this Orithos customer group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain bg-[var(--oh-surface)] px-4 pb-4 md:px-6 md:pb-6">
      <header className="mt-4 flex shrink-0 flex-col gap-3 md:mt-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Groups</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">Orithos customer categories used to organise customers.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && <button type="button" onClick={openCreate} disabled={connected !== true} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New group</button>}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={resultsBusy || connected !== true} aria-label="Refresh customer groups" title="Refresh customer groups" className="grid size-11 place-items-center rounded-lg border border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><RefreshCw size={16} /></button>
          {onClose && <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>}
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md"><AlertCircle className="mx-auto text-amber-600" size={28} /><h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Orithos to view customer groups</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect an Orithos staff account to manage customer categories used by the register.</p><button type="button" onClick={() => setConnectionRetry((value) => value + 1)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={15} /> Retry connection</button></div>
        </section>
      ) : (
        <>
          <label className="flex h-11 w-full max-w-xl shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={17} className="text-[var(--oh-muted)]" aria-hidden="true" />
            <input aria-label="Search customer groups" aria-busy={queryPending} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Search group names" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          {!isAdmin && <p className="text-sm text-[var(--oh-muted)]">Group management permission is required to add, rename or remove groups.</p>}
          {resultsBusy && groups.length > 0 && <p role="status" aria-live="polite" className="text-sm text-[var(--oh-muted)]">{queryPending ? "Waiting to apply search…" : "Updating customer groups…"} Existing rows are temporarily read-only.</p>}
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={resultsBusy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><RefreshCw size={14} /> Retry</button></div>}

          <section aria-busy={resultsBusy} className="shrink-0 overflow-visible rounded-lg border border-[var(--oh-border)] bg-white">
            {loading && groups.length === 0 ? <p role="status" className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Loading customer groups…</p>
              : groups.length === 0 ? <div role="status" className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center"><p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery ? "No customer groups match this search" : "No Orithos customer groups yet"}</p><p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">{debouncedQuery ? "Try another group name." : isAdmin ? "Add a group to organise customers in Orithos." : "A store admin can add customer groups for this Orithos company."}</p></div>
                : <>
                  <table aria-label="Orithos customer groups" className="hidden w-full min-w-[650px] border-collapse text-left text-sm xl:table">
                    <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]"><tr><th scope="col" className="px-4 py-3">Group</th><th scope="col" className="px-4 py-3">Parent</th><th scope="col" className="px-4 py-3 text-right">Customers</th>{isAdmin && <th scope="col" className="px-4 py-3 text-right">Actions</th>}</tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">{groups.map((group) => <tr key={group.id} className="hover:bg-[var(--oh-surface)]/70"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{group.name}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{group.parentName || "—"}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text)]">{group.customerCount}</td>{isAdmin && <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" aria-label={`Edit group ${group.name}`} title="Edit group" disabled={rowActionsDisabled || group.writable === false} onClick={() => openEdit(group)} className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50"><Pencil size={15} /></button><button type="button" aria-label={`Delete group ${group.name}`} title="Delete group" disabled={rowActionsDisabled || group.writable === false} onClick={() => { setDeleting(group); setDeleteError(null); }} className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-wait disabled:opacity-50"><Trash2 size={15} /></button></div></td>}</tr>)}</tbody>
                  </table>
                  <ul className="divide-y divide-[var(--oh-border)] xl:hidden">{groups.map((group) => <li key={group.id} className="flex items-start justify-between gap-3 px-4 py-3.5"><div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--oh-text)]">{group.name}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{group.parentName ? `${group.parentName} · ` : ""}{group.customerCount} customers</p></div>{isAdmin && <div className="flex shrink-0 gap-2"><button type="button" aria-label={`Edit group ${group.name}`} disabled={rowActionsDisabled || group.writable === false} onClick={() => openEdit(group)} className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50"><Pencil size={15} /></button><button type="button" aria-label={`Delete group ${group.name}`} disabled={rowActionsDisabled || group.writable === false} onClick={() => { setDeleting(group); setDeleteError(null); }} className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-wait disabled:opacity-50"><Trash2 size={15} /></button></div>}</li>)}</ul>
                </>}
          </section>
          <footer className="flex shrink-0 items-center justify-between gap-3 text-sm text-[var(--oh-muted)]"><span>Page {Math.floor(offset / PAGE_SIZE) + 1}{groups.length ? ` · Showing ${offset + 1}–${offset + groups.length}` : ""}</span><div className="flex gap-2"><button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || resultsBusy} aria-label="Previous customer groups page" className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || resultsBusy} aria-label="Next customer groups page" className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-40"><ChevronRight size={16} /></button></div></footer>
        </>
      )}

      {editorOpen && <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditor(); }}><section role="dialog" aria-modal="true" aria-labelledby="customer-group-title" className="my-auto w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-white p-5 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 id="customer-group-title" className="text-lg font-semibold text-[var(--oh-text)]">{editing ? "Edit customer group" : "New customer group"}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Changes are saved to Orithos.</p></div><button type="button" aria-label="Close" onClick={closeEditor} disabled={busy} className="grid size-10 place-items-center rounded-md hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={17} /></button></header><form className="mt-5 grid gap-4" onSubmit={(event) => void submitGroup(event)}><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Group name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label>{formError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{formError}</p>}<footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeEditor} disabled={busy} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy || !name.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{editing ? "Save changes" : "Create group"}</button></footer></form></section></ModalOverlay>}
      {deleting && <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-customer-group-title" className="w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-white p-5 shadow-2xl"><h2 id="delete-customer-group-title" className="text-lg font-semibold text-[var(--oh-text)]">Delete customer group?</h2><p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">Deleting “{deleting.name}” also removes it from associated Orithos customers.</p>{deleteError && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{deleteError}</p>}<footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDeleting(null)} disabled={busy} className="h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void confirmDelete()} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}Delete group</button></footer></section></ModalOverlay>}
    </main>
  );
}
