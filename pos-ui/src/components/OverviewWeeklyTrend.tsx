"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ReportLineChart, type LineChartPoint } from "@/components/reports/ReportLineChart";
import { reportMoney } from "@/components/reports/report-format";
import type { OverviewPulseWeekPoint } from "./useOverview";

function compactMoney(value: number) {
  if (value >= 10_000) return `$${Math.round(value / 1000)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export function OverviewWeeklyTrend({
  sales,
  margin,
  loading,
}: {
  sales: OverviewPulseWeekPoint[];
  margin: OverviewPulseWeekPoint[];
  loading: boolean;
}) {
  const salesPoints: LineChartPoint[] = sales.map((row) => ({ date: row.date, value: row.revenue }));
  const marginPoints: LineChartPoint[] = margin
    .filter((row) => row.profitMargin != null)
    .map((row) => ({ date: row.date, value: (row.profitMargin ?? 0) * 100 }));

  const marginAvg = marginPoints.length
    ? marginPoints.reduce((sum, row) => sum + row.value, 0) / marginPoints.length
    : null;

  const [salesFocus, setSalesFocus] = useState<LineChartPoint | null>(null);
  const salesCaption = salesFocus ?? (salesPoints.length ? salesPoints[salesPoints.length - 1] : null);

  if (loading && !sales.length) {
    return (
      <section className="ov-trend-panel" aria-busy="true" aria-label="Loading weekly trends">
        <div className="ov-trend-skeleton" aria-hidden="true" />
        <div className="ov-trend-skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (!sales.length && !marginPoints.length) return null;

  return (
    <section className="ov-trend-panel" aria-label="Last 7 days trends">
      {salesPoints.length >= 2 ? (
        <article className="ov-trend-card">
          <TrendCardHead
            title="Sales trend"
            href="/reports/dashboard?period=last_7_days"
            caption={salesCaption ? reportMoney(salesCaption.value) : undefined}
          />
          <div className="ov-trend-chart">
            <ReportLineChart
              points={salesPoints}
              formatValue={(value) => reportMoney(value)}
              formatAxisValue={compactMoney}
              stroke="#4d7cfe"
              ariaLabel="Last 7 days sales line chart"
              height={124}
              onActiveChange={setSalesFocus}
            />
          </div>
        </article>
      ) : null}
      {marginPoints.length >= 2 ? (
        <article className="ov-trend-card">
          <div className="ov-trend-card-head">
            <div>
              <h3>Weekly margin</h3>
              <p>Gross margin % · last 7 days</p>
            </div>
            {marginAvg != null ? (
              <p className="ov-trend-avg">{marginAvg.toFixed(1)}% <span>avg</span></p>
            ) : null}
          </div>
          <div className="ov-trend-chart">
            <ReportLineChart
              points={marginPoints}
              formatValue={(value) => `${value.toFixed(1)}%`}
              formatAxisValue={(value) => `${Math.round(value)}%`}
              stroke="#0d9488"
              ariaLabel="Last 7 days gross margin line chart"
              height={112}
            />
          </div>
        </article>
      ) : null}
    </section>
  );
}

function TrendCardHead({
  title,
  href,
  caption,
}: {
  title: string;
  href: string;
  caption?: string;
}) {
  return (
    <div className="ov-trend-card-head">
      <div>
        <h3>{title}</h3>
        <p>
          Orithos ledger · last 7 days
          {caption ? <span className="ov-trend-caption"> · {caption}</span> : null}
        </p>
      </div>
      <Link href={href} className="ov-trend-link">
        Reports <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}