"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";

export type OverviewPulse = {
  generatedAt?: string;
  queryThrough?: string;
  sourceReportsFetchedAt?: string | null;
  cacheStatus?: string;
  company: string;
  currency: string;
  timezone: string;
  revenue: number;
  transactions?: number;
  opportunities?: number;
  lowStockCount?: number;
  newCustomers?: number;
  inventoryUnits?: number | null;
  yesterdaySales?: number;
  yesterdaySalesAvailable?: boolean;
  yesterdayGrossMargin?: number | null;
  grossMarginCoverage?: number;
  inventoryAvailable?: boolean;
  inventoryStatus?: string;
  negativeStockProducts?: number | null;
  inventoryCoverage?: number | null;
  inventoryIncompleteRows?: number | null;
  grossMarginStatus?: string;
  yesterdayNetSales?: number | null;
  yesterdayTax?: number | null;
  yesterdayFrom?: string;
  yesterdayTo?: string;
  grossMarginBasis?: string;
  sourceSalesAvailable?: boolean;
  sourceInventoryAvailable?: boolean;
  shopfrontReportsMode?: "orithos" | "source";
};

type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  tax: number | null;
  grossProfit: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  inventoryAvailable?: boolean;
  inventoryUnits?: number | null;
  inventoryStatus?: string | null;
  negativeStockProducts?: number | null;
  dailyTrend: Array<{ date: string; revenue: number; transaction_count: number; tax: number | null; grossProfit: number | null; costAvailable: boolean; taxAvailable: boolean }>;
};

const PULSE_STORAGE_KEY = "orithos-dashboard-pulse-native-v1";
const PULSE_FRESH_MS = 60_000;

function storeDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function pulseScope(vendorId?: number, outletId?: number) {
  return `${window.location.hostname}:${vendorId ?? "vendor"}:${outletId ?? "outlet"}`;
}

function readPulse(scope: string): { scope: string; at: number; data: OverviewPulse } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(PULSE_STORAGE_KEY) || "null") as { scope?: string; at?: number; data?: OverviewPulse } | null;
    if (!cached || cached.scope !== scope || !cached.data || !Number.isFinite(cached.data.revenue)) return null;
    return cached as { scope: string; at: number; data: OverviewPulse };
  } catch {
    return null;
  }
}

function writePulse(scope: string, data: OverviewPulse) {
  try { localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify({ scope, at: Date.now(), data })); } catch { /* Continue without the optional dashboard cache. */ }
}

export function pulseMarginNote(data: OverviewPulse): string {
  if (data.grossMarginStatus === "no_sales") return "No sales yesterday";
  if (data.yesterdayGrossMargin == null) return "Cost or tax coverage unavailable";
  if (data.grossMarginStatus === "complete") return `Orithos ledger cost · ${Math.round((data.grossMarginCoverage ?? 0) * 100)}% coverage`;
  return "Orithos ledger margin";
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
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

  const load = useCallback(async (refresh = false, revalidate = false) => {
    if (!user) return;
    const current = ++revision.current;
    const scope = pulseScope(user.vendorId, user.outletId);
    const cached = refresh || revalidate ? null : readPulse(scope);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (Date.now() - cached.at < PULSE_FRESH_MS) return;
    } else {
      setLoading(true);
    }
    setError(null);
    setConnection(false);
    setAuthExpired(false);
    try {
      const today = storeDay();
      const yesterday = shiftDay(today, -1);
      const params = new URLSearchParams({ from: yesterday, to: today });
      const response = await fetch(`/api/reports/native-overview?${params}`, { credentials: "same-origin", cache: "no-store" });
      const envelope = await response.json().catch(() => null) as { data?: NativeOverview; message?: string } | null;
      if (current !== revision.current) return;
      if (response.status === 401) setAuthExpired(true);
      if (!response.ok || !envelope?.data || envelope.data.source !== "orithos_ledger") {
        throw new Error(envelope?.message || "Could not load the Orithos dashboard.");
      }
      const result = envelope.data;
      const todayRow = result.dailyTrend.find(row => row.date === today);
      const yesterdayRow = result.dailyTrend.find(row => row.date === yesterday);
      const marginAvailable = Boolean(yesterdayRow?.costAvailable && yesterdayRow.taxAvailable && yesterdayRow.grossProfit !== null);
      const next: OverviewPulse = {
        generatedAt: new Date().toISOString(),
        queryThrough: new Date().toISOString(),
        sourceReportsFetchedAt: null,
        company: "Orithos",
        currency: "AUD",
        timezone: "Australia/Adelaide",
        revenue: Number(todayRow?.revenue ?? 0),
        transactions: Number(todayRow?.transaction_count ?? 0),
        yesterdaySales: Number(yesterdayRow?.revenue ?? 0),
        yesterdaySalesAvailable: Boolean(yesterdayRow),
        yesterdayNetSales: yesterdayRow?.taxAvailable && yesterdayRow.tax !== null ? Number(yesterdayRow.revenue) - Number(yesterdayRow.tax) : null,
        yesterdayTax: yesterdayRow?.taxAvailable && yesterdayRow.tax !== null ? Number(yesterdayRow.tax) : null,
        yesterdayGrossMargin: marginAvailable ? Number(yesterdayRow?.grossProfit) : null,
        grossMarginCoverage: marginAvailable ? 1 : 0,
        grossMarginStatus: !yesterdayRow ? "no_sales" : marginAvailable ? "complete" : "unavailable",
        grossMarginBasis: "orithos_sale_and_sale_item_ledger",
        yesterdayFrom: yesterday,
        yesterdayTo: yesterday,
        inventoryUnits: result.inventoryAvailable ? Number(result.inventoryUnits ?? 0) : null,
        inventoryAvailable: result.inventoryAvailable === true,
        inventoryStatus: result.inventoryAvailable ? (result.inventoryStatus || "complete") : "unavailable",
        inventoryCoverage: result.inventoryAvailable ? 1 : null,
        inventoryIncompleteRows: null,
        negativeStockProducts: result.inventoryAvailable ? Number(result.negativeStockProducts ?? 0) : null,
        sourceSalesAvailable: true,
        sourceInventoryAvailable: result.inventoryAvailable === true,
        shopfrontReportsMode: "orithos",
      };
      setData(next);
      writePulse(scope, next);
      lastFetchAt.current = Date.now();
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : "Could not load the Orithos dashboard.");
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready || !user) return;
    void load();
    return () => { revision.current++; };
  }, [load, ready, user?.id, user?.vendorId, user?.outletId]);

  useEffect(() => {
    if (!ready || !user) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false, true);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, ready, user]);

  useEffect(() => {
    const onSync = () => { void load(true); };
    window.addEventListener("orithos-shopfront-sync", onSync);
    return () => window.removeEventListener("orithos-shopfront-sync", onSync);
  }, [load]);

  useEffect(() => {
    const sync = () => {
      try {
        const value = JSON.parse(localStorage.getItem("orithos-odoo-parked-sales-v1") || "[]");
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
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: data.timezone, hour: "numeric", hour12: false }).format(new Date()));
    greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }
  const navigation = getSidebarNavigation({ isAdmin: Boolean(user?.isAdmin), hasPermission });
  return {
    data, loading, error, connection, authExpired, parked, load, greeting, user, navigation,
    destinations: buildLaunchDestinations(navigation).filter(item => item.id !== "overview" && item.id !== "dashboard"),
  };
}
