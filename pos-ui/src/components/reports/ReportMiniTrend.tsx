"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ReportLineChart } from "@/components/reports/ReportLineChart";
import { reportMoney } from "@/components/reports/report-format";
import type { NativeOverviewDaily } from "@/lib/native-overview";

export function ReportMiniTrend({
  points,
  loading = false,
  salesHref = "/reports/sales?period=last_7_days",
}: {
  points: NativeOverviewDaily[];
  loading?: boolean;
  salesHref?: string;
}) {
  const linePoints = useMemo(
    () => points.map((row) => ({ date: row.date, value: Number(row.revenue) || 0 })),
    [points],
  );
  const latest = linePoints.length ? linePoints[linePoints.length - 1] : null;

  if (loading) {
    return (
      <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 md:mx-6">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="mt-3 h-20 animate-pulse rounded bg-[var(--oh-border)]" />
      </section>
    );
  }

  return (
    <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 md:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Last 7 days</h2>
          {latest ? (
            <p className="text-xs tabular-nums text-[var(--oh-muted)]">
              {latest.date}: {reportMoney(latest.value)}
            </p>
          ) : (
            <p className="text-xs text-[var(--oh-muted)]">No sales in the last 7 days</p>
          )}
        </div>
        <Link href={salesHref} className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
          Open sales report
        </Link>
      </div>
      {linePoints.length >= 2 ? (
        <ReportLineChart
          points={linePoints}
          formatValue={(value) => reportMoney(value)}
          ariaLabel="Last 7 days sales trend line chart"
        />
      ) : (
        <p className="mt-3 text-sm text-[var(--oh-muted)]">No Orithos sales in the last 7 days.</p>
      )}
    </section>
  );
}