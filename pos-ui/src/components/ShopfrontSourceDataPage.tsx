"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, Eye, Pencil, RefreshCw, Search, X } from "lucide-react";
import { calculateShopfrontRowProfit, parseShopfrontSalesReport, shopfrontInventorySnapshotIsFresh } from "@/lib/shopfront-dashboard-metrics";
import { Sparkline } from "@/components/admin/Sparkline";

export type Mode = "dashboard" | "sales" | "inventory" | "products" | "purchase";
type SourceRow = Record<string, unknown>;
type SourceSnapshot = { complete?: unknown; snapshot_at?: unknown; products?: unknown; source_products?: unknown; [key: string]: unknown };
type SourceCoverage = { inventory?: SourceSnapshot; catalog?: { checkpoint_at?: unknown; [key: string]: unknown }; products?: Record<string, unknown>; [key: string]: unknown };
type PagePayload = { data?: SourceRow[]; pagination?: { page?: number; size?: number; total?: number; returned?: number }; snapshot?: SourceSnapshot; coverage?: Record<string, unknown>; source?: string; source_version?: string; fetched_at?: unknown; totals?: SourceRow; metrics?: SourceRow };
type CoveragePayload = { data?: SourceCoverage };

const PAGE_SIZE = 50;
const PRODUCTS_PAGE_SIZE = 100;
const MODE_META: Record<Mode, { title: string; odooHref: string; odooLabel: string }> = {
  dashboard: { title: "Shopfront dashboard", odooHref: "/reports/dashboard", odooLabel: "Overview" },
  sales: { title: "Shopfront sales", odooHref: "/reports/sales", odooLabel: "Sales report" },
  inventory: { title: "Shopfront inventory", odooHref: "/reports/inventory/odoo", odooLabel: "Orithos inventory" },
  products: { title: "Products", odooHref: "/products/odoo", odooLabel: "Orithos products" },
  purchase: { title: "Shopfront purchase report", odooHref: "/reports/purchase/odoo", odooLabel: "Orithos purchasing" },
};
const MODE_HREF: Record<Mode, string> = {
  dashboard: "/reports/shopfront/dashboard",
  sales: "/reports/shopfront/sales",
  inventory: "/reports/shopfront/inventory",
  products: "/products/shopfront",
  purchase: "/reports/shopfront/purchase",
};
const MODE_LABEL: Record<Mode, string> = {
  dashboard: "Dashboard",
  sales: "Sales",
  inventory: "Inventory",
  products: "Products",
  purchase: "Purchase",
};

function adelaideDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDay(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(number) : "—";
}

function quantity(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(number) : "—";
}

function sourceNumber(row: SourceRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const number = typeof value === "number" ? value : Number(String(value).replace(/[,$%\s]/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function sourceMoney(row: SourceRow, ...keys: string[]) {
  const raw = keys.map(key => row[key]).find(value => value !== null && value !== undefined && value !== "");
  if (raw === undefined) return "—";
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[,$%\s]/g, ""));
  return Number.isFinite(value) ? money(value) : "—";
}

function sourceText(row: SourceRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return "—";
}

function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function dateTimeLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function statusTone(status: unknown) {
  const value = String(status ?? "").toUpperCase();
  if (value === "ACTIVE" || value === "COMPLETED" || value === "RECEIVED") return "text-emerald-800 bg-emerald-50";
  if (value === "CANCELLED" || value === "NOT_ACTIVE") return "text-slate-700 bg-slate-100";
  return "text-amber-900 bg-amber-50";
}

function readSourceProductInventory(product: SourceRow) {
  const value = product.inventory_snapshot;
  return value && typeof value === "object" ? value as SourceRow : undefined;
}

function sourcePriceTiers(product: SourceRow) {
  if (!Array.isArray(product.prices)) return [];
  return product.prices.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const tier = value as SourceRow;
    const tierQuantity = sourceNumber(tier, "quantity");
    const tierPrice = sourceNumber(tier, "price");
    return tierQuantity > 0 ? [{ quantity: tierQuantity, price: tierPrice }] : [];
  }).sort((left, right) => left.quantity - right.quantity);
}

