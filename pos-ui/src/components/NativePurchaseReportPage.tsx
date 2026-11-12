"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { reportMoney, reportNumber } from "@/components/reports/report-format";
import { fetchOrithosApi } from "@/lib/orithos-api-fetch";
import {
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";

type PurchaseRow = {
  id?: number | null;
  name: string;
  orderCount: number;
  totalCost: number;
  fees: number | null;
  freight: number | null;
  paymentFees: number | null;
  taxAmount: number | null;
  feesAvailable: boolean;
  freightAvailable: boolean;
  paymentFeesAvailable: boolean;
  taxAvailable: boolean;
};

type PurchaseReport = {
  source: "orithos_ledger";
  from: string;
  to: string;
  groupBy: "outlet" | "supplier" | "none";
  rows: PurchaseRow[];
  totals: {
    orderCount: number;
    totalCost: number;
    fees: number | null;
    freight: number | null;
    paymentFees: number | null;
    taxAmount: number | null;
  };
  feesAvailable: boolean;
  freightAvailable: boolean;
  paymentFeesAvailable: boolean;
  taxAvailable: boolean;
  diagnostics?: {
    available?: boolean;
    mirrorPurchaseOrders?: number;
    mappedPurchaseOrders?: number;
    nativePurchaseOrders?: number;
    nativeReportOrders?: number;
    message?: string;
  };
  parityNotes?: string[];
};

type GroupBy = PurchaseReport["groupBy"];

function moneyOrDash(value: number | null | undefined, available: boolean) {
  if (!available || value == null || !Number.isFinite(Number(value))) return "—";
  return reportMoney(Number(value));
}

export function NativePurchaseReportPage() {
  const defaults = useMemo(() => reportDatePreset("last_7_days"), []);
  const [period, setPeriod] = useState<ReportDatePreset>("last_7_days");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [groupBy, setGroupBy] = useState<GroupBy>("outlet");
  const [rangeReady, setRangeReady] = useState(false);
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const selection = readReportRangeFromSearch(window.location.search);
    setPeriod(selection.period);
    setFrom(selection.from);
    setTo(selection.to);
    const params = new URLSearchParams(window.location.search);
    const requestedGroup = params.get("groupBy");
    if (requestedGroup === "supplier" || requestedGroup === "none" || requestedGroup === "outlet") {
      setGroupBy(requestedGroup);
    }
    syncReportRangeToUrl(selection.period, selection.from, selection.to);
    setRangeReady(true);
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setReport(null);
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to, groupBy });
    const url = new URL(window.location.href);
    url.searchParams.set("groupBy", groupBy);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
    fetchOrithosApi(`/reports/purchase?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: PurchaseReport; message?: string } | null;
        if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
          throw new Error(body?.message || "Orithos purchase data is unavailable.");
        }
        setReport(body.data);
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : "Orithos purchase data is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, groupBy, revision, rangeReady]);

  const diagnostics = report?.diagnostics;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 space-y-4 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Adelaide</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Purchase report</h1>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              Received purchase spend by order date · {from === to ? from : `${from} → ${to}`}
            </p>
          </div>
          <ReportPeriodToolbar
            period={period}
            from={from}
            to={to}
            loading={loading}
            onChange={(next) => {
              setPeriod(next.period);
              setFrom(next.from);
              setTo(next.to);
            }}
            onRefresh={() => setRevision((value) => value + 1)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--oh-text-secondary)]">
          Group by
          <select
            aria-label="Group purchase report"
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            className="h-10 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm"
          >
            <option value="outlet">Outlet</option>
            <option value="supplier">Supplier</option>
            <option value="none">None</option>
          </select>
        </label>
      </header>

      {error ? (
        <div role="alert" className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:px-6 md:pb-8">
        <section className="overflow-x-auto rounded-xl border border-[var(--oh-border)] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total cost</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3 text-right">Freight</th>
                <th className="px-4 py-3 text-right">Payment fees</th>
                <th className="px-4 py-3 text-right">Tax amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {loading && !report ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--oh-muted)]">Loading purchase report…</td>
                </tr>
              ) : null}
              {!loading && report && report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--oh-muted)]">
                    No received purchase orders in this date range.
                  </td>
                </tr>
              ) : null}
              {report?.rows.map((row) => (
                <tr key={`${row.id ?? "row"}-${row.name}`} className="hover:bg-[var(--oh-surface)]">
                  <td className="px-4 py-3 font-medium text-[var(--oh-text)]">{row.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reportNumber(row.orderCount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reportMoney(row.totalCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(row.fees, row.feesAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(row.freight, row.freightAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(row.paymentFees, row.paymentFeesAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(row.taxAmount, row.taxAvailable)}</td>
                </tr>
              ))}
            </tbody>
            {report ? (
              <tfoot>
                <tr className="bg-[var(--oh-primary)]/10 font-semibold text-[var(--oh-text)]">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reportNumber(report.totals.orderCount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{reportMoney(report.totals.totalCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(report.totals.fees, report.feesAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(report.totals.freight, report.freightAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(report.totals.paymentFees, report.paymentFeesAvailable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{moneyOrDash(report.totals.taxAmount, report.taxAvailable)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>

        <div className="mt-4 space-y-2 text-xs text-[var(--oh-muted)]">
          <p>
            Native ledger purchase report. Includes received and partially received orders (type ORDER) by order date.
            Fees, freight, payment fees, and tax show as unavailable until those fields are stored on imported lines.
            This page is not the same as Purchases order workflow, and does not proxy Shopfront /reports/purchase.
          </p>
          {diagnostics?.available ? (
            <p>
              Sync diagnostics: mirror {reportNumber(diagnostics.mirrorPurchaseOrders ?? 0)} · mapped{" "}
              {reportNumber(diagnostics.mappedPurchaseOrders ?? 0)} · native{" "}
              {reportNumber(diagnostics.nativePurchaseOrders ?? 0)} · in range{" "}
              {reportNumber(diagnostics.nativeReportOrders ?? 0)}. Unmapped mirror orders are excluded from totals.
            </p>
          ) : diagnostics?.message ? (
            <p>{diagnostics.message}</p>
          ) : null}
          {report?.parityNotes?.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </main>
  );
}
