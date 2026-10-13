"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose, Wifi, WifiOff } from "lucide-react";
import { UserIcon } from "@/components/icons";
import { OrithosLogo } from "@/components/OrithosLogo";

/**
 * Orithos top bar — light chrome (50px) shared by Sell and admin pages.
 *
 * Right-group: avatar opens the account menu (onUserClick).
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
  const [online, setOnline] = useState(true);
  const pathname = usePathname();
  const checkoutKeyboard = pathname === "/" || pathname === "/finalise";
  const tabIndex = checkoutKeyboard ? -1 : undefined;

  useEffect(() => {
    const syncStatus = () => setOnline(navigator.onLine);
    syncStatus();
    window.addEventListener("online", syncStatus);
    window.addEventListener("offline", syncStatus);
    return () => {
      window.removeEventListener("online", syncStatus);
      window.removeEventListener("offline", syncStatus);
    };
  }, []);

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

      <div className="flex items-center gap-2 pr-2 sm:gap-5 sm:pr-5">
        <div
          role="status"
          aria-live="polite"
          title="Browser network connection"
          className="oh-type-label inline-flex items-center gap-1.5 font-semibold text-[var(--oh-text-secondary)]"
        >
          {online ? (
            <Wifi size={16} className="text-[var(--sf-online-green)]" aria-hidden="true" />
          ) : (
            <WifiOff size={16} className="text-[var(--oh-warning)]" aria-hidden="true" />
          )}
          <span className={`hidden sm:inline ${online ? "text-[var(--sf-online-green)]" : ""}`}>{online ? "ONLINE" : "OFFLINE"}</span>
        </div>
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
