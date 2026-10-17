"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/lib/auth";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { AiFloatHost } from "@/components/AiFloatHost";
import { AiAssistantProvider } from "@/lib/ai-assistant";
import { SellScreenProvider } from "@/lib/sell-screen";
import { MobileTopBar } from "@/components/MobileAiApp";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { clearUiMode, getUiMode, isMobileAllowedPath, type UiMode } from "@/lib/ui-mode";
import {
  controlPlaneLandingPath,
  isControlPlaneHost,
  isControlPlanePageAllowed,
  storeLandingPath,
  STORE_WEB_LANDING_PATH,
} from "@/lib/tenant-host";

/** Routes that render standalone, without the app chrome + auth guard. */
const CHROMELESS = ["/login", "/signup", "/auth/bootstrap", "/forgot-password", "/reset-password"];

function isPlatformPath(pathname: string): boolean {
  return pathname === "/platform" || pathname.startsWith("/platform/");
}
const SIDEBAR_OPEN_KEY = "orithos-sidebar-open";
const ODOO_REGISTER_PATHS = new Set(["/", "/register/odoo"]);

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const target = new URL(value, window.location.origin);
    if (
      target.origin !== window.location.origin
      || target.pathname === "/login"
      || target.pathname === "/signup"
      || target.pathname.startsWith("/auth/")
      || target.pathname === "/forgot-password"
      || target.pathname === "/reset-password"
    ) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/**
 * Orithos application shell — persistent sidebar + white header + content area.
 * Mobile sessions (`/m`) skip POS chrome and only keep the AI assistant.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [uiMode, setUiModeState] = useState<UiMode>("web");
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  const onControlPlaneHost =
    typeof window !== "undefined" && isControlPlaneHost(window.location.host);
  // Password reset must work on app.* without the store Sidebar/POS chrome.
  const chromeless =
    CHROMELESS.includes(pathname)
    || isPlatformPath(pathname)
    || (onControlPlaneHost && pathname === "/settings/account");
  const isSellPath = ODOO_REGISTER_PATHS.has(pathname);

  useEffect(() => {
    const breakpoint = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      setIsMobileViewport(breakpoint.matches);
      setMobileSidebarOpen(false);
      if (breakpoint.matches) {
        setSidebarOpen(false);
        return;
      }
      if (isSellPath) {
        // Keep the register wide on desktop; mobile navigation opens as an overlay.
        setSidebarOpen(false);
        return;
      }
      setSidebarOpen(localStorage.getItem(SIDEBAR_OPEN_KEY) !== "false");
    };
    syncViewport();
    breakpoint.addEventListener("change", syncViewport);
    return () => breakpoint.removeEventListener("change", syncViewport);
  }, [isSellPath]);

  useDialogFocus(mobileSidebarOpen && isMobileViewport, () => setMobileSidebarOpen(false), "mobile-navigation");

  useLayoutEffect(() => {
    const mode = getUiMode();
    setUiModeState(mode);
    if (!ready) return;
    const onControlPlane = isControlPlaneHost(window.location.host);
    if (onControlPlane && !isControlPlanePageAllowed(pathname) && !pathname.startsWith("/api/")) {
      router.replace("/platform/stores");
      return;
    }
    if (!user && !chromeless) {
      const next = onControlPlane ? "/platform/stores" : `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (user?.pendingPasswordReset && pathname !== "/settings/account") {
      router.replace("/settings/account");
      return;
    }
    if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/auth/bootstrap"
        || pathname === "/forgot-password" || pathname === "/reset-password")) {
      const next = safeInternalPath(new URLSearchParams(window.location.search).get("next"));
      if (onControlPlane) {
        router.replace(controlPlaneLandingPath(next));
        return;
      }
      router.replace(storeLandingPath(next, mode));
      return;
    }
    if (onControlPlane) {
      return;
    }
    if (user && mode === "mobile" && !isMobileAllowedPath(pathname) && pathname !== "/login") {
      router.replace("/m");
      return;
    }
    if (user && mode !== "mobile" && pathname === "/m") {
      router.replace(STORE_WEB_LANDING_PATH);
    }
  }, [ready, user, chromeless, pathname, router]);

  if (chromeless) {
    return <>{children}</>;
  }

  if (ready && !user) {
    return null;
  }

  async function onLogout() {
    await logout();
    clearUiMode();
    router.replace("/login");
  }

  function toggleNavigation() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileSidebarOpen((value) => !value);
      return;
    }
    setSidebarOpen((value) => {
      const next = !value;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(next));
      return next;
    });
  }

  if (!user?.pendingPasswordReset && (pathname === "/m" || (uiMode === "mobile" && isMobileAllowedPath(pathname)))) {
    if (!user) {
      return null;
    }
    const onAiHome = pathname === "/m";
    return (
      <UnsavedChangesProvider>
      <SellScreenProvider>
      <AiAssistantProvider defaultExpanded={false}>
        <div className="flex h-dvh flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
          <MobileTopBar backHref={onAiHome ? undefined : "/m"} />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[var(--oh-primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to main content
          </a>
          <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden outline-none">
            {children}
          </main>
          <AiFloatHost />
        </div>
      </AiAssistantProvider>
      </SellScreenProvider>
      </UnsavedChangesProvider>
    );
  }

  return (
    <UnsavedChangesProvider>
      <AiAssistantProvider>
    <div className="flex h-screen overflow-hidden bg-[var(--oh-surface)] font-sans print:block print:h-auto print:overflow-visible">
      <Sidebar
        open={!isMobileViewport && sidebarOpen}
        mobileOpen={mobileSidebarOpen}
        onNavigate={() => setMobileSidebarOpen(false)}
      />
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 cursor-default bg-slate-950/30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col print:w-full">
        <Header
          userName={user?.name || user?.username || "admin"}
          sidebarOpen={isMobileViewport ? mobileSidebarOpen : sidebarOpen}
          userMenuOpen={userMenuOpen}
          onSidebarToggle={toggleNavigation}
          onUserClick={() => setUserMenuOpen((v) => !v)}
        />
        <UserMenu
          open={userMenuOpen}
          onClose={() => setUserMenuOpen(false)}
          onLogout={onLogout}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[var(--oh-primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 outline-none">
          {ODOO_REGISTER_PATHS.has(pathname) ? children : <SellScreenProvider>{children}</SellScreenProvider>}
        </main>
      </div>
      <AiFloatHost />
    </div>
      </AiAssistantProvider>
    </UnsavedChangesProvider>
  );
}
