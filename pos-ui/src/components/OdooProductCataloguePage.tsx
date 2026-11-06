"use client";
import { clearOdooReadCache } from "@/lib/odoo-read-cache";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { groupCategories } from "@/lib/category-groups";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Check, Download, Eye, FileUp, LoaderCircle, Pencil, Plus, Printer, RefreshCw, Search, Tag, X } from "lucide-react";
import {
  createOdooProduct,
  fetchOdooRoute,
  getOdooPosBootstrap,
  getOdooSession,
  importOdooProducts,
  OdooApiError,
  searchOdooRecords,
  updateOdooProduct,
  type OdooPosCategoryRecord,
  type OdooPage,
  type OdooProductRecord,
} from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { parseProductCsv, type ProductImportRow } from "@/lib/product-csv";
import { useAuth } from "@/lib/auth";
import { StockWorkspaceDialog } from "@/components/admin/StockWorkspaceDialog";
import { StockListPage } from "@/components/admin/StockListPage";
import { WorkspaceRecordsPanel } from "@/components/WorkspaceRecordsPanel";
import { CostReconciliationPanel } from "@/components/CostReconciliationPanel";
import { OdooPricelistsPage } from "@/components/OdooPricelistsPage";
import { OdooCategoriesPanel } from "@/components/admin/OdooCategoriesPanel";
import { OdooStocktakePanel } from "@/components/admin/OdooStocktakePanel";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useShopfrontSyncRefresh } from "@/hooks/useShopfrontSyncRefresh";
import { ShopfrontInventorySummary, ShopfrontProductHistorySection } from "@/components/ShopfrontSourceSections";
import { ProductImage } from "@/components/ProductImage";
import { Sparkline } from "@/components/admin/Sparkline";
import { prepareProductImage } from "@/lib/product-image";
import { CATALOGUE_VIEWS, type CatalogueView } from "@/lib/product-catalogue";
import { CatalogueIssues, CataloguePrice, CatalogueProductDetails } from "@/components/admin/CatalogueProductDetails";
import {
  friendlyProductName,
  looksLikeR2ImportMarker,
  truncateSku,
} from "@/lib/product-display-name";
import { type InventorySort, type InventoryDirection, type InventoryTotals } from "@/lib/inventory-report";

const PAGE_SIZE = 40;
const INVENTORY_COLUMNS = [
  { key: "product", label: "Product" }, { key: "category", label: "Category" },
  { key: "barcode", label: "Barcode" }, { key: "sku", label: "SKU" },
  { key: "quantity", label: "Inventory" }, { key: "unit", label: "Unit" },
  { key: "price", label: "Sale price" }, { key: "pos", label: "POS" },
] as const;
const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
const quantity = (amount: number) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(amount);

