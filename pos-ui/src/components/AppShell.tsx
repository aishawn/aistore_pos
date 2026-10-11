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
      router.replace("/login");
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

  if (pathname === "/m" || (uiMode === "mobile" && isMobileAllowedPath(pathname))) {
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
    <SellScreenProvider>
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
          {children}
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
    </SellScreenProvider>
    </UnsavedChangesProvider>
  );
}
