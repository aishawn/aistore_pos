"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  fetchOdooRoute,
  getOdooSessionStatus,
  OdooApiError,
} from "@/lib/odoo-api";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";

export type OverviewPulse = {
  company: string;
  currency: string;
  timezone: string;
  revenue: number;
  transactions?: number;
  openRegisters?: number;
  opportunities?: number;
  lowStockCount?: number;
  newCustomers?: number;
};
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
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<OverviewPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [parked, setParked] = useState(0);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError(null);
    setAuthExpired(false);
    let checkingSession = true;
    try {
      const session = await getOdooSessionStatus();
      checkingSession = false;
      if (!session.user) {
        if (current !== revision.current) return;
        setConnection(true);
        setError("Connect your store to load dashboard data.");
        return;
      }
      const response = await fetchOdooRoute(
        "/api/odoo/reporting-dashboard?hours=168",
        { cache: "no-store", credentials: "same-origin" },
      );
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
      setData({
        company: payload.company || "Store",
        currency: payload.currency || "AUD",
        timezone: payload.timezone || "Australia/Adelaide",
        revenue: payload.revenue,
        transactions: Number.isFinite(payload.transactions)
          ? payload.transactions
          : undefined,
        openRegisters: Number.isFinite(payload.openRegisters)
          ? payload.openRegisters
          : undefined,
        opportunities: Number.isFinite(payload.opportunities) ? payload.opportunities : undefined,
        lowStockCount: Number.isFinite(payload.lowStockCount) ? payload.lowStockCount : undefined,
        newCustomers: Number.isFinite(payload.newCustomers) ? payload.newCustomers : undefined,
      });
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
  }, []);
  useEffect(() => {
    void load();
    const counter = revision;
    return () => {
      counter.current++;
    };
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
