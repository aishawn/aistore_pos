"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Boxes, Lightbulb, PackageSearch, ReceiptText } from "lucide-react";
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
    label: "AI Insights",
    href: "/reports/dashboard#ai-insights",
    icon: Lightbulb,
    match: ["/reports/dashboard#ai-insights"],
  },
  {
    label: "Sales History",
    href: "/history",
    icon: ReceiptText,
    match: ["/history"],
  },
  {
    label: "Inventory",
    href: "/reports/inventory",
    icon: Boxes,
    match: ["/reports/inventory"],
  },
  {
    label: "Purchasing & Transfers",
    href: "/reports/purchase",
    icon: PackageSearch,
    match: ["/reports/purchase", "/reports/transfer"],
  },
];

function isActive(pathname: string, tab: ReportTab) {
  return tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function ReportsNavigation() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);
  const active = TABS.find((tab) => isActive(pathname, tab)) ?? TABS[0];

  return (
    <div className="shrink-0 border-b border-[var(--oh-border)] bg-white">
      <nav aria-label="Report sections" className="overflow-x-auto px-3 lg:px-5">
        <div className="flex min-w-max items-center gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.href.includes("#")
              ? pathname === tab.href.split("#")[0] && hash === `#${tab.href.split("#")[1]}`
              : active.href === tab.href && !hash;
            return (
              <Link
                key={tab.href}
                href={tab.href}
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
