"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  Wine,
  ScanLine,
  BarChart3,
  Percent,
  Compass,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSidebarNavigation, type SidebarIcon } from "@/lib/sidebar-navigation";
import { buildLaunchDestinations, openLaunchRing } from "@/lib/overview-launch";
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

export function OverviewLaunchTiles({
  parkedCount = 0,
  openRegisters = 0,
  company,
  netSalesLabel,
}: {
  parkedCount?: number;
  openRegisters?: number;
  company?: string;
  netSalesLabel?: string;
}) {
  const { user } = useAuth();
  const destinations = buildLaunchDestinations(
    getSidebarNavigation({ isAdmin: Boolean(user?.isAdmin) }),
  );
  const sell = destinations.find((item) => item.featured) ?? destinations[0];
  // Skip Overview on its own page so the bento stays a clean 2×2 beside Sell.
  const secondary = destinations.filter(
    (item) => item.id !== sell?.id && item.id !== "overview",
  );

  const sellDetail =
    parkedCount > 0
      ? `${parkedCount} parked sale${parkedCount === 1 ? "" : "s"} waiting`
      : openRegisters > 0
        ? `${openRegisters} open register${openRegisters === 1 ? "" : "s"}`
        : "Ready when you are";

  return (
    <section aria-label="Store destinations" className="shrink-0">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <p className="oh-type-meta font-medium text-[var(--oh-muted)]">Go somewhere</p>
          <h2 className="oh-type-label mt-0.5 font-semibold text-[var(--oh-text)]">Store launch pad</h2>
        </div>
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openLaunchRing({
              originX: rect.left + rect.width / 2,
              originY: rect.top + rect.height / 2,
              company,
              centerCaption: netSalesLabel,
            });
          }}
          className="oh-type-meta inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--oh-border)] bg-white px-3 font-semibold text-[var(--oh-text)] shadow-[var(--oh-shadow-card)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] motion-reduce:transform-none"
        >
          <Compass size={14} aria-hidden="true" />
          Quick menu
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-2.5">
        {sell ? (
          <Link
            href={sell.href}
            className={cn(
              "group relative col-span-2 flex min-h-[132px] flex-col justify-between overflow-hidden rounded-[22px] bg-white p-4 no-underline shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-[transform,box-shadow] duration-200",
              "hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)] active:scale-[0.97]",
              "motion-reduce:transform-none md:row-span-2 md:min-h-[220px] md:p-5",
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-70 blur-2xl transition-opacity group-hover:opacity-100"
              style={{ background: sell.tone.iconBg }}
            />
            <span
              className="relative grid h-12 w-12 place-items-center rounded-[16px] md:h-14 md:w-14 md:rounded-[18px]"
              style={{ background: sell.tone.iconBg, color: sell.tone.iconFg }}
            >
              <ShoppingCart size={24} strokeWidth={1.75} />
            </span>
            <div className="relative mt-auto pt-4">
              <p className="text-[1.35rem] font-semibold tracking-tight text-[var(--oh-text)] md:text-[1.6rem]">
                {sell.label}
              </p>
              <p className="oh-type-meta mt-1 max-w-[18rem] text-[var(--oh-muted)]">{sellDetail}</p>
            </div>
          </Link>
        ) : null}

        {secondary.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          return (
            <Link
              key={item.id}
              href={item.children?.[0]?.href ?? item.href}
              className={cn(
                "group flex min-h-[104px] flex-col justify-between rounded-[22px] bg-white p-3.5 no-underline shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-[transform,box-shadow] duration-200",
                "hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)] active:scale-[0.97]",
                "motion-reduce:transform-none md:min-h-0 md:p-4",
              )}
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-[14px]"
                style={{ background: item.tone.iconBg, color: item.tone.iconFg }}
              >
                {item.id.includes("ai") || item.id.includes("orithos") ? (
                  <Sparkles size={20} strokeWidth={1.75} />
                ) : (
                  <Icon size={20} strokeWidth={1.75} />
                )}
              </span>
              <div className="mt-3">
                <p className="oh-type-label font-semibold text-[var(--oh-text)]">{item.label}</p>
                <p className="oh-type-meta mt-0.5 line-clamp-2 text-[var(--oh-muted)]">{item.hint}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
