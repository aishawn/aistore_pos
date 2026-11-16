"use client";

import { useMemo } from "react";
import { reportMoney, reportNumber } from "@/components/reports/report-format";
import type { NativeOverviewDaily } from "@/lib/native-overview";
import { periodTotals } from "@/lib/report-insights";
import { compareIsoDateDesc } from "@/lib/natural-sort";
import { formatShopfrontProfitPercent, shopfrontAlignedMarginRatio } from "@/lib/shopfront-aligned-margin";

function dayProfitPercent(row: NativeOverviewDaily): string {
  if (row.profitMargin != null && Number.isFinite(Number(row.profitMargin))) {
    return `${Number(row.profitMargin).toFixed(2)}%`;
  }
  const ratio = shopfrontAlignedMarginRatio(row.grossProfit, Number(row.revenue));
  return ratio == null ? "—" : formatShopfrontProfitPercent(ratio);
}

const COLUMNS = [
  "Business date",
  "Revenue",
  "Cost",
  "Profit",
  "Profit %",
  "Tax",
  "Discount",
  "Refunds",
  "Tx",
] as const;

export function ReportDayLedgerTable({
  rows,
  loading = false,
  emptyMessage = "No Orithos sales in this range.",
}: {
  rows: NativeOverviewDaily[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => compareIsoDateDesc(a.date, b.date)), [rows]);
  const totals = useMemo(() => periodTotals(rows), [rows]);
  const margin =
    totals.costAvailable && totals.profit != null && totals.revenue > 0
      ? ((totals.profit / totals.revenue) * 100).toFixed(2)
      : "—";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-[var(--oh-surface-muted)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
          <tr>
            {COLUMNS.map((label) => (
              <th key={label} className="px-3 py-2.5 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={row.date}
              className={index % 2 === 0 ? "bg-[var(--oh-surface-elevated)]" : "bg-[var(--oh-surface)]"}
            >
              <td className="px-3 py-2.5 tabular-nums">{row.date}</td>
              <td className="px-3 py-2.5 tabular-nums">{reportMoney(Number(row.revenue))}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.costAvailable && row.cost != null ? reportMoney(Number(row.cost)) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.grossProfit != null ? reportMoney(Number(row.grossProfit)) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{dayProfitPercent(row)}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.taxAvailable && row.tax != null ? reportMoney(Number(row.tax)) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.discount != null ? reportMoney(Number(row.discount)) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.refundAmount != null ? reportMoney(Number(row.refundAmount)) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{reportNumber(Number(row.transaction_count) || 0)}</td>
            </tr>
          ))}
          {!loading && sorted.length > 0 ? (
            <tr className="border-t-2 border-[var(--oh-border)] bg-[var(--oh-surface-muted)] font-semibold">
              <td className="px-3 py-2.5">Period total</td>
              <td className="px-3 py-2.5 tabular-nums">{reportMoney(totals.revenue)}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {totals.costAvailable && totals.cost != null ? reportMoney(totals.cost) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {totals.profit != null ? reportMoney(totals.profit) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{margin === "—" ? "—" : `${margin}%`}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {totals.taxAvailable && totals.tax != null ? reportMoney(totals.tax) : "—"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{reportMoney(totals.discount)}</td>
              <td className="px-3 py-2.5 tabular-nums">{reportMoney(totals.refunds)}</td>
              <td className="px-3 py-2.5 tabular-nums">{reportNumber(totals.transactions)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {!loading && sorted.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--oh-muted)]">{emptyMessage}</p>
      ) : null}
    </div>
  );
}