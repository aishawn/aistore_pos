"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SellAiPanel } from "@/components/SellAiPanel";
import { useAiAssistant } from "@/lib/ai-assistant";
import { getUiMode } from "@/lib/ui-mode";

/**
 * AppShell mounts this host only on signed-in store pages.
 * Login, signup, and the platform control plane never reach it.
 */
export function shouldShowAiFloat(): boolean {
  return true;
}

/** Global floating AI host — every store-shell route. */
export function AiFloatHost() {
  const pathname = usePathname();
  const { expanded, setExpanded } = useAiAssistant();

  useEffect(() => {
    if (getUiMode() === "mobile" && pathname === "/m") {
      setExpanded(false);
    }
    if (pathname === "/reports/dashboard") {
      setExpanded(false);
    }
  }, [pathname, setExpanded]);

  if (!shouldShowAiFloat()) return null;

  return (
    <SellAiPanel
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
