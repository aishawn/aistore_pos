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
  { href: "/platform/demo-reset", label: "Demo sandbox" },
  { href: "/platform/usage", label: "AI usage" },
  { href: "/platform/operations", label: "Operations" },
  { href: "/platform/failures", label: "Failures" },
  { href: "/platform/audit", label: "Audit" },
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
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
        <OrithosLogo />
        <section role="alert" className="space-y-3">
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Your session could not be loaded</h1>
          <p className="text-sm text-[var(--oh-text-secondary)]">Try again, or sign in to open the admin console.</p>
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <AdminSecondaryButton onClick={() => window.location.reload()}>Retry</AdminSecondaryButton>
          <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--oh-primary)] hover:underline">Sign in</Link>
        </div>
      </main>
    );
  }

  if (!user.platformOperator) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
        <OrithosLogo />
        <h1 className="text-xl font-semibold text-[var(--oh-text)]">Platform admin required</h1>
        <p className="text-sm text-[var(--oh-text-secondary)]">
          This console lists every store. Sign in with a platform operator account
          on app.{tenantBaseDomain()} (not a store owner from the brand signup form).
        </p>
        <Link href="/login" className="text-sm font-semibold text-[var(--oh-primary)] hover:underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  const demoLogin = `${storeOrigin("demo")}/login`;

  return (
    <div className="oh-workspace-main flex min-h-dvh flex-col font-sans text-[var(--oh-text)]">
      <header className="border-b border-[var(--oh-border)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex"><OrithosLogo /></span>
              <span className="inline-flex sm:hidden"><OrithosLogo compact /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--oh-text)]">Platform admin</p>
                <p className="text-xs text-[var(--oh-text-secondary)]">
                  All stores · app.{tenantBaseDomain()}
                </p>
              </div>
            </div>
            <nav className="flex min-w-0 max-w-full shrink items-center gap-1 overflow-x-auto" aria-label="Platform">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors",
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
