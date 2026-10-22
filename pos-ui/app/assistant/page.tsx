"use client";

import { useEffect } from "react";
import { useAiAssistant } from "@/lib/ai-assistant";

/**
 * Dedicated Orithos AI dialogue route. Chat UI is the global SellAiPanel
 * (forced fullscreen via AiFloatHost); this page only opens the panel.
 */
export default function AssistantPage() {
  const { setExpanded } = useAiAssistant();

  useEffect(() => {
    setExpanded(true);
  }, [setExpanded]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--oh-muted)]">
      <p className="sr-only">Orithos AI assistant is open.</p>
    </div>
  );
}
