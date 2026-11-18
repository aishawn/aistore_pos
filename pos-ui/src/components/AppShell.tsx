"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import { OverviewChromeProvider } from "@/components/OverviewChromeContext";
import { CloseRegisterUiProvider, useCloseRegisterUi } from "@/components/CloseRegisterUiProvider";
import { SalesHistoryUiProvider, useSalesHistoryUi } from "@/components/SalesHistoryUiProvider";
import { useAuth } from "@/lib/auth";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { AiFloatHost } from "@/components/AiFloatHost";
import { LaunchRingHost } from "@/components/LaunchRingHost";
import { AiTransitionOverlay } from "@/components/AiTransitionOverlay";
import { AiAssistantProvider } from "@/lib/ai-assistant";
import { SellScreenProvider } from "@/lib/sell-screen";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import {
  controlPlaneLandingPath,
  isControlPlaneHost,
  isControlPlanePageAllowed,
  loginQueryReturnPath,
  normalizeAuthReturnPath,
  storeLandingPath,
} from "@/lib/tenant-host";

/** Routes that render standalone, without the app chrome + auth guard. */
const CHROMELESS = ["/login", "/signup", "/auth/bootstrap", "/forgot-password", "/reset-password"];

function isPlatformPath(pathname: string): boolean {
  return pathname === "/platform" || pathname.startsWith("/platform/");
}

/** Overview keeps auth/providers but hides Sidebar + Header (in-page launcher is nav). */
function isOverviewPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/overview" || pathname.startsWith("/overview/");
}

function isAssistantPath(pathname: string): boolean {
  return pathname === "/assistant" || pathname.startsWith("/assistant/");
}
const SIDEBAR_OPEN_KEY = "orithos-sidebar-open";
const ODOO_REGISTER_PATHS = new Set(["/", "/register", "/sell"]);
const subscribeToHost = () => () => {};

/** Orithos application shell — persistent sidebar + white header + content area. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout, recoverSession } = useAuth();
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const host = useSyncExternalStore(subscribeToHost, () => window.location.host, () => "");

  const localPreview =
    typeof document !== "undefined"
    && document.cookie.split(";").some((cookie) => cookie.trim() === "orithos_local_preview=1");
  const onControlPlaneHost =
    Boolean(host) && !localPreview && isControlPlaneHost(host);
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
    if (!ready) return;
    // Keep local preview sessions on their requested route even though
    // localhost is treated as the control plane for normal host routing.
    const onControlPlane = onControlPlaneHost;
    if (onControlPlane && !isControlPlanePageAllowed(pathname) && !pathname.startsWith("/api/")) {
      router.replace("/platform/stores");
      return;
    }
    if (!user && !chromeless && !sessionRecovering) {
      setSessionRecovering(true);
      void recoverSession().then((recovered) => {
        setSessionRecovering(false);
        if (recovered) return;
        const next = onControlPlane ? "/platform/stores" : loginQueryReturnPath(pathname, window.location.search);
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      });
      return;
    }
    if (user?.pendingPasswordReset && pathname !== "/settings/account") {
      router.replace("/settings/account");
      return;
    }
    if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/auth/bootstrap"
        || pathname === "/forgot-password" || pathname === "/reset-password")) {
      const next = normalizeAuthReturnPath(new URLSearchParams(window.location.search).get("next"));
      if (onControlPlane) {
        router.replace(controlPlaneLandingPath(next));
        return;
      }
      router.replace(storeLandingPath(next, user));
      return;
    }
  }, [ready, user, chromeless, pathname, router, onControlPlaneHost, recoverSession, sessionRecovering]);

  if (chromeless) {
    return <>{children}</>;
  }

  if (ready && !user && !sessionRecovering) {
    return null;
  }

  async function onLogout() {
    await logout();
    window.location.replace("/login");
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

  return (
    <UnsavedChangesProvider>
      <AiAssistantProvider>
      <CloseRegisterUiProvider>
        <SalesHistoryUiProvider>
          <AppShellChrome
            userName={user?.name || user?.username || "admin"}
            sidebarOpen={sidebarOpen}
            mobileSidebarOpen={mobileSidebarOpen}
            isMobileViewport={isMobileViewport}
            userMenuOpen={userMenuOpen}
            setUserMenuOpen={setUserMenuOpen}
            setMobileSidebarOpen={setMobileSidebarOpen}
            toggleNavigation={toggleNavigation}
            onLogout={onLogout}
            pathname={pathname}
          >
            {children}
          </AppShellChrome>
        </SalesHistoryUiProvider>
      </CloseRegisterUiProvider>
      <AiTransitionOverlay />
      </AiAssistantProvider>
    </UnsavedChangesProvider>
  );
}

/** Inner chrome so UserMenu can call close-register / sales-history hooks inside providers. */
function AppShellChrome({
  children,
  userName,
  sidebarOpen,
  mobileSidebarOpen,
  isMobileViewport,
  userMenuOpen,
  setUserMenuOpen,
  setMobileSidebarOpen,
  toggleNavigation,
  onLogout,
  pathname,
}: {
  children: React.ReactNode;
  userName: string;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  isMobileViewport: boolean;
  userMenuOpen: boolean;
  setUserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleNavigation: () => void;
  onLogout: () => void | Promise<void>;
  pathname: string;
}) {
  const { openCloseRegister } = useCloseRegisterUi();
  const { openSalesHistory } = useSalesHistoryUi();
  const hideStoreChrome = isOverviewPath(pathname) || isAssistantPath(pathname);

  const userMenu = (
    <UserMenu
      open={userMenuOpen}
      onClose={() => setUserMenuOpen(false)}
      onCloseRegister={() => {
        setUserMenuOpen(false);
        openCloseRegister();
      }}
      onSalesHistory={() => {
        setUserMenuOpen(false);
        openSalesHistory();
      }}
      onLogout={onLogout}
    />
  );

  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[var(--oh-primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
    >
      Skip to main content
    </a>
  );

  const main = (
    <main
      id="main-content"
      tabIndex={-1}
      className={`relative min-h-0 flex-1 outline-none ${
        !isOverviewPath(pathname) && !isAssistantPath(pathname)
          ? "oh-workspace-main"
          : ""
      }`}
    >
      {ODOO_REGISTER_PATHS.has(pathname) ? children : <SellScreenProvider>{children}</SellScreenProvider>}
    </main>
  );

  if (hideStoreChrome) {
    return (
      <OverviewChromeProvider
        value={{
          userName,
          userMenuOpen,
          toggleUserMenu: () => setUserMenuOpen((v) => !v),
        }}
      >
        <div className="flex h-screen overflow-hidden bg-[var(--oh-surface)] font-sans print:block print:h-auto print:overflow-visible">
          <div className="flex min-w-0 flex-1 flex-col print:w-full">
            {userMenu}
            {skipLink}
            {main}
          </div>
          <AiFloatHost />
          <LaunchRingHost />
        </div>
      </OverviewChromeProvider>
    );
  }

  return (
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
          userName={userName}
          sidebarOpen={isMobileViewport ? mobileSidebarOpen : sidebarOpen}
          userMenuOpen={userMenuOpen}
          onSidebarToggle={toggleNavigation}
          onUserClick={() => setUserMenuOpen((v) => !v)}
        />
        {userMenu}
        {skipLink}
        {main}
      </div>
      <AiFloatHost />
      <LaunchRingHost />
    </div>
  );
}
