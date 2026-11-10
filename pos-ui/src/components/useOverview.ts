"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";

export type OverviewPulse = {
  generatedAt?: string;
  queryThrough?: string;
  cacheStatus?: string;
  company: string;
  currency: string;
  timezone: string;
  revenue: number;
  transactions?: number;
  openRegisters?: number;
  opportunities?: number;
  lowStockCount?: number;
  newCustomers?: number;
  yesterdaySales?: number;
  yesterdaySalesAvailable?: boolean;
  yesterdayGrossMargin?: number | null;
  grossMarginCoverage?: number;
  inventoryUnits?: number | null;
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
  sourceReportsFetchedAt?: string | null;
  shopfrontReportsMode?: "orithos_ledger";
};

const PULSE_STORAGE_KEY = "orithos-dashboard-pulse-v3";
const PULSE_FRESH_MS = 2 * 60_000;
const PULSE_KEEP_MS = 30 * 60_000;

type StoredPulse = { scope: string; at: number; data: OverviewPulse };
type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  cost: number;
  tax: number;
  grossProfit: number | null;
  costAvailable: boolean;
  transactions: number;
};

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

function dayInAdelaide(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function pulseMarginNote(data: OverviewPulse): string {
  if (data.grossMarginStatus === "no_sales") return "No sales yesterday";
  if (data.grossMarginStatus === "cost_unavailable") return "Cost coverage unavailable on Orithos ledger";
  if (data.yesterdayGrossMargin == null) return "Gross margin unavailable";
  return "Orithos ledger · Revenue − cost";
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

async function readNativeOverview(from: string, to: string, signal?: AbortSignal): Promise<NativeOverview> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/reports/native-overview?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null) as { data?: NativeOverview; message?: string } | null;
  if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
    throw new Error(body?.message || "Orithos sales data is unavailable.");
  }
  return body.data;
}

function toPulse(today: NativeOverview, yesterday: NativeOverview): OverviewPulse {
  const margin = yesterday.costAvailable && yesterday.revenue !== 0 && yesterday.grossProfit != null
    ? yesterday.grossProfit / yesterday.revenue
    : null;
  return {
    generatedAt: new Date().toISOString(),
    queryThrough: today.to,
    company: "Orithos",
    currency: "AUD",
    timezone: "Australia/Adelaide",
    revenue: today.revenue,
    transactions: today.transactions,
    yesterdaySales: yesterday.revenue,
    yesterdaySalesAvailable: true,
    yesterdayGrossMargin: margin,
    grossMarginCoverage: yesterday.costAvailable ? 1 : 0,
    inventoryUnits: null,
    inventoryAvailable: false,
    inventoryStatus: "unavailable",
    negativeStockProducts: null,
    inventoryCoverage: null,
    inventoryIncompleteRows: null,
    grossMarginStatus: yesterday.revenue === 0
      ? "no_sales"
      : yesterday.costAvailable
        ? "verified"
        : "cost_unavailable",
    yesterdayNetSales: yesterday.revenue,
    yesterdayTax: yesterday.tax,
    yesterdayFrom: yesterday.from,
    yesterdayTo: yesterday.to,
    sourceReportsFetchedAt: new Date().toISOString(),
    shopfrontReportsMode: "orithos_ledger",
  };
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

  const load = useCallback(async (refresh = false) => {
    const current = ++revision.current;
    const scope = pulseScope(user?.vendorId);
    const cached = refresh ? null : readPulse(scope);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (Date.now() - cached.at < PULSE_FRESH_MS) return;
    } else {
      setLoading(true);
    }
    setError(null);
    setAuthExpired(false);
    setConnection(false);
    try {
      const today = dayInAdelaide();
      const yesterday = shiftDay(today, -1);
      const [todayOverview, yesterdayOverview] = await Promise.all([
        readNativeOverview(today, today),
        readNativeOverview(yesterday, yesterday),
      ]);
      if (current !== revision.current) return;
      const next = toPulse(todayOverview, yesterdayOverview);
      setData(next);
      writePulse(scope, next);
      lastFetchAt.current = Date.now();
    } catch (cause) {
      if (current !== revision.current) return;
      const message = cause instanceof Error ? cause.message : "Could not load dashboard.";
      if (/session|sign in|401/i.test(message)) {
        setAuthExpired(true);
      }
      if (!cached && !pulseRef.current) {
        setError(message);
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [user?.vendorId]);

  useEffect(() => {
    if (!ready || !user) return;
    void load();
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
      void load(true);
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
      if (detail?.reason !== "identity" && detail?.active !== false && user && ready) void load(true);
    };
    window.addEventListener("orithos-read-cache-cleared", reset);
    return () => window.removeEventListener("orithos-read-cache-cleared", reset);
  }, [load, user, ready]);

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
    try {
      const hour = Number(new Intl.DateTimeFormat("en-AU", {
        timeZone: data.timezone,
        hour: "numeric",
        hour12: false,
      }).format(new Date()));
      greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
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
