"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { SettingsGearIcon, LogOutIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Compact account popover anchored to the application header. */
export function UserMenu({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout?: () => void;
}) {
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-user-menu-trigger]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <aside
      ref={menuRef}
      id="user-menu"
      role="dialog"
      aria-label="User menu"
      aria-hidden={!open}
      className={cn(
        "fixed right-3 top-[56px] z-[60] w-[min(320px,calc(100vw-24px))] origin-top-right rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-xl",
        "transition-[opacity,transform] duration-150 ease-out",
        open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[.98] opacity-0",
      )}
    >
      <p className="px-1 pb-3 text-sm leading-5 text-[var(--oh-muted)]">
        Account settings and sign-out for this workstation.
      </p>
      <div className="flex flex-col gap-2 border-t border-[var(--oh-border)] pt-3 sm:flex-row">
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
    </aside>
  );
}
