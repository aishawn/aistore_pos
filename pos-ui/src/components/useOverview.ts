"use client";
import { fetchPreparedReport } from "@/lib/report-client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  OdooApiError,
} from "@/lib/odoo-api";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";
import { fetchShopfrontSyncStamp, readShopfrontSyncStamp } from "@/lib/shopfront-sync-stamp";
import { parseShopfrontInventoryReport, parseShopfrontSalesReport, reconcileShopfrontSales, shopfrontDashboardMetricPaths, shopfrontInventorySnapshotIsFresh } from "@/lib/shopfront-dashboard-metrics";

export type OverviewPulse = {
  generatedAt?: string;
  queryThrough?: string;
  cacheStatus?: string;
  updateStatus?: string;
  completeness?: "complete" | "incomplete" | "unverified";
  sourceReconciliation?: "matched" | "mismatch" | "unavailable" | "not_comparable";
  sourceSyncedThrough?: string | null;
  dataRevision?: string;
  taskId?: string;
  company: string;
  currency: string;
  timezone: string;
  revenue: number;
  transactions?: number;
  openRegisters?: number;
  opportunities?: number;
  lowStockCount?: number;
  newCustomers?: number;
  inventoryUnits?: number | null;
  inventoryNetUnits?: number | null;
  yesterdaySales?: number;
  yesterdaySalesAvailable?: boolean;
  yesterdayGrossMargin?: number | null;
  grossMarginCoverage?: number;
  inventoryAvailable?: boolean;
  inventoryStatus?: string;
  inventorySnapshotAt?: string | null;
  negativeStockProducts?: number | null;
  inventoryCoverage?: number | null;
  inventoryIncompleteRows?: number | null;
  grossMarginStatus?: string;
  yesterdayNetSales?: number | null;
  yesterdayTax?: number | null;
  salesReconciled?: boolean;
  yesterdayFrom?: string;
  yesterdayTo?: string;
  grossMarginBasis?: string;
  sourceReportsFetchedAt?: string | null;
  sourceSalesAvailable?: boolean;
  sourceInventoryAvailable?: boolean;
  todayShopfrontSalesAvailable?: boolean;
  todaySalesReconciliation?: "matched" | "mismatch" | "unavailable";
  todaySourceFetchedAt?: string | null;
  shopfrontReportsMode?: "source" | "odoo";
};
const PULSE_STORAGE_KEY = "orithos-dashboard-pulse-v2";
const PULSE_FRESH_MS = 2 * 60_000;
const PULSE_KEEP_MS = 30 * 60_000;
const PULSE_SYNC_POLL_MS = 5 * 60_000;
type StoredPulse = { scope: string; at: number; data: OverviewPulse };
let memoryPulse: StoredPulse | null = null;
function pulseScope(vendorId?: number) {
  return `${window.location.hostname}:${vendorId ?? "store"}`;
}
function readPulse(scope: string): StoredPulse | null {
  if (memoryPulse?.scope === scope && Date.now() - memoryPulse.at < PULSE_KEEP_MS && Number.isFinite(memoryPulse.data.revenue)) {
    return memoryPulse;
  }
  try {
    const raw = localStorage.getItem(PULSE_STORAGE_KEY) ?? sessionStorage.getItem(PULSE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "null") as StoredPulse | null;
    if (!parsed || parsed.scope !== scope || Date.now() - parsed.at > PULSE_KEEP_MS || !Number.isFinite(parsed.data?.revenue)) return null;
    memoryPulse = parsed;
    return parsed;
  } catch {
    return null;
  }
}
function writePulse(scope: string, data: OverviewPulse) {
  const stored = { scope, at: Date.now(), data };
  memoryPulse = stored;
  try { localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify(stored)); } catch { /* Keep the in-memory copy when storage is full. */ }
}

