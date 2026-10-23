"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Wine,
  ScanLine,
  BarChart3,
  Percent,
  Sparkles,
} from "lucide-react";
import type { LaunchChild, LaunchDestination } from "@/lib/overview-launch";
import type { SidebarIcon } from "@/lib/sidebar-navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<SidebarIcon, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  sales: ShoppingCart,
  sommelier: Wine,
  invoice: ScanLine,
  inventory: Package,
  customers: Users,
  reporting: BarChart3,
  settings: Settings,
  marketing: Percent,
};

const RING_RADIUS = 168;
const CHILD_RADIUS = 248;
const MAX_CHILD_ARC = 5;
const PIE_SIZE = 520;

function polar(radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function normalizeAngle(deg: number) {
  const value = deg % 360;
  return value < 0 ? value + 360 : value;
}

function angleFromCenter(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
  return normalizeAngle(deg);
}

function nearestDestinationId(
  angle: number,
  items: Array<LaunchDestination & { angle: number }>,
) {
  if (!items.length) return null;
  let best = items[0];
  let bestDelta = 180;
  for (const item of items) {
    const delta = Math.min(
      Math.abs(normalizeAngle(angle) - item.angle),
      360 - Math.abs(normalizeAngle(angle) - item.angle),
    );
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }
  return best.id;
}

function destinationIcon(destination: LaunchDestination) {
  if (destination.id.includes("ai") || destination.id.includes("orithos")) return Sparkles;
  return ICONS[destination.icon] ?? LayoutDashboard;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function useIsCompactViewport() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return compact;
}

export function RadialPie({
  destinations,
  centerTitle,
  centerCaption,
  centerHref = "/reports/dashboard",
  onNavigate,
  entered = true,
  variant = "page",
  className,
}: {
  destinations: LaunchDestination[];
  centerTitle: string;
  centerCaption: string;
  centerHref?: string;
  onNavigate?: () => void;
  entered?: boolean;
  variant?: "page" | "modal";
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const compact = useIsCompactViewport();
  const listMode = reducedMotion || compact;

  const items = useMemo(() => {
    const count = Math.max(destinations.length, 1);
    return destinations.map((destination, index) => {
      const angle = (360 / count) * index;
      const point = polar(RING_RADIUS, angle);
      return { ...destination, angle, x: point.x, y: point.y };
    });
  }, [destinations]);

  const active = items.find((item) => item.id === activeId) ?? null;

  const childItems = useMemo(() => {
    if (!active?.children?.length) {
      return [] as Array<LaunchChild & { x: number; y: number }>;
    }
    const shown = active.children.slice(0, MAX_CHILD_ARC);
    const overflow = active.children.length - shown.length;
    const arc = [...shown];
    if (overflow > 0) {
      arc.push({
        label: `+${overflow} more`,
        href: shown[0]?.href ?? active.href,
        hint: "Open this group",
      });
    }
    const spread = Math.min(110, 28 * Math.max(arc.length - 1, 1));
    const start = active.angle - spread / 2;
    const step = arc.length > 1 ? spread / (arc.length - 1) : 0;
    return arc.map((child, index) => {
      const point = polar(CHILD_RADIUS, start + step * index);
      return { ...child, x: point.x, y: point.y };
    });
  }, [active]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (listMode || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < 56) {
        setActiveId(null);
        return;
      }
      const angle = angleFromCenter(event.clientX, event.clientY, rect);
      setActiveId(nearestDestinationId(angle, items));
    },
    [items, listMode],
  );

  if (listMode) {
    return (
      <div className={cn("mx-auto w-full max-w-lg space-y-3", className)}>
        <Link
          href={centerHref}
          onClick={onNavigate}
          className="block rounded-[22px] bg-white/90 px-4 py-3 no-underline shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5"
        >
          <p className="oh-type-meta text-[var(--oh-muted)]">{centerTitle}</p>
          <p className="oh-type-title mt-0.5 font-semibold text-[var(--oh-text)]">{centerCaption}</p>
        </Link>
        <ul className="grid grid-cols-2 gap-2">
          {destinations.map((destination) => {
            const Icon = destinationIcon(destination);
            return (
              <li key={destination.id}>
                <Link
                  href={destination.children?.[0]?.href ?? destination.href}
                  onClick={onNavigate}
                  className="flex min-h-[104px] flex-col justify-between rounded-[20px] bg-white/90 p-3.5 no-underline shadow-[0_8px_24px_rgba(15,23,42,0.06)] ring-1 ring-black/5"
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full"
                    style={{ background: destination.tone.iconBg, color: destination.tone.iconFg }}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="mt-3">
                    <span className="oh-type-label block font-semibold text-[var(--oh-text)]">{destination.label}</span>
                    <span className="oh-type-meta mt-0.5 block line-clamp-2 text-[var(--oh-muted)]">{destination.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setActiveId(null)}
      className={cn(
        "relative mx-auto touch-none select-none",
        variant === "page" ? "h-[min(72vh,32.5rem)] w-[min(100%,32.5rem)]" : "h-[30rem] w-[30rem]",
        className,
      )}
      style={{ maxWidth: PIE_SIZE, maxHeight: PIE_SIZE }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}
      >
        {items.map((item) => {
          const end = polar(PIE_SIZE * 0.48, item.angle);
          const isActive = activeId === item.id;
          return (
            <line
              key={`ray-${item.id}`}
              x1={PIE_SIZE / 2}
              y1={PIE_SIZE / 2}
              x2={PIE_SIZE / 2 + end.x}
              y2={PIE_SIZE / 2 + end.y}
              stroke={isActive ? item.tone.accent : "rgba(100,116,139,0.28)"}
              strokeWidth={isActive ? 2.5 : 1.25}
              strokeLinecap="round"
              className="transition-[stroke,stroke-width] duration-200"
            />
          );
        })}
      </svg>

      <div
        className={cn(
          "absolute inset-0 transition-[transform,opacity] duration-300 ease-out",
          entered ? "scale-100 opacity-100" : "scale-[0.86] opacity-0",
          "motion-reduce:transition-none motion-reduce:scale-100",
        )}
      >
        <Link
          href={centerHref}
          onClick={onNavigate}
          className="absolute left-1/2 top-1/2 z-20 flex h-[7.75rem] w-[7.75rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white/85 px-3 text-center no-underline shadow-[0_16px_40px_rgba(15,23,42,0.14)] ring-1 ring-white/70 backdrop-blur-xl backdrop-saturate-150"
        >
          <p className="oh-type-meta truncate font-medium text-[var(--oh-muted)]">{centerTitle}</p>
          <p className="oh-type-label mt-0.5 line-clamp-2 font-semibold text-[var(--oh-text)]">{centerCaption}</p>
        </Link>

        {items.map((item, index) => {
          const Icon = destinationIcon(item);
          const isActive = activeId === item.id;
          return (
            <div
              key={item.id}
              className="absolute left-1/2 top-1/2 z-10"
              style={{
                transform: `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px))`,
                transitionDelay: entered ? `${index * 28}ms` : "0ms",
              }}
              onMouseEnter={() => setActiveId(item.id)}
              onFocus={() => setActiveId(item.id)}
            >
              <Link
                href={item.children?.[0]?.href ?? item.href}
                onClick={onNavigate}
                aria-expanded={item.children?.length ? isActive : undefined}
                className={cn(
                  "group flex w-[6.75rem] flex-col items-center gap-1.5 no-underline outline-none transition-transform duration-200",
                  isActive ? "scale-110" : "scale-100 hover:scale-105",
                  "focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2",
                )}
              >
                <span
                  className={cn(
                    "grid h-[3.75rem] w-[3.75rem] place-items-center rounded-full shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-md backdrop-saturate-150 transition-[box-shadow,ring-width] duration-200",
                    isActive ? "ring-[5px] ring-slate-800/85" : "ring-[3px] ring-slate-700/55",
                  )}
                  style={{ background: item.tone.iconBg, color: item.tone.iconFg }}
                >
                  <Icon size={24} strokeWidth={1.75} />
                </span>
                <span
                  className={cn(
                    "oh-type-meta text-center font-semibold transition-colors",
                    variant === "modal" ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : "text-[var(--oh-text)]",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </div>
          );
        })}

        {childItems.map((child) => (
          <div
            key={`${active?.id}-${child.href}-${child.label}`}
            className="absolute left-1/2 top-1/2 z-30"
            style={{
              transform: `translate(calc(-50% + ${child.x}px), calc(-50% + ${child.y}px))`,
            }}
          >
            <Link
              href={child.href}
              onClick={onNavigate}
              title={child.hint}
              className="oh-type-meta inline-flex min-h-10 max-w-[9.5rem] items-center justify-center rounded-full bg-white/95 px-3 text-center font-semibold text-[var(--oh-text)] no-underline shadow-lg ring-1 ring-black/5 backdrop-blur-md hover:bg-white"
            >
              <span className="line-clamp-2">{child.label}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadialPieEmpty({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[16rem] place-items-center">{children}</div>;
}
