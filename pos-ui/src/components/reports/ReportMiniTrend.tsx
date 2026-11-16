"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { reportMoney, shortDayLabel } from "@/components/reports/report-format";
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
  const [hover, setHover] = useState<number | null>(null);
  const defaultIndex = useMemo(() => {
    if (!points.length) return 0;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (String(points[i].date) > String(points[best].date)) best = i;
    }
    return best;
  }, [points]);

  if (loading) {
    return (
      <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 md:mx-6">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="mt-3 h-20 animate-pulse rounded bg-[var(--oh-border)]" />
      </section>
    );
  }

  const activeIndex = hover ?? defaultIndex;
  const active = points[activeIndex];
  const max = Math.max(1, ...points.map((row) => Number(row.revenue) || 0));

  return (
    <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 md:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Last 7 days</h2>
          {active ? (
            <p className="text-xs tabular-nums text-[var(--oh-muted)]">
              {active.date}: {reportMoney(Number(active.revenue))}
            </p>
          ) : (
            <p className="text-xs text-[var(--oh-muted)]">No sales in the last 7 days</p>
          )}
        </div>
        <Link href={salesHref} className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
          Open sales report
        </Link>
      </div>
      {points.length ? (
        <div className="mt-3 flex h-20 items-end gap-1.5" role="img" aria-label="Last 7 days sales mini chart">
          {points.map((row, index) => {
            const revenue = Number(row.revenue) || 0;
            const height = Math.max(6, (revenue / max) * 100);
            return (
              <button
                key={row.date}
                type="button"
                className="group flex min-w-0 flex-1 flex-col items-center gap-1"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                aria-label={`${row.date}: ${reportMoney(revenue)}`}
              >
                <div
                  className={
                    activeIndex === index
                      ? "w-full rounded-t bg-[var(--oh-primary)]"
                      : "w-full rounded-t bg-[var(--oh-primary)]/35 group-hover:bg-[var(--oh-primary)]/55"
                  }
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-[var(--oh-muted)]">{shortDayLabel(row.date)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--oh-muted)]">No Orithos sales in the last 7 days.</p>
      )}
    </section>
  );
}