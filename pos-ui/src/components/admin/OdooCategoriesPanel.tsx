"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

type Category = { id: number; name: string; parent_id: [number, string] | false; productCount: number; childCount: number; ids: number[]; editable: boolean };

export function OdooCategoriesPanel({ onBusyChange }: { onChanged?: () => void; onBusyChange: (busy: boolean) => void }) {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    onBusyChange(true);
    try {
      const filters = await api.get<{ categories?: Array<{ id: string | number; name: string; productCount?: number }> }>("/api/products/filter-options");
      setItems((filters.categories || []).map((category) => ({
        id: Number(category.id),
        name: category.name,
        parent_id: false,
        productCount: Number(category.productCount ?? 0),
        childCount: 0,
        ids: [Number(category.id)],
        editable: false,
      })));
      // Read-only: skip onChanged on load so opening the dialog does not refresh the
      // catalogue / re-hit filter-options (that stack can surface as gateway 500s).
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Orithos categories.");
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  }, [onBusyChange]);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3.5">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
      <div><p className="text-sm font-medium text-[var(--oh-text)]">Your store categories</p><p className="mt-0.5 text-xs leading-5 text-[var(--oh-muted)]">Categories come from the Orithos product catalogue. Create or rename them by editing products.</p></div>
    </div>
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950"><p className="font-medium">Category editing is read-only on Orithos</p><p className="mt-1 text-xs leading-5">Assign a category when creating or editing a product. Direct category CRUD will return in a later Orithos release.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">Reload categories</button></div>}
    <label className="relative block min-w-0"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" aria-hidden="true" /><span className="sr-only">Search categories</span><input aria-label="Search categories" placeholder="Search by category name…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] pl-9 pr-3 text-sm text-[var(--oh-text)] outline-none transition-colors focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></label>
    <p role="status" aria-live="polite" className="text-xs text-[var(--oh-muted)]">{loading ? "Loading categories…" : `${filtered.length.toLocaleString("en-AU")} ${filtered.length === 1 ? "category" : "categories"}`}</p>
    <ul className="divide-y rounded-xl border border-[var(--oh-border)] bg-white">
      {filtered.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div><p className="font-medium text-[var(--oh-text)]">{item.name}</p><p className="text-xs text-[var(--oh-muted)]">{item.productCount.toLocaleString("en-AU")} products</p></div>
          <Link href={`/products?categoryId=${item.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--oh-primary)]"><ExternalLink size={14} /> View products</Link>
        </li>
      ))}
      {!loading && !filtered.length && <li className="px-4 py-6 text-sm text-[var(--oh-muted)]">No Orithos categories found.</li>}
    </ul>
  </div>;
}
