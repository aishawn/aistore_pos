"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search } from "lucide-react";
import {
  getOdooSession,
  searchOdooRecords,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";

const PAGE_SIZE = 40;
const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
const quantity = (amount: number) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(amount);

export function OdooProductCataloguePage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooProductRecord[]>([]);
  const [categories, setCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRevision = useRef(0);
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

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

  const loadProducts = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooProductRecord>("products", {
        query: debouncedQuery,
        limit: PAGE_SIZE,
        offset,
        categoryId: categoryId ?? undefined,
      });
      if (revision !== requestRevision.current) return;
      setItems(page.items);
      setHasNext(page.items.length === PAGE_SIZE);
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo products.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [categoryId, connected, debouncedQuery, offset, refreshKey]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  useEffect(() => {
    if (connected !== true) return;
    let cancelled = false;
    setCategoryLoading(true);
    void searchOdooRecords<OdooPosCategoryRecord>("posCategories", { limit: 100 })
      .then((result) => { if (!cancelled) setCategories(result.items); })
      .catch((cause) => { if (!cancelled) setCategoryError(cause instanceof Error ? cause.message : "Product categories are unavailable."); })
      .finally(() => { if (!cancelled) setCategoryLoading(false); });
    return () => { cancelled = true; };
  }, [connected]);

  function selectCategory(value: string) {
    setCategoryId(value ? Number(value) : null);
    setOffset(0);
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Odoo Product Catalogue</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">POS products, prices and stock data from Odoo.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Odoo to view products</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Odoo staff account to view the POS catalogue and inventory available to that account.</p>
            <Link href="/settings/integrations" className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, barcode or SKU" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <label className="grid min-w-[220px] gap-1 text-xs font-medium text-[var(--oh-muted)]">
              POS category
              <select value={categoryId ?? ""} onChange={(event) => selectCategory(event.target.value)} disabled={categoryLoading} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] disabled:opacity-60">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</option>)}
              </select>
            </label>
          </div>

          <p className="-mt-2 text-xs leading-5 text-[var(--oh-muted)]">On-hand quantities follow the Odoo user’s current inventory context and may include multiple locations; use Odoo stock reports for location-specific counts.</p>
          {categoryError && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{categoryError}</p>}
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Barcode / SKU</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">List price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading products…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-[var(--oh-muted)]">{debouncedQuery || categoryId ? "No POS products match these filters." : "No products are available in the Odoo POS catalogue."}</td></tr>
                ) : items.map((product) => {
                  const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id)).filter(Boolean);
                  return (
                    <tr key={product.id} className="hover:bg-sky-50/50">
                      <td className="px-4 py-3"><span className="block font-medium text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Odoo #{product.id}</span></td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{productCategories.length ? productCategories.join(", ") : "Uncategorised"}</td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]"><span className="block">{product.barcode || "—"}</span>{product.default_code && <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">SKU {product.default_code}</span>}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${product.qty_available > 0 ? "text-[var(--oh-text)]" : "font-medium text-amber-700"}`}>{quantity(product.qty_available)}{product.uom_id && <span className="ml-1 text-xs text-[var(--oh-muted)]">{product.uom_id[1]}</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(product.list_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <footer className="flex items-center justify-between text-sm text-[var(--oh-muted)]">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
