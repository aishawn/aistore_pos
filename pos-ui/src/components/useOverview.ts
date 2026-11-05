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

export type OverviewPulse = {
  generatedAt?: string;
  queryThrough?: string;
  cacheStatus?: string;
  updateStatus?: string;
  completeness?: "complete" | "incomplete" | "unverified";
  sourceReconciliation?: "matched" | "mismatch" | "unavailable";
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
  negativeStockProducts?: number | null;
  grossMarginStatus?: string;
  yesterdayNetSales?: number | null;
  yesterdayTax?: number | null;
  salesReconciled?: boolean;
  yesterdayFrom?: string;
  yesterdayTo?: string;
  grossMarginBasis?: string;
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
    negativeStockProducts: payload.negativeStockProducts as number | null | undefined,
    grossMarginStatus: payload.grossMarginStatus as string | undefined,
    yesterdayNetSales: payload.yesterdayNetSales as number | null | undefined,
    yesterdayTax: payload.yesterdayTax as number | null | undefined,
    salesReconciled: payload.salesReconciled as boolean | undefined,
    yesterdayFrom: payload.yesterdayFrom as string | undefined,
    yesterdayTo: payload.yesterdayTo as string | undefined,
    grossMarginBasis: payload.costBasis as string | undefined,
  };
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
  const load = useCallback(async (refresh = false, revalidate = false) => {
    const current = ++revision.current;
    const scope = pulseScope(user?.vendorId);
    const cached = refresh || revalidate ? null : readPulse(scope);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      const freshFor = cached.data.cacheStatus === "STALE" ? 15_000 : PULSE_FRESH_MS;
      if (Date.now() - cached.at < freshFor) return;
    } else {
      setLoading(true);
    }
    setError(null);
    setAuthExpired(false);
    let checkingSession = true;
    try {
      checkingSession = false;
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
      const next = mapPayload(payload as Record<string, unknown>);
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
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [user?.vendorId]);
  useEffect(() => {
    if (!data?.taskId || data.cacheStatus !== "STALE") return;
    const controller = new AbortController(); const current = revision.current;
    void fetchPreparedReport(`/api/odoo/reporting-dashboard?period=today&view=summary&task=${data.taskId}`, { signal: controller.signal })
      .then(async response => {
        const next = await response.json();
        if (!response.ok || !Number.isFinite(next.revenue)) throw new Error("Summary update failed. Please retry.");
        if (!controller.signal.aborted && current === revision.current) setData(next);
      }).catch(cause => { if (!controller.signal.aborted && current === revision.current) setError(cause instanceof Error ? cause.message : "Summary update failed."); });
    return () => controller.abort();
  }, [data?.taskId, data?.cacheStatus]);
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
