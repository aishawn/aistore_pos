"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Search } from "lucide-react";

export type Mode = "dashboard" | "sales" | "inventory" | "products" | "purchase";
type SourceRow = Record<string, unknown>;
type SourceSnapshot = { complete?: unknown; snapshot_at?: unknown; products?: unknown; source_products?: unknown; [key: string]: unknown };
type SourceCoverage = { inventory?: SourceSnapshot; catalog?: Record<string, unknown>; products?: Record<string, unknown>; [key: string]: unknown };
type PagePayload = { data?: SourceRow[]; pagination?: { page?: number; size?: number; total?: number }; snapshot?: SourceSnapshot; coverage?: Record<string, unknown>; source?: string; fetched_at?: unknown; totals?: SourceRow; metrics?: SourceRow };
type CoveragePayload = { data?: SourceCoverage };

const PAGE_SIZE = 50;
const MODE_META: Record<Mode, { title: string; odooHref: string; odooLabel: string }> = {
  dashboard: { title: "Shopfront dashboard", odooHref: "/reports/dashboard/odoo", odooLabel: "Orithos dashboard" },
  sales: { title: "Shopfront sales", odooHref: "/reports/dashboard/odoo", odooLabel: "Orithos dashboard" },
  inventory: { title: "Shopfront inventory", odooHref: "/reports/inventory/odoo", odooLabel: "Orithos inventory" },
  products: { title: "Shopfront products", odooHref: "/products/odoo", odooLabel: "Orithos products" },
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

function statusTone(status: unknown) {
  const value = String(status ?? "").toUpperCase();
  if (value === "ACTIVE" || value === "COMPLETED" || value === "RECEIVED") return "text-emerald-800 bg-emerald-50";
  if (value === "CANCELLED" || value === "NOT_ACTIVE") return "text-slate-700 bg-slate-100";
  return "text-amber-900 bg-amber-50";
}

function readSourceProductInventory(product: SourceRow) {
  const raw = product.raw_payload && typeof product.raw_payload === "object" ? product.raw_payload as SourceRow : {};
  const value = raw.inventory;
  return Array.isArray(value) ? value[0] as SourceRow | undefined : value && typeof value === "object" ? value as SourceRow : undefined;
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
  const initialTo = today;
  const initialFrom = today;
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
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<SourceCoverage | null>(null);
  const [rangeCoverage, setRangeCoverage] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [reportTotals, setReportTotals] = useState<SourceRow>({});
  const [reportMetrics, setReportMetrics] = useState<SourceRow>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resource = mode === "dashboard" || mode === "sales" ? "report-sales" : mode === "products" ? "products" : mode === "inventory" ? "report-inventory" : "report-purchase";
      const params = new URLSearchParams({ resource });
      if (mode === "dashboard" || mode === "sales") {
        params.set("from", range.from);
        params.set("to", range.to);
        if (mode === "dashboard") params.set("dashboard", "true");
      } else if (mode === "purchase") {
        params.set("from", range.from);
        params.set("to", range.to);
        if (query) params.set("q", query);
      } else {
        params.set("page", String(page));
        params.set("size", String(PAGE_SIZE));
        if (query) params.set("q", query);
        if (mode === "products") {
          params.set("catalog_only", "true");
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
      setRows(result.data ?? []);
      setTotal(Number(result.pagination?.total ?? result.data?.length ?? 0));
      setReportTotals(result.totals ?? {});
      setReportMetrics(result.metrics ?? {});
      setRangeCoverage(result.coverage ?? null);
      setSnapshot(result.snapshot ?? null);
      setGeneratedAt(typeof result.fetched_at === "string" ? result.fetched_at : new Date().toISOString());

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
      setError(cause instanceof Error ? cause.message : "Shopfront source data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [mode, negativeOnly, page, productFilters, query, range, refreshKey, status]);

  useEffect(() => { void load(); }, [load]);

  const sums = useMemo(() => rows.reduce<{ revenue: number; cost: number; profit: number; tax: number; discount: number; transactions: number }>((acc, row) => ({
    revenue: acc.revenue + sourceNumber(row, "Revenue", "revenue"),
    cost: acc.cost + sourceNumber(row, "Cost of Goods Sold", "cost"),
    profit: acc.profit + sourceNumber(row, "Profit", "profit"),
    tax: acc.tax + sourceNumber(row, "Tax Amount", "tax"),
    discount: acc.discount + sourceNumber(row, "Discount Amount", "discount"),
    transactions: acc.transactions + sourceNumber(row, "Transaction Count", "transaction_count"),
  }), { revenue: 0, cost: 0, profit: 0, tax: 0, discount: 0, transactions: 0 }), [rows]);
  const averageSale = sums.transactions > 0 ? sums.revenue / sums.transactions : 0;
  const profitPercentage = sums.revenue !== 0 ? (sums.profit / sums.revenue) * 100 : 0;
  const missingDates = Array.isArray(rangeCoverage?.missing_dates) ? rangeCoverage?.missing_dates as string[] : [];
  const inventory = coverage?.inventory ?? {};
  const catalog = coverage?.catalog ?? {};
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
          {generatedAt && <p className="mt-1 text-xs text-[var(--oh-muted)]">Loaded {dateLabel(generatedAt)} · Adelaide business dates</p>}
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

      <nav aria-label="Shopfront source views" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--oh-border)] bg-white px-4 md:px-6">
        {(Object.keys(MODE_HREF) as Mode[]).map(view => <Link key={view} href={MODE_HREF[view]} aria-current={view === mode ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${view === mode ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-muted)] hover:text-[var(--oh-text)]"}`}>
          {MODE_LABEL[view]}
        </Link>)}
      </nav>

      {error && <div role="alert" className="mx-4 mt-3 flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 md:mx-6"><AlertCircle size={16} />{error}</div>}

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
        <Metric label="Revenue" value={money(sums.revenue)} />
        <Metric label="Cost of goods sold" value={money(sums.cost)} />
        <Metric label="Gross profit" value={money(sums.profit)} emphasis />
        <Metric label="Average sale" value={money(averageSale)} />
        <Metric label="Profit percentage" value={`${quantity(profitPercentage)}%`} />
        <Metric label="Sale count" value={quantity(sums.transactions)} />
        <Metric label="Customers" value={quantity(reportMetrics.customer_count)} />
        <Metric label="Basket size" value={quantity(reportMetrics.basket_size)} />
        <Metric label="Discount amount" value={money(sums.discount)} />
        <Metric label="Active products" value={quantity(catalog.active_records)} detail="Shopfront ACTIVE catalog" />
        <Metric label="Inventory records" value={quantity(inventory.records)} />
        <Metric label="Negative stock rows" value={quantity(inventory.negative_records)} />
      </div>}

      {mode === "dashboard" && <DashboardBreakdown metrics={reportMetrics} />}

      {mode === "sales" && <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <Metric label="Revenue" value={money(sums.revenue)} />
        <Metric label="Cost of goods sold" value={money(sums.cost)} />
        <Metric label="Profit" value={money(sums.profit)} emphasis />
        <Metric label="Average sale" value={money(averageSale)} />
        <Metric label="Profit percentage" value={`${quantity(profitPercentage)}%`} />
        <Metric label="Tax" value={money(sums.tax)} />
        <Metric label="Discount" value={money(sums.discount)} />
        <Metric label="Transactions" value={quantity(sums.transactions)} />
      </div>}

      {(mode === "sales" || mode === "dashboard") && missingDates.length > 0 && <div role="status" className="mx-4 mt-3 flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:mx-6"><AlertCircle size={16} className="mt-0.5 shrink-0" />Report coverage is incomplete for {missingDates.length} date(s): {missingDates.slice(0, 8).join(", ")}{missingDates.length > 8 ? "…" : ""}.</div>}

      {mode === "products" && <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[var(--oh-border)] bg-white px-4 py-2 text-xs text-[var(--oh-muted)] md:px-6">
        <span>Current view: {status === "all" ? "ACTIVE" : status} products{query ? ` matching “${query}”` : ""}</span>
        <span>{quantity(catalog.active_records)} ACTIVE</span>
        <span>{quantity(catalog.current_records)} current catalog</span>
        <span>{quantity(coverage?.products?.total)} archived records</span>
        <span>{quantity(catalog.historical_or_unconfirmed_records)} historical / unconfirmed</span>
      </div>}

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "sales" || mode === "dashboard" ? <SalesTable rows={rows} loading={loading} />
          : mode === "products" ? <ProductsTable rows={rows} loading={loading} />
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
    </main>
  );
}

