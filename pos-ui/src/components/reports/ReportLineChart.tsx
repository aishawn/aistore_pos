"use client";

import { useId, useMemo, useState } from "react";
import { shortDayLabel } from "@/components/reports/report-format";

export type LineChartPoint = { date: string; value: number };

function paddedMax(values: number[]) {
  const peak = Math.max(0, ...values);
  if (peak <= 0) return 1;
  const step = peak <= 10 ? 2 : peak <= 100 ? 10 : peak <= 1000 ? 100 : peak <= 10000 ? 1000 : 5000;
  return Math.ceil((peak * 1.08) / step) * step;
}

function chartGeometry(values: number[], width: number, height: number, padLeft: number, padRight: number, padTop: number, padBottom: number, max: number) {
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const coords = values.map((value, index) => {
    const x = padLeft + index * step;
    const y = padTop + innerH - (Math.max(0, value) / max) * innerH;
    return [x, y] as [number, number];
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${padLeft + innerW},${height - padBottom} L${padLeft},${height - padBottom} Z`;
  return { coords, line, area, innerW, innerH };
}

export function ReportLineChart({
  points,
  formatValue,
  formatAxisValue,
  stroke = "#3b82f6",
  ariaLabel,
  height = 132,
  onActiveChange,
}: {
  points: LineChartPoint[];
  formatValue: (value: number) => string;
  formatAxisValue?: (value: number) => string;
  stroke?: string;
  ariaLabel: string;
  height?: number;
  onActiveChange?: (point: LineChartPoint | null) => void;
}) {
  const gradientId = useId().replace(/:/g, "");
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
  const max = paddedMax(values);
  const axisFormat = formatAxisValue ?? formatValue;
  const width = 400;
  const pad = { left: 44, right: 12, top: 10, bottom: 22 };
  const { coords, line, area } = chartGeometry(values, width, height, pad.left, pad.right, pad.top, pad.bottom, max);
  const yTicks = [0, max * 0.5, max];

  const setActive = (index: number | null) => {
    setHover(index);
    if (onActiveChange) {
      onActiveChange(index == null ? null : points[index]);
    }
  };

  return (
    <div className="report-line-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="report-line-chart-svg"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = pad.top + (height - pad.top - pad.bottom) * (1 - tick / max);
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className="report-line-chart-grid"
              />
              <text x={pad.left - 6} y={y + 3.5} textAnchor="end" className="report-line-chart-axis">
                {axisFormat(tick)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map(([x, y], index) => (
          <g key={points[index].date}>
            <circle
              cx={x}
              cy={y}
              r={14}
              fill="transparent"
              className="report-line-chart-hit"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
            />
            {activeIndex === index ? (
              <>
                <circle cx={x} cy={y} r={5.5} fill={stroke} opacity={0.14} />
                <circle cx={x} cy={y} r={2.75} fill="#fff" stroke={stroke} strokeWidth={1.5} />
              </>
            ) : null}
          </g>
        ))}
        {coords.map(([x], index) => (
          <text
            key={`${points[index].date}-x`}
            x={x}
            y={height - 5}
            textAnchor="middle"
            className={
              activeIndex === index
                ? "report-line-chart-x report-line-chart-x-active"
                : "report-line-chart-x"
            }
          >
            {shortDayLabel(points[index].date)}
          </text>
        ))}
      </svg>
      {active ? (
        <p className="sr-only">
          {active.date}: {formatValue(active.value)}
        </p>
      ) : null}
    </div>
  );
}