"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SellAiPanel } from "@/components/SellAiPanel";
import { useAiAssistant } from "@/lib/ai-assistant";
import { getUiMode } from "@/lib/ui-mode";
import { showsFloatingAiLauncher } from "@/lib/ai-entry-placement";

/**
 * AppShell mounts this host only on signed-in store pages.
 * Login, signup, and the platform control plane never reach it.
 */
export function shouldShowAiFloat(pathname = ""): boolean {
  return showsFloatingAiLauncher(pathname);
}

const ASSISTANT_PATH = "/assistant";

/** Global floating AI host — every store-shell route. */
export function AiFloatHost() {
  const pathname = usePathname();
  const router = useRouter();
  const { expanded, setExpanded } = useAiAssistant();
  const onAssistantRoute = pathname === ASSISTANT_PATH;

  useEffect(() => {
    if (getUiMode() === "mobile" && pathname === "/m") {
      setExpanded(false);
      return;
    }
    if (onAssistantRoute) {
      setExpanded(true);
    }
  }, [pathname, onAssistantRoute, setExpanded]);

  const onRequestClose = useCallback(() => {
    if (!onAssistantRoute) return;
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/overview");
  }, [onAssistantRoute, router]);

  return (
    <SellAiPanel
      expanded={expanded}
      onExpandedChange={setExpanded}
      launcherVisible={shouldShowAiFloat(pathname) && !onAssistantRoute}
      forceFullscreen={onAssistantRoute}
      onRequestClose={onAssistantRoute ? onRequestClose : undefined}
    />
  );
}