export function pulseMarginNote(data: OverviewPulse): string {
  const status = data.grossMarginStatus;
  if (status === "sales_mismatch") return "Odoo sales do not reconcile";
  if (status === "shopfront_profit_mismatch") return "Shopfront Profit differs from Revenue − COGS";
  if (status === "shopfront_profit_incomplete") return "Shopfront Profit unavailable · margin uses Revenue − COGS";
  if (status === "shopfront_source_report") return "Shopfront Sales · Profit / Revenue";
  if (data.shopfrontReportsMode === "source" && status === "unavailable") return "Shopfront Sales report unavailable";
  if (status === "source_margin") return "Shopfront source cost · not ledger-audited";
  if (status === "source_margin_unverified") return "Shopfront cost · sync coverage unverified";
  if (status === "purchase_cost_missing" || status === "ledger_cost_unverified") return "Odoo cost records incomplete";
  if (status === "no_sales") return "No sales yesterday";
  if (status === "verified") return `Odoo recorded cost · ${Math.round((data.grossMarginCoverage ?? 0) * 100)}% coverage`;
  if (status === "complete") {
    return `POS purchase cost · ${Math.round((data.grossMarginCoverage ?? 0) * 100)}% lines · not ledger-audited`;
  }
  if (status === "partial") {
    return `${Math.round((data.grossMarginCoverage ?? 0) * 100)}% purchase cost · lines missing cost`;
  }
  if (data.yesterdayGrossMargin == null) return "Purchase cost unavailable · open reconciliation";
  return "Purchase cost on POS lines · not ledger-audited";
}

function mapPayload(payload: Record<string, unknown>): OverviewPulse {
  return {
    generatedAt: payload.generatedAt as string | undefined,
    queryThrough: payload.queryThrough as string | undefined,
    cacheStatus: payload.cacheStatus as string | undefined,
    updateStatus: payload.updateStatus as string | undefined,
    completeness: payload.completeness as OverviewPulse["completeness"],
    sourceReconciliation: payload.sourceReconciliation as OverviewPulse["sourceReconciliation"],
    sourceSyncedThrough: payload.sourceSyncedThrough as string | null | undefined,
    dataRevision: payload.dataRevision as string | undefined,
    taskId: payload.taskId as string | undefined,
    company: (payload.company as string) || "Store",
    currency: (payload.currency as string) || "AUD",
    timezone: (payload.timezone as string) || "Australia/Adelaide",
    revenue: payload.revenue as number,
    transactions: Number.isFinite(payload.transactions) ? Number(payload.transactions) : undefined,
    openRegisters: Number.isFinite(payload.openRegisters) ? Number(payload.openRegisters) : undefined,
    opportunities: Number.isFinite(payload.opportunities) ? Number(payload.opportunities) : undefined,
    lowStockCount: Number.isFinite(payload.lowStockCount) ? Number(payload.lowStockCount) : undefined,
    newCustomers: Number.isFinite(payload.newCustomers) ? Number(payload.newCustomers) : undefined,
    inventoryUnits: Number.isFinite(payload.inventoryUnits) ? Number(payload.inventoryUnits) : null,
    inventoryNetUnits: Number.isFinite(payload.inventoryNetUnits) ? Number(payload.inventoryNetUnits) : null,
    yesterdaySales: Number.isFinite(payload.yesterdaySales) ? Number(payload.yesterdaySales) : 0,
    yesterdaySalesAvailable: payload.yesterdaySalesAvailable === true,
    yesterdayGrossMargin: Number.isFinite(payload.yesterdayGrossMargin) ? Number(payload.yesterdayGrossMargin) : null,
    grossMarginCoverage: Number.isFinite(payload.grossMarginCoverage) ? Number(payload.grossMarginCoverage) : 0,
    inventoryAvailable: payload.inventoryAvailable === true,
    inventoryStatus: payload.inventoryStatus as string | undefined,
    inventorySnapshotAt: payload.inventorySnapshotAt as string | null | undefined,
    negativeStockProducts: payload.negativeStockProducts as number | null | undefined,
    inventoryCoverage: Number.isFinite(payload.inventoryCoverage) ? Number(payload.inventoryCoverage) : null,
    inventoryIncompleteRows: Number.isFinite(payload.inventoryIncompleteRows) ? Number(payload.inventoryIncompleteRows) : null,
    grossMarginStatus: payload.grossMarginStatus as string | undefined,
    yesterdayNetSales: payload.yesterdayNetSales as number | null | undefined,
    yesterdayTax: payload.yesterdayTax as number | null | undefined,
    salesReconciled: payload.salesReconciled as boolean | undefined,
    yesterdayFrom: payload.yesterdayFrom as string | undefined,
    yesterdayTo: payload.yesterdayTo as string | undefined,
    grossMarginBasis: payload.costBasis as string | undefined,
    sourceReportsFetchedAt: payload.sourceReportsFetchedAt as string | null | undefined,
    sourceSalesAvailable: payload.sourceSalesAvailable === true,
    sourceInventoryAvailable: payload.sourceInventoryAvailable === true,
    shopfrontReportsMode: "odoo",
  };
}

