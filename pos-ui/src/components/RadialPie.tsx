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

/** Modal / LaunchRing orbit — keep compact so 30rem stage does not clip children. */
const MODAL_RING_RADIUS = 158;
const MODAL_CHILD_RADIUS = 214;
const MODAL_PIE_SIZE = 520;
/** Full-page Overview hub — larger orbit for chromeless viewport. */
const PAGE_RING_RADIUS = 195;
const PAGE_CHILD_RADIUS = 264;
const PAGE_PIE_SIZE = 640;
const MAX_VISIBLE_CHILDREN = 3;
const CLEAR_ACTIVE_MS = 120;
const SPRING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

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

/**
 * Keep child chips inside the parent's sector so Setup never spills onto Reports.
 * Sector width = 360/n; allow at most ~42% of that as the child arc.
 */
function childArcAngles(parentAngle: number, count: number, sectorDeg: number) {
  if (count <= 0) return [] as number[];
  if (count === 1) return [parentAngle];
  const maxSpread = Math.max(18, sectorDeg * 0.42);
  const stepIdeal = 22;
  const spread = Math.min(maxSpread, stepIdeal * (count - 1));
  const start = parentAngle - spread / 2;
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
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
  centerHint,
  centerHref = "/reports/dashboard",
  onNavigate,
  entered = true,
  variant = "page",
  className,
}: {
  destinations: LaunchDestination[];
  centerTitle: string;
  centerCaption: string;
  /** Optional quieter line under the caption (e.g. "Last 24 hours"). */
  centerHint?: string;
  centerHref?: string;
  onNavigate?: () => void;
  entered?: boolean;
  variant?: "page" | "modal";
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const compact = useIsCompactViewport();
  const listMode = reducedMotion || compact;
  const isPage = variant === "page";
  const ringRadius = isPage ? PAGE_RING_RADIUS : MODAL_RING_RADIUS;
  const childRadius = isPage ? PAGE_CHILD_RADIUS : MODAL_CHILD_RADIUS;
  const pieSize = isPage ? PAGE_PIE_SIZE : MODAL_PIE_SIZE;

  const items = useMemo(() => {
    const count = Math.max(destinations.length, 1);
    return destinations.map((destination, index) => {
      const angle = (360 / count) * index;
      const point = polar(ringRadius, angle);
      return { ...destination, angle, x: point.x, y: point.y };
    });
  }, [destinations, ringRadius]);

  const sectorDeg = 360 / Math.max(items.length, 1);
  const active = items.find((item) => item.id === activeId) ?? null;

  const childItems = useMemo(() => {
    // Leaf destinations (Sell, Reports, …) must never render foreign pills.
    if (!active?.children?.length) {
      return [] as Array<LaunchChild & { x: number; y: number; angle: number }>;
    }
    const shown = active.children.slice(0, MAX_VISIBLE_CHILDREN);
    const overflow = active.children.length - shown.length;
    const arc: LaunchChild[] = [...shown];
    if (overflow > 0) {
      arc.push({
        label: `+${overflow} more`,
        href: active.children[MAX_VISIBLE_CHILDREN]?.href ?? shown[0]?.href ?? active.href,
        hint: "Open more in this group",
      });
    }
    const angles = childArcAngles(active.angle, arc.length, sectorDeg);
    return arc.map((child, index) => {
      const angle = angles[index] ?? active.angle;
      const point = polar(childRadius, angle);
      return { ...child, x: point.x, y: point.y, angle };
    });
  }, [active, childRadius, sectorDeg]);

  const setActiveSoon = useCallback((id: string | null) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (id === null) {
      clearTimer.current = setTimeout(() => setActiveId(null), CLEAR_ACTIVE_MS);
      return;
    }
    setActiveId(id);
  }, []);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (listMode || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < 64) {
        setActiveSoon(null);
        return;
      }
      const angle = angleFromCenter(event.clientX, event.clientY, rect);
      setActiveSoon(nearestDestinationId(angle, items));
    },
    [items, listMode, setActiveSoon],
  );

  if (listMode) {
    return (
      <div className={cn("mx-auto w-full max-w-lg space-y-3", className)}>
        <Link
          href={centerHref}
          onClick={onNavigate}
          className="block rounded-[22px] bg-white/90 px-4 py-3.5 no-underline shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-black/5"
        >
          <p className="oh-type-meta truncate text-[var(--oh-muted)]">{centerTitle}</p>
          <p className="mt-1 text-[1.25rem] font-semibold tracking-tight text-[var(--oh-text)]">{centerCaption}</p>
          {centerHint ? <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">{centerHint}</p> : null}
        </Link>
        <ul className="grid grid-cols-2 gap-2.5">
          {destinations.map((destination) => {
            const Icon = destinationIcon(destination);
            return (
              <li key={destination.id}>
                <Link
                  href={destination.children?.[0]?.href ?? destination.href}
                  onClick={onNavigate}
                  className="flex min-h-[108px] flex-col justify-between rounded-[22px] bg-white/90 p-3.5 no-underline shadow-[0_8px_24px_rgba(15,23,42,0.06)] ring-1 ring-black/5 transition-transform active:scale-[0.97] motion-reduce:transform-none"
                >
                  <span
                    className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/5"
                    style={{ color: destination.tone.iconFg }}
                  >
                    <Icon size={22} strokeWidth={1.6} />
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
      onPointerLeave={() => setActiveSoon(null)}
      className={cn(
        "relative mx-auto touch-none select-none",
        isPage ? "h-[min(78vh,40rem)] w-[min(100%,40rem)]" : "h-[30rem] w-[30rem]",
        className,
      )}
      style={{ maxWidth: pieSize, maxHeight: pieSize }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${pieSize} ${pieSize}`}
      >
        {items.map((item) => {
          // Rays stop at the node — no leftover stubs past the orbit.
          const end = polar(ringRadius - 36, item.angle);
          const isActive = activeId === item.id;
          return (
            <line
              key={`ray-${item.id}`}
              x1={pieSize / 2}
              y1={pieSize / 2}
              x2={pieSize / 2 + end.x}
              y2={pieSize / 2 + end.y}
              stroke={isActive ? item.tone.accent : "rgba(148,163,184,0.22)"}
              strokeWidth={isActive ? 2 : 1}
              strokeLinecap="round"
              opacity={isActive ? 0.85 : 0.55}
              className="transition-[stroke,stroke-width,opacity] duration-200"
              style={{ transitionTimingFunction: SPRING }}
            />
          );
        })}
      </svg>

      <div
        className={cn(
          "absolute inset-0",
          entered ? "opacity-100" : "opacity-0",
          "transition-opacity duration-300 motion-reduce:transition-none",
        )}
      >
        <Link
          href={centerHref}
          onClick={onNavigate}
          className={cn(
            "absolute left-1/2 top-1/2 z-20 flex h-[8.25rem] w-[8.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full px-4 text-center no-underline",
            "bg-white/75 shadow-[0_20px_50px_rgba(15,23,42,0.12)] ring-1 ring-white/80",
            "backdrop-blur-2xl backdrop-saturate-150",
            "transition-transform duration-200 active:scale-[0.96] motion-reduce:transform-none",
          )}
          style={{ transitionTimingFunction: SPRING }}
        >
          <p className="oh-type-meta max-w-full truncate px-1 font-medium text-[var(--oh-muted)]">{centerTitle}</p>
          <p className="mt-1 max-w-full truncate text-[1.15rem] font-semibold tracking-tight text-[var(--oh-text)]">
            {centerCaption}
          </p>
          {centerHint ? (
            <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">{centerHint}</p>
          ) : null}
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
              }}
              onMouseEnter={() => setActiveSoon(item.id)}
              onFocus={() => setActiveSoon(item.id)}
            >
              <Link
                href={item.children?.[0]?.href ?? item.href}
                onClick={onNavigate}
                aria-expanded={item.children?.length ? isActive : undefined}
                className={cn(
                  "group flex w-[6.5rem] flex-col items-center gap-2 no-underline outline-none",
                  "transition-transform duration-200 motion-reduce:transition-none",
                  isActive ? "scale-[1.08]" : "scale-100 hover:scale-[1.04]",
                  "active:scale-[0.96]",
                  "focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2",
                )}
                style={{
                  transitionTimingFunction: SPRING,
                  transitionDelay: reducedMotion || !entered ? "0ms" : `${index * 40}ms`,
                }}
              >
                <span className="relative grid h-14 w-14 place-items-center">
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-[-6px] rounded-full opacity-90 blur-md transition-opacity duration-200"
                      style={{ background: item.tone.iconBg }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative grid h-14 w-14 place-items-center rounded-full",
                      "bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.1)] ring-1 ring-black/[0.04]",
                      "backdrop-blur-xl backdrop-saturate-150",
                      "transition-[box-shadow,transform] duration-200",
                    )}
                    style={{ color: item.tone.iconFg, transitionTimingFunction: SPRING }}
                  >
                    <Icon size={24} strokeWidth={1.6} />
                  </span>
                </span>
                <span
                  className={cn(
                    "oh-type-meta text-center font-semibold tracking-tight",
                    variant === "modal" ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]" : "text-[var(--oh-text)]",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </div>
          );
        })}

        {childItems.map((child, index) => (
          <div
            key={`${active?.id}-${child.href}-${child.label}`}
            className="absolute left-1/2 top-1/2 z-30"
            style={{
              transform: `translate(calc(-50% + ${child.x}px), calc(-50% + ${child.y}px)) scale(${reducedMotion ? 1 : 1})`,
              opacity: 1,
              transition: reducedMotion ? undefined : `opacity 220ms ${SPRING}, transform 260ms ${SPRING}`,
              transitionDelay: reducedMotion ? undefined : `${index * 35}ms`,
            }}
          >
            <Link
              href={child.href}
              onClick={onNavigate}
              title={child.hint}
              onMouseEnter={() => active && setActiveSoon(active.id)}
              className={cn(
                "oh-type-meta inline-flex min-h-10 max-w-[9rem] items-center justify-center rounded-full px-3 text-center font-semibold text-[var(--oh-text)] no-underline",
                "bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.05]",
                "backdrop-blur-xl hover:bg-white active:scale-[0.97] motion-reduce:transform-none",
              )}
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
