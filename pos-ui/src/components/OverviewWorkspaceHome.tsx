"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  BarChart3,
  Package,
  Shield,
  ShoppingCart,
  Sparkles,
  Users,
  Search,
  LayoutGrid,
  ShoppingBag,
} from "lucide-react";
import { OverviewLayoutSwitcher } from "@/components/OverviewLayoutSwitcher";
import { cn } from "@/lib/utils";

const SPRING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

type WorkspaceTile = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  /** Soft pastel fill */
  fill: string;
  /** Icon / label accent */
  accent: string;
};

const TILES: WorkspaceTile[] = [
  {
    id: "reports",
    label: "Business insights",
    href: "/reports/dashboard",
    icon: BarChart3,
    fill: "#FFF1E6",
    accent: "#C2410C",
  },
  {
    id: "stock",
    label: "Products & stock",
    href: "/products/odoo",
    icon: Package,
    fill: "#E8F1FF",
    accent: "#1D4ED8",
  },
  {
    id: "roles",
    label: "Staff & access",
    href: "/settings/roles",
    icon: Shield,
    fill: "#E8F8EF",
    accent: "#047857",
  },
  {
    id: "purchases",
    label: "Purchasing",
    href: "/purchases/odoo",
    icon: ShoppingCart,
    fill: "#F3E8FF",
    accent: "#7E22CE",
  },
  {
    id: "customers",
    label: "Customers",
    href: "/customers/odoo",
    icon: Users,
    fill: "#E6F7F7",
    accent: "#0F766E",
  },
  {
    id: "ai",
    label: "Orithos AI",
    href: "/assistant",
    icon: Sparkles,
    fill: "#FFE8E4",
    accent: "#BE185D",
  },
];

const DOCK: Array<{
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}> = [
  { id: "home", label: "Workspace", href: "/overview/workspace", icon: LayoutGrid },
  { id: "sell", label: "Sell", href: "/", icon: ShoppingBag },
  { id: "reports", label: "Reports", href: "/reports/dashboard", icon: BarChart3 },
  { id: "stock", label: "Stock", href: "/products/odoo", icon: Package },
  { id: "ai", label: "AI", href: "/assistant", icon: Sparkles },
];

export function OverviewWorkspaceHome({
  greeting,
  userName,
  company,
  briefingLines,
  className,
}: {
  greeting: string;
  userName: string;
  company: string;
  briefingLines: Array<{ text: string; href: string }>;
  className?: string;
}) {
  return (
    <section
      aria-label="Admin workspace"
      className={cn(
        "relative mx-auto flex h-full min-h-0 w-full max-w-[920px] flex-col overflow-hidden",
        "rounded-[28px] bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.1)] ring-1 ring-black/[0.04]",
        "backdrop-blur-xl",
        className,
      )}
    >
      {/* Soft stage wash behind the window */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[28px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.06), transparent 55%)",
        }}
      />

      {/* Window chrome */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.04] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF9F0A]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#D1D5DB]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#D1D5DB]" />
        </div>
        <p className="oh-type-meta flex-1 truncate text-center font-medium text-[var(--oh-muted)]">
          ORITHOS · Admin Workspace
        </p>
        <Link
          href="/products/odoo"
          aria-label="Search products"
          className="grid h-9 w-9 place-items-center rounded-full text-[var(--oh-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--oh-text)]"
        >
          <Search size={16} strokeWidth={1.75} />
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4 pt-6 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="oh-type-meta text-[var(--oh-muted)]">
              {greeting}, {userName}
            </p>
            <h1 className="mt-1.5 max-w-xl text-[1.65rem] font-semibold leading-tight tracking-tight text-[var(--oh-text)] sm:text-[1.85rem]">
              Your store, at a glance.
            </h1>
            <p className="oh-type-meta mt-1.5 text-[var(--oh-muted)]">{company}</p>
          </div>
          <OverviewLayoutSwitcher active="workspace" />
        </div>

        {/* Square module grid */}
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5">
          {TILES.map((tile, index) => {
            const Icon = tile.icon;
            return (
              <li key={tile.id}>
                <Link
                  href={tile.href}
                  className={cn(
                    "group flex aspect-square flex-col justify-between rounded-[22px] p-4 no-underline sm:rounded-[26px] sm:p-5",
                    "shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] ring-1 ring-black/[0.03]",
                    "transition-[transform,box-shadow] duration-300 will-change-transform",
                    "hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)]",
                    "active:scale-[0.97] motion-reduce:transform-none",
                  )}
                  style={{
                    background: tile.fill,
                    transitionTimingFunction: SPRING,
                    transitionDelay: `${index * 40}ms`,
                  }}
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-[14px] bg-white/70 shadow-sm backdrop-blur-sm transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none sm:h-12 sm:w-12"
                    style={{ color: tile.accent, transitionTimingFunction: SPRING }}
                  >
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <span
                    className="text-[0.95rem] font-semibold tracking-tight sm:text-[1.05rem]"
                    style={{ color: tile.accent }}
                  >
                    {tile.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Smart briefing */}
        <section
          aria-label="Today’s smart briefing"
          className="mt-5 rounded-[20px] bg-[#F4F7FB] px-4 py-4 ring-1 ring-black/[0.03] sm:px-5"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-[var(--oh-primary)] shadow-sm">
              <Sparkles size={14} strokeWidth={1.75} />
            </span>
            <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Today’s smart briefing</h2>
          </div>
          <ul className="mt-3 space-y-2">
            {briefingLines.map((line) => (
              <li key={line.href + line.text}>
                <Link
                  href={line.href}
                  className="oh-type-meta flex min-h-10 items-start gap-2 rounded-xl px-2 py-1.5 text-[var(--oh-text-secondary)] no-underline transition-colors hover:bg-white hover:text-[var(--oh-text)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--oh-primary)]" aria-hidden="true" />
                  <span className="leading-5">{line.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* macOS-style dock */}
      <div className="shrink-0 px-4 pb-4 pt-1 sm:px-6 sm:pb-5">
        <nav
          aria-label="App dock"
          className={cn(
            "mx-auto flex max-w-md items-center justify-between gap-1 rounded-[22px] px-3 py-2.5",
            "bg-white/70 shadow-[0_12px_40px_rgba(15,23,42,0.1)] ring-1 ring-black/[0.06]",
            "backdrop-blur-2xl backdrop-saturate-150",
          )}
        >
          <div className="flex flex-1 items-center justify-around">
            {DOCK.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-[14px] text-[var(--oh-text)] no-underline",
                    "transition-transform duration-200 hover:-translate-y-1 hover:bg-black/[0.04] active:scale-95",
                    "motion-reduce:transform-none",
                  )}
                  style={{ transitionTimingFunction: SPRING }}
                >
                  <Icon size={22} strokeWidth={1.6} />
                </Link>
              );
            })}
          </div>
          <span className="oh-type-meta hidden shrink-0 pl-2 font-medium text-[var(--oh-muted)] sm:inline">
            App Dock
          </span>
        </nav>
      </div>
    </section>
  );
}