function Metric({ label, value, emphasis = false, detail }: { label: string; value: string; emphasis?: boolean; detail?: string }) {
  return <div className="min-w-28"><p className="text-xs font-medium text-[var(--oh-muted)]">{label}</p><p className={`mt-1 text-lg font-semibold ${emphasis ? "text-[var(--oh-primary)]" : "text-[var(--oh-text)]"}`}>{value}</p>{detail && <p className="mt-0.5 text-[11px] text-[var(--oh-muted)]">{detail}</p>}</div>;
}

function DashboardBreakdown({ metrics }: { metrics: SourceRow }) {
  const products = Array.isArray(metrics.top_products) ? metrics.top_products as SourceRow[] : [];
  const users = Array.isArray(metrics.users) ? metrics.users as SourceRow[] : [];
  if (!products.length && !users.length) return null;
  return <div className="grid gap-4 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-4 md:grid-cols-2 md:px-6">
    <section className="overflow-x-auto border border-[var(--oh-border)] bg-white">
      <h2 className="border-b border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)]">Top 20 Products</h2>
      <table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Revenue</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{products.map((row, index) => <tr key={`${String(row.id)}-${index}`}><Cell>{sourceText(row, "name")}</Cell><Cell>{quantity(row.quantity)}</Cell><Cell>{money(row.revenue)}</Cell></tr>)}</tbody></table>
    </section>
    <section className="overflow-x-auto border border-[var(--oh-border)] bg-white">
      <h2 className="border-b border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)]">Users</h2>
      <table className="w-full min-w-[360px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Transactions</th><th className="px-3 py-2">Revenue</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{users.map((row, index) => <tr key={`${String(row.id)}-${index}`}><Cell>{sourceText(row, "name")}</Cell><Cell>{quantity(row.transactions)}</Cell><Cell>{money(row.revenue)}</Cell></tr>)}</tbody></table>
    </section>
  </div>;
}

