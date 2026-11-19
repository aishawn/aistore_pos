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
  comparisonPoints = [],
  loading = false,
  periodLabel,
  salesHref = "/reports/sales?period=last_7_days",
}: {
  points: NativeOverviewDaily[];
  comparisonPoints?: NativeOverviewDaily[];
  loading?: boolean;
  periodLabel?: string;
  salesHref?: string;
}) {
  const linePoints = useMemo(
    () => points.map((row) => ({ date: row.date, value: Number(row.revenue) || 0 })),
    [points],
  );
  const previousLinePoints = useMemo(
    () => comparisonPoints.map((row) => ({ date: row.date, value: Number(row.revenue) || 0 })),
    [comparisonPoints],
  );
  const hasComparison = linePoints.length >= 2 && previousLinePoints.length === linePoints.length;
  const [active, setActive] = useState<LineChartPoint | null>(null);
  const activePoint = active && linePoints.some((point) => point.date === active.date) ? active : null;
  const focus = activePoint ?? (linePoints.length ? linePoints[linePoints.length - 1] : null);
  const activeIndex = focus ? linePoints.findIndex((point) => point.date === focus.date) : -1;
  const previousFocus = hasComparison && activeIndex >= 0 ? previousLinePoints[activeIndex] : null;

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
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Sales trend</h2>
          {focus ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--oh-muted)]">
              {periodLabel ? <span>{periodLabel}</span> : null}
              {periodLabel ? <span aria-hidden="true">·</span> : null}
              <span className="font-medium text-[var(--oh-text)]">{formatDayCaption(focus.date)}</span>
              <span className="tabular-nums">{reportMoney(focus.value)}</span>
              {previousFocus ? <span>Previous {reportMoney(previousFocus.value)}</span> : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--oh-muted)]">No sales in this period</p>
          )}
        </div>
        <Link href={salesHref} className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
          Open sales report
        </Link>
      </div>
      {hasComparison ? (
        <div role="group" aria-label="Chart legend" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--oh-muted)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--oh-primary)]" aria-hidden="true" />Selected period</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-[#98A2B3]" aria-hidden="true" />Previous period</span>
        </div>
      ) : null}
      {linePoints.length >= 2 ? (
        <div className="report-mini-trend-chart mt-3">
          <ReportLineChart
            points={linePoints}
            comparisonPoints={hasComparison ? previousLinePoints : undefined}
            formatValue={(value) => reportMoney(value)}
            formatAxisValue={compactMoney}
            stroke="var(--oh-primary)"
            ariaLabel={`${periodLabel ?? "Selected period"} sales trend${hasComparison ? " compared with the previous period" : ""}`}
            height={156}
            onActiveChange={setActive}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--oh-muted)]">Not enough daily data to draw a trend.</p>
      )}
    </section>
  );
}
