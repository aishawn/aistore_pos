"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, ClipboardCheck, FileCog, Heart, PackageSearch, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

type ReportSection = {
  label: string;
  href: string;
  icon: typeof BarChart3;
  match: string[];
  children: Array<{ label: string; href: string; hint?: string }>;
};

const SECTIONS: ReportSection[] = [
  {
    label: "Overview",
    href: "/reports/dashboard",
    icon: BarChart3,
    match: ["/reports/dashboard", "/reports/ai"],
    children: [
      { label: "Dashboard", href: "/reports/dashboard" },
      { label: "AI Insights", href: "/reports/ai/metrics" },
      { label: "Recent Sales", href: "/history" },
    ],
  },
  {
    label: "Sales",
    href: "/reports/sales",
    icon: ShoppingCart,
    match: ["/reports/sales", "/reports/daily-sales", "/reports/weekly-sales", "/reports/this-month-sales", "/reports/last-week-sales", "/reports/last-month-sales"],
    children: [
      { label: "Sales Overview", href: "/reports/sales" },
      { label: "Daily Sales", href: "/reports/daily-sales", hint: "Today" },
      { label: "Weekly Sales", href: "/reports/weekly-sales", hint: "This week" },
      { label: "Monthly Sales", href: "/reports/this-month-sales", hint: "This month" },
      { label: "Refunds & Discounts", href: "/reports/sales?view=refunds" },
    ],
  },
  {
    label: "Inventory",
    href: "/reports/inventory",
    icon: Boxes,
    match: ["/reports/inventory"],
    children: [
      { label: "Inventory On Hand", href: "/reports/inventory" },
      { label: "Inventory at Date", href: "/reports/inventory?view=at-date" },
      { label: "Low / Out of Stock", href: "/reports/inventory?view=low-stock" },
      { label: "Slow Moving Stock", href: "/reports/inventory?view=slow-moving" },
      { label: "Inventory Movement", href: "/reports/inventory?view=movement" },
    ],
  },
  {
    label: "Purchasing & Transfers",
    href: "/reports/purchase",
    icon: PackageSearch,
    match: ["/reports/purchase", "/reports/transfer"],
    children: [
      { label: "Purchase Orders", href: "/reports/purchase" },
      { label: "Suppliers", href: "/reports/purchase?view=suppliers" },
      { label: "Open Purchase Orders", href: "/reports/purchase?view=open-orders" },
      { label: "Transfers In Transit", href: "/reports/transfer" },
    ],
  },
  {
    label: "Operations",
    href: "/reports/closures",
    icon: ClipboardCheck,
    match: ["/reports/closures", "/reports/actions", "/reports/misc"],
    children: [
      { label: "Register Closures", href: "/reports/closures" },
      { label: "Cash Variance", href: "/reports/closures?view=variance" },
      { label: "Refunds & Voids", href: "/reports/actions" },
      { label: "Audit Log", href: "/reports/actions?view=audit" },
    ],
  },
];

function isActive(pathname: string, section: ReportSection) {
  return section.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function ReportsNavigation() {
  const pathname = usePathname();
  const active = SECTIONS.find((section) => isActive(pathname, section)) ?? SECTIONS[0];

  return (
    <div className="shrink-0 border-b border-[var(--oh-border)] bg-white">
      <nav aria-label="Report sections" className="overflow-x-auto px-3 pt-2 lg:px-5">
        <div className="flex min-w-max items-end gap-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const selected = active.href === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-t-lg border-b-2 px-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"
                    : "border-transparent text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--oh-border)] px-3 py-2 lg:px-5">
        <span className="mr-1 shrink-0 text-xs font-semibold uppercase tracking-[.08em] text-[var(--oh-muted)]">Reports</span>
        {active.children.map((item) => {
          const selected = pathname === item.href || (item.href.includes("?") && pathname === item.href.split("?")[0]);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
                selected ? "bg-[var(--oh-primary)] font-semibold text-white" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
              )}
            >
              {item.label}
              {item.hint ? <span className="text-[11px] opacity-75">· {item.hint}</span> : null}
            </Link>
          );
        })}
        <span className="ml-0 flex items-center gap-1.5 lg:ml-auto">
          <Link href="/reports/favourites" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]"><Heart size={14} /> Saved</Link>
          <Link href="/reports/advanced" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]"><FileCog size={14} /> Custom</Link>
        </span>
      </div>
    </div>
  );
}
