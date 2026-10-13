"use client";

import Link from "next/link";
import {
  SettingsGearIcon,
  LogOutIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Orithos header user menu — right slide-in panel opened from the top bar avatar.
 * Profile shortcuts and logout only (theme toggle hidden until dark mode is wired).
 */
export function UserMenu({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout?: () => void;
}) {
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black transition-opacity duration-200 ease-in-out",
          open ? "opacity-15" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-label="User menu"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-0 right-0 top-[50px] z-50 flex w-screen max-w-[90%] flex-col bg-white shadow-md",
          "transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] md:w-[360px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex-1 overflow-auto px-8 py-6">
          <p className="text-sm leading-6 text-[var(--oh-muted)]">
            Account settings and sign-out for this workstation.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--oh-border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-center">
          <Link
            href="/settings/account"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--oh-primary)] px-4 py-2 text-sm font-bold text-[var(--oh-primary)] no-underline transition-colors hover:bg-[var(--oh-primary)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <SettingsGearIcon size={18} strokeWidth={1.5} />
            Profile &amp; Security
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--oh-primary)] bg-[var(--oh-primary)] px-4 py-2 text-sm font-bold tracking-wide text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <LogOutIcon size={18} strokeWidth={1.5} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
