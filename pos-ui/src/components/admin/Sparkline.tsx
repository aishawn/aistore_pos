/** Tiny inline area sparkline using Orithos chart tokens (brand module blue). */
export function Sparkline({
  points = [],
  width = 160,
  height = 60,
}: {
  points?: number[];
  width?: number;
  height?: number;
}) {
  const w = width;
  const h = height;
  if (points.length < 2) return <span className="block h-1 w-full bg-[var(--oh-border)]" aria-hidden="true" />;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - (p / max) * (h - 6) - 3]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible text-[var(--chart-1)]">
      <path d={area} fill="currentColor" opacity={0.14} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
