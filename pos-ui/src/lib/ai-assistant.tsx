"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type AiAssistantContextValue = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  /** @deprecated Kept for compatibility; chat-only panel ignores mode. */
  launchMode: "search" | "dialogue" | null;
  openAssistant: (opts?: { mode?: "search" | "dialogue" }) => void;
  clearLaunchMode: () => void;
};

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({
  children,
  defaultExpanded = false,
}: {
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [launchMode, setLaunchMode] = useState<"search" | "dialogue" | null>(null);

  const openAssistant = useCallback((opts?: { mode?: "search" | "dialogue" }) => {
    setLaunchMode(opts?.mode ?? null);
    setExpanded(true);
  }, []);

  const clearLaunchMode = useCallback(() => setLaunchMode(null), []);

  const value = useMemo(
    () => ({ expanded, setExpanded, launchMode, openAssistant, clearLaunchMode }),
    [expanded, launchMode, openAssistant, clearLaunchMode],
  );

  return (
    <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>
  );
}

export function useAiAssistant(): AiAssistantContextValue {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) {
    throw new Error("useAiAssistant must be used within AiAssistantProvider");
  }
  return ctx;
}

export function useOptionalAiAssistant(): AiAssistantContextValue | null {
  return useContext(AiAssistantContext);
}