function TableFrame({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  return (
    <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white">
      {empty ? <div className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No source records found.</div> : children}
    </div>
  );
}

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle text-sm text-[var(--oh-text)] ${className}`}>{children}</td>;
}

export function ShopfrontSourceDataPage({ mode }: { mode: Mode }) {
  const today = useMemo(() => adelaideDay(new Date()), []);
  const initialDay = mode === "dashboard" ? shiftDay(today, -1) : today;
  const initialTo = initialDay;
  const initialFrom = initialDay;
  const [fromInput, setFromInput] = useState(initialFrom);
  const [toInput, setToInput] = useState(initialTo);
  const [range, setRange] = useState({ from: initialFrom, to: initialTo });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [brandInput, setBrandInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [familyInput, setFamilyInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [supplierInput, setSupplierInput] = useState("");
  const [typeInput, setTypeInput] = useState("");
  const [taxRateInput, setTaxRateInput] = useState("");
  const [costTaxRateInput, setCostTaxRateInput] = useState("");
  const [giftCardInput, setGiftCardInput] = useState("all");
  const [productFilters, setProductFilters] = useState({ brand: "", category: "", family: "", tag: "", supplier: "", type: "", taxRate: "", costTaxRate: "", giftCard: "all" });
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [performanceById, setPerformanceById] = useState<Record<string, number[]>>({});
  const [viewingProduct, setViewingProduct] = useState<SourceRow | null>(null);
  const [total, setTotal] = useState(0);
  const [liveActiveProducts, setLiveActiveProducts] = useState<number | null>(null);
  const [sellableUnits, setSellableUnits] = useState<number | null>(null);
  const [sellableUnitsState, setSellableUnitsState] = useState<"available" | "stale" | "unavailable">("unavailable");
  const [liveCatalogFetchedAt, setLiveCatalogFetchedAt] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<SourceCoverage | null>(null);
  const [rangeCoverage, setRangeCoverage] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [reportTotals, setReportTotals] = useState<SourceRow>({});
  const [reportMetrics, setReportMetrics] = useState<SourceRow>({});
  const [salesMetrics, setSalesMetrics] = useState<ReturnType<typeof parseShopfrontSalesReport>>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pageSize = mode === "products" ? PRODUCTS_PAGE_SIZE : PAGE_SIZE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    setTotal(0);
    setReportTotals({});
    setReportMetrics({ available: false });
    setSalesMetrics(null);
    setRangeCoverage(null);
    setSnapshot(null);
    setGeneratedAt(null);
    setCoverage(null);
    setLiveActiveProducts(null);
    setLiveCatalogFetchedAt(null);
    setSellableUnits(null);
    setSellableUnitsState("unavailable");
    try {
      const resource = mode === "dashboard" || mode === "sales" ? "report-sales" : mode === "products" ? "products" : mode === "inventory" ? "report-inventory" : "report-purchase";
      const params = new URLSearchParams({ resource });
      if (mode === "dashboard" || mode === "sales") {
        params.set("from", range.from);
        params.set("to", range.to);
        params.set("size", "600");
        if (mode === "dashboard") params.set("dashboard", "true");
      } else if (mode === "purchase") {
        params.set("from", range.from);
        params.set("to", range.to);
        params.set("page", String(page));
        params.set("size", String(pageSize));
        if (query) params.set("q", query);
      } else {
        params.set("page", String(page));
        params.set("size", String(pageSize));
        if (query) params.set("q", query);
        if (mode === "products") {
          params.set("status", status === "all" ? "ACTIVE" : status);
          for (const [key, value] of [["brand", productFilters.brand], ["category", productFilters.category], ["family", productFilters.family], ["tag", productFilters.tag], ["supplier", productFilters.supplier], ["type", productFilters.type], ["tax_rate", productFilters.taxRate], ["cost_tax_rate", productFilters.costTaxRate]] as const) {
            if (value) params.set(key, value);
          }
          if (productFilters.giftCard !== "all") params.set("gift_card", productFilters.giftCard);
        }
        if (mode === "inventory" && negativeOnly) params.set("negative_only", "true");
      }
      const response = await fetch(`/api/shopfront-source?${params}`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null) as PagePayload | { message?: string } | null;
      if (!response.ok || !payload || !Array.isArray((payload as PagePayload).data)) {
        throw new Error(payload && "message" in payload ? payload.message : `Shopfront source request failed (${response.status}).`);
      }
      const result = payload as PagePayload;
      if (mode === "inventory" && (result.source !== "shopfront_reporting_api" || result.source_version !== "shopfront_reporting_api_v1")) {
        throw new Error("The Shopfront inventory report source is outdated. Refresh after the source service has updated.");
      }
      const parsedSalesMetrics = mode === "sales" || mode === "dashboard" ? parseShopfrontSalesReport(result) : null;
      if ((mode === "sales" || mode === "dashboard") && !parsedSalesMetrics) {
        throw new Error("Shopfront returned an incomplete sales report. No partial totals are shown.");
      }
      setSalesMetrics(parsedSalesMetrics);
      const loadedRows = result.data ?? [];
      setRows(loadedRows);
      setTotal(Number(result.pagination?.total ?? loadedRows.length));
      setPerformanceById({});
      if (mode === "products") {
        const ids = loadedRows.map(row => String(row.shopfront_product_id ?? "")).filter(Boolean);
        if (ids.length) {
          void fetch(`/api/shopfront-source?${new URLSearchParams({ resource: "product-performance", product_ids: ids.join(","), days: "30" })}`, { cache: "no-store", credentials: "same-origin" })
            .then(response => response.ok ? response.json() as Promise<{ data?: Array<{ shopfront_product_id?: string; daily_units?: number[] }> }> : null)
            .then(payload => {
              if (!payload || !Array.isArray(payload.data)) return;
              setPerformanceById(Object.fromEntries(payload.data.flatMap(row => typeof row.shopfront_product_id === "string" && Array.isArray(row.daily_units)
                ? [[row.shopfront_product_id, row.daily_units.map(value => Number.isFinite(Number(value)) ? Number(value) : 0)] as const]
                : [])));
            })
            .catch(() => setPerformanceById({}));
        }
      }
      setReportTotals(result.totals ?? {});
      setReportMetrics(result.metrics ?? {});
      setRangeCoverage(result.coverage ?? null);
      setSnapshot(result.snapshot ?? null);
      setGeneratedAt(typeof result.fetched_at === "string" ? result.fetched_at : new Date().toISOString());

      if (mode === "dashboard") {
        void fetch("/api/shopfront-source?resource=dashboard-inventory", { cache: "no-store", credentials: "same-origin" })
          .then(async response => ({ response, payload: await response.json().catch(() => null) as { available?: unknown; sellable_units?: unknown; reason?: unknown } | null }))
          .then(({ response: inventoryResponse, payload: inventoryPayload }) => {
            const value = inventoryResponse.ok && inventoryPayload?.available === true && Number.isFinite(Number(inventoryPayload.sellable_units))
              ? Number(inventoryPayload.sellable_units) : null;
            setSellableUnits(value);
            setSellableUnitsState(value !== null ? "available" : inventoryPayload?.reason === "snapshot_stale" ? "stale" : "unavailable");
          })
          .catch(() => { setSellableUnits(null); setSellableUnitsState("unavailable"); });
        const catalogParams = new URLSearchParams({ resource: "products", page: "1", size: "1", status: "ACTIVE" });
        void fetch(`/api/shopfront-source?${catalogParams}`, { cache: "no-store", credentials: "same-origin" })
          .then(async catalogResponse => ({ catalogResponse, catalogResult: await catalogResponse.json().catch(() => null) as PagePayload | null }))
          .then(({ catalogResponse, catalogResult }) => {
            if (catalogResponse.ok && Array.isArray(catalogResult?.data) && Number.isFinite(Number(catalogResult.pagination?.total))) {
              setLiveActiveProducts(Number(catalogResult.pagination?.total));
              setLiveCatalogFetchedAt(typeof catalogResult.fetched_at === "string" ? catalogResult.fetched_at : null);
            } else {
              setLiveActiveProducts(null);
              setLiveCatalogFetchedAt(null);
            }
          })
          .catch(() => {
            setLiveActiveProducts(null);
            setLiveCatalogFetchedAt(null);
          });
      } else {
        setLiveActiveProducts(null);
        setLiveCatalogFetchedAt(null);
        setSellableUnits(null);
        setSellableUnitsState("unavailable");
      }

      if (mode === "dashboard" || mode === "inventory" || mode === "products") {
        const coverageResponse = await fetch("/api/shopfront-source?resource=coverage", { cache: "no-store", credentials: "same-origin" });
        const coveragePayload = await coverageResponse.json().catch(() => null) as CoveragePayload | null;
        if (coverageResponse.ok) {
          setCoverage(coveragePayload?.data ?? null);
        } else if (mode !== "products") {
          throw new Error("Shopfront coverage could not be loaded.");
        } else {
          setCoverage(null);
        }
      } else {
        setCoverage(null);
      }
    } catch (cause) {
      setRows([]);
      setTotal(0);
      setReportTotals({});
      setReportMetrics({ available: false });
      setSalesMetrics(null);
      setRangeCoverage(null);
      setSnapshot(null);
      setGeneratedAt(null);
      setError(cause instanceof Error ? cause.message : "Shopfront source data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [mode, negativeOnly, page, pageSize, productFilters, query, range, refreshKey, status]);

  useEffect(() => { void load(); }, [load]);

  const sums = useMemo(() => rows.reduce<{ revenue: number; cost: number; tax: number; discount: number; transactions: number }>((acc, row) => ({
    revenue: acc.revenue + sourceNumber(row, "Revenue", "revenue"),
    cost: acc.cost + sourceNumber(row, "Cost of Goods Sold", "cost"),
    tax: acc.tax + sourceNumber(row, "Tax Amount", "tax"),
    discount: acc.discount + sourceNumber(row, "Discount Amount", "discount"),
    transactions: acc.transactions + sourceNumber(row, "Transaction Count", "transaction_count"),
  }), { revenue: 0, cost: 0, tax: 0, discount: 0, transactions: 0 }), [rows]);
  const revenue = salesMetrics?.revenue ?? sums.revenue;
  const cost = salesMetrics?.cost ?? sums.cost;
  const calculatedProfit = salesMetrics?.calculatedProfit ?? Math.round((revenue - cost) * 100) / 100;
  const averageSale = sums.transactions > 0 ? revenue / sums.transactions : 0;
  const profitPercentage = revenue !== 0 ? (calculatedProfit / revenue) * 100 : 0;
  const missingDates = Array.isArray(rangeCoverage?.missing_dates) ? rangeCoverage?.missing_dates as string[] : [];
  const inventory = coverage?.inventory ?? {};
  const dashboardMetricsAvailable = reportMetrics.available !== false;
  const salesReportAvailable = !loading && error === null && salesMetrics !== null;
  const profitAuditMessage = salesMetrics?.profitStatus === "matched"
    ? "Shopfront Profit matches the independent Revenue − COGS calculation."
    : salesMetrics?.profitStatus === "mismatch"
      ? `Shopfront Profit differs from calculated profit by ${money(salesMetrics.profitDelta)} (calculated − Shopfront).`
      : salesMetrics?.profitStatus === "incomplete"
        ? "Profit is calculated from Revenue − COGS; Shopfront's Profit comparison fields are incomplete."
        : null;
  const inventorySnapshotStale = mode === "inventory" && generatedAt !== null && !shopfrontInventorySnapshotIsFresh(generatedAt);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const meta = MODE_META[mode];

  function applyRange() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromInput) || !/^\d{4}-\d{2}-\d{2}$/.test(toInput) || fromInput > toInput) {
      setError("Choose a valid date range.");
      return;
    }
    setRange({ from: fromInput, to: toInput });
  }

  function applyQuery() {
    setPage(1);
    setQuery(queryInput.trim());
  }

  function applyProductFilters() {
    setPage(1);
    setProductFilters({ brand: brandInput.trim(), category: categoryInput.trim(), family: familyInput.trim(), tag: tagInput.trim(), supplier: supplierInput.trim(), type: typeInput.trim(), taxRate: taxRateInput.trim(), costTaxRate: costTaxRateInput.trim(), giftCard: giftCardInput });
  }
  const advancedFilters: Array<[string, string, (value: string) => void]> = [
    ["Brand", brandInput, setBrandInput], ["Category", categoryInput, setCategoryInput], ["Family", familyInput, setFamilyInput], ["Tag", tagInput, setTagInput],
    ["Supplier", supplierInput, setSupplierInput], ["Type", typeInput, setTypeInput], ["Retail tax rate", taxRateInput, setTaxRateInput], ["Purchase tax rate", costTaxRateInput, setCostTaxRateInput],
  ];

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Source: Shopfront · SKR</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{meta.title}</h1>
          {generatedAt && <p className="mt-1 text-xs text-[var(--oh-muted)]">{mode === "inventory" ? `Snapshot ${dateTimeLabel(generatedAt)} Adelaide` : `Loaded ${dateLabel(generatedAt)} · Adelaide business dates`}</p>}
          {mode === "products" && <p className="mt-1 text-xs text-[var(--oh-muted)]">Inventory snapshot: {snapshot?.complete === true ? snapshot.fresh === true ? "complete" : "complete · stale" : snapshot?.manifest_complete === false ? "incomplete" : "unavailable"}{snapshot?.snapshot_at ? ` · ${dateTimeLabel(snapshot.snapshot_at)} Adelaide` : ""} · Shopfront source data</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href={meta.odooHref} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">
            <ExternalLink size={15} aria-hidden="true" /> {meta.odooLabel}
          </Link>
          <button type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading} aria-label="Refresh Shopfront data" title="Refresh Shopfront data" className="grid h-9 w-9 place-items-center rounded-md border border-[var(--oh-border)] bg-white text-[var(--oh-text)] disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      {mode !== "products" && <nav aria-label="Shopfront source views" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--oh-border)] bg-white px-4 md:px-6">
        {(Object.keys(MODE_HREF) as Mode[]).map(view => <Link key={view} href={MODE_HREF[view]} aria-current={view === mode ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${view === mode ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-muted)] hover:text-[var(--oh-text)]"}`}>
          {MODE_LABEL[view]}
        </Link>)}
      </nav>}

      {error && <div role="alert" className="mx-4 mt-3 flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 md:mx-6"><AlertCircle size={16} />{error}</div>}
      {inventorySnapshotStale && <div role="status" className="mx-4 mt-3 flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:mx-6"><AlertCircle size={16} />This Shopfront inventory report is over 24 hours old. The listed rows are historical until a fresh report is available.</div>}

      {(mode === "sales" || mode === "dashboard" || mode === "purchase") && <div className="flex flex-wrap items-end gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={fromInput} onChange={event => setFromInput(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm text-[var(--oh-text)]" /></label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={toInput} onChange={event => setToInput(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm text-[var(--oh-text)]" /></label>
        <button type="button" onClick={applyRange} className="h-9 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Apply</button>
      </div>}

      {(mode === "products" || mode === "inventory" || mode === "purchase") && <div className="flex flex-wrap items-end gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <label className="grid min-w-60 flex-1 gap-1 text-xs font-medium text-[var(--oh-muted)]">Search<input value={queryInput} onChange={event => setQueryInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") applyQuery(); }} placeholder="Name, SKU or source ID" className="h-9 rounded-md border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)]" /></label>
        {mode === "products" && <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-9 min-w-36 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm text-[var(--oh-text)]">
          <option value="all">Active products</option><option value="NOT_ACTIVE">Not active</option>
        </select></label>}
        {mode === "inventory" && <label className="flex h-9 items-center gap-2 px-2 text-sm text-[var(--oh-text)]"><input type="checkbox" checked={negativeOnly} onChange={event => { setNegativeOnly(event.target.checked); setPage(1); }} />Negative stock only</label>}
        <button type="button" onClick={applyQuery} className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"><Search size={15} aria-hidden="true" /> Search</button>
      </div>}

      {mode === "products" && <details className="border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--oh-text)]">Advanced product filters</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {advancedFilters.map(([label, value, setter]) => <label key={label} className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">{label}<input value={value} onChange={event => setter(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)]" /></label>)}
          <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Gift card<select value={giftCardInput} onChange={event => setGiftCardInput(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm text-[var(--oh-text)]"><option value="all">All</option><option value="true">Gift cards</option><option value="false">Not gift cards</option></select></label>
          <button type="button" onClick={applyProductFilters} className="h-9 self-end rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Apply filters</button>
        </div>
      </details>}

      {mode === "dashboard" && <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <Metric label="Revenue" value={salesReportAvailable ? money(revenue) : "—"} />
        <Metric label="Cost of goods sold" value={salesReportAvailable ? money(cost) : "—"} />
        <Metric label="Gross profit · calculated" value={salesReportAvailable ? money(calculatedProfit) : "—"} emphasis />
        <Metric label="Average sale" value={salesReportAvailable ? money(averageSale) : "—"} />
        <Metric label="Profit percentage" value={salesReportAvailable ? `${quantity(profitPercentage)}%` : "—"} />
        <Metric label="Sale count" value={salesReportAvailable ? quantity(sums.transactions) : "—"} />
        <Metric label="Customers" value={dashboardMetricsAvailable ? quantity(reportMetrics.customer_count) : "—"} />
        <Metric label="Basket size" value={dashboardMetricsAvailable ? quantity(reportMetrics.basket_size) : "—"} />
        <Metric label="Discount amount" value={money(sums.discount)} />
        <Metric label="Active products" value={liveActiveProducts === null ? "—" : quantity(liveActiveProducts)} detail={liveCatalogFetchedAt ? `Live Shopfront catalog · ${dateLabel(liveCatalogFetchedAt)}` : "Live Shopfront catalog unavailable"} />
        <Metric label="Sellable units" value={sellableUnits === null ? "—" : quantity(sellableUnits)} detail={sellableUnitsState === "stale" ? "Shopfront inventory report is stale" : sellableUnitsState === "unavailable" ? "Shopfront inventory report unavailable" : "Shopfront case and item levels"} />
        <Metric label="Inventory records" value={quantity(inventory.records)} />
        <Metric label="Negative stock rows" value={quantity(inventory.negative_records)} />
      </div>}

      {(mode === "sales" || mode === "dashboard") && profitAuditMessage && <div role="status" className={`mx-4 border-b px-3 py-2 text-sm md:mx-6 ${salesMetrics?.profitStatus === "mismatch" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-[var(--oh-border)] bg-white text-[var(--oh-muted)]"}`}>{profitAuditMessage}</div>}

      {mode === "dashboard" && <DashboardBreakdown metrics={reportMetrics} />}

      {mode === "sales" && <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <Metric label="Revenue" value={salesReportAvailable ? money(revenue) : "—"} />
        <Metric label="Cost of goods sold" value={salesReportAvailable ? money(cost) : "—"} />
        <Metric label="Profit · calculated" value={salesReportAvailable ? money(calculatedProfit) : "—"} emphasis />
        <Metric label="Average sale" value={salesReportAvailable ? money(averageSale) : "—"} />
        <Metric label="Profit percentage" value={salesReportAvailable ? `${quantity(profitPercentage)}%` : "—"} />
        <Metric label="Tax" value={salesReportAvailable ? money(sums.tax) : "—"} />
        <Metric label="Discount" value={salesReportAvailable ? money(sums.discount) : "—"} />
        <Metric label="Transactions" value={salesReportAvailable ? quantity(sums.transactions) : "—"} />
      </div>}

      {(mode === "sales" || mode === "dashboard") && missingDates.length > 0 && <div role="status" className="mx-4 mt-3 flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:mx-6"><AlertCircle size={16} className="mt-0.5 shrink-0" />Report coverage is incomplete for {missingDates.length} date(s): {missingDates.slice(0, 8).join(", ")}{missingDates.length > 8 ? "…" : ""}.</div>}

      {mode === "products" && <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[var(--oh-border)] bg-white px-4 py-2 text-xs text-[var(--oh-muted)] md:px-6">
        <span>{quantity(total)} matching Shopfront products{query ? ` for “${query}”` : ""}</span>
        <span>Read-only source data</span>
        {typeof coverage?.catalog?.checkpoint_at === "string" && <span>Last catalog sync {dateTimeLabel(coverage.catalog.checkpoint_at)}</span>}
      </div>}

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "sales" || mode === "dashboard" ? <SalesTable rows={rows} loading={loading} />
          : mode === "products" ? <ProductsTable rows={rows} loading={loading} performanceById={performanceById} onView={setViewingProduct} />
            : mode === "inventory" ? <InventoryTable rows={rows} loading={loading} fetchedAt={generatedAt} total={total} totals={reportTotals} />
              : <PurchaseTable rows={rows} loading={loading} />}
        {!(mode === "sales" || mode === "dashboard") && <div className="flex items-center justify-between border-t border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
          <span className="text-sm text-[var(--oh-muted)]">{total.toLocaleString("en-AU")} records · Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1 || loading} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-md border border-[var(--oh-border)] disabled:opacity-40"><ArrowLeft size={16} /></button>
            <button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-md border border-[var(--oh-border)] disabled:opacity-40"><ArrowRight size={16} /></button>
          </div>
        </div>}
      </div>
      {viewingProduct && <ProductSourceDialog product={viewingProduct} onClose={() => setViewingProduct(null)} />}
    </main>
  );
}

