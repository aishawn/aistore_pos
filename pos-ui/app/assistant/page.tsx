"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SellAiPanel } from "@/components/SellAiPanel";
import { useAiAssistant } from "@/lib/ai-assistant";

/**
 * Dedicated Orithos AI dialogue page — chat fills main beside the store Sidebar.
 */
export default function AssistantPage() {
  const router = useRouter();
  const { setExpanded, startAssistantExit, notifyAssistantReady } = useAiAssistant();

  useEffect(() => {
    setExpanded(true);
    notifyAssistantReady();
    return () => setExpanded(false);
  }, [setExpanded, notifyAssistantReady]);

  const onRequestClose = useCallback(() => {
    startAssistantExit();
    window.setTimeout(() => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
      router.replace("/dashboard");
    }, 180);
  }, [router, startAssistantExit]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <SellAiPanel
        expanded
        onExpandedChange={(next) => {
          setExpanded(next);
        }}
        presentation="page"
        workspace
        launcherVisible={false}
        onRequestClose={onRequestClose}
      />
    </div>
  );
}
