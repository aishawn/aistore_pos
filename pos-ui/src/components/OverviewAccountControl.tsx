"use client";

import { OrithosLogo } from "@/components/OrithosLogo";
import { UserIcon } from "@/components/icons";
import { useOverviewChrome } from "@/components/OverviewChromeContext";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Dashboard home link + account trigger for chromeless Overview pages. */
export function OverviewAccountControl({ className, showLogo = true }: { className?: string; showLogo?: boolean }) {
  const chrome = useOverviewChrome();
  if (!chrome) return null;

  const { userName, userMenuOpen, toggleUserMenu } = chrome;

  return (
    <div
      data-dashboard-account-control
      className={cn("flex shrink-0 items-center gap-1.5 sm:gap-2", className)}
    >
      {showLogo ? <Link
        href="/dashboard"
        aria-label="Open Dashboard"
        title="Dashboard"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1.5 transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
      >
        <OrithosLogo />
      </Link> : null}
      <button
        type="button"
        onClick={toggleUserMenu}
        title="User menu"
        aria-label={`User menu for ${userName}`}
        data-user-menu-trigger
        aria-haspopup="dialog"
        aria-controls="user-menu"
        aria-expanded={userMenuOpen}
        data-testid="sh-current-user"
        className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-1 transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--oh-primary)]">
          <UserIcon size={18} className="text-white" fill="white" />
        </span>
        <p className="oh-type-body mx-1.5 hidden text-[var(--oh-text)] sm:block">
          {userName}
        </p>
      </button>
    </div>
  );
}
