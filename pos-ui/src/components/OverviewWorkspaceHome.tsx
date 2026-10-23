"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  BarChart3,
  Package,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { OverviewAccountControl } from "@/components/OverviewAccountControl";
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
    id: "sell",
    label: "Sell",
    href: "/",
    icon: ShoppingBag,
    fill: "#FFF7E8",
    accent: "#B45309",
  },
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

function subtitleForTile(
  tile: WorkspaceTile,
  briefingLines: Array<{ text: string; href: string }>,
): string | null {
  const match = briefingLines.find(
    (line) => line.href === tile.href || line.href.startsWith(`${tile.href}?`),
  );
  if (!match) return null;
  const text = match.text.trim();
  if (!text) return null;
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

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
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden",
        "bg-[linear-gradient(180deg,#eef2f7_0%,#f5f7fa_45%,#e8eef6_100%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.07), transparent 55%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-5 pb-8 pt-5 sm:px-8 sm:pt-6 lg:px-10">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="oh-type-meta text-[var(--oh-muted)]">
              {greeting}, {userName}
            </p>
            <h1 className="mt-1.5 max-w-xl text-[1.65rem] font-semibold leading-tight tracking-tight text-[var(--oh-text)] sm:text-[1.85rem]">
              Your store, at a glance.
            </h1>
            <p className="oh-type-meta mt-1.5 text-[var(--oh-muted)]">{company}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <OverviewLayoutSwitcher active="workspace" />
            <OverviewAccountControl />
          </div>
        </header>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:mt-7 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
          {TILES.map((tile, index) => {
            const Icon = tile.icon;
            const subtitle = subtitleForTile(tile, briefingLines);
            return (
              <li key={tile.id}>
                <Link
                  href={tile.href}
                  className={cn(
                    "group flex aspect-[5/4] flex-col justify-between rounded-[22px] p-4 no-underline sm:rounded-[26px] sm:p-5",
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
                  <span className="min-w-0">
                    <span
                      className="block text-[0.95rem] font-semibold tracking-tight sm:text-[1.05rem]"
                      style={{ color: tile.accent }}
                    >
                      {tile.label}
                    </span>
                    {subtitle ? (
                      <span className="mt-1 block line-clamp-2 text-[0.75rem] leading-snug text-[var(--oh-text-secondary)] opacity-90">
                        {subtitle}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <section
          aria-label="Today’s smart briefing"
          className="mt-5 rounded-[20px] bg-white/80 px-4 py-4 ring-1 ring-black/[0.04] backdrop-blur-sm sm:mt-6 sm:px-5"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F4F7FB] text-[var(--oh-primary)] shadow-sm">
              <Sparkles size={14} strokeWidth={1.75} />
            </span>
            <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Today’s smart briefing</h2>
          </div>
          <ul className="mt-3 space-y-2">
            {briefingLines.map((line) => (
              <li key={line.href + line.text}>
                <Link
                  href={line.href}
                  className="oh-type-meta flex min-h-10 items-start gap-2 rounded-xl px-2 py-1.5 text-[var(--oh-text-secondary)] no-underline transition-colors hover:bg-[#F4F7FB] hover:text-[var(--oh-text)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--oh-primary)]" aria-hidden="true" />
                  <span className="leading-5">{line.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
