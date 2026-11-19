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
  loading,
}: {
  sales: OverviewPulseWeekPoint[];
  loading: boolean;
}) {
  const salesPoints: LineChartPoint[] = sales.map((row) => ({ date: row.date, value: row.revenue }));

  const [salesFocus, setSalesFocus] = useState<LineChartPoint | null>(null);
  const salesCaption = salesFocus ?? (salesPoints.length ? salesPoints[salesPoints.length - 1] : null);

  if (loading && !sales.length) {
    return (
      <section className="ov-trend-panel" aria-busy="true" aria-label="Loading sales trend">
        <div className="ov-trend-skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (salesPoints.length < 2) return null;

  return (
    <section className="ov-trend-panel" aria-label="Sales trend">
      <article className="ov-trend-card">
        <div className="ov-trend-card-head">
          <div>
            <h3>Sales trend</h3>
            <p>
              Orithos ledger · last 7 days
              {salesCaption ? <span className="ov-trend-caption"> · {reportMoney(salesCaption.value)}</span> : null}
            </p>
          </div>
          <Link href="/reports/dashboard?period=last_7_days" className="ov-trend-link">
            Reports <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="ov-trend-chart">
          <ReportLineChart
            points={salesPoints}
            formatValue={(value) => reportMoney(value)}
            formatAxisValue={compactMoney}
            stroke="#4d7cfe"
            ariaLabel="Last 7 days sales line chart"
            height={148}
            onActiveChange={setSalesFocus}
          />
        </div>
      </article>
    </section>
  );
}