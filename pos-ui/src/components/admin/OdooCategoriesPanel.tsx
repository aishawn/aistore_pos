"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type Category = { id: number; name: string; parent_id: [number, string] | false; productCount: number; childCount: number; editable: boolean };

export function OdooCategoriesPanel({ onChanged, onBusyChange }: { onChanged: () => void; onBusyChange: (busy: boolean) => void }) {
  const [items, setItems] = useState<Category[]>([]);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const lock = useRef(false);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true); setError(null);
    try {
      const result: Category[] = [];
      let offset = 0;
      for (;;) {
        const response = await fetchOdooRoute(`/api/odoo/categories?offset=${offset}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Could not load categories.");
        if (request !== revision.current) return;
        setWriteEnabled(payload.writeEnabled === true);
        result.push(...payload.items);
        if (!payload.hasNext) break;
        if (!payload.items.length) throw new Error("Category pagination returned no records. Retry shortly.");
        offset += payload.items.length;
      }
      setItems(result);
    } catch (error) { if (request === revision.current) setError(error instanceof Error ? error.message : "Could not load categories."); }
    finally { if (request === revision.current) setLoading(false); }
  }, []);
  useEffect(() => { const requests = revision; void load(); return () => { requests.current++; }; }, [load]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  async function mutate(method: "POST" | "PATCH" | "DELETE", id?: number) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError(null);
    try {
      const response = await fetchOdooRoute(`/api/odoo/categories${id ? `/${id}` : ""}`, {
        method, headers: { "Content-Type": "application/json" },
        ...(method === "DELETE" ? {} : { body: JSON.stringify({ name: name.trim(), parentId: parentId ? Number(parentId) : null }) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Category update failed.");
      setEditing(null); setDeleting(null); onChanged(); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the category. Refresh the list before retrying if the result is unknown."); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }

  const isDemoCategory = (item: Category) => /^demo\b/i.test(item.name.trim());
  const demoCount = items.filter(isDemoCategory).length;
  const filtered = items.filter((item) => (showDemo || !isDemoCategory(item)) && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = Array.from(filtered.reduce((result, item) => {
    const key = item.name.trim().toLocaleLowerCase();
    const group = result.get(key) ?? { name: item.name, items: [] as Category[] };
    group.items.push(item);
    result.set(key, group);
    return result;
  }, new Map<string, { name: string; items: Category[] }>()).values());
  const categoryGroups = groups.map((group) => {
    const local = group.items.find((item) => item.editable);
    const shared = group.items.find((item) => !item.editable);
    return {
      ...group,
      local,
      shared,
      productCount: group.items.reduce((total, item) => total + item.productCount, 0),
      childCount: group.items.reduce((total, item) => total + item.childCount, 0),
      ids: group.items.map((item) => item.id),
    };
  });
  const unavailable = !writeEnabled || loading || !!error && !items.length;
  return <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3.5">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
      <div><p className="text-sm font-medium text-[var(--oh-text)]">Categories organise your POS catalogue</p><p className="mt-0.5 text-xs leading-5 text-[var(--oh-muted)]">Each name appears once here, even when it is backed by both a store category and a shared catalogue category. Shared categories are managed centrally.</p></div>
    </div>
    {!loading && !writeEnabled && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950"><p className="font-medium">Category changes are currently locked</p><p className="mt-1 text-xs leading-5">An administrator must complete the Orithos upgrade and isolated verification before you can add, edit or delete local categories.</p></div>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}<button type="button" disabled={busy} onClick={() => void load()} className="ml-3 underline">Reload categories</button></div>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" aria-hidden="true" /><span className="sr-only">Search categories</span><input aria-label="Search categories" placeholder="Search by category name…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] pl-9 pr-3 text-sm text-[var(--oh-text)] outline-none transition-colors focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label>{demoCount > 0 && <button type="button" onClick={() => setShowDemo((visible) => !visible)} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">{showDemo ? "Hide demo data" : `Show demo data (${demoCount})`}</button>}<button type="button" disabled={unavailable} onClick={() => { setEditing("new"); setName(""); setParentId(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} aria-hidden="true" /> New category</button></div>
      {editing !== null && <form className="space-y-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4" onSubmit={(event) => { event.preventDefault(); void mutate(editing === "new" ? "POST" : "PATCH", editing === "new" ? undefined : editing); }}>
        <h3 className="font-semibold">{editing === "new" ? "New category" : "Edit category"}</h3>
<label className="block text-sm text-[var(--oh-text)]">Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)]" /></label>
<label className="block text-sm text-[var(--oh-text)]">Parent category<select value={parentId} onChange={(event) => setParentId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)]"><option value="">No parent</option>{items.filter((item) => item.editable && item.id !== editing).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex gap-2"><button type="submit" disabled={!name.trim()} className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">Save category</button><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button></div>
      </form>}
      {loading ? <p role="status" className="rounded-xl border border-dashed border-[var(--oh-border)] p-8 text-center text-sm text-[var(--oh-muted)]">Loading categories…</p> : <div className="space-y-3">{categoryGroups.map((group) => {
        const editable = group.local;
        const categoryIdQuery = group.ids.join(",");
        return <section key={group.name.toLocaleLowerCase()} className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[var(--oh-text)]">{group.name}</h3><p className="mt-0.5 text-xs text-[var(--oh-muted)]">{group.productCount} {group.productCount === 1 ? "product" : "products"}{group.childCount ? ` · ${group.childCount} ${group.childCount === 1 ? "child" : "children"}` : ""}</p></div>{group.items.length > 1 && <span className="shrink-0 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--oh-muted)]">Available in shared catalogue</span>}</header>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 text-sm text-[var(--oh-text-secondary)]">{editable?.parent_id ? `Parent: ${editable.parent_id[1]}` : group.shared && !editable ? "Managed by the shared catalogue" : "Managed by this store"}{group.shared && editable ? <span className="ml-2 text-xs text-[var(--oh-muted)]">Shared version is read-only</span> : null}</div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{group.productCount > 0 && <Link href={`/products?categoryId=${categoryIdQuery}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)]"><ExternalLink size={14} aria-hidden="true" /> View products</Link>}{editable && writeEnabled && <><button type="button" onClick={() => { setEditing(editable.id); setName(editable.name); setParentId(editable.parent_id ? String(editable.parent_id[0]) : ""); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)]"><Pencil size={14} aria-hidden="true" /> Edit</button><button type="button" disabled={editable.productCount > 0 || editable.childCount > 0} title={editable.productCount || editable.childCount ? "Remove product and child category references first" : "Delete category"} aria-label={editable.productCount || editable.childCount ? `${editable.name} cannot be deleted until its products and child categories are moved` : `Delete ${editable.name}`} onClick={() => setDeleting(editable)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} aria-hidden="true" /> Delete</button></>}</div></div>
        </section>;
      })}{!categoryGroups.length && <div className="rounded-xl border border-dashed border-[var(--oh-border)] p-8 text-center text-sm text-[var(--oh-muted)]">No matching categories.</div>}</div>}
    </fieldset>
    <ConfirmDialog open={deleting !== null} title="Delete category?" message={`Delete ${deleting?.name || "this category"}? Products will not be deleted.`} busy={busy} error={error} onConfirm={() => { if (deleting) void mutate("DELETE", deleting.id); }} onCancel={() => { if (!lock.current) setDeleting(null); }} />
  </div>;
}