function Metric({ label, value, emphasis = false, detail }: { label: string; value: string; emphasis?: boolean; detail?: string }) {
  return <div className="min-w-28"><p className="text-xs font-medium text-[var(--oh-muted)]">{label}</p><p className={`mt-1 text-lg font-semibold ${emphasis ? "text-[var(--oh-primary)]" : "text-[var(--oh-text)]"}`}>{value}</p>{detail && <p className="mt-0.5 text-[11px] text-[var(--oh-muted)]">{detail}</p>}</div>;
}

function DashboardBreakdown({ metrics }: { metrics: SourceRow }) {
  const products = Array.isArray(metrics.top_products) ? metrics.top_products as SourceRow[] : [];
  const users = Array.isArray(metrics.users) ? metrics.users as SourceRow[] : [];
  if (metrics.available === false) {
    const sourceCount = metrics.source_transaction_count === null || metrics.source_transaction_count === undefined ? "—" : quantity(metrics.source_transaction_count);
    return <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:px-6">
      Dashboard detail metrics are unavailable: Shopfront reports {sourceCount} transactions, but {quantity(metrics.graphql_transaction_count)} sales records were loaded.
    </p>;
  }
  if (!products.length && !users.length) return null;
  return <div className="grid gap-4 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-4 md:grid-cols-2 md:px-6">
    <section className="overflow-x-auto border border-[var(--oh-border)] bg-white">
      <h2 className="border-b border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)]">Top 20 Products</h2>
      <table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Quantity</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{products.map((row, index) => <tr key={`${String(row.id)}-${index}`}><Cell>{sourceText(row, "name")}</Cell><Cell>{money(row.revenue)}</Cell><Cell>{quantity(row.quantity)}</Cell></tr>)}</tbody></table>
    </section>
    <section className="overflow-x-auto border border-[var(--oh-border)] bg-white">
      <h2 className="border-b border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)]">Users</h2>
      <table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Transaction Count</th><th className="px-3 py-2">Average Sale</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{users.map((row, index) => <tr key={`${String(row.id)}-${index}`}><Cell>{sourceText(row, "name")}</Cell><Cell>{money(row.revenue)}</Cell><Cell>{quantity(row.transactions)}</Cell><Cell>{money(row.average_sale)}</Cell></tr>)}</tbody></table>
    </section>
  </div>;
}

