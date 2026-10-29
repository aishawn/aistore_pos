"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DoorClosed, History, LayoutDashboard, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { SettingsGearIcon, LogOutIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useTheme } from "@/components/ThemeProvider";

/** Compact account popover anchored to the application header. */
export function UserMenu({
  open,
  onClose,
  onCloseRegister,
  onSalesHistory,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onCloseRegister?: () => void;
  onSalesHistory?: () => void;
  onLogout?: () => void;
}) {
  const menuRef = useRef<HTMLElement>(null);
  const [online, setOnline] = useState(true);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  useDialogFocus(open, onClose);

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

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-user-menu-trigger]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      ref={menuRef}
      id="user-menu"
      role="dialog"
      aria-modal="true"
      aria-label="User menu"
      aria-hidden={!open}
      className={cn(
        "fixed right-3 top-[56px] z-[60] w-[min(320px,calc(100vw-24px))] origin-top-right rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-xl",
        "transition-[opacity,transform] duration-150 ease-out",
        open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[.98] opacity-0",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        title="Browser network connection"
        className="oh-type-label mb-3 inline-flex items-center gap-1.5 px-1 font-semibold text-[var(--oh-text-secondary)]"
      >
        {online ? (
          <Wifi size={16} className="text-[var(--sf-online-green)]" aria-hidden="true" />
        ) : (
          <WifiOff size={16} className="text-[var(--oh-warning)]" aria-hidden="true" />
        )}
        <span className={online ? "text-[var(--sf-online-green)]" : ""}>{online ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <p className="px-1 pb-3 text-sm leading-5 text-[var(--oh-muted)]">
        Account settings and sign-out for this workstation. Offline POS checkout is not supported; keep this workstation connected before taking payment.
      </p>
      <section aria-label="Hardware readiness" className="border-t border-[var(--oh-border)] px-1 py-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--oh-muted)]">Hardware readiness</h2>
        <ul className="space-y-1.5 text-xs text-[var(--oh-muted)]">
          <li className="flex items-center justify-between gap-3"><span>Receipt printer</span><span className="font-semibold text-[var(--oh-warning)]">Not connected / not validated</span></li>
          <li className="flex items-center justify-between gap-3"><span>Cash drawer</span><span className="font-semibold text-[var(--oh-warning)]">Not connected / not validated</span></li>
          <li className="flex items-center justify-between gap-3"><span>Barcode scanner</span><span className="font-semibold text-[var(--oh-warning)]">Keyboard probe only</span></li>
          <li className="flex items-center justify-between gap-3"><span>EFTPOS terminal</span><span className="font-semibold text-[var(--oh-warning)]">Not connected / not validated</span></li>
        </ul>
      </section>
      <div className="border-t border-[var(--oh-border)] px-1 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--oh-muted)]">Appearance</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Appearance">
          <button
            type="button"
            aria-label="Use light theme"
            aria-pressed={theme === "light"}
            onClick={() => setTheme("light")}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
              theme === "light"
                ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--brand-control)]"
                : "border-[var(--oh-border)] text-[var(--oh-text)] hover:bg-[var(--oh-surface)]",
            )}
          >
            <Sun size={17} aria-hidden="true" />
            Light
          </button>
          <button
            type="button"
            aria-label="Use dark theme"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme("dark")}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
              theme === "dark"
                ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--brand-control)]"
                : "border-[var(--oh-border)] text-[var(--oh-text)] hover:bg-[var(--oh-surface)]",
            )}
          >
            <Moon size={17} aria-hidden="true" />
            Dark
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-[var(--oh-border)] pt-3">
        <div className="grid grid-cols-2 gap-2 md:hidden" aria-label="Dashboard views">
          <Link
            href="/dashboard"
            onClick={onClose}
            aria-current={pathname === "/dashboard" ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
              pathname === "/dashboard"
                ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--brand-control)]"
                : "border-[var(--oh-border)] text-[var(--oh-text)] hover:bg-[var(--oh-surface)]",
            )}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            Radial
          </Link>
          <Link
            href="/dashboard/workspace"
            onClick={onClose}
            aria-current={pathname === "/dashboard/workspace" ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
              pathname === "/dashboard/workspace"
                ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--brand-control)]"
                : "border-[var(--oh-border)] text-[var(--oh-text)] hover:bg-[var(--oh-surface)]",
            )}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            Workspace
          </Link>
        </div>
        {onCloseRegister ? (
          <button
            type="button"
            tabIndex={open ? undefined : -1}
            onClick={() => {
              onClose();
              onCloseRegister();
            }}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <DoorClosed size={18} strokeWidth={1.5} />
            Close Register
          </button>
        ) : null}
        {onSalesHistory ? (
          <button
            type="button"
            tabIndex={open ? undefined : -1}
            onClick={() => {
              onClose();
              onSalesHistory();
            }}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <History size={18} strokeWidth={1.5} />
            Sales History
          </button>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/settings/account"
            tabIndex={open ? undefined : -1}
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)] no-underline transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <SettingsGearIcon size={18} strokeWidth={1.5} />
            Profile &amp; Security
          </Link>
          <button
            type="button"
            tabIndex={open ? undefined : -1}
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <LogOutIcon size={18} strokeWidth={1.5} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
