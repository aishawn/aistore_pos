"use client";

import { OrithosBrandMarkIcon } from "@/components/OrithosBrandMark";
import { UserIcon } from "@/components/icons";
import { useOverviewChrome } from "@/components/OverviewChromeContext";
import { openLaunchRing } from "@/lib/overview-launch";
import { cn } from "@/lib/utils";

/** Logo (LaunchRing) + account trigger for chromeless Overview pages. */
export function OverviewAccountControl({ className }: { className?: string }) {
  const chrome = useOverviewChrome();
  if (!chrome) return null;

  const { userName, userMenuOpen, toggleUserMenu } = chrome;

  return (
    <div
      className={cn("flex shrink-0 items-center gap-1.5 sm:gap-2", className)}
    >
      <button
        type="button"
        aria-label="Open store quick menu"
        title="Quick menu"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openLaunchRing({
            originX: rect.left + rect.width / 2,
            originY: rect.top + rect.height / 2,
          });
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1.5 transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
      >
        <span className="oh-brand-mark">
          <OrithosBrandMarkIcon className="h-7 w-7" />
          <span className="oh-brand-wordmark">orithos</span>
        </span>
      </button>
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
