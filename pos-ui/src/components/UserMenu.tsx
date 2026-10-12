"use client";

import Link from "next/link";
import {
  PaintRollerIcon,
  SettingsGearIcon,
  LogOutIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Orithos header user menu — the right slide-in panel opened by clicking the
 * "admin" avatar in the top bar (live: `#user-information`). Mirrors
 * sea.onshopfront.com: a 500px white panel (full-width on mobile) that slides
 * in from the right below the 50px header, dimming the page behind it.
 *
 * Contents: a Theme selector, activity charts (Revenue, Transaction Count),
 * and footer actions — "Profile & Security" and "Logout".
 */
export function UserMenu({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout?: () => void;
}) {
  return (
    <>
      {/* Backdrop — dims the page, click to close */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black transition-opacity duration-200 ease-in-out",
          open ? "opacity-15" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="User menu"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-0 right-0 top-[50px] z-50 flex w-screen max-w-[90%] flex-col bg-white shadow-md",
          "transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] md:w-[500px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex-1 overflow-auto">
          {/* Theme selector */}
          <div className="mt-4 space-y-2 px-8">
            <label className="flex min-h-12 w-full items-center justify-between py-1 text-xl text-neutral-900">
              <span className="flex items-center">
                <span className="mr-4 inline-block text-[var(--sf-link-blue)]">
                  <PaintRollerIcon size={20} strokeWidth={1.5} />
                </span>
                Theme
              </span>
              <select
                defaultValue="Default"
                className="max-w-[150px] rounded-lg border border-solid border-neutral-700 bg-white py-2 pl-4 pr-8 text-base text-neutral-900"
              >
                <option>Default</option>
                <option>Dark</option>
              </select>
            </label>
          </div>

          {/* Activity charts (demo data) */}
          <div className="mt-6 space-y-8 px-8 pb-8">
            <ActivityChart
              title="Revenue"
              values={[0, 0, 0, 0, 0, 4.5, 0]}
              max={4.5}
              divisions={9}
              formatY={(v) => `$${v.toFixed(2)}`}
            />
            <ActivityChart
              title="Transaction Count"
              values={[0, 0, 0, 0, 0, 1, 0]}
              max={1}
              divisions={10}
              formatY={(v) => `${Math.round(v)}`}
              labelEvery={10}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-center gap-4 border-t border-neutral-200 px-8 py-4">
          <Link
            href="/settings/account"
            onClick={onClose}
            className="inline-flex w-[202px] items-center justify-center gap-2 rounded-xl border border-solid border-[var(--sf-link-blue)] px-8 py-2 text-base font-bold text-[var(--sf-link-blue)] no-underline transition-colors hover:bg-[var(--sf-link-blue)]/5"
          >
            <SettingsGearIcon size={18} strokeWidth={1.5} />
            Profile &amp; Security
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="inline-flex w-[202px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-[var(--sf-link-blue)] bg-[var(--sf-link-blue)] px-8 py-2 text-base font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            <LogOutIcon size={18} strokeWidth={1.5} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

const X_LABELS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];
const BLUE = "var(--sf-link-blue)";

/**
 * Small SVG area chart mirroring the live user-menu activity graphs: a blue
 * line + soft area fill over a weekday axis, with a light grid and data-point
 * dots. Uses a monotone-ish smoothing so the single Wed spike reads as a curve.
 */
function ActivityChart({
  title,
  values,
  max,
  divisions,
  formatY,
  labelEvery = 1,
}: {
  title: string;
  values: number[];
  max: number;
  divisions: number;
  formatY: (v: number) => string;
  labelEvery?: number;
}) {
  const W = 500;
  const H = 256;
  const padLeft = 52;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 24;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const x = (i: number) => padLeft + (plotW * i) / (values.length - 1);
  const y = (v: number) => padTop + plotH * (1 - v / max);

  const points = values.map((v, i) => [x(i), y(v)] as const);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${x(values.length - 1)} ${padTop + plotH} L ${padLeft} ${
    padTop + plotH
  } Z`;

  const grid = Array.from({ length: divisions + 1 }, (_, i) => i);

  return (
    <div className="relative">
      <div className="text-center text-sm text-neutral-700">{title}</div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1"
        role="img"
        aria-label={`${title} chart`}
      >
        {/* Horizontal grid + Y labels */}
        {grid.map((g) => {
          const gy = padTop + (plotH * g) / divisions;
          const val = max * (1 - g / divisions);
          const showLabel = g % labelEvery === 0;
          return (
            <g key={g}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={gy}
                y2={gy}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              {showLabel && (
                <text
                  x={padLeft - 8}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize={11}
                  fill="#737373"
                >
                  {formatY(val)}
                </text>
              )}
            </g>
          );
        })}

        {/* X labels */}
        {X_LABELS.map((label, i) => (
          <text
            key={label}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={11}
            fill="#737373"
          >
            {label}
          </text>
        ))}

        {/* Area + line */}
        <path d={areaPath} fill={BLUE} fillOpacity={0.15} stroke="none" />
        <path d={linePath} fill="none" stroke={BLUE} strokeWidth={2} />

        {/* Data-point dots */}
        {points.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={3} fill={BLUE} />
        ))}
      </svg>
    </div>
  );
}

/** Catmull-Rom → cubic-bezier smoothing for a soft curve through the points. */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
