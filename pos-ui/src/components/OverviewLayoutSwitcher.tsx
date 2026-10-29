"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** Dashboard layout switcher for Radial and Workspace views. */
export function OverviewLayoutSwitcher({
  active,
  className,
}: {
  active: "radial" | "workspace";
  className?: string;
}) {
  return (
    <div
      role="navigation"
      aria-label="Dashboard layout options"
      data-dashboard-layout-switcher
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-0.5 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <Link
        href="/dashboard"
        aria-current={active === "radial" ? "page" : undefined}
        className={cn(
          "oh-type-meta inline-flex min-h-11 items-center rounded-full px-3 font-semibold no-underline transition-colors",
          active === "radial"
            ? "bg-[var(--oh-surface-inverse)] text-[var(--oh-on-inverse)]"
            : "text-[var(--oh-muted)] hover:text-[var(--oh-text)]",
        )}
      >
        Radial
      </Link>
      <Link
        href="/dashboard/workspace"
        aria-current={active === "workspace" ? "page" : undefined}
        className={cn(
          "oh-type-meta inline-flex min-h-11 items-center rounded-full px-3 font-semibold no-underline transition-colors",
          active === "workspace"
            ? "bg-[var(--oh-surface-inverse)] text-[var(--oh-on-inverse)]"
            : "text-[var(--oh-muted)] hover:text-[var(--oh-text)]",
        )}
      >
        Workspace
      </Link>
    </div>
  );
}
