"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Download, FileUp, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  createOdooProduct,
  fetchOdooRoute,
  getOdooPosBootstrap,
  getOdooSession,
  importOdooProducts,
  searchOdooRecords,
  updateOdooProduct,
  type OdooPosCategoryRecord,
  type OdooProductRecord,
} from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { parseProductCsv, type ProductImportRow } from "@/lib/product-csv";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { ProductImage } from "@/components/ProductImage";
import { prepareProductImage } from "@/lib/product-image";

const PAGE_SIZE = 40;
const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
const quantity = (amount: number) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(amount);

export function OdooProductCataloguePage() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [items, setItems] = useState<OdooProductRecord[]>([]);
  const [categories, setCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryRetryKey, setCategoryRetryKey] = useState(0);
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
  const newProductNameInputRef = useRef<HTMLInputElement>(null);
  const productEditPriceInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  useDialogFocus(editingProduct !== null, () => {
    if (!savingProduct) setEditingProduct(null);
  }, undefined, productEditPriceInputRef);
  useDialogFocus(importOpen, () => {
    if (!importBusy) setImportOpen(false);
  }, undefined, importFileInputRef);
  useDialogFocus(newProductOpen, () => {
    if (!creatingProduct) setNewProductOpen(false);
  }, undefined, newProductNameInputRef);
  useLayoutEffect(() => {
    if (!importOpen || categoryLoading || importBusy) return;
    let attempts = 0;
    let frame = 0;
    const focusWhenReady = () => {
      const input = importFileInputRef.current;
      if (input && !input.disabled) {
        input.focus();
        return;
      }
      if (attempts < 8) {
        attempts += 1;
        frame = window.requestAnimationFrame(focusWhenReady);
      }
    };
    focusWhenReady();
    return () => window.cancelAnimationFrame(frame);
  }, [categoryLoading, importBusy, importOpen]);
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery !== null) setQuery(initialQuery);
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setCheckingConnection(true);
    void getOdooSession().then((user) => {
      if (!cancelled) setConnected(Boolean(user));
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check the Odoo connection.");
      }
    }).finally(() => {
      if (!cancelled) setCheckingConnection(false);
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey]);

  useEffect(() => {
    if (searchParams.get("import") === "1" && connected === true) {
      setImportRows([]);
      setImportErrors([]);
      setImportResult(null);
      setImportFileName("");
      setImportOpen(true);
    }
  }, [searchParams, connected]);

  useEffect(() => {
    if (connected !== true) return;
    let cancelled = false;
    void getOdooPosBootstrap().then((bootstrap) => {
      if (cancelled) return;
      const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
      if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
    }).catch(() => {
      // Keep Adelaide as the display fallback when bootstrap is unavailable.
    });
    return () => { cancelled = true; };
  }, [categoryRetryKey, connected]);

  async function exportProductsCsv() {
    if (exportBusy || connected !== true) return;
    setExportBusy(true);
    setError(null);
    try {
      // Keep exports on the same Odoo session recovery path as list reads.
      const response = await fetchOdooRoute("/api/odoo/products/export", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      anchor.href = url;
      anchor.download = match?.[1] || "products.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export products.");
    } finally {
      setExportBusy(false);
    }
  }

  const loadProducts = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooProductRecord>("products", {
        query: debouncedQuery,
        limit: PAGE_SIZE + 1,
        offset,
        categoryId: categoryId ?? undefined,
      });
      if (revision !== requestRevision.current) return;
      setItems(page.items.slice(0, PAGE_SIZE));
      setHasNext(page.items.length > PAGE_SIZE);
      setLastLoadedAt(Date.now());
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
    setCategoryError(null);
    void searchOdooRecords<OdooPosCategoryRecord>("posCategories", { limit: 100 })
      .then((result) => { if (!cancelled) { setCategories(result.items); setCategoryError(null); } })
      .catch((cause) => { if (!cancelled) setCategoryError(cause instanceof Error ? cause.message : "Product categories are unavailable."); })
      .finally(() => { if (!cancelled) setCategoryLoading(false); });
    return () => { cancelled = true; };
  }, [categoryRetryKey, connected]);

  function selectCategory(value: string) {
    setCategoryId(value ? Number(value) : null);
    setOffset(0);
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct || savingProduct) return;
    const form = new FormData(event.currentTarget);
    const price = Number(form.get("list_price"));
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      setEditError("Enter a sale price between 0 and 1,000,000.");
      return;
    }
    const formElement = event.currentTarget;
    const categoryIds = Array.from(formElement.querySelectorAll<HTMLInputElement>("input[name='pos_categ_ids']:checked"))
      .map((input) => Number(input.value));
    setSavingProduct(true);
    setEditError(null);
    try {
      const imageFile = form.get("product_image");
      const values = {
        barcode: String(form.get("barcode") ?? ""),
        default_code: String(form.get("default_code") ?? ""),
        list_price: price,
        available_in_pos: form.get("available_in_pos") === "on",
        ...(categoriesTouched ? { pos_categ_ids: categoryIds } : {}),
        ...(imageFile instanceof File && imageFile.size ? { image_1920: await prepareProductImage(imageFile) } : {}),
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
    if (!name) {
      setCreateError("Enter a product name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      setCreateError("Enter a sale price between 0 and 1,000,000.");
      return;
    }
    setCreatingProduct(true);
    setCreateError(null);
    try {
      const imageFile = form.get("product_image");
      await createOdooProduct({
        name,
        list_price: price,
        default_code: String(form.get("default_code") ?? "").trim(),
        barcode: String(form.get("barcode") ?? "").trim(),
        pos_categ_ids: form.getAll("pos_categ_ids").map(Number),
        available_in_pos: form.get("available_in_pos") === "on",
        ...(imageFile instanceof File && imageFile.size ? { image_1920: await prepareProductImage(imageFile) } : {}),
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
        <div className="grid grid-cols-2 items-center gap-2 sm:flex">
          <button type="button" onClick={() => void exportProductsCsv()} disabled={connected !== true || exportBusy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3">{exportBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}<span className="sm:hidden">Export</span><span className="hidden sm:inline">Export CSV</span></button>
          <button type="button" onClick={() => { setImportRows([]); setImportErrors([]); setImportResult(null); setImportFileName(""); setImportOpen(true); }} disabled={connected !== true} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"><FileUp size={16} /><span className="sm:hidden">Import</span><span className="hidden sm:inline">Import CSV</span></button>
          <button type="button" onClick={() => { setCreateError(null); setNewProductOpen(true); }} disabled={connected !== true} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New product</button>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh products" title="Refresh products" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 justify-self-end rounded-lg border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60 sm:w-auto sm:justify-self-auto sm:px-3">
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
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setConnectionRetryKey((value) => value + 1)} disabled={checkingConnection} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">{checkingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {checkingConnection ? "Retrying…" : "Retry connection"}</button>
              <Link href="/settings/integrations" className="inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Odoo</Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap gap-3">
            <label className="flex h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input aria-label="Search products by name, barcode or SKU" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, barcode or SKU" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <label className="oh-type-label grid w-full min-w-0 gap-1 text-[var(--oh-muted)] sm:w-[220px] sm:flex-none">
              POS category
              <select aria-busy={categoryLoading} value={categoryId ?? ""} onChange={(event) => selectCategory(event.target.value)} disabled={categoryLoading} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] outline-none transition-colors focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:opacity-60">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</option>)}
              </select>
            </label>
          </div>

          <p className="oh-type-meta -mt-2 shrink-0 leading-5 text-[var(--oh-muted)]">
            Stock quantities reflect the active Odoo inventory context. Use Odoo reports for location-specific counts.
            {lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}
          </p>
          {categoryError && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><span>{categoryError} Category filtering and CSV import may be unavailable until it reloads.</span><button type="button" onClick={() => setCategoryRetryKey((value) => value + 1)} disabled={categoryLoading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"><RefreshCw size={14} /> Retry categories</button></div>}
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Odoo product catalogue" className="hidden w-full min-w-[940px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Product</th>
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Barcode / SKU</th>
                  <th scope="col" className="px-4 py-3 text-right">On hand</th>
                  <th scope="col" className="px-4 py-3 text-right">List price</th>
                  <th scope="col" className="px-4 py-3">POS</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => <tr key={`product-skeleton-${index}`} aria-hidden="true">
                  <td colSpan={7} className="px-4 py-3"><div className="grid grid-cols-[1.3fr_1fr_1fr_.7fr_.7fr_.65fr_.55fr] items-center gap-4">
                    <span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-6 animate-pulse rounded-full bg-[var(--oh-border)]" /><span className="ml-auto h-11 w-16 animate-pulse rounded-lg bg-[var(--oh-border)]" />
                  </div></td>
                </tr>) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center"><div className="mx-auto max-w-md"><p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId ? "No matching products" : "No POS products yet"}</p><p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId ? "Try clearing search or category filters." : "Connect Odoo and confirm products are available in the POS catalogue."}</p>{debouncedQuery || categoryId ? <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Integrations</Link>}</div></td></tr>
                ) : items.map((product) => {
                  const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id)).filter(Boolean);
                  return (
                    <tr key={product.id} className="hover:bg-[var(--oh-tile-blue-bg)]/60">
                      <td className="px-4 py-3"><span className="flex items-center gap-2.5"><ProductImage productId={product.id} name={product.name} refreshToken={refreshKey} className="h-10 w-10 border border-[var(--oh-border)] bg-white" /><span className="min-w-0"><span className="block font-medium text-[var(--oh-text)]">{product.display_name || product.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Odoo #{product.id}</span></span></span></td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{productCategories.length ? productCategories.join(", ") : "Uncategorised"}</td>
                      <td className="px-4 py-3 text-[var(--oh-text-secondary)]"><span className="block">{product.barcode || "—"}</span>{product.default_code && <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">SKU {product.default_code}</span>}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${product.qty_available > 0 ? "text-[var(--oh-text)]" : "font-medium text-amber-700"}`}>{quantity(product.qty_available)}{product.uom_id && <span className="ml-1 text-xs text-[var(--oh-muted)]">{product.uom_id[1]}</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(product.list_price)}</td>
                      <td className="px-4 py-3">{product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden</span>}</td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${product.display_name || product.name}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-xs font-semibold text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Pencil size={14} /> Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <div role="status" aria-label="Loading products" className="divide-y divide-[var(--oh-border)]">
                  {Array.from({ length: 6 }, (_, index) => <div key={`product-mobile-skeleton-${index}`} aria-hidden="true" className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3"><span className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 w-20 animate-pulse rounded bg-[var(--oh-border)]" /></div>
                    <div className="mt-3 grid grid-cols-2 gap-3"><span className="h-3 w-28 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-3 w-24 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-3 w-20 animate-pulse rounded bg-[var(--oh-border)]" /></div>
                    <div className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3"><span className="h-11 w-20 animate-pulse rounded-lg bg-[var(--oh-border)]" /></div>
                  </div>)}
                  <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading products…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId ? "No matching products" : "No POS products yet"}</p>
                  <p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId ? "Try clearing search or category filters." : "Connect Odoo and confirm products are available in the POS catalogue."}</p>
                  {debouncedQuery || categoryId ? <button type="button" onClick={() => { setQuery(""); setCategoryId(null); }} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Integrations</Link>}
                </div>
              ) : items.map((product) => {
                const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id)).filter(Boolean);
                return (
                  <article key={product.id} className="px-4 py-3.5">
                    <header className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3"><ProductImage productId={product.id} name={product.name} refreshToken={refreshKey} className="h-14 w-14 border border-[var(--oh-border)] bg-white" /><div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--oh-text)]">{product.display_name || product.name}</p><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Odoo #{product.id}{product.default_code ? ` · SKU ${product.default_code}` : ""}</p></div></div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{money(product.list_price)}</p>
                    </header>
                    <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs min-[360px]:grid-cols-2">
                      <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Category</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]">{productCategories.length ? productCategories.join(", ") : "Uncategorised"}</dd></div>
                      <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Barcode</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]" title={product.barcode || undefined}>{product.barcode || "—"}</dd></div>
                      <div className="flex items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">On hand</dt><dd className={`tabular-nums ${product.qty_available > 0 ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-700"}`}>{quantity(product.qty_available)}{product.uom_id && <span className="ml-1 text-[var(--oh-muted)]">{product.uom_id[1]}</span>}</dd></div>
                    </dl>
                    <footer className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--oh-border)] pt-2">
                      {product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available in POS</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden from POS</span>}
                      <button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${product.display_name || product.name}`} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-xs font-semibold text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Pencil size={14} /> Edit</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>

          <footer className="flex shrink-0 flex-col gap-2 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{items.length ? `Page ${Math.floor(offset / PAGE_SIZE) + 1} · Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || loading} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {editingProduct && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingProduct) setEditingProduct(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-edit-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-edit-title" className="text-lg font-semibold text-[var(--oh-text)]">Edit product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingProduct.display_name || editingProduct.name} · Odoo #{editingProduct.id}</p></div>
            <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form onSubmit={(event) => void saveProduct(event)} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Sale price
                <input ref={productEditPriceInputRef} name="list_price" type="number" min="0" max="1000000" step="0.01" required defaultValue={editingProduct.list_price} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">SKU
                <input name="default_code" maxLength={64} defaultValue={editingProduct.default_code || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Barcode
              <input name="barcode" maxLength={64} defaultValue={editingProduct.barcode || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[var(--oh-text)]">Product image <span className="text-xs font-normal text-[var(--oh-muted)]">Optional · saved to Odoo and compressed before upload</span>
              <div className="flex items-center gap-3"><ProductImage productId={editingProduct.id} name={editingProduct.name} refreshToken={refreshKey} className="h-16 w-16 border border-[var(--oh-border)] bg-white" /><input name="product_image" type="file" accept="image/jpeg,image/png,image/webp" disabled={savingProduct} className="min-w-0 flex-1 text-xs file:mr-2 file:min-h-10 file:rounded-md file:border-0 file:bg-[var(--oh-surface)] file:px-3 file:font-semibold file:text-[var(--oh-text)]" /></div>
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[var(--oh-text)]">POS categories</legend>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-[var(--oh-border)] p-2 sm:grid-cols-2">
                {categories.map((category) => <label key={category.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
                  <input type="checkbox" name="pos_categ_ids" value={category.id} defaultChecked={editingProduct.pos_categ_ids.includes(category.id)} onChange={() => setCategoriesTouched(true)} className="accent-[var(--oh-primary)]" />
                  <span className="truncate">{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</span>
                </label>)}
                {!categories.length && <p className="px-2 py-3 text-sm text-[var(--oh-muted)]">No POS categories are available.</p>}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-[var(--oh-text)]"><input type="checkbox" name="available_in_pos" defaultChecked={editingProduct.available_in_pos} className="mt-0.5 accent-[var(--oh-primary)]" /><span><span className="block font-medium">Available in POS</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Hide this product from register searches without deleting it.</span></span></label>
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">Stock on hand is controlled by Odoo receipts and inventory adjustments, so it cannot be edited here.</p>
            {editError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{editError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={savingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{savingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save changes</button>
            </footer>
          </form>
        </section>
      </div>}

      {importOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !importBusy) setImportOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-import-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-import-title" className="text-lg font-semibold text-[var(--oh-text)]">Import products from CSV</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Preview and validate your catalogue before adding products to Odoo.</p></div>
            <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <div className="mt-5 grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
              <div><p className="text-sm font-semibold text-[var(--oh-text)]">CSV columns</p><p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">Required: Product Name, Sale Price. Optional: SKU, Barcode, Cost, POS Category. English and common Chinese headers are supported.</p></div>
              <a href="/product-import-template.csv" download className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-xs font-semibold text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Download size={14} /> Download template</a>
            </div>
            <label className="grid gap-2 text-sm font-medium text-[var(--oh-text)]">Choose a CSV file
              <input ref={importFileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void selectImportFile(event)} disabled={importBusy || categoryLoading} className="block w-full rounded-md border border-[var(--oh-border)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--oh-surface)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--oh-text)] disabled:opacity-60" />
            </label>
            {importFileName && <p className="-mt-2 text-xs text-[var(--oh-muted)]">Selected: {importFileName}</p>}
            {importErrors.length > 0 && <div role="alert" className="max-h-32 overflow-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"><p className="font-semibold">Some rows need attention</p><ul className="mt-1 list-disc space-y-1 pl-5">{importErrors.slice(0, 30).map((message) => <li key={message}>{message}</li>)}</ul>{importErrors.length > 30 && <p className="mt-1">And {importErrors.length - 30} more row errors.</p>}</div>}
            {importRows.length > 0 && <>
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"><span>{importRows.length} valid product{importRows.length === 1 ? "" : "s"} ready to import</span><span>Up to 500 per file</span></div>
              <div className="max-h-64 overflow-auto rounded-md border border-[var(--oh-border)]">
                <table aria-label="Product import preview" className="w-full min-w-[620px] text-left text-xs">
                  <thead className="sticky top-0 bg-[#f7f8f8] font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th scope="col" className="px-3 py-2">Line</th><th scope="col" className="px-3 py-2">Product</th><th scope="col" className="px-3 py-2">SKU / Barcode</th><th scope="col" className="px-3 py-2 text-right">Sale price</th><th scope="col" className="px-3 py-2 text-right">Cost</th></tr></thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">{importRows.slice(0, 30).map((row) => <tr key={row.line}><td className="px-3 py-2 text-[var(--oh-muted)]">{row.line}</td><td className="px-3 py-2 font-medium text-[var(--oh-text)]">{row.name}</td><td className="px-3 py-2 text-[var(--oh-muted)]">{row.default_code || "—"} / {row.barcode || "—"}</td><td className="px-3 py-2 text-right">{money(row.list_price)}</td><td className="px-3 py-2 text-right">{row.standard_price === undefined ? "—" : money(row.standard_price)}</td></tr>)}</tbody>
                </table>
                {importRows.length > 30 && <p className="border-t border-[var(--oh-border)] px-3 py-2 text-xs text-[var(--oh-muted)]">Showing the first 30 rows; {importRows.length - 30} more will be imported.</p>}
              </div>
            </>}
            {importResult && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950"><p className="font-semibold">Added {importResult.created} product{importResult.created === 1 ? "" : "s"} to Odoo; skipped {importResult.skipped.length} duplicate{importResult.skipped.length === 1 ? "" : "s"}.</p>{importResult.skipped.length > 0 && <ul className="mt-1 max-h-24 list-disc space-y-1 overflow-auto pl-5">{importResult.skipped.slice(0, 30).map((item) => <li key={`${item.line}-${item.reason}`}>Line {item.line}: {item.reason}.</li>)}</ul>}</div>}
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">This imports product details, sale prices and optional costs. It does not change on-hand stock; use an Odoo receipt or stock adjustment to load opening quantities. Products already matching an SKU or barcode are skipped.</p>
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">{importResult ? "Done" : "Cancel"}</button>
              <button type="button" onClick={() => void runProductImport()} disabled={importBusy || importRows.length === 0 || Boolean(importResult)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{importBusy ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />} Import {importRows.length} product{importRows.length === 1 ? "" : "s"}</button>
            </footer>
          </div>
        </section>
      </div>}

      {newProductOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingProduct) setNewProductOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-create-title" className="text-lg font-semibold text-[var(--oh-text)]">New product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Add a stock-tracked product to the Odoo POS catalogue.</p></div>
            <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key="new-product" onSubmit={(event) => void createProduct(event)} className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Product name <span className="text-red-700">*</span></span>
              <input ref={newProductNameInputRef} name="name" maxLength={120} required className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Sale price (AUD)
                <input name="list_price" type="number" min="0" max="1000000" step="0.01" required defaultValue="0" className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">SKU
                <input name="default_code" maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Barcode
              <input name="barcode" maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[var(--oh-text)]">Product image <span className="text-xs font-normal text-[var(--oh-muted)]">Optional · use a real product or package photo</span>
              <input name="product_image" type="file" accept="image/jpeg,image/png,image/webp" className="min-w-0 text-xs file:mr-2 file:min-h-10 file:rounded-md file:border-0 file:bg-[var(--oh-surface)] file:px-3 file:font-semibold file:text-[var(--oh-text)]" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[var(--oh-text)]">POS categories <span className="font-normal text-[var(--oh-muted)]">(optional)</span></legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-[var(--oh-border)] p-2 sm:grid-cols-2">
                {categories.map((category) => <label key={category.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]">
                  <input type="checkbox" name="pos_categ_ids" value={category.id} className="accent-[var(--oh-primary)]" />
                  <span className="truncate">{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</span>
                </label>)}
                {!categories.length && <p className="px-2 py-3 text-sm text-[var(--oh-muted)]">No POS categories are available. You can create the product without one.</p>}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-[var(--oh-text)]"><input type="checkbox" name="available_in_pos" defaultChecked className="mt-0.5 accent-[var(--oh-primary)]" /><span><span className="block font-medium">Available in POS</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">Make the product searchable at the register.</span></span></label>
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">Odoo tracks stock quantities. Load opening stock through an Odoo receipt or adjustment.</p>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={creatingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creatingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Create product</button>
            </footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
