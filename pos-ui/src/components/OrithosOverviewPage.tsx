"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, RefreshCw, Store } from "lucide-react";
import { OverviewRadialHome } from "@/components/OverviewRadialHome";
import { fetchOdooRoute, getOdooSessionStatus } from "@/lib/odoo-api";

type PulseData = {
  company: string;
  currency: string;
  timezone: string;
  revenue: number;
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function greetingForTimezone(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Landing launcher — analytics live on /reports/dashboard. */
export function OrithosOverviewPage() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    setRequestId(null);
    try {
      await getOdooSessionStatus();
      if (revision !== requestRevision.current) return;
      const correlationId = crypto.randomUUID();
      setRequestId(correlationId);
      // 24h pulse for the hub caption only — full ranges live on Reports.
      const response = await fetchOdooRoute("/api/odoo/reporting-dashboard?hours=24", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-Correlation-ID": correlationId },
      });
      if (revision !== requestRevision.current) return;
      setRequestId(response.headers.get("x-correlation-id") || correlationId);
      const payload = (await response.json().catch(() => null)) as
        | (PulseData & { message?: string; trend?: unknown })
        | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        setNeedsConnection(response.status === 401);
        throw new Error(
          (payload && "message" in payload ? payload.message : undefined)
            || `Could not load overview (${response.status}).`,
        );
      }
      if (!payload || typeof payload.revenue !== "number") {
        throw new Error("Odoo returned an incomplete overview response.");
      }
      setNeedsConnection(false);
      setData({
        company: payload.company || "Store",
        currency: payload.currency || "AUD",
        timezone: payload.timezone || "Australia/Adelaide",
        revenue: payload.revenue,
      });
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load overview.");
      }
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = useMemo(
    () => greetingForTimezone(data?.timezone ?? "Australia/Adelaide"),
    [data?.timezone],
  );

  const company = data?.company ?? "Store";
  const centerCaption = data
    ? data.revenue > 0
      ? formatMoney(data.revenue, data.currency)
      : "No sales yet"
    : "Reports";
  const centerHint = data ? "Last 24 hours · Reports" : undefined;

  if (loading && !data) {
    return (
      <main
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading overview"
        className="grid h-full place-items-center bg-[var(--oh-surface)] p-6"
      >
        <div className="flex flex-col items-center gap-3 text-[var(--oh-muted)]">
          <LoaderCircle className="animate-spin" size={28} />
          <p className="oh-type-meta">Preparing launcher…</p>
        </div>
      </main>
    );
  }

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to open Overview</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
            Overview needs your connected Odoo company for the store pulse on the launcher.
          </p>
          <Link
            href="/settings/integrations"
            className="mt-5 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
          >
            Connect Odoo
          </Link>
        </section>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section role="alert" className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-red-700" size={28} />
          <h1 className="mt-4 text-lg font-semibold text-[var(--oh-text)]">Overview could not load</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
            {error}
            {requestId ? (
              <span className="mt-2 block break-all font-mono text-xs text-red-800/80">Request ID: {requestId}</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
          >
            <RefreshCw size={15} /> Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      {error ? (
        <div
          role="alert"
          className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950"
        >
          <span className="flex min-w-0 items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>
              {error} Showing the last pulse on the hub.
              {requestId ? (
                <span className="mt-1 block break-all font-mono text-[11px] text-amber-900/80">
                  Request ID: {requestId}
                </span>
              ) : null}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 font-semibold"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : null}
      <OverviewRadialHome
        greeting={greeting}
        company={company}
        centerCaption={centerCaption}
        centerHint={centerHint}
        className="min-h-0 flex-1"
      />
    </main>
  );
}
