"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ReportLineChart, type LineChartPoint } from "@/components/reports/ReportLineChart";
import { reportMoney } from "@/components/reports/report-format";
import type { OverviewPulseWeekPoint } from "./useOverview";

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
          <TrendCardHead title="Sales trend" href="/reports/dashboard?period=last_7_days" />
          <ReportLineChart
            points={salesPoints}
            formatValue={(value) => reportMoney(value)}
            ariaLabel="Last 7 days sales line chart"
          />
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
          <ReportLineChart
            points={marginPoints}
            formatValue={(value) => `${value.toFixed(1)}%`}
            stroke="var(--brand-module-teal)"
            ariaLabel="Last 7 days gross margin line chart"
            height={72}
          />
        </article>
      ) : null}
    </section>
  );
}

function TrendCardHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="ov-trend-card-head">
      <div>
        <h3>{title}</h3>
        <p>Orithos ledger · last 7 days</p>
      </div>
      <Link href={href} className="ov-trend-link">
        Reports <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}