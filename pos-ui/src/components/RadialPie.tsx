"use client";
import "./overview.css";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  Package,
  Percent,
  ScanLine,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  Wine,
  X,
} from "lucide-react";
import type { LaunchDestination } from "@/lib/overview-launch";
import type { SidebarIcon } from "@/lib/sidebar-navigation";
import { cn } from "@/lib/utils";

const ICONS = {
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
function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return matches;
}
export function usePrefersReducedMotion() {
  return useMedia("(prefers-reduced-motion: reduce)");
}
export function useIsCompactViewport() {
  return useMedia("(max-width: 767px)");
}

export function RadialPie({
  destinations,
  centerTitle,
  centerCaption,
  centerHint,
  centerHref,
  onNavigate,
  onCenterClick,
  entered = true,
  variant = "page",
  className,
}: {
  destinations: LaunchDestination[];
  centerTitle: string;
  centerCaption: string;
  centerHint?: string;
  centerHref?: string;
  onNavigate?: () => void;
  onCenterClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  entered?: boolean;
  variant?: "page" | "modal";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [preview, setPreview] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const compact = useIsCompactViewport();
  const id = useId();
  const activeId = pinned || preview;
  const active = destinations.find((item) => item.id === activeId);
  // The dashboard keeps the radial relationship on phones; modal launchers
  // remain a list so a small dialog does not become a cramped mini-canvas.
  const mobileRadial = variant === "page" && compact;
  const listMode =
    variant === "modal"
      ? compact || (size.width > 0 && (size.width < 700 || size.height < 430))
      : !mobileRadial && size.width > 0 && (size.width < 700 || size.height < 430);
  const originX = size.width / 2;
  const radius = mobileRadial
    ? Math.max(0, Math.min(size.width * 0.34, size.height * 0.31, 122))
    : Math.max(
        0,
        Math.min(
          size.width / 2 - 106,
          size.height / 2 - 86,
          (size.width / 2 - 168) / 0.866,
          218,
        ),
      );
  const close = (restore = false) => {
    const target = pinned || preview;
    setPinned(null);
    setPreview(null);
    if (restore && target) triggers.current.get(target)?.focus();
  };
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setPinned(null);
        setPreview(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
  const showPreview = (item: LaunchDestination) => {
    if (timeout.current) clearTimeout(timeout.current);
    if (!pinned && item.children?.length) setPreview(item.id);
  };
  const hidePreview = () => {
    if (!pinned) timeout.current = setTimeout(() => setPreview(null), 180);
  };
  const center = (
    <>
      {centerTitle !== centerCaption ? <span className="ov-eyebrow">{centerTitle}</span> : null}
      <strong>{centerCaption}</strong>
      {centerHint ? <span>{centerHint}</span> : null}
    </>
  );
  return (
    <div
      ref={ref}
      className={cn(
        "ov-ring",
        variant === "modal" && "ov-ring-modal",
        mobileRadial && "ov-ring-mobile-radial",
        listMode && "ov-ring-list",
        !entered && "opacity-0",
        className,
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && activeId) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      {centerHref ? (
        <Link
          className="ov-ring-center ov-ring-center-link"
          aria-label={`${centerCaption}. Open dashboard`}
          title="Open dashboard"
          style={listMode ? undefined : { left: originX }}
          href={centerHref}
          onClick={(event) => {
            onNavigate?.();
            onCenterClick?.(event);
          }}
        >
          {center}
        </Link>
      ) : (
        <div
          className="ov-ring-center"
          style={listMode ? undefined : { left: originX }}
        >
          {center}
        </div>
      )}
      {!listMode && size.width > 0 ? (
        <svg
          className="ov-rays"
          aria-hidden="true"
          width={size.width}
          height={size.height}
        >
          {destinations.map((item, index) => {
            const angle =
              (index * Math.PI * 2) / destinations.length - Math.PI / 2;
            return (
              <line
                key={item.id}
                x1={originX}
                y1={size.height / 2}
                x2={originX + Math.cos(angle) * (radius - 30)}
                y2={size.height / 2 + Math.sin(angle) * (radius - 30)}
                stroke={activeId === item.id ? item.tone.accent : "#ccd3df"}
                strokeOpacity={activeId === item.id ? 0.7 : 0.5}
              />
            );
          })}
        </svg>
      ) : null}
      <ul className="ov-ring-nodes" aria-label="Store modules">
        {destinations.map((item, index) => {
          const Icon = item.id.includes("ai")
            ? Sparkles
            : ICONS[item.icon as SidebarIcon];
          const angle =
            (index * Math.PI * 2) / Math.max(destinations.length, 1) -
            Math.PI / 2;
          const selected = item.id === activeId;
          const body = (
            <>
              <span
                className="ov-node-icon"
                style={{ color: item.tone.iconFg }}
              >
                <Icon size={25} strokeWidth={1.7} />
              </span>
              <span>
                {item.label}
                {item.children?.length ? <ChevronDown size={12} /> : null}
              </span>
              {item.description ? <small>{item.description}</small> : null}
            </>
          );
          return (
            <li
              key={item.id}
              className={cn("ov-ring-node", `ov-ring-node-${item.id}`, selected && "ov-node-active")}
              style={
                listMode
                  ? undefined
                  : {
                      left: originX,
                      top: "50%",
                      transform: `translate(calc(-50% + ${Math.cos(angle) * radius}px), calc(-50% + ${Math.sin(angle) * radius}px))`,
                    }
              }
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && !listMode) showPreview(item);
              }}
              onPointerLeave={hidePreview}
            >
              {item.children?.length ? (
                <button
                  ref={(element) => {
                    if (element) triggers.current.set(item.id, element);
                    else triggers.current.delete(item.id);
                  }}
                  type="button"
                  aria-expanded={selected}
                  aria-controls={`${id}-children`}
                  onClick={() => {
                    if (pinned === item.id) close();
                    else {
                      setPreview(null);
                      setPinned(item.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setPinned(item.id);
                      requestAnimationFrame(() =>
                        ref.current
                          ?.querySelector<HTMLAnchorElement>(".ov-submenu a")
                          ?.focus(),
                      );
                    }
                  }}
                >
                  {body}
                </button>
              ) : (
                <Link href={item.href} onClick={onNavigate}>
                  {body}
                </Link>
              )}
              {listMode && selected && item.children?.length ? (
                <div className="ov-inline-children" id={`${id}-children`}>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!listMode && active?.children?.length ? (
        <section
          className="ov-submenu"
          id={`${id}-children`}
          aria-label={`${active.label} destinations`}
          onPointerEnter={() => {
            if (timeout.current) clearTimeout(timeout.current);
          }}
          onPointerLeave={hidePreview}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const links = Array.from(event.currentTarget.querySelectorAll("a"));
            const index = links.indexOf(
              document.activeElement as HTMLAnchorElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? links.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      links.length) %
                    links.length;
            links[next]?.focus();
          }}
        >
          <div className="ov-submenu-heading">
            <h2>{active.label}</h2>
            <button
              type="button"
              aria-label="Close module destinations"
              onClick={() => close(true)}
            >
              <X size={18} />
            </button>
          </div>
          <ul>
            {active.children.map((child) => (
              <li key={child.href}>
                <Link href={child.href} onClick={onNavigate}>
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
export function RadialPieEmpty({ children }: { children: ReactNode }) {
  return <div className="grid min-h-64 place-items-center">{children}</div>;
}