function SalesTable({ rows, loading }: { rows: SourceRow[]; loading: boolean }) {
  return <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[1160px] border-collapse text-left">
    <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Name", "Revenue", "Cost of goods sold", "Transactions", "Average sale", "Shopfront Profit", "Calculated Profit", "Calculated − Shopfront", "Profit %", "Tax", "Discount", "Revenue %", "Transactions %"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--oh-border)]">{rows.map((row, index) => {
      const calculation = calculateShopfrontRowProfit(row);
      const calculated = calculation?.calculatedProfit ?? (sourceNumber(row, "Revenue", "revenue") - sourceNumber(row, "Cost of Goods Sold", "cost"));
      const reported = calculation?.reportedProfit ?? null;
      return <tr key={`${sourceText(row, "Name", "BY_NAME")}-${index}`} className="hover:bg-[var(--oh-surface)]">
        <Cell>{sourceText(row, "Name", "BY_NAME")}</Cell><Cell>{money(sourceNumber(row, "Revenue", "revenue"))}</Cell><Cell>{money(sourceNumber(row, "Cost of Goods Sold", "cost"))}</Cell><Cell>{quantity(sourceNumber(row, "Transaction Count", "transaction_count"))}</Cell><Cell>{money(sourceNumber(row, "Average Sale", "average_sale"))}</Cell><Cell>{reported === null ? "—" : money(reported)}</Cell><Cell className="font-semibold">{money(calculated)}</Cell><Cell>{reported === null ? "—" : money(calculated - reported)}</Cell><Cell>{calculation?.profitPercentage == null ? "—" : `${quantity(calculation.profitPercentage)}%`}</Cell><Cell>{money(sourceNumber(row, "Tax Amount", "tax"))}</Cell><Cell>{money(sourceNumber(row, "Discount Amount", "discount"))}</Cell><Cell>{sourceText(row, "Revenue Percentage", "revenue_percentage")}</Cell><Cell>{sourceText(row, "Transaction Percentage", "transaction_percentage")}</Cell>
      </tr>;
    })}</tbody>
    {loading && <tfoot><tr><td colSpan={13} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront report…</td></tr></tfoot>}
  </table></TableFrame>;
}

