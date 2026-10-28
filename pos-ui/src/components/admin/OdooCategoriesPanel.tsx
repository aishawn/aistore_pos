"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type Category = { id: number; name: string; parent_id: [number, string] | false; productCount: number; childCount: number; editable: boolean };

export function OdooCategoriesPanel({ onChanged, onBusyChange }: { onChanged: () => void; onBusyChange: (busy: boolean) => void }) {
  const [items, setItems] = useState<Category[]>([]);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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

  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const unavailable = !writeEnabled || loading || !!error && !items.length;
  return <div className="space-y-4">
    <p className="text-sm text-[var(--oh-muted)]">Organise the POS catalogue. Shared categories are read-only. Assign categories when creating or editing a product.</p>
    {!loading && !writeEnabled && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Category changes are not enabled. An administrator must complete the Orithos upgrade and isolated verification.</p>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}<button type="button" disabled={busy} onClick={() => void load()} className="ml-3 underline">Reload categories</button></div>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2"><input aria-label="Search categories" placeholder="Search categories…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border px-3" /><button type="button" disabled={unavailable} onClick={() => { setEditing("new"); setName(""); setParentId(""); }} className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">New category</button></div>
      {editing !== null && <form className="space-y-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4" onSubmit={(event) => { event.preventDefault(); void mutate(editing === "new" ? "POST" : "PATCH", editing === "new" ? undefined : editing); }}>
        <h3 className="font-semibold">{editing === "new" ? "New category" : "Edit category"}</h3>
<label className="block text-sm text-[var(--oh-text)]">Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)]" /></label>
<label className="block text-sm text-[var(--oh-text)]">Parent category<select value={parentId} onChange={(event) => setParentId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)]"><option value="">No parent</option>{items.filter((item) => item.editable && item.id !== editing).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex gap-2"><button type="submit" disabled={!name.trim()} className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">Save category</button><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg border px-4 text-sm">Cancel</button></div>
      </form>}
      {loading ? <p role="status">Loading categories…</p> : <ul className="divide-y rounded-lg border border-[var(--oh-border)]">{filtered.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="break-words font-medium">{item.name}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{item.parent_id ? `Parent: ${item.parent_id[1]} · ` : ""}{item.productCount} {item.productCount === 1 ? "product" : "products"}{item.childCount ? ` · ${item.childCount} ${item.childCount === 1 ? "child" : "children"}` : ""}{!item.editable ? " · Shared · read-only" : ""}</p></div><div className="flex flex-wrap items-center justify-end gap-2">{item.productCount > 0 && <Link href={`/products?categoryId=${item.id}`} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-text)] hover:bg-[var(--oh-surface-elevated)]">View products</Link>}{item.editable && writeEnabled && <><button type="button" onClick={() => { setEditing(item.id); setName(item.name); setParentId(item.parent_id ? String(item.parent_id[0]) : ""); }} className="min-h-11 rounded-lg border px-3 text-sm">Edit</button><button type="button" disabled={item.productCount > 0 || item.childCount > 0} title={item.productCount || item.childCount ? "Remove product and child category references first" : "Delete category"} aria-label={item.productCount || item.childCount ? `${item.name} cannot be deleted until its products and child categories are moved` : `Delete ${item.name}`} onClick={() => setDeleting(item)} className="min-h-11 rounded-lg border px-3 text-sm text-red-700 disabled:opacity-40">Delete</button></>}{item.editable && writeEnabled && (item.productCount > 0 || item.childCount > 0) && <span className="w-full text-right text-xs text-[var(--oh-muted)]">Move products and child categories before deleting</span>}</div></li>)}{!filtered.length && <li className="p-6 text-center text-sm text-[var(--oh-muted)]">No matching categories.</li>}</ul>}
    </fieldset>
    <ConfirmDialog open={deleting !== null} title="Delete category?" message={`Delete ${deleting?.name || "this category"}? Products will not be deleted.`} busy={busy} error={error} onConfirm={() => { if (deleting) void mutate("DELETE", deleting.id); }} onCancel={() => { if (!lock.current) setDeleting(null); }} />
  </div>;
}
