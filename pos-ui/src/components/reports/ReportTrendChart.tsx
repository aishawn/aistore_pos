"use client";

import { useId, useMemo, useState } from "react";
import { reportMoney, reportNumber, shortDayLabel } from "@/components/reports/report-format";

export type ReportTrendPoint = {
  date: string;
  revenue: number;
  transaction_count?: number;
  grossProfit?: number | null;
  costAvailable?: boolean;
};

export type ReportComparisonSnapshot = {
  label: string;
  revenue: number;
  transactions: number;
  grossProfit: number | null;
};

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function ReportTrendChart({
  points,
  loading = false,
  title = "Daily sales",
  emptyMessage = "No Orithos sales for this period.",
  comparison,
  breakdownAnchorId,
  overlayProfit = false,
}: {
  points: ReportTrendPoint[];
  loading?: boolean;
  title?: string;
  emptyMessage?: string;
  comparison?: { current: ReportComparisonSnapshot; previous: ReportComparisonSnapshot } | null;
  /** When set, shows a control that scrolls to the element with this id (e.g. daily breakdown table). */
  breakdownAnchorId?: string;
  /** Draw gross profit line when day rows include cost-backed profit. */
  overlayProfit?: boolean;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const singleDay = points.length === 1;
  const defaultHighlightIndex = useMemo(() => {
    if (!points.length) return 0;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (String(points[i].date) > String(points[best].date)) best = i;
    }
    return best;
  }, [points]);

  if (loading) {
    return (
      <section className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4">
        <h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2>
        <div className="mt-4 h-56 animate-pulse rounded-md bg-[var(--oh-border)] md:h-64" aria-busy="true" />
      </section>
    );
  }

  if (singleDay && comparison) {
    const metrics: Array<{ key: string; label: string; format: (value: number) => string; current: number | null; previous: number | null }> = [
      { key: "revenue", label: "Revenue", format: reportMoney, current: comparison.current.revenue, previous: comparison.previous.revenue },
      { key: "tx", label: "Transactions", format: reportNumber, current: comparison.current.transactions, previous: comparison.previous.transactions },
      { key: "profit", label: "Profit", format: reportMoney, current: comparison.current.grossProfit, previous: comparison.previous.grossProfit },
    ];

    return (
      <section className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Period comparison</h2>
          <p className="text-xs text-[var(--oh-muted)]">
            {comparison.current.label} vs {comparison.previous.label}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => {
            const current = metric.current;
            const previous = metric.previous;
            const delta =
              current != null && previous != null && previous !== 0
                ? ((current - previous) / Math.abs(previous)) * 100
                : null;
            const max = Math.max(1, Number(current) || 0, Number(previous) || 0);
            return (
              <div key={metric.key} className="rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
                <p className="text-xs font-medium text-[var(--oh-muted)]">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--oh-text)]">
                  {current == null ? "—" : metric.format(current)}
                </p>
                <p className="text-xs text-[var(--oh-muted)]">
                  Prev {previous == null ? "—" : metric.format(previous)}
                  {delta == null ? "" : ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                </p>
                <div className="mt-3 flex h-28 gap-2">
                  <div className="flex h-full w-1/2 flex-col justify-end gap-1">
                    <div className="flex h-20 items-end">
                      <div
                        className="w-full rounded-t bg-[var(--oh-border-strong,#cbd3df)]"
                        style={{ height: `${Math.max(8, ((Number(previous) || 0) / max) * 100)}%` }}
                        title={`Previous: ${previous == null ? "—" : metric.format(previous)}`}
                      />
                    </div>
                    <span className="text-center text-[10px] font-medium text-[var(--oh-muted)]">Prev</span>
                  </div>
                  <div className="flex h-full w-1/2 flex-col justify-end gap-1">
                    <div className="flex h-20 items-end">
                      <div
                        className="w-full rounded-t bg-[var(--oh-primary)]"
                        style={{ height: `${Math.max(8, ((Number(current) || 0) / max) * 100)}%` }}
                        title={`Current: ${current == null ? "—" : metric.format(current)}`}
                      />
                    </div>
                    <span className="text-center text-[10px] font-medium text-[var(--oh-muted)]">Current</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (!points.length) {
    return (
      <section className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4">
        <h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2>
        <p className="mt-5 text-sm text-[var(--oh-muted)]">{emptyMessage}</p>
      </section>
    );
  }

  const width = 640;
  const height = 260;
  const pad = { top: 16, right: 12, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const profitEligible =
    overlayProfit && points.some((row) => row.costAvailable && row.grossProfit != null && Number(row.grossProfit) >= 0);
  const maxRevenue = niceMax(
    Math.max(
      ...points.map((row) => Math.max(Number(row.revenue) || 0, profitEligible ? Number(row.grossProfit) || 0 : 0)),
    ),
  );
  const barGap = points.length > 20 ? 2 : 6;
  const barWidth = Math.max(4, (innerW - barGap * (points.length - 1)) / points.length);
  const ticks = [0, 0.5, 1].map((ratio) => maxRevenue * ratio);
  const highlightIndex = hover ?? defaultHighlightIndex;
  const active = points[highlightIndex];

  function scrollToBreakdown() {
    if (!breakdownAnchorId) return;
    document.getElementById(breakdownAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2>
          {breakdownAnchorId ? (
            <button
              type="button"
              onClick={scrollToBreakdown}
              className="text-xs font-semibold text-[var(--oh-primary)] hover:underline"
            >
              View daily breakdown
            </button>
          ) : null}
        </div>
        <div className="text-right text-xs tabular-nums text-[var(--oh-muted)]">
          {active ? (
            <p>
              {active.date}: {reportMoney(Number(active.revenue))}
              {active.transaction_count != null ? ` · ${reportNumber(Number(active.transaction_count))} tx` : ""}
              {profitEligible && active.grossProfit != null ? ` · Profit ${reportMoney(Number(active.grossProfit))}` : ""}
            </p>
          ) : null}
          {profitEligible ? <p className="text-[10px]">Bars: sales · Line: gross profit (tax inclusive)</p> : null}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg
          role="img"
          aria-label={`${title} bar chart`}
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full min-w-[320px] md:h-64"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--oh-primary)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--oh-primary)" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => {
            const y = pad.top + innerH - (tick / maxRevenue) * innerH;
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--oh-border)" strokeDasharray="4 4" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-[var(--oh-muted)] text-[10px]">
                  {tick >= 1000 ? `$${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(tick)}`}
                </text>
              </g>
            );
          })}
          {points.map((row, index) => {
            const revenue = Number(row.revenue) || 0;
            const barH = Math.max(2, (revenue / maxRevenue) * innerH);
            const x = pad.left + index * (barWidth + barGap);
            const y = pad.top + innerH - barH;
            const showLabel = points.length <= 14 || index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 7) === 0;
            return (
              <g
                key={row.date}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                className="cursor-default"
              >
                <title>
                  {row.date}: {reportMoney(revenue)}
                  {row.transaction_count != null ? ` · ${reportNumber(Number(row.transaction_count))} tx` : ""}
                </title>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={3}
                  fill={`url(#${gradientId})`}
                  opacity={highlightIndex === index ? 1 : 0.35}
                />
                {showLabel ? (
                  <text
                    x={x + barWidth / 2}
                    y={height - 12}
                    textAnchor="middle"
                    className="fill-[var(--oh-muted)] text-[10px]"
                  >
                    {shortDayLabel(row.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {profitEligible
            ? (() => {
                const coords = points
                  .map((row, index) => {
                    if (!row.costAvailable || row.grossProfit == null) return null;
                    const profit = Number(row.grossProfit) || 0;
                    const x = pad.left + index * (barWidth + barGap) + barWidth / 2;
                    const y = pad.top + innerH - Math.max(2, (profit / maxRevenue) * innerH);
                    return `${x},${y}`;
                  })
                  .filter(Boolean)
                  .join(" ");
                return coords ? (
                  <polyline
                    points={coords}
                    fill="none"
                    stroke="var(--oh-text)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                ) : null;
              })()
            : null}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Revenue</th>
            <th>Transactions</th>
          </tr>
        </thead>
        <tbody>
          {points.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{reportMoney(Number(row.revenue))}</td>
              <td>{row.transaction_count == null ? "—" : reportNumber(Number(row.transaction_count))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
