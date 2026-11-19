"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ReportLineChart, type LineChartPoint } from "@/components/reports/ReportLineChart";
import { reportMoney } from "@/components/reports/report-format";
import type { NativeOverviewDaily } from "@/lib/native-overview";

function compactMoney(value: number) {
  if (value >= 10_000) return `$${Math.round(value / 1000)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function formatDayCaption(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

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
  const [active, setActive] = useState<LineChartPoint | null>(null);
  const focus = active ?? (linePoints.length ? linePoints[linePoints.length - 1] : null);

  if (loading) {
    return (
      <section className="report-mini-trend mx-4 mt-4 md:mx-6" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="report-mini-trend-chart report-mini-trend-skeleton mt-3" />
      </section>
    );
  }

  return (
    <section className="report-mini-trend mx-4 mt-4 md:mx-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--oh-text)]">Last 7 days</h2>
          {focus ? (
            <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
              <span className="font-medium text-[var(--oh-text)]">{formatDayCaption(focus.date)}</span>
              <span className="mx-1.5 text-[var(--oh-border)]">·</span>
              <span className="tabular-nums">{reportMoney(focus.value)}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--oh-muted)]">No sales in the last 7 days</p>
          )}
        </div>
        <Link href={salesHref} className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
          Open sales report
        </Link>
      </div>
      {linePoints.length >= 2 ? (
        <div className="report-mini-trend-chart mt-3">
          <ReportLineChart
            points={linePoints}
            formatValue={(value) => reportMoney(value)}
            formatAxisValue={compactMoney}
            stroke="#4d7cfe"
            ariaLabel="Last 7 days sales trend"
            height={148}
            onActiveChange={setActive}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--oh-muted)]">No Orithos sales in the last 7 days.</p>
      )}
    </section>
  );
}