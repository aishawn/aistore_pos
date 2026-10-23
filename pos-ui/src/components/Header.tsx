"use client";

import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { UserIcon } from "@/components/icons";
import { OrithosLogo } from "@/components/OrithosLogo";

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
}: {
  userName?: string;
  sidebarOpen?: boolean;
  userMenuOpen?: boolean;
  onSidebarToggle?: () => void;
  onUserClick?: () => void;
}) {
  const pathname = usePathname();
  const checkoutKeyboard = pathname === "/" || pathname === "/finalise";
  const tabIndex = checkoutKeyboard ? -1 : undefined;

  return (
    <header className="relative flex h-[50px] items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-header-bg)] font-sans print:hidden">
      <button
        type="button"
        tabIndex={tabIndex}
        aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={sidebarOpen}
        aria-controls="main-navigation"
        onClick={onSidebarToggle}
        className="flex h-[50px] w-[50px] shrink-0 cursor-pointer items-center justify-center px-1 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)]"
      >
        {sidebarOpen ? (
          <PanelLeftClose size={22} strokeWidth={1.5} />
        ) : (
          <PanelLeft size={22} strokeWidth={1.5} />
        )}
      </button>

      <div className="mr-auto min-w-0 pl-1 md:hidden" aria-hidden="true">
        <OrithosLogo />
      </div>

      <div className="flex items-center gap-2 pr-2 sm:pr-5">
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
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-1 transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--oh-primary)]">
            <UserIcon size={20} className="text-white" fill="white" />
          </span>
          <p className="oh-type-body mx-2 hidden text-[var(--oh-text)] sm:block">{userName}</p>
        </button>
      </div>
    </header>
  );
}
