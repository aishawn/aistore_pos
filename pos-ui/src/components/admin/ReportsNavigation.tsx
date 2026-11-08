"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BarChart3, Boxes, PackageSearch, ReceiptText, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

type ReportTab = {
  label: string;
  href: string;
  icon: typeof BarChart3;
  match: string[];
};

const TABS: ReportTab[] = [
  {
    label: "Overview",
    href: "/reports/dashboard",
    icon: BarChart3,
    match: ["/reports/dashboard", "/reports/ai"],
  },
  {
    label: "Sales report",
    href: "/reports/sales",
    icon: ReceiptText,
    match: ["/reports/sales", "/history"],
  },
  {
    label: "Inventory",
    href: "/reports/inventory",
    icon: Boxes,
    match: ["/reports/inventory"],
  },
  {
    label: "Purchase analysis",
    href: "/reports/purchase",
    icon: PackageSearch,
    match: ["/reports/purchase"],
  },
  {
    label: "Purchase Orders",
    href: "/purchases",
    icon: PackageSearch,
    match: ["/purchases"],
  },
  {
    label: "Transfers",
    href: "/reports/transfer",
    icon: PackageSearch,
    match: ["/reports/transfer"],
  },
  {
    label: "Register Closures",
    href: "/reports/closures",
    icon: WalletCards,
    match: ["/reports/closures"],
  },
];

function isActive(pathname: string, tab: ReportTab) {
  return tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function ReportsNavigation() {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const active = TABS.find((tab) => isActive(pathname, tab)) ?? TABS[0];
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active.href]);

  // This admin health page belongs to Setup, rather than business reports.
  if (pathname === "/reports/ai/metrics") return null;

  return (
    <div className="print:hidden shrink-0 border-b border-[var(--oh-border)] bg-white">
      <nav aria-label="Report sections" className="overflow-x-auto px-3 lg:px-5 [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = active.href === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                ref={selected ? activeTabRef : undefined}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"
                    : "border-transparent text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
