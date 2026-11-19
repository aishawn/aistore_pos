"use client";

import { useMemo, useState } from "react";
import { shortDayLabel } from "@/components/reports/report-format";

export type LineChartPoint = { date: string; value: number };

function chartPath(values: number[], width: number, height: number, max: number) {
  if (values.length < 2) return { line: "", area: "", coords: [] as Array<[number, number]> };
  const padY = 4;
  const innerH = height - padY * 2;
  const step = width / (values.length - 1);
  const coords = values.map((value, index) => {
    const y = padY + innerH - (Math.max(0, value) / max) * innerH;
    return [index * step, y] as [number, number];
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area, coords };
}

export function ReportLineChart({
  points,
  formatValue,
  stroke = "var(--oh-primary)",
  ariaLabel,
  height = 88,
}: {
  points: LineChartPoint[];
  formatValue: (value: number) => string;
  stroke?: string;
  ariaLabel: string;
  height?: number;
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

  if (points.length < 2) return null;

  const activeIndex = hover ?? defaultIndex;
  const active = points[activeIndex];
  const values = points.map((row) => Number(row.value) || 0);
  const max = Math.max(1, ...values);
  const width = 320;
  const { line, area, coords } = chartPath(values, width, height, max);

  return (
    <div>
      {active ? (
        <p className="text-xs tabular-nums text-[var(--oh-muted)]">
          {active.date}: {formatValue(active.value)}
        </p>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="var(--oh-border)" strokeWidth={1} />
        <path d={area} fill={stroke} opacity={0.12} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        {coords.map(([x, y], index) => (
          <circle
            key={points[index].date}
            cx={x}
            cy={y}
            r={activeIndex === index ? 4 : 3}
            fill={activeIndex === index ? stroke : "var(--oh-surface-elevated)"}
            stroke={stroke}
            strokeWidth={2}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--oh-muted)]">
        <span>{shortDayLabel(points[0].date)}</span>
        <span>{shortDayLabel(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}