function businessDay(value: unknown, timezone: string): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const result = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

function currentBusinessDay(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousBusinessDay(day: string): string {
  const previous = new Date(`${day}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

async function loadShopfrontDashboardMetrics(payload: Record<string, unknown> = {}, forceRefresh = false) {
  const timezone = typeof payload.timezone === "string" ? payload.timezone : "Australia/Adelaide";
  const today = businessDay(payload.from, timezone) ?? currentBusinessDay(timezone);
  const yesterday = businessDay(payload.yesterdayFrom, timezone) ?? previousBusinessDay(today);
  const paths = shopfrontDashboardMetricPaths(today, yesterday, forceRefresh);
  const read = async (path: string) => {
    try {
      const response = await fetchPreparedReport(path);
      if (response.status === 409) return { mapped: false as const, report: null };
      if (!response.ok) return { mapped: true as const, report: null };
      return { mapped: true as const, report: await response.json() as Record<string, unknown> };
    } catch {
      return { mapped: true as const, report: null };
    }
  };
  const [todaySalesResponse, yesterdaySalesResponse, inventoryResponse] = await Promise.all([
    read(paths.todaySales),
    paths.yesterdaySales ? read(paths.yesterdaySales) : Promise.resolve({ mapped: true as const, report: null }),
    read(paths.inventory),
  ]);
  if (!todaySalesResponse.mapped || !yesterdaySalesResponse.mapped || !inventoryResponse.mapped) {
    return { mapped: false as const, salesToday: null, salesYesterday: null, inventory: null, inventoryStale: false, inventorySnapshotAt: null };
  }
  const inventoryPayload = inventoryResponse.report;
  const inventorySnapshotAt = typeof inventoryPayload?.snapshot_at === "string" ? inventoryPayload.snapshot_at : null;
  const inventoryStale = inventoryPayload?.reason === "snapshot_stale"
    || Boolean(inventorySnapshotAt && !shopfrontInventorySnapshotIsFresh(inventorySnapshotAt));
  return {
    mapped: true as const,
    salesToday: parseShopfrontSalesReport(todaySalesResponse.report),
    salesYesterday: parseShopfrontSalesReport(yesterdaySalesResponse.report),
    inventory: parseShopfrontInventoryReport(inventoryResponse.report),
    inventoryStale,
    inventorySnapshotAt,
  };
}

function sourceDashboardPulse(source: Awaited<ReturnType<typeof loadShopfrontDashboardMetrics>>): OverviewPulse | null {
  if (!source.mapped) return null;
  const today = currentBusinessDay("Australia/Adelaide");
  const yesterday = previousBusinessDay(today);
  const base: OverviewPulse = {
    company: "Shopfront",
    currency: "AUD",
    timezone: "Australia/Adelaide",
    revenue: 0,
    yesterdaySales: 0,
    yesterdaySalesAvailable: false,
    yesterdayFrom: yesterday,
    yesterdayTo: yesterday,
    inventoryAvailable: false,
    inventoryStatus: source.inventoryStale ? "stale" : "unavailable",
    shopfrontReportsMode: "source",
  };
  return applyShopfrontDashboardMetrics(base, source);
}

function applyShopfrontDashboardMetrics(data: OverviewPulse, source: Awaited<ReturnType<typeof loadShopfrontDashboardMetrics>>): OverviewPulse {
  if (!source.mapped) return data;
  const salesToday = source.salesToday;
  const salesYesterday = source.salesYesterday;
  const inventory = source.inventory;
  const sourceActive = salesToday !== null || salesYesterday !== null || inventory !== null;
  if (!sourceActive) return data;
  const fetchedTimes = [salesToday?.fetchedAt, salesYesterday?.fetchedAt, inventory?.fetchedAt, source.inventorySnapshotAt].filter((value): value is string => Boolean(value)).map(value => Date.parse(value)).filter(Number.isFinite);
  const sourceReportsFetchedAt = fetchedTimes.length ? new Date(Math.min(...fetchedTimes)).toISOString() : null;
  const next: OverviewPulse = { ...data, shopfrontReportsMode: "source", sourceReportsFetchedAt };
  if (salesToday) {
    const odooRevenue = data.revenue;
    const odooTransactions = data.transactions ?? Number.NaN;
    next.revenue = salesToday.revenue;
    next.transactions = salesToday.transactionCount;
    next.todayShopfrontSalesAvailable = true;
    next.todaySalesReconciliation = data.shopfrontReportsMode === "source"
      ? "unavailable"
      : reconcileShopfrontSales(salesToday, odooRevenue, odooTransactions);
    next.todaySourceFetchedAt = salesToday.fetchedAt;
  }
  if (salesYesterday) {
    next.yesterdaySales = salesYesterday.revenue;
    next.yesterdaySalesAvailable = true;
    next.yesterdayGrossMargin = salesYesterday.grossMargin;
    next.grossMarginCoverage = 1;
    next.grossMarginStatus = salesYesterday.grossMargin === null ? "no_sales"
      : salesYesterday.profitStatus === "mismatch" ? "shopfront_profit_mismatch"
        : salesYesterday.profitStatus === "incomplete" ? "shopfront_profit_incomplete"
          : "shopfront_source_report";
    next.grossMarginBasis = "shopfront_sales_report_profit_percentage";
    next.sourceSalesAvailable = true;
  }
  if (inventory) {
    next.inventoryUnits = inventory.sellableUnits;
    next.inventoryAvailable = true;
    next.inventoryStatus = inventory.completeness === "partial" ? "partial_inventory" : inventory.negativeStockProducts ? "negative_stock" : "verified";
    next.inventorySnapshotAt = source.inventorySnapshotAt;
    next.negativeStockProducts = inventory.negativeStockProducts;
    next.inventoryCoverage = inventory.coverage;
    next.inventoryIncompleteRows = inventory.incompleteRecordCount;
    next.sourceInventoryAvailable = true;
  } else {
    next.inventoryUnits = null;
    next.inventoryAvailable = false;
    next.sourceInventoryAvailable = false;
    next.inventoryStatus = source.inventoryStale ? "stale" : "unavailable";
    next.inventorySnapshotAt = source.inventorySnapshotAt;
    next.negativeStockProducts = null;
    next.inventoryCoverage = null;
    next.inventoryIncompleteRows = null;
  }
  return next;
}

function downgradeStaleShopfrontPulse(data: OverviewPulse): OverviewPulse {
  if (data.shopfrontReportsMode !== "source") return data;
  if (data.todayShopfrontSalesAvailable || data.sourceSalesAvailable || data.sourceInventoryAvailable) return data;
  if (data.inventoryAvailable && Number.isFinite(data.inventoryUnits)) return data;
  return { ...data, shopfrontReportsMode: "odoo" };
}
export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
export function useOverview() {
  const { user, ready, hasPermission } = useAuth();
  const [data, setData] = useState<OverviewPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [parked, setParked] = useState(0);
  const revision = useRef(0);
  const lastFetchAt = useRef(0);
  const pulseRef = useRef<OverviewPulse | null>(null);
  useEffect(() => {
    pulseRef.current = data;
  }, [data]);
  const load = useCallback(async (refresh = false, revalidate = false) => {
    const current = ++revision.current;
    const scope = pulseScope(user?.vendorId);
    const cached = refresh || revalidate ? null : readPulse(scope);
    const paintedFromCache = Boolean(cached);
    if (cached) {
      let cachedData = { ...cached.data };
      if (cachedData.shopfrontReportsMode === "source" && !shopfrontInventorySnapshotIsFresh(cachedData.inventorySnapshotAt)) {
        cachedData.inventoryUnits = null;
        cachedData.negativeStockProducts = null;
        cachedData.inventoryAvailable = false;
        cachedData.sourceInventoryAvailable = false;
        cachedData.inventoryStatus = cachedData.inventorySnapshotAt ? "stale" : "unavailable";
        cachedData.inventoryCoverage = null;
        cachedData.inventoryIncompleteRows = null;
      }
      cachedData = downgradeStaleShopfrontPulse(cachedData);
      writePulse(scope, cachedData);
      setData(cachedData);
      setLoading(false);
      const freshFor = cached.data.cacheStatus === "STALE" ? 15_000 : PULSE_FRESH_MS;
      // A cached Odoo-only summary can contain zero inventory while the
      // Shopfront source snapshot is healthy. Keep the fast paint, but force
      // a revalidation until the source inventory metric has been confirmed.
      const sourceInventoryConfirmed = cachedData.shopfrontReportsMode === "source"
        && cachedData.sourceInventoryAvailable === true
        && cachedData.inventoryAvailable === true
        && Number.isFinite(cachedData.inventoryUnits)
        && shopfrontInventorySnapshotIsFresh(cachedData.inventorySnapshotAt);
      if (Date.now() - cached.at < freshFor && sourceInventoryConfirmed) return;
    } else {
      setLoading(true);
    }
    setError(null);
    setAuthExpired(false);
    let checkingSession = true;
    try {
      checkingSession = false;
      const source = await loadShopfrontDashboardMetrics({}, refresh);
      const sourcePulse = sourceDashboardPulse(source);
      if (sourcePulse) {
        if (current !== revision.current) return;
        setConnection(false);
        setData(sourcePulse);
        writePulse(scope, sourcePulse);
        lastFetchAt.current = Date.now();
        return;
      }
      const response = await fetchPreparedReport("/api/odoo/reporting-dashboard?period=today&view=summary", { refresh });
      const payload = await response.json();
      if (current !== revision.current) return;
      setConnection(response.status === 401);
      if (!response.ok)
        throw new OdooApiError(
          payload?.message || "Could not load your store dashboard.",
          response.status,
        );
      if (!Number.isFinite(payload?.revenue))
        throw new Error("The store summary is incomplete. Please retry.");
      let next = mapPayload(payload as Record<string, unknown>);
      const enrichedSource = await loadShopfrontDashboardMetrics(payload as Record<string, unknown>, refresh);
      next = applyShopfrontDashboardMetrics(next, enrichedSource);
      if (current !== revision.current) return;
      setData(next);
      writePulse(scope, next);
      lastFetchAt.current = Date.now();
    } catch (cause) {
      if (current === revision.current) {
        const authExpired = cause instanceof OdooApiError
          && cause.status === 401
          && checkingSession
          && /Orithos session expired/i.test(cause.message);
        const odooSessionExpired = cause instanceof OdooApiError
          && cause.status === 401
          && !checkingSession;
        setAuthExpired(authExpired);
        setConnection(odooSessionExpired ? true : false);
        const surfaceError = refresh || authExpired || odooSessionExpired || (!paintedFromCache && !pulseRef.current);
        if (surfaceError) {
          setError(
            authExpired
              ? "Your Orithos session has expired. Please sign in again."
              : odooSessionExpired
                ? "Connect your store to load dashboard data."
              : cause instanceof Error
                ? cause.message
                : "Could not load dashboard.",
          );
        }
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [user?.vendorId]);
  useEffect(() => {
    if (!data?.taskId || data.cacheStatus !== "STALE") return;
    const controller = new AbortController(); const current = revision.current;
    void fetchPreparedReport(`/api/odoo/reporting-dashboard?period=today&view=summary&task=${data.taskId}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as Record<string, unknown>;
        if (!response.ok || !Number.isFinite(payload.revenue)) throw new Error("Summary update failed. Please retry.");
        let next = mapPayload(payload);
        const source = await loadShopfrontDashboardMetrics(payload);
        next = applyShopfrontDashboardMetrics(next, source);
        if (!controller.signal.aborted && current === revision.current) {
          setData(next);
          writePulse(pulseScope(user?.vendorId), next);
          lastFetchAt.current = Date.now();
        }
      }).catch(() => { /* Keep the saved summary visible when background refresh fails. */ });
    return () => controller.abort();
  }, [data?.taskId, data?.cacheStatus, user?.vendorId]);
  useEffect(() => {
    if (!ready || !user) return;
    void load();
    void fetchShopfrontSyncStamp();
    const counter = revision;
    return () => {
      counter.current++;
    };
  }, [load, ready, user?.id, user?.vendorId, user?.outletId]);
  useEffect(() => {
    if (!ready || !user) return;
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 15_000) return;
      lastRefresh = Date.now();
      void load(false, true);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load, ready, user]);
  useEffect(() => {
    const reset = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string; active?: boolean }>).detail;
      revision.current++;
      setData(null);
      // Identity changes already trigger the authenticated load effect below.
      if (detail?.reason !== "identity" && detail?.active !== false && user && ready) void load();
    };
    window.addEventListener("orithos-read-cache-cleared", reset);
    return () => window.removeEventListener("orithos-read-cache-cleared", reset);
  }, [load, user, ready]);
  useEffect(() => {
    const onSync = () => { void load(true); };
    window.addEventListener("orithos-shopfront-sync", onSync);
    return () => window.removeEventListener("orithos-shopfront-sync", onSync);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const stamp = readShopfrontSyncStamp();
      if (stamp && stamp > lastFetchAt.current) {
        void load(true);
        return;
      }
      void fetchShopfrontSyncStamp().then((remote) => {
        if (remote && remote > lastFetchAt.current) void load(true);
      });
    }, PULSE_SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const sync = () => {
      try {
        const value = JSON.parse(
          localStorage.getItem("orithos-odoo-parked-sales-v1") || "[]",
        );
        setParked(Array.isArray(value) ? value.length : 0);
      } catch {
        setParked(0);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  let greeting = "Welcome back";
  if (data) {
    try {
      const hour = Number(
        new Intl.DateTimeFormat("en-AU", {
          timeZone: data.timezone,
          hour: "numeric",
          hour12: false,
        }).format(new Date()),
      );
      greeting =
        hour < 12
          ? "Good morning"
          : hour < 17
            ? "Good afternoon"
            : "Good evening";
    } catch {
      /* Keep a neutral greeting for invalid source timezones. */
    }
  }
  return {
    data,
    loading,
    error,
    connection,
    authExpired,
    parked,
    load,
    greeting,
    user,
    navigation: getSidebarNavigation({
      isAdmin: Boolean(user?.isAdmin),
      hasPermission,
    }),
    destinations: buildLaunchDestinations(
      getSidebarNavigation({ isAdmin: Boolean(user?.isAdmin), hasPermission }),
    ).filter((item) => item.id !== "overview" && item.id !== "dashboard"),
  };
}