function ProductsTable({ rows, loading, performanceById, onView }: { rows: SourceRow[]; loading: boolean; performanceById: Record<string, number[]>; onView: (product: SourceRow) => void }) {
  return <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[1080px] border-collapse text-left">
    <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Status", "Product", "Category", "Cost", "Inventory", "Price", "Performance · 30d", "Actions"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--oh-border)]">{rows.map(row => {
      const stock = readSourceProductInventory(row);
      const tracksInventory = row.track_inventory === true;
      const caseQuantity = sourceNumber(row, "case_quantity", "caseQuantity");
      const inventoryDisplay = !tracksInventory ? "Non-stock"
        : !stock ? "Not synced"
          : stock.complete !== true ? "Snapshot incomplete"
            : stock.fresh !== true ? "Snapshot stale"
              : stock.available !== true ? "Not covered"
                : caseQuantity > 1
                  ? <><span className="block">{quantity(sourceNumber(stock, "case_level"))} Cases</span><span className="block">{quantity(sourceNumber(stock, "single_level"))} Items</span></>
                  : `${quantity(sourceNumber(stock, "quantity"))} Items`;
      const rawCost = row.cost === null || row.cost === undefined || row.cost === "" ? null : Number(row.cost);
      const unitCost = rawCost !== null && Number.isFinite(rawCost) ? rawCost / (caseQuantity > 0 ? caseQuantity : 1) : null;
      const priceTiers = sourcePriceTiers(row);
      const basePrice = priceTiers.find(tier => tier.quantity === 1)?.price ?? sourceNumber(row, "price");
      const bulkTier = priceTiers.filter(tier => tier.quantity > 1).at(-1);
      const productId = String(row.shopfront_product_id ?? "");
      const points = performanceById[productId];
      const search = String(row.sku || row.barcode || row.name || "");
      return <tr key={productId} className="hover:bg-[var(--oh-surface)]">
        <Cell><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{String(row.status ?? "UNKNOWN")}</span></Cell>
        <Cell><span className="font-medium">{String(row.name ?? "—")}</span>{typeof row.sku === "string" && row.sku && <span className="mt-0.5 block text-xs text-[var(--oh-muted)]">SKU {row.sku}</span>}</Cell>
        <Cell>{String(row.category ?? "—")}</Cell>
        <Cell>{unitCost === null ? "—" : <div title={`Shopfront case cost ${money(rawCost)} for ${quantity(caseQuantity || 1)} units`}>
          <span className="block">{money(unitCost)}</span>
          {bulkTier && <span className="block text-xs text-[var(--oh-muted)]">{quantity(bulkTier.quantity)} units · {money(unitCost * bulkTier.quantity)}</span>}
        </div>}</Cell>
        <Cell>{inventoryDisplay}</Cell>
        <Cell><span className="block">{money(basePrice)}</span>{bulkTier && <span className="block text-xs text-[var(--oh-muted)]">{quantity(bulkTier.quantity)} units · {money(bulkTier.price)}</span>}</Cell>
        <Cell><div className="flex min-w-36 items-center gap-2" title={points ? `${quantity(points.reduce((sum, value) => sum + value, 0))} units sold over the last 30 days` : "Sales trend unavailable"}>
          {points ? <><Sparkline points={points} width={128} height={42} /><span className="text-xs tabular-nums text-[var(--oh-muted)]">{quantity(points.reduce((sum, value) => sum + value, 0))}</span></> : <span className="text-xs text-[var(--oh-muted)]">—</span>}
        </div></Cell>
        <Cell><div className="flex items-center gap-1">
          <button type="button" onClick={() => onView(row)} aria-label={`View ${String(row.name ?? "product")}`} title="View source details" className="grid h-9 w-9 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]"><Eye size={16} /></button>
          <Link href={`/products/odoo?q=${encodeURIComponent(search)}`} aria-label={`Edit ${String(row.name ?? "product")} in Orithos`} title="Open Orithos product record" className="grid h-9 w-9 place-items-center rounded-md border border-[var(--oh-border)] text-emerald-700 hover:bg-[var(--oh-surface)]"><Pencil size={15} /></Link>
        </div></Cell>
      </tr>;
    })}</tbody>
    {loading && <tfoot><tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront products…</td></tr></tfoot>}
  </table></TableFrame>;
}

