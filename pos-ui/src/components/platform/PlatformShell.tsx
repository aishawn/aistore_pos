"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OrithosLogo } from "@/components/OrithosLogo";
import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { storeOrigin, tenantBaseDomain } from "@/lib/tenant-host";

const NAV = [
  { href: "/platform/stores", label: "Stores" },
  { href: "/signup", label: "Create store" },
] as const;

function navActive(href: string, pathname: string): boolean {
  if (href === "/platform/stores") {
    return pathname === "/platform" || pathname.startsWith("/platform/stores");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Control-plane chrome for app.* — not the store Sidebar/POS shell.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-[var(--oh-text-secondary)]">
        Loading…
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const demoLogin = `${storeOrigin("demo")}/login`;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--oh-surface)] font-sans text-[var(--oh-text)]">
      <header className="border-b border-[var(--oh-border)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <OrithosLogo compact />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--oh-text)]">Platform admin</p>
                <p className="text-xs text-[var(--oh-text-secondary)]">
                  Console · app.{tenantBaseDomain()}
                </p>
              </div>
            </div>
            <nav className="flex items-center gap-1" aria-label="Platform">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors",
                    navActive(item.href, pathname)
                      ? "bg-[var(--oh-primary)]/10 text-[var(--oh-primary)]"
                      : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--oh-text-secondary)]">
            <a
              href={demoLogin}
              className="font-semibold text-[var(--oh-primary)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open demo store
            </a>
            <span className="hidden sm:inline">{user.name || user.username}</span>
            <AdminSecondaryButton onClick={() => void onLogout()}>Sign out</AdminSecondaryButton>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
