"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon, LogOutIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { clearUiMode } from "@/lib/ui-mode";

/** Slim phone chrome around the shared floating AI dialog / report page. */
export function MobileTopBar({ backHref }: { backHref?: string }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    clearUiMode();
    router.replace("/login");
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-header-bg)] px-3">
      {backHref ? (
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
        >
          <ArrowLeftIcon size={16} />
          Back
        </button>
      ) : (
        <p className="truncate text-[13px] font-medium text-[var(--oh-text-secondary)]">
          {user?.name ?? "Orithos"}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onLogout()}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
      >
        <LogOutIcon size={16} />
        Log out
      </button>
    </header>
  );
}

/** Phone home: the shared SellAiPanel float is mounted by AppShell. */
export function MobileAiApp() {
  return <div className="h-full bg-[var(--oh-surface)]" />;
}