function ProductSourceDialog({ product, onClose }: { product: SourceRow; onClose: () => void }) {
  const stock = readSourceProductInventory(product);
  const fields: Array<[string, string]> = [
    ["Category", sourceText(product, "category")], ["SKU", sourceText(product, "sku")], ["Barcode", sourceText(product, "barcode")],
    ["Cost", sourceMoney(product, "cost")], ["Price", sourceMoney(product, "price")], ["Inventory tracking", product.track_inventory === true ? "Tracked" : "Non-stock"],
    ["On hand", stock?.available === true ? `${quantity(sourceNumber(stock, "quantity"))} Units` : "Snapshot unavailable"], ["Outlets", stock?.available === true ? quantity(sourceNumber(stock, "outlets")) : "—"],
    ["Source status", sourceText(product, "status")], ["Last synced", dateTimeLabel(product.synced_at)], ["Shopfront product ID", sourceText(product, "shopfront_product_id")],
  ];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="source-product-title" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-lg bg-white shadow-xl">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] px-5 py-4"><div><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Shopfront · read only</p><h2 id="source-product-title" className="mt-1 break-words text-lg font-semibold text-[var(--oh-text)]">{sourceText(product, "name")}</h2></div><button type="button" aria-label="Close product details" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--oh-border)]"><X size={16} /></button></header>
      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[var(--oh-muted)]">{label}</dt><dd className="mt-0.5 break-words text-sm text-[var(--oh-text)]">{value}</dd></div>)}</dl>
      <footer className="flex justify-end border-t border-[var(--oh-border)] px-5 py-3"><Link href={`/products/odoo?q=${encodeURIComponent(String(product.sku || product.barcode || product.name || ""))}`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white"><Pencil size={15} />Open Orithos product</Link></footer>
    </section>
  </div>;
}

