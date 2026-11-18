"use client";

import { usePathname } from "next/navigation";
import { SellAiPanel } from "@/components/SellAiPanel";
import { useAiAssistant } from "@/lib/ai-assistant";
import { showsFloatingAiLauncher } from "@/lib/ai-entry-placement";

/**
 * AppShell mounts this host only on signed-in store pages.
 * Login, signup, and the platform control plane never reach it.
 */
export function shouldShowAiFloat(pathname = ""): boolean {
  return showsFloatingAiLauncher(pathname);
}

const ASSISTANT_PATH = "/assistant";

/** Global floating AI host — every store-shell route except /assistant (page owns chat). */
export function AiFloatHost() {
  const pathname = usePathname();
  const { expanded, setExpanded } = useAiAssistant();
  const onAssistantRoute = pathname === ASSISTANT_PATH;

  // Dedicated /assistant page renders SellAiPanel inline so Sidebar stays visible.
  if (onAssistantRoute) {
    return null;
  }

  return (
    <SellAiPanel
      expanded={expanded}
      onExpandedChange={setExpanded}
    launcherVisible={shouldShowAiFloat(pathname) && !pathname.startsWith("/reports") && pathname !== "/dashboard" && !pathname.startsWith("/dashboard/") && pathname !== "/overview" && !pathname.startsWith("/overview/")}
    />
  );
}