function SalesTable({ rows, loading }: { rows: SourceRow[]; loading: boolean }) {
  return <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[860px] border-collapse text-left">
    <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Name", "Revenue", "Cost of goods sold", "Transactions", "Average sale", "Profit", "Profit %", "Tax", "Discount", "Revenue %", "Transactions %"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--oh-border)]">{rows.map((row, index) => <tr key={`${sourceText(row, "Name", "BY_NAME")}-${index}`} className="hover:bg-[var(--oh-surface)]">
      <Cell>{sourceText(row, "Name", "BY_NAME")}</Cell><Cell>{money(sourceNumber(row, "Revenue", "revenue"))}</Cell><Cell>{money(sourceNumber(row, "Cost of Goods Sold", "cost"))}</Cell><Cell>{quantity(sourceNumber(row, "Transaction Count", "transaction_count"))}</Cell><Cell>{money(sourceNumber(row, "Average Sale", "average_sale"))}</Cell><Cell className="font-semibold">{money(sourceNumber(row, "Profit", "profit"))}</Cell><Cell>{sourceText(row, "Profit Percentage", "profit_percentage")}</Cell><Cell>{money(sourceNumber(row, "Tax Amount", "tax"))}</Cell><Cell>{money(sourceNumber(row, "Discount Amount", "discount"))}</Cell><Cell>{sourceText(row, "Revenue Percentage", "revenue_percentage")}</Cell><Cell>{sourceText(row, "Transaction Percentage", "transaction_percentage")}</Cell>
    </tr>)}</tbody>
    {loading && <tfoot><tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront report…</td></tr></tfoot>}
  </table></TableFrame>;
}

