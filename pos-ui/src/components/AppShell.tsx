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
import { clearUiMode, getUiMode, isMobileAllowedPath, type UiMode } from "@/lib/ui-mode";

/** Routes that render standalone, without the app chrome + auth guard. */
const CHROMELESS = ["/login"];
const SIDEBAR_OPEN_KEY = "orithos-sidebar-open";
const ODOO_REGISTER_PATH = "/register/odoo";

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname === "/login") return null;
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
  const [uiMode, setUiModeState] = useState<UiMode>("web");
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  const chromeless = CHROMELESS.includes(pathname);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (stored !== null) {
      setSidebarOpen(stored === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useLayoutEffect(() => {
    const mode = getUiMode();
    setUiModeState(mode);
    if (!ready) return;
    if (!user && !chromeless) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (user?.pendingPasswordReset && pathname !== "/settings/account") {
      router.replace("/settings/account");
      return;
    }
    if (user && pathname === "/login") {
      const next = safeInternalPath(new URLSearchParams(window.location.search).get("next"));
      router.replace(next ?? (mode === "mobile" ? "/m" : "/"));
      return;
    }
    if (user && mode === "mobile" && !isMobileAllowedPath(pathname) && pathname !== "/login") {
      router.replace("/m");
      return;
    }
    if (user && mode !== "mobile" && pathname === "/m") {
      router.replace("/");
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
          <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
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
      <Sidebar open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col print:w-full">
        <Header
          userName={user?.name ?? "Mennru"}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((v) => !v)}
          onUserClick={() => setUserMenuOpen((v) => !v)}
        />
        <div className="relative min-h-0 flex-1">
          {pathname === ODOO_REGISTER_PATH ? children : <SellScreenProvider>{children}</SellScreenProvider>}
          <UserMenu
            open={userMenuOpen}
            onClose={() => setUserMenuOpen(false)}
            onLogout={onLogout}
          />
        </div>
      </div>
      <AiFloatHost />
    </div>
      </AiAssistantProvider>
    </UnsavedChangesProvider>
  );
}
