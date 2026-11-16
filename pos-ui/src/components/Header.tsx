"use client";

import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { UserIcon } from "@/components/icons";
import { OrithosLogo } from "@/components/OrithosLogo";
import { LocationHeaderControl } from "@/components/LocationHeaderControl";

/**
 * Orithos top bar — light chrome (50px) shared by Sell and admin pages.
 *
 * Right-group: avatar opens the account menu (onUserClick).
 * Network status lives in UserMenu; AI entry is the floating launcher.
 */
export function Header({
  userName = "admin",
  sidebarOpen = true,
  userMenuOpen = false,
  onSidebarToggle,
  onUserClick,
  showLocation = true,
}: {
  userName?: string;
  sidebarOpen?: boolean;
  userMenuOpen?: boolean;
  onSidebarToggle?: () => void;
  onUserClick?: () => void;
  showLocation?: boolean;
}) {
  const pathname = usePathname();
  const checkoutKeyboard = pathname === "/" || pathname === "/finalise";
  const tabIndex = checkoutKeyboard ? -1 : undefined;

  return (
    <header className="oh-app-header relative shrink-0 bg-[var(--oh-header-bg)] font-sans print:hidden">
      <div className="flex h-[var(--oh-header-height)] items-center justify-between border-b border-[var(--oh-border)]">
        <button
          type="button"
          tabIndex={tabIndex}
          aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={sidebarOpen}
          aria-controls="main-navigation"
          onClick={onSidebarToggle}
          className="flex h-full w-14 shrink-0 cursor-pointer items-center justify-center text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface-muted)]"
        >
          {sidebarOpen ? <PanelLeftClose size={21} strokeWidth={1.6} /> : <PanelLeft size={21} strokeWidth={1.6} />}
        </button>

        <div className="mr-auto min-w-0 pl-1 md:hidden" aria-hidden="true"><OrithosLogo /></div>

        <div className="flex items-center gap-2 pr-3 sm:pr-6">
          {showLocation && <LocationHeaderControl />}
          <button
            type="button"
            tabIndex={tabIndex}
            onClick={onUserClick}
            title="User menu"
            aria-label={`User menu for ${userName}`}
            data-user-menu-trigger
            aria-haspopup="dialog"
            aria-controls="user-menu"
            aria-expanded={userMenuOpen}
            data-testid="sh-current-user"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 transition-colors hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--oh-primary)]"><UserIcon size={18} className="text-white" fill="white" /></span>
            <p className="oh-type-body mx-2 hidden text-[var(--oh-text)] sm:block">{userName}</p>
          </button>
        </div>
      </div>
    </header>
  );
}
