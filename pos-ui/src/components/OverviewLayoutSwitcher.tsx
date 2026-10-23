"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** Temporary A/B switcher so the owner can pick Radial vs Workspace Overview. */
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
      aria-label="Overview layout options"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-black/[0.06] bg-white/80 p-0.5 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <Link
        href="/overview"
        aria-current={active === "radial" ? "page" : undefined}
        className={cn(
          "oh-type-meta inline-flex min-h-11 items-center rounded-full px-3 font-semibold no-underline transition-colors",
          active === "radial"
            ? "bg-[var(--oh-text)] text-white"
            : "text-[var(--oh-muted)] hover:text-[var(--oh-text)]",
        )}
      >
        Radial
      </Link>
      <Link
        href="/overview/workspace"
        aria-current={active === "workspace" ? "page" : undefined}
        className={cn(
          "oh-type-meta inline-flex min-h-11 items-center rounded-full px-3 font-semibold no-underline transition-colors",
          active === "workspace"
            ? "bg-[var(--oh-text)] text-white"
            : "text-[var(--oh-muted)] hover:text-[var(--oh-text)]",
        )}
      >
        Workspace
      </Link>
    </div>
  );
}
