"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose, Wifi, WifiOff } from "lucide-react";
import { UserIcon } from "@/components/icons";

/**
 * Orithos "Sell" screen top bar — static dark header (50px).
 *
 * Right-group: avatar opens the User menu panel (onUserClick).
 */
export function Header({
  userName = "admin",
  sidebarOpen = true,
  onSidebarToggle,
  onUserClick,
}: {
  userName?: string;
  sidebarOpen?: boolean;
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
    <header className="relative flex h-[50px] items-center justify-between bg-[var(--sf-header-bg)] font-sans print:hidden">
      <button
        type="button"
        tabIndex={tabIndex}
        aria-label={sidebarOpen ? "Hide navigation menu" : "Show navigation menu"}
        aria-expanded={sidebarOpen}
        onClick={onSidebarToggle}
        className="flex h-[50px] w-[50px] shrink-0 cursor-pointer items-center justify-center px-1"
      >
        {sidebarOpen ? (
          <PanelLeftClose size={22} strokeWidth={1.5} className="text-[var(--sf-on-dark)]" />
        ) : (
          <PanelLeft size={22} strokeWidth={1.5} className="text-[var(--sf-on-dark)]" />
        )}
      </button>

      <div className="flex items-center gap-3 pr-3 sm:gap-5 sm:pr-5">
        <div
          role="status"
          aria-live="polite"
          title="Browser network connection"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--sf-on-dark)]"
        >
          {online ? (
            <Wifi size={15} className="text-[var(--sf-online-green)]" aria-hidden="true" />
          ) : (
            <WifiOff size={15} className="text-amber-300" aria-hidden="true" />
          )}
          <span>{online ? "ONLINE" : "OFFLINE"}</span>
        </div>
        {/* User — click opens the user menu panel */}
        <button
          type="button"
          tabIndex={tabIndex}
          onClick={onUserClick}
          title="User menu"
          data-testid="sh-current-user"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-1 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-link-blue)]"
        >
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--sf-muted)]">
            <UserIcon size={20} className="text-white" fill="white" />
          </span>
          <p className="mx-2 text-[16px] text-[var(--sf-on-dark)]">{userName}</p>
        </button>
      </div>
    </header>
  );
}
