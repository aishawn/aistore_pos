"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { LaunchChild, LaunchDestination, LaunchRingDetail } from "@/lib/overview-launch";
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

const RING_RADIUS = 148;
const CHILD_RADIUS = 220;
const MAX_CHILD_ARC = 5;

function polar(radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function usePrefersReducedMotion() {
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

function useIsCompactViewport() {
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

export function OverviewRadialMenu({
  open,
  destinations,
  detail,
  onClose,
}: {
  open: boolean;
  destinations: LaunchDestination[];
  detail: LaunchRingDetail;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const compact = useIsCompactViewport();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useDialogFocus(open, onClose, open ? "launch-ring" : null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setActiveId(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

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
    if (!active?.children?.length) return [] as Array<LaunchChild & { x: number; y: number; more?: boolean }>;
    const shown = active.children.slice(0, MAX_CHILD_ARC);
    const overflow = active.children.length - shown.length;
    const arc = shown.map((child) => child);
    if (overflow > 0) {
      arc.push({
        label: `+${overflow} more`,
        href: shown[0]?.href ?? active.href,
        hint: "Open the first destination in this group",
      });
    }
    const spread = Math.min(110, 28 * Math.max(arc.length - 1, 1));
    const start = active.angle - spread / 2;
    const step = arc.length > 1 ? spread / (arc.length - 1) : 0;
    return arc.map((child, index) => {
      const point = polar(CHILD_RADIUS, start + step * index);
      return { ...child, x: point.x, y: point.y, more: child.label.startsWith("+") };
    });
  }, [active]);

  if (!open) return null;

  const company = detail.company?.trim() || "Orithos";
  const caption = detail.centerCaption?.trim() || "Choose a destination";
  const listMode = reducedMotion || compact;

  return (
    <div className="fixed inset-0 z-[80] print:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close quick menu"
        className={cn(
          "absolute inset-0 bg-slate-950/35 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0",
          "motion-reduce:transition-none",
        )}
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Store quick menu"
        className={cn(
          "absolute left-1/2 top-1/2 w-[min(100vw-1.5rem,36rem)] -translate-x-1/2 -translate-y-1/2",
          listMode ? "max-h-[min(88vh,40rem)] overflow-y-auto rounded-[28px] bg-white/92 p-4 shadow-2xl" : "h-[30rem] w-[30rem]",
        )}
      >
        {listMode ? (
          <div className="space-y-3">
            <div className="rounded-[22px] bg-[var(--oh-surface)] px-4 py-3">
              <p className="oh-type-meta text-[var(--oh-muted)]">{company}</p>
              <p className="oh-type-title mt-0.5 font-semibold text-[var(--oh-text)]">{caption}</p>
            </div>
            <ul className="space-y-2">
              {destinations.map((destination) => {
                const Icon = destination.id.includes("ai") || destination.id.includes("orithos")
                  ? Sparkles
                  : ICONS[destination.icon];
                return (
                  <li key={destination.id} className="rounded-[18px] border border-[var(--oh-border)] bg-white">
                    <Link
                      href={destination.children?.[0]?.href ?? destination.href}
                      onClick={onClose}
                      className="flex min-h-14 items-center gap-3 px-3 py-2.5 no-underline"
                    >
                      <span
                        className="grid h-11 w-11 place-items-center rounded-[14px]"
                        style={{ background: destination.tone.iconBg, color: destination.tone.iconFg }}
                      >
                        <Icon size={20} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="oh-type-label block font-semibold text-[var(--oh-text)]">{destination.label}</span>
                        <span className="oh-type-meta block truncate text-[var(--oh-muted)]">{destination.hint}</span>
                      </span>
                    </Link>
                    {destination.children && destination.children.length > 1 ? (
                      <ul className="border-t border-[var(--oh-border)] px-2 py-2">
                        {destination.children.slice(0, 6).map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onClose}
                              className="oh-type-meta flex min-h-10 items-center rounded-lg px-3 text-[var(--oh-text-secondary)] no-underline hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={onClose}
              className="oh-type-label inline-flex h-11 w-full items-center justify-center rounded-full border border-[var(--oh-border)] font-semibold text-[var(--oh-text)]"
            >
              Close
            </button>
          </div>
        ) : (
          <div
            className={cn(
              "relative h-full w-full transition-[transform,opacity] duration-300 ease-out",
              entered ? "scale-100 opacity-100" : "scale-[0.86] opacity-0",
              "motion-reduce:transition-none motion-reduce:scale-100",
            )}
            style={{ transformOrigin: "center center" }}
          >
            <div className="absolute left-1/2 top-1/2 z-10 flex h-[7.5rem] w-[7.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white/95 px-3 text-center shadow-[0_12px_40px_rgba(15,23,42,0.16)] ring-1 ring-black/5">
              <p className="oh-type-meta truncate font-medium text-[var(--oh-muted)]">{company}</p>
              <p className="oh-type-label mt-0.5 line-clamp-2 font-semibold text-[var(--oh-text)]">{caption}</p>
            </div>

            {items.map((item, index) => {
              const Icon = item.id.includes("ai") || item.id.includes("orithos") ? Sparkles : ICONS[item.icon];
              const isActive = activeId === item.id;
              return (
                <div
                  key={item.id}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px))`,
                    transitionDelay: entered ? `${index * 30}ms` : "0ms",
                  }}
                  onMouseEnter={() => setActiveId(item.id)}
                  onFocus={() => setActiveId(item.id)}
                >
                  <Link
                    href={item.children?.[0]?.href ?? item.href}
                    onClick={onClose}
                    aria-expanded={Boolean(item.children?.length) ? isActive : undefined}
                    className={cn(
                      "group flex w-[6.5rem] flex-col items-center gap-1.5 rounded-[22px] px-2 py-2 no-underline outline-none transition-transform duration-200",
                      isActive ? "scale-110" : "scale-100 hover:scale-105",
                      "focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2",
                    )}
                  >
                    <span
                      className="grid h-14 w-14 place-items-center rounded-[18px] shadow-[0_10px_28px_rgba(15,23,42,0.12)] ring-1 ring-black/5"
                      style={{ background: item.tone.iconBg, color: item.tone.iconFg }}
                    >
                      <Icon size={24} strokeWidth={1.75} />
                    </span>
                    <span className="oh-type-meta text-center font-semibold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">
                      {item.label}
                    </span>
                  </Link>
                </div>
              );
            })}

            {childItems.map((child) => (
              <div
                key={`${active?.id}-${child.href}-${child.label}`}
                className="absolute left-1/2 top-1/2 transition-[opacity,transform] duration-200"
                style={{
                  transform: `translate(calc(-50% + ${child.x}px), calc(-50% + ${child.y}px))`,
                }}
              >
                <Link
                  href={child.href}
                  onClick={onClose}
                  title={child.hint}
                  className="oh-type-meta inline-flex min-h-10 max-w-[9.5rem] items-center justify-center rounded-full bg-white/95 px-3 text-center font-semibold text-[var(--oh-text)] no-underline shadow-lg ring-1 ring-black/5 hover:bg-white"
                >
                  <span className="line-clamp-2">{child.label}</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