export function OdooProductCataloguePage({ inventoryReport = false }: { inventoryReport?: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  const canAuditCosts = user?.isAdmin === true || user?.roleCode === "ADMIN";
  const [stockBusy, setStockBusy] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const dialog = searchParams.get("dialog");
  const dialogBusy = stockBusy || categoryBusy;
  function setDialog(value: string | null) {
    if (dialogBusy) return;
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set("dialog", value); else next.delete("dialog");
    router.replace(`/products${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  useEffect(() => {
    const guardBack = (event: PopStateEvent) => { if (dialogBusy) { event.stopImmediatePropagation(); window.history.go(1); } };
    window.addEventListener("popstate", guardBack, true);
    return () => window.removeEventListener("popstate", guardBack, true);
  }, [dialogBusy]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [items, setItems] = useState<OdooProductRecord[]>([]);
  const [printItems, setPrintItems] = useState<OdooProductRecord[] | null>(null);
  const [categories, setCategories] = useState<OdooPosCategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const requestedView = searchParams.get("view");
  const [catalogueView, setCatalogueView] = useState<CatalogueView>(() =>
    CATALOGUE_VIEWS.some((view) => view.value === requestedView) ? requestedView as CatalogueView : "all",
  );
  const [shopfrontSyncBanner, setShopfrontSyncBanner] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<OdooProductRecord | null>(null);
  const [sortBy, setSortBy] = useState<InventorySort>(() => {
    if (!inventoryReport) return "name";
    const value = searchParams.get("sort");
    return value === "category" || value === "qty_available" || value === "price_included" ? value : "name";
  });
  const [sortDirection, setSortDirection] = useState<InventoryDirection>(() => inventoryReport && searchParams.get("direction") === "desc" ? "desc" : "asc");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "zero" | "negative">(() => {
    const value = searchParams.get("stock");
    return value === "zero" || value === "negative" ? value : "all";
  });
  const [inventoryColumns, setInventoryColumns] = useState<string[]>(() => {
    const saved = searchParams.get("columns");
    const selected = saved?.split(",").filter((key) => INVENTORY_COLUMNS.some((column) => column.key === key));
    return selected?.length ? selected : INVENTORY_COLUMNS.map((column) => column.key);
  });
  const [totals, setTotals] = useState<InventoryTotals | null>(null);
  const [shopfrontCoverage, setShopfrontCoverage] = useState<OdooPage<OdooProductRecord>["shopfrontCoverage"] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expired, setExpired] = useState(false);
  const snapshotId = useRef<string | undefined>(undefined);
  const nextOffset = useRef(0);
  const requestBusy = useRef(false);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadedQuery = useRef("");
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const [inventorySource, setInventorySource] = useState<{ company: string; timezone: string; source: string; generatedAt: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string } | null } | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryRetryKey, setCategoryRetryKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!inventoryReport) return;
    const stock = searchParams.get("stock");
    setInventoryFilter(stock === "zero" || stock === "negative" ? stock : "all");
    const sort = searchParams.get("sort");
    setSortBy(sort === "category" || sort === "qty_available" || sort === "price_included" ? sort : "name");
    setSortDirection(searchParams.get("direction") === "desc" ? "desc" : "asc");
  }, [inventoryReport, searchParams]);
  const categoriesChanged = useCallback(() => { setCategoryRetryKey((value) => value + 1); setRefreshKey((value) => value + 1); }, []);
  const stockApplied = useCallback(() => setRefreshKey((value) => value + 1), []);
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
  const [priceListsOpen, setPriceListsOpen] = useState(false);
  const resultsPending = loading || query.trim() !== debouncedQuery;
  const renderedProductCount = printItems?.length ?? items.length;
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
  useDialogFocus(priceListsOpen, () => setPriceListsOpen(false));
  useEffect(() => {
    if (requestedView && CATALOGUE_VIEWS.some((view) => view.value === requestedView)) {
      setCatalogueView(requestedView as CatalogueView);
    }
  }, [requestedView]);
  useEffect(() => {
    if (!inventoryReport) return;
    const saved = searchParams.get("columns");
    if (!saved) { setInventoryColumns(INVENTORY_COLUMNS.map((column) => column.key)); return; }
    const selected = saved.split(",").filter((key) => INVENTORY_COLUMNS.some((column) => column.key === key));
    setInventoryColumns(selected.length ? Array.from(new Set(["product", ...selected])) : INVENTORY_COLUMNS.map((column) => column.key));
  }, [inventoryReport, searchParams]);
  useEffect(() => {
    if (!inventoryReport) return;
    const params = new URLSearchParams(searchParams.toString());
    const value = debouncedQuery.trim();
    if (value) params.set("q", value); else params.delete("q");
    if (params.toString() !== searchParams.toString()) {
      router.replace(`/reports/inventory${params.size ? `?${params}` : ""}`, { scroll: false });
    }
  }, [debouncedQuery, inventoryReport, router, searchParams]);
  useEffect(() => {
    if (!inventoryReport) return;
    let cancelled = false;
    void fetchOdooRoute("/api/odoo/inventory-report", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as typeof inventorySource & { message?: string };
        if (!response.ok || !body || typeof body.company !== "string") throw new Error(body?.message || "Inventory source metadata is unavailable.");
        if (!cancelled) {
          setInventorySource(body);
          setStoreTimezone(body.timezone || "Australia/Adelaide");
        }
      })
      .catch(() => { if (!cancelled) setInventorySource(null); });
    return () => { cancelled = true; };
  }, [inventoryReport, refreshKey]);
  useShopfrontSyncRefresh(() => {
    setShopfrontSyncBanner(true);
    setRefreshKey((value) => value + 1);
  });
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
  const tab = searchParams.get("tab") === "stocktake" ? "stocktake" : "catalogue";
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const categoryGroups = useMemo(() => groupCategories(categories), [categories]);
  const categoryOptions = useMemo(() => categoryGroups.map((group) => group[0]), [categoryGroups]);

  const showImportDisplayNote = useMemo(
    () => items.some((product) => {
      const displayName = typeof product.display_name === "string" ? product.display_name : product.name;
      const sku = typeof product.default_code === "string" ? product.default_code : undefined;
      return looksLikeR2ImportMarker(displayName) || looksLikeR2ImportMarker(sku);
    }),
    [items],
  );

  const requestedQuery = searchParams.get("q");
  useEffect(() => {
    if (requestedQuery !== null) setQuery(requestedQuery);
    else if (inventoryReport) setQuery("");
  }, [requestedQuery, inventoryReport]);
  const requestedCategoryId = searchParams.get("categoryId");
  useEffect(() => {
    const parsed = Number(requestedCategoryId);
    setCategoryId(requestedCategoryId !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
  }, [requestedCategoryId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setRefreshKey((value) => value + 1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (dialog === "cost-reconciliation") { setCheckingConnection(false); return; }
    let cancelled = false;
    setCheckingConnection(true);
    void getOdooSession().then((user) => {
      if (!cancelled) setConnected(Boolean(user));
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check the Orithos connection.");
      }
    }).finally(() => {
      if (!cancelled) setCheckingConnection(false);
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey, dialog]);

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
    if (dialog === "cost-reconciliation") return;
    let cancelled = false;
    void getOdooPosBootstrap().then((bootstrap) => {
      if (cancelled) return;
      const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
      if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
    }).catch(() => {
      // Keep Adelaide as the display fallback when bootstrap is unavailable.
    });
    return () => { cancelled = true; };
  }, [categoryRetryKey, connected, dialog]);

  async function loadAllInventoryMatches() {
    if (!snapshotId.current) throw new Error("Inventory snapshot is not ready. Refresh and try again.");
    const categoryIds = categoryId ? (categoryGroups.find((group) => group.some((item) => item.id === categoryId))?.map((item) => item.id) ?? [categoryId]) : undefined;
    const matches: OdooProductRecord[] = [];
    let offset = 0;
    for (;;) {
      const page = await searchOdooRecords<OdooProductRecord>("products", {
        query: debouncedQuery, limit: 100, offset, categoryIds, catalogueView,
        inventoryReport: true, inventoryFilter, sortBy, sortDirection, snapshotId: snapshotId.current,
      });
      if (!page.snapshotId || (page.hasNext && page.items.length === 0)) throw new Error("Inventory snapshot is incomplete. Refresh and try again.");
      matches.push(...page.items);
      offset = page.offset + page.items.length;
      if (!page.hasNext) break;
    }
    return matches;
  }

  function downloadInventoryCsv(products: OdooProductRecord[]) {
    const labels: Record<string, string> = { product: "Product", category: "Category", barcode: "Barcode", sku: "SKU", quantity: "Inventory", unit: "Unit", price: "Sale price (AUD)", pos: "POS" };
    const cell = (value: string | number) => {
      const text = String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const values = (product: OdooProductRecord): Record<string, string | number> => ({
      product: friendlyProductName(product.display_name || product.name),
      category: product.pos_categ_ids.map((id) => categoryNames.get(id) ?? `Category #${id}`).join(", ") || "Uncategorised",
      barcode: product.barcode || "", sku: product.default_code || "", quantity: product.qty_available,
      unit: product.uom_id ? product.uom_id[1] : "", price: product.price_included ?? "", pos: product.available_in_pos ? "Available" : "Hidden",
    });
    const columns = INVENTORY_COLUMNS.filter((column) => inventoryColumns.includes(column.key));
    const rows = products.map((product) => { const row = values(product); return columns.map((column) => row[column.key]); });
    const csv = `\uFEFF${[columns.map((column) => labels[column.key]), ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `inventory-${inventoryFilter}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function exportProductsCsv() {
    if (exportBusy || connected !== true) return;
    setExportBusy(true);
    setError(null);
    try {
      if (inventoryReport) {
        downloadInventoryCsv(await loadAllInventoryMatches());
        return;
      }
      // Keep exports on the same Orithos session recovery path as list reads.
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

  async function printInventoryReport() {
    if (!inventoryReport || connected !== true) return;
    try {
      const matches = await loadAllInventoryMatches();
      window.addEventListener("afterprint", () => setPrintItems(null), { once: true });
      setPrintItems(matches);
      window.setTimeout(() => window.print(), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare inventory for printing.");
    }
  }

  const refreshVersion = useRef(refreshKey);
  const loadProducts = useCallback(async (append = false) => {
    const forceRefresh = refreshVersion.current !== refreshKey;
    refreshVersion.current = refreshKey;
    if (connected !== true || dialog === "cost-reconciliation") return;
    if (append && (requestBusy.current || (inventoryReport && !snapshotId.current))) return;
    const revision = ++requestRevision.current;
    requestBusy.current = true;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
      setHasNext(false);
      setTotals(null);
      if (!inventoryReport) setShopfrontCoverage(null);
      snapshotId.current = undefined;
      nextOffset.current = 0;
    }
    setExpired(false);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooProductRecord>("products", {
        query: debouncedQuery,
        limit: PAGE_SIZE,
        offset: append ? nextOffset.current : 0,
        categoryIds: categoryId ? (categoryGroups.find((group) => group.some((item) => item.id === categoryId))?.map((item) => item.id) ?? [categoryId]) : undefined,
        catalogueView,
        ...(inventoryReport ? {
          inventoryReport: true,
          refresh: forceRefresh,
          sortBy,
          sortDirection,
          inventoryFilter,
          snapshotId: append ? snapshotId.current : undefined,
        } : {}),
      });
      if (revision !== requestRevision.current) return;
      if (inventoryReport && (!page.snapshotId || !page.generatedAt || typeof page.totalItems !== "number" || page.totalQty === undefined || page.totalStockValue === undefined || (page.hasNext && page.items.length === 0))) {
        throw new Error("Inventory results are incomplete. Refresh to try again.");
      }
      setItems((previous) => append ? [...previous, ...page.items.filter((item) => !previous.some((row) => row.id === item.id))] : page.items);
      snapshotId.current = page.snapshotId;
      nextOffset.current = page.offset + page.items.length;
      setTotals({ totalItems: page.totalItems ?? page.total ?? 0, totalQty: page.totalQty ?? null, negativeStockItems: page.negativeStockItems ?? 0, totalStockValue: page.totalStockValue ?? null, missingCostItems: page.missingCostItems ?? 0, mixedUnits: page.mixedUnits ?? false });
      if (!inventoryReport) setShopfrontCoverage(page.shopfrontCoverage ?? null);
      setHasNext(page.hasNext === true);
      if (!append) setLastLoadedAt(page.generatedAt ? Date.parse(page.generatedAt) : null);
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load Orithos products.");
        setExpired(cause instanceof OdooApiError && cause.status === 409);
      }
    } finally {
      if (revision === requestRevision.current) {
        requestBusy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [categoryId, categoryGroups, catalogueView, connected, debouncedQuery, dialog, inventoryFilter, inventoryReport, sortBy, sortDirection, refreshKey]);

  useEffect(() => {
    if (dialog === "cost-reconciliation") { setLoading(false); return; }
    const key = JSON.stringify([categoryId, categoryGroups, catalogueView, debouncedQuery, sortBy, sortDirection, inventoryFilter]);
    if (loadedQuery.current !== key) {
      setItems([]);
      loadedQuery.current = key;
    }
    scrollRoot.current?.scrollTo({ top: 0 });
    void loadProducts();
    return () => { requestRevision.current += 1; requestBusy.current = false; };
  }, [loadProducts, refreshKey, categoryId, categoryGroups, catalogueView, debouncedQuery, sortBy, sortDirection, inventoryFilter, dialog]);

  useEffect(() => {
    if (!hasNext || resultsPending || loadingMore || error || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadProducts(true);
    }, { root: scrollRoot.current, rootMargin: "0px 0px 240px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNext, resultsPending, loadingMore, error, loadProducts, tab]);

  function changeSort(field: InventorySort, direction?: InventoryDirection) {
    requestRevision.current += 1;
    setLoading(true);
    const nextDirection = direction ?? (field === sortBy && sortDirection === "asc" ? "desc" : "asc");
    setSortDirection(nextDirection);
    setSortBy(field);
    if (inventoryReport) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", field); params.set("direction", nextDirection);
      router.replace(`/reports/inventory?${params}`, { scroll: false });
    }
  }

  function toggleInventoryColumn(key: string) {
    setInventoryColumns((current) => {
      const next = current.includes(key) ? current.filter((column) => column !== key) : INVENTORY_COLUMNS.map((column) => column.key).filter((column) => current.includes(column) || column === key);
      const params = new URLSearchParams(searchParams.toString());
      params.set("columns", next.join(","));
      router.replace(`/reports/inventory?${params}`, { scroll: false });
      return next;
    });
  }

  function sortHeader(field: InventorySort, label: string) {
    const active = sortBy === field;
    const Icon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return <th scope="col" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-2 ${field === "qty_available" || field === "price_included" ? "text-right" : ""}`}>
      <button type="button" onClick={() => changeSort(field)} className="inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-xs font-semibold uppercase focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{label}<Icon aria-hidden="true" size={14} /></button>
    </th>;
  }

  useEffect(() => {
    if (connected !== true || dialog === "cost-reconciliation") return;
    let cancelled = false;
    setCategoryLoading(true);
    setCategoryError(null);
    void (async () => {
      const all: OdooPosCategoryRecord[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await searchOdooRecords<OdooPosCategoryRecord>("posCategories", { limit: 100, offset });
        all.push(...page.items);
        if (!page.hasNext) return { items: all };
        if (!page.items.length) throw new Error("Category pagination is unavailable.");
      }
    })()
      .then((result) => { if (!cancelled) { setCategories(result.items); setCategoryError(null); } })
      .catch((cause) => { if (!cancelled) setCategoryError(cause instanceof Error ? cause.message : "Product categories are unavailable."); })
      .finally(() => { if (!cancelled) setCategoryLoading(false); });
    return () => { cancelled = true; };
  }, [categoryRetryKey, connected, dialog]);

  function selectCategory(value: string) {
    requestRevision.current += 1;
    setLoading(true);
    const selected = value ? Number(value) : null;
    setCategoryId(selected);
    if (inventoryReport) {
      const params = new URLSearchParams(searchParams.toString());
      if (selected) params.set("categoryId", String(selected)); else params.delete("categoryId");
      router.replace(`/reports/inventory${params.size ? `?${params}` : ""}`, { scroll: false });
    }
  }

  function selectView(value: CatalogueView) {
    requestRevision.current += 1;
    setLoading(true);
    setCatalogueView(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("view"); else params.set("view", value);
    const path = inventoryReport ? "/reports/inventory" : "/products";
    router.replace(`${path}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  function clearFilters() {
    requestRevision.current += 1;
    setLoading(true);
    setQuery("");
    setDebouncedQuery("");
    setCategoryId(null);
    setCatalogueView("all");
    if (inventoryReport) setInventoryFilter("all");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("categoryId");
    params.delete("view");
    if (inventoryReport) params.delete("stock");
    const path = inventoryReport ? "/reports/inventory" : "/products";
    router.replace(`${path}${params.size ? `?${params}` : ""}`, { scroll: false });
    setRefreshKey((value) => value + 1);
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
      setEditError(cause instanceof Error ? cause.message : "Could not update this Orithos product.");
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
      setCatalogueView("all");
      setCategoryId(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Could not create this Orithos product.");
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
      setImportErrors([cause instanceof Error ? cause.message : "Could not import these products into Orithos."]);
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] print:overflow-visible print:h-auto">
      <div ref={scrollRoot} data-testid="product-results-scroll" className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto overscroll-y-contain px-4 pb-4 md:px-6 print:overflow-visible print:h-auto">
      <header inert={stockBusy || categoryBusy} className="mt-4 flex shrink-0 flex-col items-stretch gap-3 md:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">{inventoryReport ? "Inventory report" : "Products"}</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">
            {tab === "stocktake" ? "Count physical stock and apply Orithos adjustments when write is enabled." : "Manage your catalogue, check stock and resolve product issues."}
          </p>
          {tab === "catalogue" && showImportDisplayNote && (
            <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">
              Legacy import prefixes are hidden in the list; source SKUs remain available for reconciliation.
            </p>
          )}

        </div>
        {tab === "catalogue" && (
        <div className="print:hidden flex w-full items-center justify-end gap-2 sm:w-auto">
          {!inventoryReport && <button type="button" onClick={() => { setCreateError(null); setNewProductOpen(true); }} disabled={connected !== true} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New product</button>}
          <button type="button" onClick={() => { clearOdooReadCache(); setRefreshKey((value) => value + 1); }} disabled={loading} aria-label="Refresh products" title="Refresh products" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60 sm:w-auto sm:px-3">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}<span className="hidden sm:inline">Refresh</span>
          </button>
          {inventoryReport && hasPermission("stock.products.view") && <button type="button" onClick={() => void exportProductsCsv()} disabled={connected !== true || exportBusy || loading} aria-label="Export all matching inventory rows to CSV" title="Export all matching inventory rows" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-white disabled:opacity-50">{exportBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}</button>}
          {inventoryReport && hasPermission("stock.products.view") && <button type="button" onClick={() => void printInventoryReport()} disabled={connected !== true || loading} aria-label="Print all matching inventory rows" title="Print all matching inventory rows" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-white disabled:opacity-50"><Printer size={16} /></button>}
          {inventoryReport && <ReportColumnChooser columns={[...INVENTORY_COLUMNS]} selected={inventoryColumns} required={["product"]} onChange={toggleInventoryColumn} />}
          {!inventoryReport && (canAuditCosts || hasPermission("stock.products.view") || hasPermission("stock.products.edit") || hasPermission("stock.stocktake") || hasPermission("stock.products.import_export") || hasPermission("customers.pricelists")) && <details className="relative"><summary className="cursor-pointer rounded-lg border border-[var(--oh-border)] px-3 py-3 text-sm">More</summary><div className="absolute right-0 z-20 mt-2 flex w-52 flex-col gap-2 rounded-lg border bg-white p-2 shadow-lg">
          {canAuditCosts && <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("cost-reconciliation"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Cost Reconciliation</button>}
          {hasPermission("stock.products.view") && <><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("stock-list"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Stock list</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("catalogue"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Catalogue</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("inventory"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Inventory</button></>}
          {hasPermission("stock.stocktake") && <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("stocktake"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Stocktake</button>}
          {hasPermission("stock.products.edit") && <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDialog("categories"); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Manage Categories</button>}
          {hasPermission("stock.products.import_export") && <><button type="button" onClick={() => void exportProductsCsv()} disabled={connected !== true || exportBusy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3">{exportBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}<span className="sm:hidden">Export</span><span className="hidden sm:inline">Export CSV</span></button>
          <button type="button" onClick={() => { setImportRows([]); setImportErrors([]); setImportResult(null); setImportFileName(""); setImportOpen(true); }} disabled={connected !== true} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"><FileUp size={16} /><span className="sm:hidden">Import</span><span className="hidden sm:inline">Import CSV</span></button></>}
          {hasPermission("customers.pricelists") && <button type="button" onClick={() => setPriceListsOpen(true)} disabled={connected !== true} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2.5 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"><Tag size={16} /><span>Price Lists</span></button>}
          </div></details>}
        </div>
        )}
      </header>

      {dialog === "catalogue" && hasPermission("stock.products.view") && <StockWorkspaceDialog title="Catalogue" variant="records" busy={false} onClose={() => setDialog(null)}><WorkspaceRecordsPanel type="catalogue" fillHeight refreshKey={refreshKey} /></StockWorkspaceDialog>}
      {dialog === "inventory" && hasPermission("stock.products.view") && <StockWorkspaceDialog title="Inventory" variant="records" busy={false} onClose={() => setDialog(null)}><WorkspaceRecordsPanel type="inventory" fillHeight refreshKey={refreshKey} /></StockWorkspaceDialog>}
      {dialog === "stock-list" && hasPermission("stock.products.view") && <StockWorkspaceDialog title="Stock list" variant="records" busy={false} onClose={() => setDialog(null)}><StockListPage /></StockWorkspaceDialog>}
      {dialog === "cost-reconciliation" && canAuditCosts && <StockWorkspaceDialog title="Cost Reconciliation" busy={false} onClose={() => setDialog(null)} actions={<Link href="/products/cost-reconciliation" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm">Expand to full page</Link>}><CostReconciliationPanel /></StockWorkspaceDialog>}
      {dialog === "categories" && hasPermission("stock.products.edit") && <StockWorkspaceDialog title="Manage Categories" busy={categoryBusy} onClose={() => setDialog(null)}><OdooCategoriesPanel onBusyChange={setCategoryBusy} onChanged={categoriesChanged} /></StockWorkspaceDialog>}
      {dialog === "stocktake" && hasPermission("stock.stocktake") && <StockWorkspaceDialog title="Stocktake" busy={stockBusy} onClose={() => setDialog(null)} actions={<button type="button" disabled={stockBusy} onClick={() => { const next = new URLSearchParams(searchParams.toString()); next.delete("dialog"); next.set("tab", "stocktake"); router.replace(`/products?${next}`, { scroll: false }); }} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">Expand to full page</button>}><OdooStocktakePanel onBusyChange={setStockBusy} onApplied={stockApplied} /></StockWorkspaceDialog>}
      {priceListsOpen && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPriceListsOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="products-price-lists-title" className="h-[min(90dvh,900px)] w-full max-w-6xl overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] shadow-2xl">
          <header className="flex items-center justify-between border-b border-[var(--oh-border)] bg-white px-4 py-3">
            <h2 id="products-price-lists-title" className="text-base font-semibold text-[var(--oh-text)]">Price Lists</h2>
            <button type="button" onClick={() => setPriceListsOpen(false)} aria-label="Close price lists" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
          </header>
          <div className="h-[calc(100%-65px)]"><OdooPricelistsPage embedded /></div>
        </section>
      </div>}

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Orithos to view products</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Orithos staff account to view the POS catalogue and inventory available to that account.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setConnectionRetryKey((value) => value + 1)} disabled={checkingConnection} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">{checkingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {checkingConnection ? "Retrying…" : "Retry connection"}</button>
              <Link href="/settings/integrations" className="inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Orithos</Link>
            </div>
          </div>
        </section>
      ) : tab === "stocktake" ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
          {hasPermission("stock.stocktake") ? <><button type="button" disabled={stockBusy} onClick={() => router.replace("/products")} className="mb-4 inline-block text-sm underline disabled:opacity-50">Back to products · keep draft</button><OdooStocktakePanel onBusyChange={setStockBusy} onApplied={stockApplied} /></> : <p role="alert">You do not have access to stocktake.</p>}
        </div>
      ) : (
        <>
          <div className="print:hidden flex shrink-0 flex-wrap items-center gap-3">
            <label className="flex h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input aria-label="Search products by name, barcode or SKU" value={query} onChange={(event) => { requestRevision.current += 1; setLoading(true); setQuery(event.target.value); }} placeholder="Search product, barcode or SKU" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <select aria-label="Filter by POS category" aria-busy={categoryLoading} value={categoryGroups.find((group) => group.some((item) => item.id === categoryId))?.[0].id ?? ""} onChange={(event) => selectCategory(event.target.value)} disabled={categoryLoading} className="h-11 w-full min-w-0 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none transition-colors focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-[220px] sm:flex-none">
                <option value="">All categories</option>
                {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${category.parent_id[1]} / ` : ""}{category.name}</option>)}
            </select>
            {inventoryReport && <label className="grid shrink-0 gap-1 text-xs font-medium text-[var(--oh-muted)]">Stock status
              <select aria-label="Filter inventory by stock status" value={inventoryFilter} onChange={(event) => {
                const value = event.target.value as "all" | "zero" | "negative";
                setInventoryFilter(value);
                const params = new URLSearchParams(searchParams.toString());
                if (value === "all") params.delete("stock"); else params.set("stock", value);
                router.replace(`/reports/inventory${params.size ? `?${params}` : ""}`, { scroll: false });
              }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
                <option value="all">All stock</option><option value="zero">Zero stock</option><option value="negative">Negative stock</option>
              </select>
            </label>}
          </div>

          <label className="print:hidden grid shrink-0 gap-1 text-xs font-medium text-[var(--oh-muted)] xl:hidden">Sort by
            <select aria-label="Sort inventory" value={`${sortBy}:${sortDirection}`} onChange={(event) => { const [field, direction] = event.target.value.split(":"); changeSort(field as InventorySort, direction as InventoryDirection); }} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm">
              {([ ["name", "Product"], ["category", "Category"], ["qty_available", "Inventory"], ["price_included", "Sale price"] ] as const).flatMap(([field, label]) => (["asc", "desc"] as const).map((direction) => <option key={`${field}:${direction}`} value={`${field}:${direction}`}>{label} · {direction === "asc" ? "Ascending" : "Descending"}</option>))}
            </select>
          </label>

          <label className="print:hidden grid shrink-0 gap-1 text-xs font-medium text-[var(--oh-muted)] md:hidden">Quick view
            <select aria-label="Catalogue quick view" value={catalogueView} onChange={(event) => selectView(event.target.value as CatalogueView)} className="h-11 min-w-0 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
              {CATALOGUE_VIEWS.map((view) => <option key={view.value} value={view.value}>{view.label}</option>)}
            </select>
          </label>
          <div className="print:hidden hidden shrink-0 flex-wrap gap-2 md:flex" role="group" aria-label="Catalogue quick filters">
            {CATALOGUE_VIEWS.map((view) => <button key={view.value} type="button" aria-pressed={catalogueView === view.value} onClick={() => selectView(view.value)} disabled={catalogueView === view.value} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${catalogueView === view.value ? "border-[var(--oh-primary)] bg-[var(--oh-primary)] text-white" : "border-[var(--oh-border)] bg-white text-[var(--oh-text-secondary)] hover:border-[var(--oh-primary)]"}`}>{view.label}</button>)}
            {(query || categoryId || catalogueView !== "all" || (inventoryReport && inventoryFilter !== "all")) && <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"><X size={14} /> Clear filters</button>}
          </div>
          {(query || categoryId || catalogueView !== "all" || (inventoryReport && inventoryFilter !== "all")) && <button type="button" onClick={clearFilters} className="min-h-11 shrink-0 self-start rounded-lg px-3 text-xs font-semibold text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] md:hidden">Clear filters</button>}

          <p className="oh-type-meta -mt-2 shrink-0 leading-5 text-[var(--oh-muted)]">
            {inventoryReport ? `Store scope: ${inventorySource?.company ?? "signed-in store's mapped Odoo company"}. Source: ${inventorySource?.source ?? "Odoo current inventory snapshot"}.` : "Source: active Shopfront catalogue · inventory, cost, price and performance show their source."}
            {inventoryReport && <span className="ml-2">Store timezone: {inventorySource?.timezone ?? storeTimezone} · Snapshot created {lastLoadedAt !== null ? formatStoreEpoch(lastLoadedAt, storeTimezone) : "unknown"} · Shopfront sync coverage {inventorySource?.shopfrontSync ? `${inventorySource.shopfrontSync.status}, through ${inventorySource.shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(inventorySource.shopfrontSync.updatedAt), storeTimezone)}` : "unknown"}. Sync events do not prove row-level Odoo completeness.</span>}
            {!inventoryReport && shopfrontCoverage?.inventorySnapshotAt && <span className="ml-2">Shopfront inventory snapshot {formatStoreEpoch(Date.parse(shopfrontCoverage.inventorySnapshotAt), storeTimezone)}.</span>}
          </p>
          {shopfrontSyncBanner && (
            <p role="status" className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">Shopfront sync finished · catalogue and stock were refreshed.</p>
          )}
            {!inventoryReport && shopfrontCoverage && <p role="status" className={`shrink-0 rounded-md border px-3 py-2 text-sm ${shopfrontCoverage.unmappedProducts > 0 || shopfrontCoverage.ambiguousReferences > 0 || shopfrontCoverage.inventoryProductRows < shopfrontCoverage.activeProducts ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>Shopfront source coverage: {quantity(shopfrontCoverage.mappedProducts)} of {quantity(shopfrontCoverage.activeProducts)} active products linked to Odoo; inventory found for {quantity(shopfrontCoverage.inventoryProductRows)}. {quantity(shopfrontCoverage.unmappedProducts)} source products are not linked and {quantity(shopfrontCoverage.ambiguousReferences)} links match multiple Odoo templates. Ambiguous matches are read-only until reviewed.</p>}
          {categoryError && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><span>{categoryError} Category filtering and CSV import may be unavailable until it reloads.</span><button type="button" onClick={() => setCategoryRetryKey((value) => value + 1)} disabled={categoryLoading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"><RefreshCw size={14} /> Retry categories</button></div>}
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => void loadProducts(!expired && items.length > 0 && (!inventoryReport || Boolean(snapshotId.current)))} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} {expired ? "Refresh results" : "Retry"}</button></div>}

          <section aria-busy={resultsPending} className="shrink-0 overflow-visible rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Orithos product catalogue" className="hidden w-full min-w-[1080px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]">
                <tr>
                  {!inventoryReport && <th scope="col" className="px-4 py-3">Status</th>}
                  {inventoryColumns.includes("product") && sortHeader("name", "Product")}
                  {inventoryColumns.includes("category") && sortHeader("category", "Category")}
                  {inventoryReport && inventoryColumns.includes("barcode") && <th scope="col" className="px-4 py-3">Barcode</th>}
                  {inventoryReport && inventoryColumns.includes("sku") && <th scope="col" className="px-4 py-3">SKU</th>}
                  {!inventoryReport && <th scope="col" className="px-4 py-3">Cost</th>}
                  {inventoryColumns.includes("quantity") && sortHeader("qty_available", "Inventory")}
                  {inventoryReport && inventoryColumns.includes("unit") && <th scope="col" className="px-4 py-3">Unit</th>}
                  {inventoryColumns.includes("price") && sortHeader("price_included", "Sale price · AUD")}
                  {inventoryReport && inventoryColumns.includes("pos") && <th scope="col" className="px-4 py-3">POS</th>}
                  {!inventoryReport && <><th scope="col" className="px-4 py-3">Performance</th><th scope="col" className="px-4 py-3 text-right">Actions</th></>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {resultsPending ? Array.from({ length: 6 }, (_, index) => <tr key={`product-skeleton-${index}`} aria-hidden="true">
                  <td colSpan={inventoryReport ? inventoryColumns.length : 8} className="px-4 py-3"><div className="grid grid-cols-[1.3fr_1fr_1fr_.7fr_.7fr_.65fr_.55fr] items-center gap-4">
                    <span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-6 animate-pulse rounded-full bg-[var(--oh-border)]" /><span className="ml-auto h-11 w-16 animate-pulse rounded-lg bg-[var(--oh-border)]" />
                  </div></td>
                </tr>) : items.length === 0 ? (
                  <tr><td colSpan={inventoryColumns.length + (inventoryReport ? 0 : 1)} className="px-4 py-16 text-center"><div className="mx-auto max-w-md"><p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId || catalogueView !== "all" ? "No matching products" : "No products yet"}</p><p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId || catalogueView !== "all" ? "Try another search, category or quick filter." : "Add a product or import your catalogue to get started."}</p>{debouncedQuery || categoryId || catalogueView !== "all" ? <button type="button" onClick={clearFilters} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Integrations</Link>}</div></td></tr>
                ) : (printItems ?? items).map((product) => {
                  const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id) || `Category #${id}`);
                  const displayCategory = typeof product.shopfront_source_category === "string" && product.shopfront_source_category.trim()
                    ? product.shopfront_source_category.trim()
                    : productCategories.length ? productCategories.join(", ") : "Uncategorised";
                  const fullName = product.shopfront_source_name || (typeof product.display_name === "string" ? product.display_name : product.name);
                  const label = friendlyProductName(fullName);
                  const skuShort = truncateSku(typeof product.default_code === "string" ? product.default_code : undefined);
                  const unitCost = typeof product.standard_price === "number" && Number.isFinite(product.standard_price) ? product.standard_price : null;
                  const sourceCost = typeof product.shopfront_cost === "number" && Number.isFinite(product.shopfront_cost) && product.shopfront_cost > 0 ? product.shopfront_cost : null;
                  const sourceCaseQuantity = typeof product.shopfront_case_quantity === "number" && product.shopfront_case_quantity > 0 ? product.shopfront_case_quantity : null;
                  const sourceQty = typeof product.shopfront_quantity === "number" ? product.shopfront_quantity : null;
                  const sourceStockMismatch = sourceQty !== null && Math.abs(sourceQty - product.qty_available) > 0.0001;
                  const sourceUnavailable = product.shopfront_data_status !== "available";
                  return (
                    <tr key={product.id} className="hover:bg-[var(--oh-tile-blue-bg)]/60">
                      {!inventoryReport && <td className="px-4 py-3">{product.active !== false ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Active</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Archived</span>}</td>}
                      {inventoryColumns.includes("product") && <td className="px-4 py-3"><span className="flex items-center gap-2.5"><ProductImage productId={product.id} name={label} refreshToken={refreshKey} className="h-10 w-10 border border-[var(--oh-border)] bg-white" /><span className="min-w-0"><button type="button" onClick={() => setViewingProduct(product)} title={fullName} className="min-h-11 text-left font-semibold text-[var(--oh-text)] hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{label}</button><CatalogueIssues product={product} /></span></span></td>}
                      {inventoryColumns.includes("category") && <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{displayCategory}</td>}
                      {inventoryReport && inventoryColumns.includes("barcode") && <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{product.barcode || "—"}</td>}
                      {inventoryReport && inventoryColumns.includes("sku") && <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{skuShort || "—"}</td>}
                      {!inventoryReport && <td className="px-4 py-3 tabular-nums"><span className="block font-medium text-[var(--oh-text)]">{sourceUnavailable ? "Shopfront data unavailable" : sourceCost === null ? "No Shopfront cost" : sourceCaseQuantity && sourceCaseQuantity > 1 ? `${money(sourceCost / sourceCaseQuantity)} / item` : money(sourceCost)}</span>{sourceCost !== null && <span className="mt-0.5 block text-[11px] text-[var(--oh-text-secondary)]" title="Shopfront source cost; tax and unit basis must be verified">Shopfront {money(sourceCost)}{sourceCaseQuantity ? ` / pack ${quantity(sourceCaseQuantity)}` : " · unit basis unknown"}</span>}{sourceCost !== null && sourceCaseQuantity && sourceCaseQuantity > 1 && <span className="block text-[11px] text-amber-800">Indicative item cost · verify invoice</span>}<span className="mt-1 block text-[11px] text-[var(--oh-muted)]">{unitCost === null || unitCost === 0 ? "Odoo recorded cost unavailable" : `Odoo recorded ${money(unitCost)}`}</span>{product.shopfront_source_duplicate_count && product.shopfront_source_duplicate_count > 1 && <span className="mt-1 block text-[11px] text-amber-800">Source link needs review · {product.shopfront_source_duplicate_count} matches</span>}</td>}
                      {inventoryColumns.includes("quantity") && <td className={`px-4 py-3 text-right tabular-nums ${sourceQty === null ? "font-medium text-amber-700" : sourceQty > 0 ? "text-[var(--oh-text)]" : "font-medium text-amber-700"}`}>{sourceQty === null ? quantity(product.qty_available) : <><span className="block">{product.shopfront_case_level !== null && product.shopfront_case_level !== undefined ? `${quantity(product.shopfront_case_level)} Cases · ${quantity(product.shopfront_single_level ?? 0)} Items` : `${quantity(sourceQty)} Units`}</span><span className="mt-0.5 block text-[11px] text-[var(--oh-muted)]">Shopfront · {quantity(sourceQty)} units</span></>}{sourceStockMismatch && <span className="mt-0.5 block text-[11px] font-medium text-amber-800">Odoo {quantity(product.qty_available)} · mismatch</span>}</td>}
                      {inventoryReport && inventoryColumns.includes("unit") && <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{product.uom_id ? product.uom_id[1] : "—"}</td>}
                      {inventoryColumns.includes("price") && <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{!inventoryReport ? sourceUnavailable ? <span className="font-normal text-[var(--oh-muted)]">Shopfront unavailable</span> : typeof product.shopfront_price === "number" ? <>{money(product.shopfront_price)}<span className="mt-0.5 block text-[11px] font-normal text-[var(--oh-muted)]">Shopfront</span></> : <span className="font-normal text-[var(--oh-muted)]">No Shopfront price</span> : <CataloguePrice product={product} />}{!inventoryReport && product.shopfront_price_tiers?.length ? <span className="mt-1 block text-[11px] font-normal text-[var(--oh-muted)]" title="Shopfront source price tiers">{product.shopfront_price_tiers.slice(0, 2).map((tier) => `${quantity(Number(tier.quantity) || 1)}+ ${money(Number(tier.price) || 0)}`).join(" · ")}</span> : null}</td>}
                      {inventoryReport && inventoryColumns.includes("pos") && <td className="px-4 py-3">{product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden</span>}</td>}
                      {!inventoryReport && <td className="px-4 py-3"><div className="flex min-w-[140px] flex-col items-center gap-1" title={`${product.performance_source ?? "Source"} units sold per day over the past 30 days`}><Sparkline points={product.performance_30d ?? []} width={132} height={36} /><span className="text-[11px] tabular-nums text-[var(--oh-muted)]">{product.performance_30d ? `${quantity(product.performance_30d.reduce((sum, point) => sum + point, 0))} units · 30d ${product.performance_source ?? ""}` : "Performance unavailable"}</span></div></td>}
                      {!inventoryReport && <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-3"><button type="button" onClick={() => setViewingProduct(product)} aria-label={`View ${label}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"><Eye size={15} /> View</button>{(product.shopfront_source_duplicate_count ?? 0) > 1 ? <span className="text-xs text-amber-800">Review mapping</span> : <button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${label}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"><Pencil size={14} /> Edit</button>}</div></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {resultsPending ? (
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
                  <p className="text-sm font-semibold text-[var(--oh-text)]">{debouncedQuery || categoryId || catalogueView !== "all" ? "No matching products" : "No products yet"}</p>
                  <p className="mt-1 text-sm text-[var(--oh-muted)]">{debouncedQuery || categoryId || catalogueView !== "all" ? "Try another search, category or quick filter." : "Add a product or import your catalogue to get started."}</p>
                  {debouncedQuery || categoryId || catalogueView !== "all" ? <button type="button" onClick={clearFilters} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button> : <Link href="/settings/integrations" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Integrations</Link>}
                </div>
              ) : (printItems ?? items).map((product) => {
                const productCategories = product.pos_categ_ids.map((id) => categoryNames.get(id) || `Category #${id}`);
                const displayCategory = typeof product.shopfront_source_category === "string" && product.shopfront_source_category.trim()
                  ? product.shopfront_source_category.trim()
                  : productCategories.length ? productCategories.join(", ") : "Uncategorised";
                const fullName = product.shopfront_source_name || (typeof product.display_name === "string" ? product.display_name : product.name);
                const label = friendlyProductName(fullName);
                const skuShort = truncateSku(typeof product.default_code === "string" ? product.default_code : undefined);
                const sourceCost = typeof product.shopfront_cost === "number" && Number.isFinite(product.shopfront_cost) && product.shopfront_cost > 0 ? product.shopfront_cost : null;
                const sourceCaseQuantity = typeof product.shopfront_case_quantity === "number" && product.shopfront_case_quantity > 0 ? product.shopfront_case_quantity : null;
                const sourceQty = typeof product.shopfront_quantity === "number" ? product.shopfront_quantity : null;
                const sourceStockMismatch = sourceQty !== null && Math.abs(sourceQty - product.qty_available) > 0.0001;
                const sourceUnavailable = product.shopfront_data_status !== "available";
                return (
                  <article key={product.id} className="px-4 py-3.5">
                    <header className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">{(!inventoryReport || inventoryColumns.includes("product")) && <ProductImage productId={product.id} name={label} refreshToken={refreshKey} className="h-14 w-14 border border-[var(--oh-border)] bg-white" />}<div className="min-w-0"><button type="button" onClick={() => setViewingProduct(product)} title={fullName} className="min-h-11 break-words text-left text-sm font-semibold text-[var(--oh-text)] hover:text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{label}</button>{(!inventoryReport || inventoryColumns.includes("sku")) && skuShort && <p className="mt-0.5 text-xs text-[var(--oh-muted)]" title={product.default_code || undefined}>SKU {skuShort}</p>}</div></div>
                      {(!inventoryReport || inventoryColumns.includes("price")) && <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--oh-text)]">{!inventoryReport ? sourceUnavailable ? <span className="font-normal text-[var(--oh-muted)]">Shopfront unavailable</span> : typeof product.shopfront_price === "number" ? <>{money(product.shopfront_price)}<span className="mt-0.5 block text-[11px] font-normal text-[var(--oh-muted)]">Shopfront</span></> : <span className="font-normal text-[var(--oh-muted)]">No Shopfront price</span> : <CataloguePrice product={product} />}{!inventoryReport && product.shopfront_price_tiers?.length ? <span className="mt-1 block max-w-44 text-[11px] font-normal text-[var(--oh-muted)]">{product.shopfront_price_tiers.slice(0, 2).map((tier) => `${quantity(Number(tier.quantity) || 1)}+ ${money(Number(tier.price) || 0)}`).join(" · ")}</span> : null}</p>}
                    </header>
                    <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs min-[360px]:grid-cols-2">
                      {(!inventoryReport || inventoryColumns.includes("category")) && <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Category</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]">{displayCategory}</dd></div>}
                      {!inventoryReport && <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Cost</dt><dd className="min-w-0 text-[var(--oh-text-secondary)]"><span className="block">{sourceUnavailable ? "Shopfront data unavailable" : sourceCost === null ? "No Shopfront cost" : sourceCaseQuantity && sourceCaseQuantity > 1 ? `${money(sourceCost / sourceCaseQuantity)} / item` : money(sourceCost)}</span>{sourceCost !== null && <span className="block text-[11px]">Shopfront {money(sourceCost)}{sourceCaseQuantity ? ` / pack ${quantity(sourceCaseQuantity)}` : " · unit basis unknown"}</span>}{sourceCost !== null && sourceCaseQuantity && sourceCaseQuantity > 1 && <span className="block text-[11px] text-amber-800">Indicative item cost · verify invoice</span>}<span className="block text-[11px]">{typeof product.standard_price === "number" && product.standard_price !== 0 ? `Odoo recorded ${money(product.standard_price)}` : "Odoo recorded cost unavailable"}</span></dd></div>}
                      {(!inventoryReport || inventoryColumns.includes("barcode")) && <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Barcode</dt><dd className="min-w-0 truncate text-[var(--oh-text-secondary)]" title={product.barcode || undefined}>{product.barcode || "—"}</dd></div>}
                      {(!inventoryReport || inventoryColumns.includes("quantity")) && <div className="flex min-w-0 items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Inventory</dt><dd className={`min-w-0 tabular-nums ${sourceQty === null ? "font-medium text-amber-700" : sourceQty > 0 ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-700"}`}>{sourceQty === null ? `${quantity(product.qty_available)} Odoo · source unavailable` : <><span className="block">{product.shopfront_case_level !== null && product.shopfront_case_level !== undefined ? `${quantity(product.shopfront_case_level)} Cases · ${quantity(product.shopfront_single_level ?? 0)} Items` : `${quantity(sourceQty)} Units`}</span><span className="block text-[11px] text-[var(--oh-muted)]">Shopfront · {quantity(sourceQty)} units</span></>}{sourceStockMismatch && <span className="block text-[11px] font-medium text-amber-800">Odoo {quantity(product.qty_available)} · mismatch</span>}</dd></div>}
                      {inventoryReport && inventoryColumns.includes("unit") && <div className="flex items-baseline gap-1.5"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Unit</dt><dd className="text-[var(--oh-text-secondary)]">{product.uom_id ? product.uom_id[1] : "—"}</dd></div>}
                      {!inventoryReport && <div className="flex min-w-0 items-center gap-2"><dt className="shrink-0 text-xs text-[var(--oh-muted)]">Performance</dt><dd className="flex min-w-0 items-center gap-2"><Sparkline points={product.performance_30d ?? []} width={82} height={26} /><span className="text-[11px] tabular-nums text-[var(--oh-muted)]">{product.performance_30d ? `${quantity(product.performance_30d.reduce((sum, point) => sum + point, 0))} · 30d ${product.performance_source ?? ""}` : "Unavailable"}</span></dd></div>}
                    </dl>
                    <CatalogueIssues product={product} /><footer className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--oh-border)] pt-2">
                      {(!inventoryReport || inventoryColumns.includes("pos")) && (product.available_in_pos ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Available in POS</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Hidden from POS</span>)}
                      {!inventoryReport && ((product.shopfront_source_duplicate_count ?? 0) > 1 ? <span className="text-xs text-amber-800">Review source mapping</span> : <button type="button" onClick={() => { setEditingProduct(product); setCategoriesTouched(false); setEditError(null); }} aria-label={`Edit ${label}`} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-xs font-semibold text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Pencil size={14} /> Edit</button>)}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>

          <div ref={sentinel} className="print:hidden flex min-h-12 shrink-0 items-center justify-center gap-2 text-sm text-[var(--oh-muted)]" role="status" aria-live="polite">
            {loadingMore ? <><LoaderCircle aria-hidden="true" size={16} className="animate-spin" /> Loading more products…</> : !resultsPending && !error && !hasNext ? "All results loaded" : null}
          </div>

        </>
      )}
      {connected === true && tab !== "stocktake" && (inventoryReport ? <ShopfrontInventorySummary odooProductCount={totals?.totalItems} /> : tab === "catalogue" ? <ShopfrontProductHistorySection /> : null)}
      </div>
      {connected === true && tab !== "stocktake" && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 pr-24 md:px-6 md:pr-24 text-sm shadow-[0_-2px_8px_#0000000a]" aria-label={inventoryReport ? "Totals for all matching Odoo inventory variants" : "Shopfront catalogue and inventory totals"}>
            <span role="status" aria-live="polite" className="text-[var(--oh-muted)]">{resultsPending ? "Loading products…" : totals ? `Loaded ${renderedProductCount} / ${totals.totalItems} Odoo variants` : "Totals unavailable"}</span>
            {hasNext && !resultsPending && !error && <button type="button" onClick={() => void loadProducts(true)} disabled={loadingMore} className="print:hidden min-h-11 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60">{loadingMore ? "Loading…" : "Load more"}</button>}
            {!inventoryReport && shopfrontCoverage && !resultsPending ? <>
              <span>Shopfront active products <strong className="ml-2 tabular-nums">{quantity(shopfrontCoverage.activeProducts)}</strong></span>
              <span>Mapped to Odoo <strong className="ml-2 tabular-nums">{quantity(shopfrontCoverage.mappedProducts)} / {quantity(shopfrontCoverage.activeProducts)}</strong></span>
              <span>Shopfront positive stock units <strong className="ml-2 tabular-nums">{quantity(shopfrontCoverage.positiveInventoryUnits)}</strong></span>
              <span>Inventory-covered products <strong className="ml-2 tabular-nums">{quantity(shopfrontCoverage.inventoryProductRows)} / {quantity(shopfrontCoverage.activeProducts)}</strong></span>
              {shopfrontCoverage.negativeInventoryRows > 0 && <span className="basis-full text-xs text-amber-800">{quantity(shopfrontCoverage.negativeInventoryRows)} source inventory rows have negative balances; those signed quantities remain visible on each product.</span>}
            </> : totals && !resultsPending && <>
              <span>Odoo saleable variants <strong className="ml-2 tabular-nums">{quantity(totals.totalItems)}</strong></span>
              <span>Odoo positive stock units <strong className="ml-2 tabular-nums">{totals.totalQty === null ? "Mixed units" : quantity(totals.totalQty)}</strong></span>
              {totals.negativeStockItems > 0 && <span className="basis-full text-xs text-amber-800">{quantity(totals.negativeStockItems)} variants have negative stock. The positive-unit total excludes negative balances; review those variants in the list.</span>}
              {totals.mixedUnits && <span className="basis-full text-xs text-[var(--oh-muted)]">Different stock units cannot be added together.</span>}
            </>}
          </footer>
      )}

      {viewingProduct && <CatalogueProductDetails product={viewingProduct} categories={categoryNames} canEdit={!inventoryReport} onClose={() => setViewingProduct(null)} onEdit={() => { setEditingProduct(viewingProduct); setViewingProduct(null); setCategoriesTouched(false); setEditError(null); }} />}

      {editingProduct && createPortal(<div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingProduct) setEditingProduct(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-edit-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-edit-title" className="text-lg font-semibold text-[var(--oh-text)]">Edit product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingProduct.display_name || editingProduct.name} · Orithos #{editingProduct.id}</p></div>
            <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form onSubmit={(event) => void saveProduct(event)} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Base sale price (AUD)
                <input ref={productEditPriceInputRef} name="list_price" type="number" min="0" max="1000000" step="0.01" required defaultValue={editingProduct.list_price} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">SKU
                <input name="default_code" maxLength={64} defaultValue={editingProduct.default_code || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Barcode
              <input name="barcode" maxLength={64} defaultValue={editingProduct.barcode || ""} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[var(--oh-text)]">Product image <span className="text-xs font-normal text-[var(--oh-muted)]">Optional · saved to Orithos and compressed before upload</span>
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
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">The base price follows the product’s Orithos tax configuration. Stock is managed through receipts and inventory adjustments.</p>
            {editError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{editError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingProduct(null)} disabled={savingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={savingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{savingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save changes</button>
            </footer>
          </form>
        </section>
      </div>, document.body)}

      {importOpen && createPortal(<div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !importBusy) setImportOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-import-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-import-title" className="text-lg font-semibold text-[var(--oh-text)]">Import products from CSV</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Preview and validate your catalogue before adding products to Orithos.</p></div>
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
            {importResult && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950"><p className="font-semibold">Added {importResult.created} product{importResult.created === 1 ? "" : "s"} to Orithos; skipped {importResult.skipped.length} duplicate{importResult.skipped.length === 1 ? "" : "s"}.</p>{importResult.skipped.length > 0 && <ul className="mt-1 max-h-24 list-disc space-y-1 overflow-auto pl-5">{importResult.skipped.slice(0, 30).map((item) => <li key={`${item.line}-${item.reason}`}>Line {item.line}: {item.reason}.</li>)}</ul>}</div>}
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">This imports product details, sale prices and optional costs. It does not change on-hand stock; use an Orithos receipt or stock adjustment to load opening quantities. Products already matching an SKU or barcode are skipped.</p>
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">{importResult ? "Done" : "Cancel"}</button>
              <button type="button" onClick={() => void runProductImport()} disabled={importBusy || importRows.length === 0 || Boolean(importResult)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{importBusy ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />} Import {importRows.length} product{importRows.length === 1 ? "" : "s"}</button>
            </footer>
          </div>
        </section>
      </div>, document.body)}

      {newProductOpen && createPortal(<div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingProduct) setNewProductOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="product-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="product-create-title" className="text-lg font-semibold text-[var(--oh-text)]">New product</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Add a stock-tracked product to the Orithos POS catalogue.</p></div>
            <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key="new-product" onSubmit={(event) => void createProduct(event)} className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Product name <span className="text-red-700">*</span></span>
              <input ref={newProductNameInputRef} name="name" maxLength={120} required className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Base sale price (AUD)
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
            <p className="rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs leading-5 text-[var(--oh-muted)]">Orithos tracks stock quantities. Load opening stock through an Orithos receipt or adjustment.</p>
            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setNewProductOpen(false)} disabled={creatingProduct} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={creatingProduct} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creatingProduct ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Create product</button>
            </footer>
          </form>
        </section>
      </div>, document.body)}
    </main>
  );
}
