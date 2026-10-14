"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Download, FileUp, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  createOdooProduct,
  getOdooSession,
  importOdooProducts,
  searchOdooRecords,
  updateOdooProduct,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";
import { parseProductCsv, type ProductImportRow } from "@/lib/product-csv";

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
  const [editingProduct, setEditingProduct] = useState<OdooProductRecord | null>(null);
  const [categoriesTouched, setCategoriesTouched] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; skipped: Array<{ line: number; reason: string }> } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
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
  }, [categoryId, connected, debouncedQuery, offset]);

  useEffect(() => { void loadProducts(); }, [loadProducts, refreshKey]);

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

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct || savingProduct) return;
    const form = new FormData(event.currentTarget);
    const price = Number(form.get("list_price"));
    if (!Number.isFinite(price) || price < 0) {
      setEditError("Enter a valid price greater than or equal to zero.");
      return;
    }
    const formElement = event.currentTarget;
    const categoryIds = Array.from(formElement.querySelectorAll<HTMLInputElement>("input[name='pos_categ_ids']:checked"))
      .map((input) => Number(input.value));
    setSavingProduct(true);
    setEditError(null);
    try {
      const values = {
        barcode: String(form.get("barcode") ?? ""),
        default_code: String(form.get("default_code") ?? ""),
        list_price: price,
        available_in_pos: form.get("available_in_pos") === "on",
        ...(categoriesTouched ? { pos_categ_ids: categoryIds } : {}),
      };
      await updateOdooProduct(editingProduct.id, values);
      setEditingProduct(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not update this Odoo product.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingProduct) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const price = Number(form.get("list_price"));
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      setCreateError("Enter a sale price between 0 and 1,000,000.");
      return;
    }
    setCreatingProduct(true);
    setCreateError(null);
    try {
      await createOdooProduct({
        name,
        list_price: price,
        default_code: String(form.get("default_code") ?? "").trim(),
        barcode: String(form.get("barcode") ?? "").trim(),
        pos_categ_ids: form.getAll("pos_categ_ids").map(Number),
        available_in_pos: form.get("available_in_pos") === "on",
      });
      setNewProductOpen(false);
      setQuery(name);
      setCategoryId(null);
      setOffset(0);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Could not create this Odoo product.");
    } finally {
      setCreatingProduct(false);
    }
  }

  async function selectImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setImportResult(null);
    setImportFileName(file?.name ?? "");
    if (!file) {
      setImportRows([]);
      setImportErrors([]);
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith(".csv") || file.size > 2_000_000) {
      setImportRows([]);
      setImportErrors(["Choose a CSV file smaller than 2 MB."]);
      return;
    }
    if (categoryLoading) {
      setImportRows([]);
      setImportErrors(["Wait for POS categories to finish loading, then select the file again."]);
      return;
    }
    try {
      const parsed = parseProductCsv(await file.text(), categories);
      setImportRows(parsed.rows);
      setImportErrors(parsed.errors);
    } catch {
      setImportRows([]);
      setImportErrors(["This CSV file could not be read. Save it as UTF-8 CSV and try again."]);
    }
  }

  async function runProductImport() {
    if (!importRows.length || importBusy) return;
    setImportBusy(true);
    setImportErrors([]);
    setImportResult(null);
    try {
      const result = await importOdooProducts(importRows);
      setImportResult(result);
      if (result.created > 0) setRefreshKey((value) => value + 1);
    } catch (cause) {
      setImportErrors([cause instanceof Error ? cause.message : "Could not import these products into Odoo."]);
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex shrink-0 flex-col items-stretch gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Products</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">POS products, prices and stock data from Odoo.</p>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-2 sm:flex">
          <button type="button" onClick={() => { setImportRows([]); setImportErrors([]); setImportResult(null); setImportFileName(""); setImportOpen(true); }} disabled={connected !== true} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"><FileUp size={16} /><span className="sm:hidden">Import</span><span className="hidden sm:inline">Import CSV</span></button>
          <button type="button" onClick={() => { setCreateError(null); setNewProductOpen(true); }} disabled={connected !== true} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New product</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh products" title="Refresh products" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60 sm:w-auto sm:px-3">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}<span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
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
          <div className="flex shrink-0 flex-wrap gap-3">
            <label className="flex h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, barcode or SKU" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <label className="oh-type-label grid w-full min-w-0 gap-1 text-[var(--oh-muted)] sm:w-[220px] sm:flex-none">
              POS category
              <select value={categoryId ?? ""} onChange={(event) => selectCategory(event.target.value)} disabled={categoryLoading} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] disabled:opacity-60">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</option>)}
              </select>
            </label>
          </div>

          <p className="oh-type-meta -mt-2 shrink-0 leading-5 text-[var(--oh-muted)]">Stock quantities reflect the active Odoo inventory context. Use Odoo reports for location-specific counts.</p>
          {categoryError && <p role="status" className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{categoryError}</p>}
          {error && <p role="alert" className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table className="hidden w-full min-w-[940px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Barcode / SKU</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">List price</th>
                  <th className="px-4 py-3">POS</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading products…</span></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center"><div className="mx-auto max-w-md"><p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId ? "No matching products" : "No POS products yet"}</p><p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId ? "Try clearing search or category filters." : "Connect Odoo and confirm products are available in the POS catalogue."}</p>{debouncedQuery || categoryId ? <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open Integrations</Link>}</div></td></tr>
                ) : items.map((product) => {
                  const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id)).filter(Boolean);
                  return (
                    <tr key={product.id} className="hover:bg-[var(--oh-tile-blue-bg)]/60">
                      <td className="px-4 py-3"><span className="block font-medium text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Odoo #{product.id}</span></td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{productCategories.length ? productCategories.join(", ") : "Uncategorised"}</td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]"><span className="block">{product.barcode || "—"}</span>{product.default_code && <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">SKU {product.default_code}</span>}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${product.qty_available > 0 ? "text-[var(--oh-text)]" : "font-medium text-amber-700"}`}>{quantity(product.qty_available)}{product.uom_id && <span className="ml-1 text-xs text-[var(--oh-muted)]">{product.uom_id[1]}</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(product.list_price)}</td>
                      <td className="px-4 py-3">{product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden</span>}</td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${product.display_name || product.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-2.5 text-xs font-semibold text-[var(--oh-text)] hover:border-[var(--oh-orange)] hover:bg-[#fff8ec]"><Pencil size={14} /> Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Loading products…</span></div>
              ) : items.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId ? "No matching products" : "No POS products yet"}</p>
                  <p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId ? "Try clearing search or category filters." : "Connect Odoo and confirm products are available in the POS catalogue."}</p>
                  {debouncedQuery || categoryId ? <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open Integrations</Link>}
                </div>
              ) : items.map((product) => {
                const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id)).filter(Boolean);
                return (
                  <article key={product.id} className="px-4 py-3.5">
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-[var(--oh-text)]">{product.display_name || product.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo #{product.id}{product.default_code ? ` · SKU ${product.default_code}` : ""}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{money(product.list_price)}</p>
                    </header>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-[11px] text-[var(--oh-muted)]">Category</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]">{productCategories.length ? productCategories.join(", ") : "Uncategorised"}</dd></div>
                      <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-[11px] text-[var(--oh-muted)]">Barcode</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]" title={product.barcode || undefined}>{product.barcode || "—"}</dd></div>
                      <div className="flex items-baseline gap-1.5"><dt className="shrink-0 text-[11px] text-[var(--oh-muted)]">On hand</dt><dd className={`tabular-nums ${product.qty_available > 0 ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-700"}`}>{quantity(product.qty_available)}{product.uom_id && <span className="ml-1 text-[var(--oh-muted)]">{product.uom_id[1]}</span>}</dd></div>
                    </dl>
                    <footer className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--oh-border)] pt-2">
                      {product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available in POS</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden from POS</span>}
                      <button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${product.display_name || product.name}`} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 text-xs font-semibold text-[var(--oh-text)] hover:border-[var(--oh-primary)] hover:bg-blue-50"><Pencil size={14} /> Edit</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>

          <footer className="flex shrink-0 flex-col gap-2 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {editingProduct && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingProduct) setEditingProduct(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-edit-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-edit-title" className="text-lg font-semibold text-[var(--oh-text)]">Edit product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingProduct.display_name || editingProduct.name} · Odoo #{editingProduct.id}</p></div>
            <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form onSubmit={(event) => void saveProduct(event)} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Sale price
                <input name="list_price" type="number" min="0" max="1000000" step="0.01" required defaultValue={editingProduct.list_price} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">SKU
                <input name="default_code" maxLength={64} defaultValue={editingProduct.default_code || ""} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Barcode
              <input name="barcode" maxLength={64} defaultValue={editingProduct.barcode || ""} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[var(--oh-text)]">POS categories</legend>
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border border-[var(--oh-border)] p-2 sm:grid-cols-2">
                {categories.map((category) => <label key={category.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
                  <input type="checkbox" name="pos_categ_ids" value={category.id} defaultChecked={editingProduct.pos_categ_ids.includes(category.id)} onChange={() => setCategoriesTouched(true)} className="accent-[var(--oh-orange)]" />
                  <span className="truncate">{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</span>
                </label>)}
                {!categories.length && <p className="px-2 py-3 text-sm text-[var(--oh-muted)]">No POS categories are available.</p>}
              </div>
            </fieldset>
            <label className="flex items-start gap-2 text-sm text-[var(--oh-text)]"><input type="checkbox" name="available_in_pos" defaultChecked={editingProduct.available_in_pos} className="mt-0.5 accent-[var(--oh-orange)]" /><span><span className="block font-medium">Available in POS</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Hide this product from register searches without deleting it.</span></span></label>
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">Stock on hand is controlled by Odoo receipts and inventory adjustments, so it cannot be edited here.</p>
            {editError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{editError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={savingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{savingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save changes</button>
            </footer>
          </form>
        </section>
      </div>}

      {importOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !importBusy) setImportOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-import-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-import-title" className="text-lg font-semibold text-[var(--oh-text)]">Import products from CSV</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Preview and validate your catalogue before adding products to Odoo.</p></div>
            <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <div className="mt-5 grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
              <div><p className="text-sm font-semibold text-[var(--oh-text)]">CSV columns</p><p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">Required: Product Name, Sale Price. Optional: SKU, Barcode, Cost, POS Category. English and common Chinese headers are supported.</p></div>
              <a href="/product-import-template.csv" download className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-xs font-semibold text-[var(--oh-text)] hover:border-[var(--oh-orange)]"><Download size={14} /> Download template</a>
            </div>
            <label className="grid gap-2 text-sm font-medium text-[var(--oh-text)]">Choose a CSV file
              <input type="file" accept=".csv,text/csv" onChange={(event) => void selectImportFile(event)} disabled={importBusy || categoryLoading} className="block w-full rounded-md border border-[var(--oh-border)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--oh-surface)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--oh-text)] disabled:opacity-60" />
            </label>
            {importFileName && <p className="-mt-2 text-xs text-[var(--oh-muted)]">Selected: {importFileName}</p>}
            {importErrors.length > 0 && <div role="alert" className="max-h-32 overflow-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"><p className="font-semibold">Some rows need attention</p><ul className="mt-1 list-disc space-y-1 pl-5">{importErrors.slice(0, 30).map((message) => <li key={message}>{message}</li>)}</ul>{importErrors.length > 30 && <p className="mt-1">And {importErrors.length - 30} more row errors.</p>}</div>}
            {importRows.length > 0 && <>
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"><span>{importRows.length} valid product{importRows.length === 1 ? "" : "s"} ready to import</span><span>Up to 500 per file</span></div>
              <div className="max-h-64 overflow-auto rounded-md border border-[var(--oh-border)]">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="sticky top-0 bg-[#f7f8f8] font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">SKU / Barcode</th><th className="px-3 py-2 text-right">Sale price</th><th className="px-3 py-2 text-right">Cost</th></tr></thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">{importRows.slice(0, 30).map((row) => <tr key={row.line}><td className="px-3 py-2 text-[var(--oh-muted)]">{row.line}</td><td className="px-3 py-2 font-medium text-[var(--oh-text)]">{row.name}</td><td className="px-3 py-2 text-[var(--oh-muted)]">{row.default_code || "—"} / {row.barcode || "—"}</td><td className="px-3 py-2 text-right">{money(row.list_price)}</td><td className="px-3 py-2 text-right">{row.standard_price === undefined ? "—" : money(row.standard_price)}</td></tr>)}</tbody>
                </table>
                {importRows.length > 30 && <p className="border-t border-[var(--oh-border)] px-3 py-2 text-xs text-[var(--oh-muted)]">Showing the first 30 rows; {importRows.length - 30} more will be imported.</p>}
              </div>
            </>}
            {importResult && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950"><p className="font-semibold">Added {importResult.created} product{importResult.created === 1 ? "" : "s"} to Odoo; skipped {importResult.skipped.length} duplicate{importResult.skipped.length === 1 ? "" : "s"}.</p>{importResult.skipped.length > 0 && <ul className="mt-1 max-h-24 list-disc space-y-1 overflow-auto pl-5">{importResult.skipped.slice(0, 30).map((item) => <li key={`${item.line}-${item.reason}`}>Line {item.line}: {item.reason}.</li>)}</ul>}</div>}
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">This imports product details, sale prices and optional costs. It does not change on-hand stock; use an Odoo receipt or stock adjustment to load opening quantities. Products already matching an SKU or barcode are skipped.</p>
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50 sm:w-auto">{importResult ? "Done" : "Cancel"}</button>
              <button type="button" onClick={() => void runProductImport()} disabled={importBusy || importRows.length === 0 || Boolean(importResult)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{importBusy ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />} Import {importRows.length} product{importRows.length === 1 ? "" : "s"}</button>
            </footer>
          </div>
        </section>
      </div>}

      {newProductOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingProduct) setNewProductOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-create-title" className="text-lg font-semibold text-[var(--oh-text)]">New product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Add a stock-tracked product to the Odoo POS catalogue.</p></div>
            <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key="new-product" onSubmit={(event) => void createProduct(event)} className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Product name <span className="text-red-700">*</span></span>
              <input name="name" autoFocus maxLength={120} required className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Sale price (AUD)
                <input name="list_price" type="number" min="0" max="1000000" step="0.01" required defaultValue="0" className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">SKU
                <input name="default_code" maxLength={64} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Barcode
              <input name="barcode" maxLength={64} className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030]" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[var(--oh-text)]">POS categories <span className="font-normal text-[var(--oh-muted)]">(optional)</span></legend>
              <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border border-[var(--oh-border)] p-2 sm:grid-cols-2">
                {categories.map((category) => <label key={category.id} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
                  <input type="checkbox" name="pos_categ_ids" value={category.id} className="accent-[var(--oh-orange)]" />
                  <span className="truncate">{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</span>
                </label>)}
                {!categories.length && <p className="px-2 py-3 text-sm text-[var(--oh-muted)]">No POS categories are available. You can create the product without one.</p>}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-[var(--oh-text)]"><input type="checkbox" name="available_in_pos" defaultChecked className="mt-0.5 accent-[var(--oh-orange)]" /><span><span className="block font-medium">Available in POS</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Make the product searchable at the register.</span></span></label>
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">Odoo tracks stock quantities. Load opening stock through an Odoo receipt or adjustment.</p>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={creatingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creatingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Create product</button>
            </footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
