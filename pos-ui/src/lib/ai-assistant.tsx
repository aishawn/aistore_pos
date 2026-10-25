"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";

export type AiTransitionState = "idle" | "entering" | "leaving";
export type AiTransitionSource = "center" | "ai-bar" | null;
export type AiTransitionOrigin = { x: number; y: number; size?: number } | null;
export type AiTransitionPhase = "idle" | "charging" | "expanding" | "unfolding" | "waiting" | "revealing" | "leaving";
export const AI_TRANSITION_TIMING = { charge: 160, expand: 480, unfold: 900, navigate: 1020, reveal: 180, timeout: 5000 } as const;

type AiAssistantContextValue = {
  takePendingQuestion: () => string | null;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  /** @deprecated Kept for compatibility; chat-only panel ignores mode. */
  launchMode: "search" | "dialogue" | null;
  openAssistant: (opts?: { mode?: "search" | "dialogue" }) => void;
  clearLaunchMode: () => void;
  transitionState: AiTransitionState;
  transitionSource: AiTransitionSource;
  transitionOrigin: AiTransitionOrigin;
  transitionPhase: AiTransitionPhase;
  transitionError: string | null;
  notifyAssistantReady: () => void;
  startAssistantTransition: (source: Exclude<AiTransitionSource, null>, origin?: AiTransitionOrigin, question?: string) => void;
  startAssistantExit: () => void;
  finishAssistantTransition: () => void;
  cancelAssistantTransition: () => void;
};

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({
  children,
  defaultExpanded = false,
}: {
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const pendingQuestion = useRef<string | null>(null);
  const takePendingQuestion = useCallback(() => {
    const question = pendingQuestion.current;
    pendingQuestion.current = null;
    return question;
  }, []);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [launchMode, setLaunchMode] = useState<"search" | "dialogue" | null>(null);
  const [transitionState, setTransitionState] = useState<AiTransitionState>("idle");
  const [transitionSource, setTransitionSource] = useState<AiTransitionSource>(null);
  const [transitionOrigin, setTransitionOrigin] = useState<AiTransitionOrigin>(null);
  const [transitionPhase, setTransitionPhase] = useState<AiTransitionPhase>("idle");
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const transitionStateRef = useRef<AiTransitionState>("idle");
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const startedAt = useRef(0);
  const ready = useRef(false);
  const reduced = useRef(false);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const finishAssistantTransition = useCallback(() => {
    clearTimers();
    transitionStateRef.current = "idle";
    ready.current = false;
    setTransitionState("idle");
    setTransitionPhase("idle");
    setTransitionSource(null);
    setTransitionOrigin(null);
  }, [clearTimers]);
  const notifyAssistantReady = useCallback(() => {
    if (transitionStateRef.current !== "entering" || ready.current) return;
    ready.current = true;
    const earliest = reduced.current ? 80 : AI_TRANSITION_TIMING.navigate;
    schedule(() => {
      if (transitionStateRef.current !== "entering") return;
      // Mount readiness, not an AI/network response, unlocks the final reveal.
      clearTimers();
      setTransitionPhase("revealing");
      schedule(finishAssistantTransition, reduced.current ? 80 : AI_TRANSITION_TIMING.reveal);
    }, Math.max(0, earliest - (performance.now() - startedAt.current)));
  }, [clearTimers, finishAssistantTransition, schedule]);

  const openAssistant = useCallback((opts?: { mode?: "search" | "dialogue" }) => {
    setLaunchMode(opts?.mode ?? null);
    setExpanded(true);
  }, []);

  const clearLaunchMode = useCallback(() => setLaunchMode(null), []);
  const startAssistantTransition = useCallback((source: Exclude<AiTransitionSource, null>, origin?: AiTransitionOrigin, question?: string) => {
    if (transitionStateRef.current !== "idle") return;
    pendingQuestion.current = question ?? null;
    clearTimers();
    const node = document.querySelector<HTMLElement>(".ov-radial-area .ov-ring-center");
    const rect = node?.getBoundingClientRect();
    setTransitionSource(source);
    setTransitionOrigin(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: Math.min(rect.width, rect.height) } : origin ?? null);
    transitionStateRef.current = "entering";
    ready.current = false;
    startedAt.current = performance.now();
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTransitionError(null);
    setTransitionState("entering");
    setTransitionPhase("charging");
    const fail = () => {
      finishAssistantTransition();
      setTransitionError("Orithos AI could not open. Please try again.");
      node?.focus({ preventScroll: true });
    };
    try { router.prefetch("/assistant"); } catch { /* Navigation can still succeed without prefetch. */ }
    if (!reduced.current) {
      schedule(() => setTransitionPhase("expanding"), AI_TRANSITION_TIMING.charge);
      schedule(() => setTransitionPhase("unfolding"), AI_TRANSITION_TIMING.expand);
      schedule(() => setTransitionPhase("waiting"), AI_TRANSITION_TIMING.unfold);
    }
    schedule(() => { try { router.push("/assistant"); } catch { fail(); } }, reduced.current ? 80 : AI_TRANSITION_TIMING.navigate);
    schedule(fail, AI_TRANSITION_TIMING.timeout);
  }, [clearTimers, finishAssistantTransition, router, schedule]);
  const startAssistantExit = useCallback(() => {
    if (transitionStateRef.current !== "idle") return;
    clearTimers();
    setTransitionSource("center");
    setTransitionOrigin(null);
    transitionStateRef.current = "leaving";
    setTransitionState("leaving");
    setTransitionPhase("leaving");
    schedule(finishAssistantTransition, AI_TRANSITION_TIMING.timeout);
  }, [clearTimers, finishAssistantTransition, schedule]);
  const cancelAssistantTransition = useCallback(() => {
    pendingQuestion.current = null;
    finishAssistantTransition();
  }, [finishAssistantTransition]);

  const value = useMemo(
    () => ({ takePendingQuestion, expanded, setExpanded, launchMode, openAssistant, clearLaunchMode, transitionState, transitionSource, transitionOrigin, transitionPhase, transitionError, notifyAssistantReady, startAssistantTransition, startAssistantExit, finishAssistantTransition, cancelAssistantTransition }),
    [takePendingQuestion, expanded, launchMode, openAssistant, clearLaunchMode, transitionState, transitionSource, transitionOrigin, transitionPhase, transitionError, notifyAssistantReady, startAssistantTransition, startAssistantExit, finishAssistantTransition, cancelAssistantTransition],
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