function InventoryTable({ rows, loading, fetchedAt, total, totals }: { rows: SourceRow[]; loading: boolean; fetchedAt: string | null; total: number; totals: SourceRow }) {
  return <>
    <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-xs text-[var(--oh-muted)]">
      <span>Live Shopfront Inventory On Hand</span><span>{total.toLocaleString("en-AU")} report rows</span><span>Fetched {dateLabel(fetchedAt)}</span>
    </div>
    <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[680px] border-collapse text-left">
      <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Name", "Case Quantity", "Case Level", "Item Level", "Value (Inc) (Last)"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--oh-border)]">{rows.map((row, index) => <tr key={`${sourceText(row, "Name", "BY_NAME")}-${index}`} className="hover:bg-[var(--oh-surface)]">
        <Cell><span className="font-medium">{sourceText(row, "Name", "BY_NAME")}</span></Cell><Cell>{quantity(sourceNumber(row, "Case Quantity", "case_quantity"))}</Cell><Cell>{quantity(sourceNumber(row, "Case Level", "case_level"))}</Cell><Cell>{quantity(sourceNumber(row, "Item Level", "single_level"))}</Cell><Cell>{sourceMoney(row, "Value (Inc) (Last)", "value")}</Cell>
      </tr>)}</tbody>
      {!loading && <tfoot className="sticky bottom-0 bg-[var(--oh-surface)] font-semibold"><tr><td className="px-3 py-3">Total</td><td></td><td className="px-3 py-3">{quantity(totals.case_level)}</td><td className="px-3 py-3">{quantity(totals.item_level)}</td><td className="px-3 py-3">{totals.value_last_cost_complete === 1 ? money(Number(totals.value_last_cost)) : "—"}</td></tr></tfoot>}
      {loading && <tfoot><tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront report…</td></tr></tfoot>}
    </table></TableFrame>
  </>;
}

function PurchaseTable({ rows, loading }: { rows: SourceRow[]; loading: boolean }) {
  return <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[860px] border-collapse text-left">
    <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Name", "Total Cost", "Fees", "Freight", "Payment Fees", "Tax Amount"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--oh-border)]">{rows.map((row, index) => <tr key={`${sourceText(row, "Name", "BY_NAME")}-${index}`} className="hover:bg-[var(--oh-surface)]">
      <Cell>{sourceText(row, "Name", "BY_NAME")}</Cell><Cell>{money(sourceNumber(row, "Total Cost", "cost"))}</Cell><Cell>{money(sourceNumber(row, "Fees", "fees"))}</Cell><Cell>{money(sourceNumber(row, "Freight", "freight"))}</Cell><Cell>{money(sourceNumber(row, "Payment Fees", "payment_fees"))}</Cell><Cell>{money(sourceNumber(row, "Tax Amount", "tax"))}</Cell>
    </tr>)}</tbody>
    {loading && <tfoot><tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront report…</td></tr></tfoot>}
  </table></TableFrame>;
}
