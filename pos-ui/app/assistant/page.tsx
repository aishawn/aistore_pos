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
  const { setExpanded } = useAiAssistant();

  useEffect(() => {
    setExpanded(true);
    return () => setExpanded(false);
  }, [setExpanded]);

  const onRequestClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/overview");
  }, [router]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <SellAiPanel
        expanded
        onExpandedChange={(next) => {
          setExpanded(next);
        }}
        presentation="page"
        launcherVisible={false}
        onRequestClose={onRequestClose}
      />
    </div>
  );
}