function ProductsTable({ rows, loading }: { rows: SourceRow[]; loading: boolean }) {
  return <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[1420px] border-collapse text-left">
    <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Status", "Product", "SKU / Barcode", "Category", "Brand", "Family", "Supplier", "Type", "Retail Tax", "Purchase Tax", "Cost", "Inventory", "Price"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--oh-border)]">{rows.map(row => {
      const stock = readSourceProductInventory(row);
      const caseLevel = stock?.caseLevel;
      const singleLevel = stock?.singleLevel;
      const inventoryText = stock ? `${quantity(caseLevel)} Cases · ${quantity(singleLevel)} Items` : "—";
      return <tr key={String(row.shopfront_product_id)} className="hover:bg-[var(--oh-surface)]">
        <Cell><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{String(row.status ?? "UNKNOWN")}</span></Cell>
        <Cell><span className="font-medium">{String(row.name ?? "—")}</span></Cell>
        <Cell>{String(row.sku || row.barcode || "—")}</Cell><Cell>{String(row.category ?? "—")}</Cell><Cell>{String(row.brand ?? "—")}</Cell><Cell>{String(row.family ?? "—")}</Cell><Cell>{String(row.supplier ?? "—")}</Cell><Cell>{String(row.type ?? "—")}</Cell><Cell>{String(row.tax_rate ?? "—")}</Cell><Cell>{String(row.cost_tax_rate ?? "—")}</Cell><Cell>{money(row.cost)}</Cell><Cell>{inventoryText}</Cell><Cell>{money(row.price)}</Cell>
      </tr>;
    })}</tbody>
    {loading && <tfoot><tr><td colSpan={13} className="px-3 py-6 text-center text-sm text-[var(--oh-muted)]">Loading Shopfront products…</td></tr></tfoot>}
  </table></TableFrame>;
}

function InventoryTable({ rows, loading, fetchedAt, total, totals }: { rows: SourceRow[]; loading: boolean; fetchedAt: string | null; total: number; totals: SourceRow }) {
  return <>
    <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-xs text-[var(--oh-muted)]">
      <span>Live Shopfront Inventory On Hand</span><span>{total.toLocaleString("en-AU")} report rows</span><span>Fetched {dateLabel(fetchedAt)}</span>
    </div>
    <TableFrame empty={!loading && !rows.length}><table className="w-full min-w-[680px] border-collapse text-left">
      <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Name", "Case Quantity", "Case Level", "Item Level", "Value (Inc) (Last)"].map(item => <th key={item} className="px-3 py-2 font-semibold">{item}</th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--oh-border)]">{rows.map((row, index) => <tr key={`${sourceText(row, "Name", "BY_NAME")}-${index}`} className="hover:bg-[var(--oh-surface)]">
        <Cell><span className="font-medium">{sourceText(row, "Name", "BY_NAME")}</span></Cell><Cell>{quantity(sourceNumber(row, "Case Quantity", "case_quantity"))}</Cell><Cell>{quantity(sourceNumber(row, "Case Level", "case_level"))}</Cell><Cell>{quantity(sourceNumber(row, "Item Level", "single_level"))}</Cell><Cell>{money(sourceNumber(row, "Value (Inc) (Last)", "value"))}</Cell>
      </tr>)}</tbody>
      {!loading && <tfoot className="sticky bottom-0 bg-[var(--oh-surface)] font-semibold"><tr><td className="px-3 py-3">Total</td><td></td><td className="px-3 py-3">{quantity(totals.case_level)}</td><td className="px-3 py-3">{quantity(totals.item_level)}</td><td className="px-3 py-3">{money(totals.value_last_cost)}</td></tr></tfoot>}
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
