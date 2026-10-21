"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Eraser, ExternalLink, History, MessageCircle, Mic, Send, X } from "lucide-react";
import { cn, formatReportColumnHeader } from "@/lib/utils";
import {
  askAssistant,
  fetchAiChatThread,
  fetchAiChatThreads,
  fetchAiClientConfig,
  transcribeAudio,
  ApiError,
  type AiChatThreadSummary,
  type AssistantResponse,
} from "@/lib/api";
import {
  executeEntityDelete,
  resolveEntityAction,
  type PendingEntityDelete,
} from "@/lib/ai-entity-actions";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { AiFabIcon } from "@/components/AiFabIcon";
import { useOptionalAiAssistant } from "@/lib/ai-assistant";
import { useOptionalSellScreen, type LeftView } from "@/lib/sell-screen";
import { getUiMode, isMobileAllowedHref } from "@/lib/ui-mode";
import {
  canUseMediaRecorder,
  startMediaRecording,
  type VoiceEndpointPhase,
} from "@/lib/voice";

const FLOAT_SHADOW =
  "0 4px 24px rgba(37, 99, 235, 0.10), 0 1px 4px rgba(15, 23, 42, 0.06)";
const FLOAT_POS_KEY = "orithos-ai-float-anchor";
const DRAG_THRESHOLD_PX = 6;

type FloatAnchor = { x: number; y: number };

function defaultAnchor(): FloatAnchor {
  if (typeof window === "undefined") return { x: 88, y: 88 };
  const bottomInset = window.matchMedia("(max-width: 767px)").matches ? 88 : 24;
  return { x: window.innerWidth - 24, y: window.innerHeight - bottomInset };
}

function loadAnchor(): FloatAnchor {
  try {
    const raw = sessionStorage.getItem(FLOAT_POS_KEY);
    if (!raw) return defaultAnchor();
    const parsed = JSON.parse(raw) as FloatAnchor;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
  } catch {
    /* ignore */
  }
  return defaultAnchor();
}

function clampAnchor(anchor: FloatAnchor, width: number, height: number): FloatAnchor {
  const margin = 8;
  const minX = width + margin;
  const minY = height + margin;
  const maxX = Math.max(minX, window.innerWidth - margin);
  const maxY = Math.max(minY, window.innerHeight - margin);
  return {
    x: Math.min(Math.max(minX, anchor.x), maxX),
    y: Math.min(Math.max(minY, anchor.y), maxY),
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  table?: { columns: string[]; rows: Record<string, unknown>[] } | null;
  reportId?: number | null;
  diagnostics?: {
    intent: string;
    latencyMs: number;
    status: "ok" | "error";
  };
}

const ENABLED_GREETING =
  "Hi, I'm the Orithos AI assistant. Ask about sales or stock, or try restock suggestions, price reviews, wine matches, or invoice capture.";
const DISABLED_GREETING =
  "AI chat is off for this store. The shortcuts below still open the right page.";

function greetingText(enabled: boolean | null): string {
  return enabled === false ? DISABLED_GREETING : ENABLED_GREETING;
}

function isStockGreeting(text: string): boolean {
  return text === ENABLED_GREETING || text === DISABLED_GREETING;
}

function aiFailureMessage(error: unknown, mode: "chat" | "voice"): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Your session has expired. Sign in again to use the assistant.";
  }
  if (
    error instanceof ApiError &&
    (error.code === 50301 || error.status === 503)
  ) {
    return mode === "voice"
      ? "AI voice transcription is not enabled for this store. Type your request instead."
      : "The AI assistant is not enabled for this store. Contact your administrator. Product search and checkout are still available.";
  }
  if (error instanceof ApiError && error.code === 50210) {
    return mode === "voice"
      ? "No clear speech was detected. Speak for a moment, then pause briefly and try again."
      : "The AI assistant is temporarily unavailable. Check the AI configuration and try again.";
  }
  return mode === "voice"
    ? "Voice transcription could not reach the assistant. Check your connection or type your request instead."
    : "The assistant could not connect. Check your connection and try again.";
}

const QUICK_ACTIONS = [
  "Today's sales",
  "What should I restock?",
  "Which prices should I review?",
  "Recommend a red wine under $30",
  "Scan this supplier invoice",
  "Products",
  "Check stock",
];

const SELL_VIEWS = new Set<LeftView>(["keys", "parked", "customers", "promotions", "products"]);
const DISPATCHABLE_AI_INTENTS = new Set([
  "navigate",
  "sale_action",
  "search_customer",
  "search_product",
  "entity_action",
  "report_sales",
  "report_qty",
  "report_aov",
  "report_stock",
  "report_dead_stock",
  "report_adhoc",
]);

interface SellAiPanelProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  launcherVisible?: boolean;
}

/** Sell page AI chat panel — intent → frontend dispatcher. */
export function SellAiPanel({
  expanded,
  onExpandedChange,
  launcherVisible = true,
}: SellAiPanelProps) {
  const mobileOnly = getUiMode() === "mobile";
  const sell = useOptionalSellScreen();
  const ai = useOptionalAiAssistant();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: ENABLED_GREETING },
  ]);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinkingHint, setThinkingHint] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyThreads, setHistoryThreads] = useState<AiChatThreadSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [transcriptionAvailable, setTranscriptionAvailable] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingEntityDelete, setPendingEntityDelete] = useState<PendingEntityDelete | null>(null);
  const [entityDeleteBusy, setEntityDeleteBusy] = useState(false);
  const entityDeleteBusyRef = useRef(false);
  const [voiceAlert, setVoiceAlert] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const voiceStopRef = useRef<(() => void) | null>(null);
  const voiceSessionRef = useRef(0);
  const voicePressedRef = useRef(false);
  const floatRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<FloatAnchor>(defaultAnchor);
  const [dragging, setDragging] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const restoreFabRef = useRef(false);

  useDialogFocus(expanded, collapsePanel, "assistant", inputRef);

  useEffect(() => {
    if (expanded) {
      if (restoreFabRef.current || restoreFocusRef.current) return;
      const activeElement = document.activeElement;
      restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      return;
    }
    const trigger = restoreFocusRef.current;
    const restoreFab = restoreFabRef.current;
    restoreFocusRef.current = null;
    restoreFabRef.current = false;
    if (!trigger && !restoreFab) return;
    const frame = window.requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      } else if (restoreFab) {
        document.querySelector<HTMLElement>('[aria-label="Open Orithos AI"]')?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  function openWorkspace(href: string, note: string) {
    pushAssistantNote(note);
    collapsePanel();
    router.push(href);
  }

  function applySellView(view: LeftView) {
    if (mobileOnly) {
      if (view === "products") {
        openWorkspace("/products", "Opened products.");
        return;
      }
      if (view === "keys" || view === "parked") {
        openWorkspace("/", "Opened the sell screen.");
        return;
      }
      pushAssistantNote("This is available in the WEB app.");
      return;
    }
    if (sell) {
      sell.setView(view);
      return;
    }
    if (view === "customers") router.push("/customers");
    else if (view === "products") router.push("/products");
    else if (view === "promotions") router.push("/promotions");
    else router.push("/");
  }

  function tryLocalWorkspaceIntent(text: string): boolean {
    const t = text.trim();
    const productWithQuery = t.match(/^(?:查询产品|查找产品|产品查询)\s+(.+)$/);
    if (productWithQuery) {
      openProductLookup(productWithQuery[1]);
      return true;
    }
    const stockWithQuery = t.match(/^(?:查询库存|查看库存|库存查询)\s+(.+)$/);
    if (stockWithQuery) {
      openStockLookup(stockWithQuery[1]);
      return true;
    }
    if (
      /^(进入收银界面|进入收银|打开收银|收银界面|open\s*(the\s*)?(sell|cashier|register)(\s*screen)?|open\s*sell)$/i.test(
        t,
      )
    ) {
      openWorkspace("/", "Opened the sell screen.");
      return true;
    }
    if (/^(查询产品|查找产品|产品查询|look\s*up\s*products?|search\s*products?)$/i.test(t)) {
      openWorkspace("/products", "Opened products.");
      return true;
    }
    if (
      /^(查询库存|查看库存|库存查询|check\s*(stock|inventory)|stock\s*list|check\s*stock)$/i.test(
        t,
      )
    ) {
      openStockLookup("");
      return true;
    }
    return false;
  }

  useEffect(() => {
    setMounted(true);
    setAnchor(loadAnchor());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    function reclamp() {
      const el = floatRef.current;
      if (!el) return;
      setAnchor((prev) => {
        const next = clampAnchor(prev, el.offsetWidth, el.offsetHeight);
        sessionStorage.setItem(FLOAT_POS_KEY, JSON.stringify(next));
        return next;
      });
    }
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [mounted, expanded]);

  function beginDrag(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: anchor.x,
      origY: anchor.y,
      moved: false,
    };
  }

  function onDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    suppressClickRef.current = true;
    setDragging(true);
    const el = floatRef.current;
    const w = el?.offsetWidth ?? 72;
    const h = el?.offsetHeight ?? 72;
    setAnchor(clampAnchor({ x: drag.origX + dx, y: drag.origY + dy }, w, h));
  }

  function endDrag(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    dragRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (moved) {
      requestAnimationFrame(() => {
        const el = floatRef.current;
        if (!el) return;
        setAnchor((prev) => {
          const next = clampAnchor(prev, el.offsetWidth, el.offsetHeight);
          sessionStorage.setItem(FLOAT_POS_KEY, JSON.stringify(next));
          return next;
        });
      });
    }
    return moved;
  }

  function onFabClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    restoreFabRef.current = true;
    restoreFocusRef.current = null;
    openPanel();
  }

  function onMinimizeClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    collapsePanel();
  }

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (expanded && aiEnabled !== false) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [expanded, aiEnabled]);

  useEffect(() => {
    let cancelled = false;
    void fetchAiClientConfig()
      .then((config) => {
        if (cancelled) return;
        // Chat needs the graph bean, not only AI_ENABLED. Older backends omit assistantAvailable.
        const chatOn = config.assistantAvailable ?? config.enabled;
        setAiEnabled(chatOn);
        // Voice has its own provider capability. Do not expose a microphone when chat works
        // but transcription is unavailable or misconfigured.
        setTranscriptionAvailable(config.transcriptionAvailable ?? config.enabled);
        setMessages((prev) => {
          if (prev.length !== 1 || prev[0]?.role !== "assistant" || !isStockGreeting(prev[0].text)) {
            return prev;
          }
          const next = greetingText(chatOn);
          if (prev[0].text === next) return prev;
          return [{ role: "assistant", text: next }];
        });
      })
      .catch(() => {
        // Config failed: do not leave voice in an ambiguous loading state that
        // still looks clickable. Chat errors surface on the first message send.
        if (!cancelled) {
          setTranscriptionAvailable(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!expanded || !ai?.launchMode) return;
    ai.clearLaunchMode();
  }, [expanded, ai]);

  useEffect(() => {
    return () => {
      voiceStopRef.current?.();
      voiceStopRef.current = null;
    };
  }, []);

  function openPanel() {
    onExpandedChange(true);
  }

  function collapsePanel() {
    // The panel can lose activeElement during Escape dispatch or portal teardown.
    // Restore the actual launcher that opened it, including the desktop header entry.
    if (!document.activeElement?.closest('[role="dialog"]')) {
      restoreFocusRef.current = null;
      restoreFabRef.current = false;
    }
    onExpandedChange(false);
    stopVoiceCapture();
  }

  function stopVoiceCapture() {
    voicePressedRef.current = false;
    voiceSessionRef.current += 1;
    voiceStopRef.current?.();
    voiceStopRef.current = null;
    setListening(false);
    setVoiceStatus(null);
  }

  function pushAssistantNote(text: string) {
    setMessages((prev) => [...prev, { role: "assistant", text }]);
  }

  function runSellAction(action: string) {
    if (mobileOnly) {
      pushAssistantNote(`Sell action “${action}” is available in the WEB app.`);
      return;
    }
    if (sell) {
      sell.runAction(action);
      return;
    }
    pushAssistantNote(`Open the Sell screen to run "${action}".`);
    router.push("/");
  }

  function clearChat() {
    if (busy || busyRef.current) return;
    setMessages([{ role: "assistant", text: greetingText(aiEnabled) }]);
    setThreadId(null);
    setHistoryOpen(false);
  }

  async function openHistory() {
    if (busy || busyRef.current) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryThreads(await fetchAiChatThreads());
    } catch (e) {
      setHistoryError(aiFailureMessage(e, "chat"));
      setHistoryThreads([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadHistoryThread(id: number) {
    if (busy || busyRef.current) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const detail = await fetchAiChatThread(id);
      const restored: ChatMessage[] = detail.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          text: m.text || "",
          diagnostics: m.role === "assistant" && m.intent
            ? { intent: m.intent, latencyMs: 0, status: "ok" as const }
            : undefined,
        }));
      setMessages(
        restored.length
          ? restored
          : [{ role: "assistant", text: greetingText(aiEnabled) }],
      );
      setThreadId(detail.sessionKey);
      setHistoryOpen(false);
    } catch (e) {
      setHistoryError(aiFailureMessage(e, "chat"));
    } finally {
      setHistoryLoading(false);
    }
  }

  function lockAndClearInput() {
    setInput("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.blur();
    }
  }

  async function submitInput() {
    const trimmed = input.trim();
    if (!trimmed || busy || busyRef.current || aiEnabled === false) return;
    await runIntent(trimmed);
  }

  async function runIntent(text: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setThinkingHint(null);
    lockAndClearInput();
    setMessages((prev) => [...prev, { role: "user", text }]);
    if (tryLocalWorkspaceIntent(text)) {
      busyRef.current = false;
      setBusy(false);
      setThinkingHint(null);
      return;
    }
    const startedAt = performance.now();
    const hintTimers: number[] = [
      window.setTimeout(() => setThinkingHint("Still working on your question…"), 3000),
      window.setTimeout(
        () => setThinkingHint("This is taking longer than usual — hang tight…"),
        8000,
      ),
    ];
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const hardTimeout = window.setTimeout(() => controller?.abort(), 45_000);
    try {
      const result = await askAssistant(text, threadId, controller?.signal);
      setThreadId(result.threadId);
      await dispatchIntent(result);
      if (result.answer || result.table || result.reportId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: result.answer || "",
            table: result.table ?? null,
            reportId: result.reportId ?? null,
            diagnostics: {
              intent: result.intent || "unknown",
              latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
              status: "ok",
            },
          },
        ]);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 50301 || e.status === 503)) {
        setAiEnabled(false);
      }
      const aborted =
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: aborted
            ? "The assistant timed out. Try a shorter question, or use Today's sales / Check stock shortcuts."
            : aiFailureMessage(e, "chat"),
          diagnostics: {
            intent: "unavailable",
            latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
            status: "error",
          },
        },
      ]);
    } finally {
      window.clearTimeout(hardTimeout);
      for (const id of hintTimers) window.clearTimeout(id);
      busyRef.current = false;
      setBusy(false);
      setThinkingHint(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function openCustomerLookup(query: string) {
    if (mobileOnly) return;
    const q = query.trim();
    if (sell) {
      sell.setCustomerSearchQuery(q);
      sell.setView("customers");
    } else {
      router.push(q ? `/customers?q=${encodeURIComponent(q)}` : "/customers");
    }
    pushAssistantNote(q ? `Opened customers for “${q}”.` : "Opened customers.");
  }

  function openProductLookup(query: string) {
    const q = query.trim();
    if (mobileOnly) {
      openWorkspace(
        q ? `/products?q=${encodeURIComponent(q)}` : "/products",
        q ? `Opened products for “${q}”.` : "Opened products.",
      );
      return;
    }
    if (sell) {
      sell.setProductSearchQuery(q);
      sell.setView("products");
    } else {
      router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
    }
    pushAssistantNote(q ? `Opened products for “${q}”.` : "Opened products.");
  }

  function openStockLookup(query: string) {
    const q = query.trim();
    openWorkspace(
      q ? `/stock/list?q=${encodeURIComponent(q)}` : "/stock/list",
      q ? `Opened stock list for “${q}”.` : "Opened stock list.",
    );
  }

  async function dispatchIntent(result: AssistantResponse) {
    const ui = result.ui ?? {};
    const slots = result.slots ?? {};
    const intent = result.intent;

    if (!DISPATCHABLE_AI_INTENTS.has(intent)) return;

    if (intent === "search_customer") {
      openCustomerLookup(slots.query ?? "");
      onExpandedChange(true);
      return;
    }

    if (intent === "search_product") {
      openProductLookup(slots.query ?? "");
      return;
    }

    if (intent === "entity_action") {
      await handleEntityAction(slots.entity, slots.op, slots.query);
      return;
    }

    if (typeof intent === "string" && intent.startsWith("report_")) {
      onExpandedChange(true);
      return;
    }

    if (ui.view && SELL_VIEWS.has(ui.view as LeftView)) {
      applySellView(ui.view as LeftView);
    }

    if (ui.route && ui.route.startsWith("/") && !ui.route.startsWith("//")) {
      if (!mobileOnly || isMobileAllowedHref(ui.route)) {
        collapsePanel();
        router.push(ui.route);
      }
    }

    if (intent === "sale_action" && ui.action) {
      const action = ui.action;
      if (action === "Create Customer") {
        await handleEntityAction("customer", "create", slots.query);
        return;
      }
      if (action === "Create Product") {
        await handleEntityAction("product", "create", slots.query);
        return;
      }
      setPendingAction(action);
    }
  }

  async function handleEntityAction(entity?: string, op?: string, query?: string) {
    try {
      const result = await resolveEntityAction(entity, op, query);
      if (result.kind === "search_panel") {
        if (result.scope === "customer") openCustomerLookup(result.query);
        else openProductLookup(result.query);
        if (!(mobileOnly && result.scope === "product")) {
          onExpandedChange(true);
        }
        return;
      }
      if (result.kind === "confirm_delete") {
        setPendingEntityDelete(result.pending);
        return;
      }
      if (result.kind === "navigate" || result.kind === "pick_list") {
        if (mobileOnly && !isMobileAllowedHref(result.href)) {
          pushAssistantNote(result.note ?? "Open the WEB app to continue this action.");
          return;
        }
        collapsePanel();
        router.push(result.href);
        if (result.note) pushAssistantNote(result.note);
        return;
      }
      if (result.kind === "message") {
        pushAssistantNote(result.text);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Entity action failed";
      pushAssistantNote(msg);
    }
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    runSellAction(action);
  }

  async function confirmEntityDelete() {
    if (!pendingEntityDelete || entityDeleteBusyRef.current) return;
    entityDeleteBusyRef.current = true;
    setEntityDeleteBusy(true);
    try {
      await executeEntityDelete(pendingEntityDelete);
      pushAssistantNote(
        `Deleted ${pendingEntityDelete.entity.replaceAll("_", " ")} “${pendingEntityDelete.name}”.`,
      );
      setPendingEntityDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      pushAssistantNote(msg);
    } finally {
      entityDeleteBusyRef.current = false;
      setEntityDeleteBusy(false);
    }
  }

  /** Cloud-only STT via DashScope; no browser Web Speech fallback. */
  async function startVoice() {
    if (busy || listening) return;
    // null = client config still loading — do not pop a modal on a stray press.
    if (transcriptionAvailable == null) return;
    if (transcriptionAvailable !== true) {
      setVoiceAlert(
        aiEnabled === false
          ? "AI voice transcription is not enabled for this store. Type your request instead."
          : "AI voice transcription is unavailable for this store. Type your request instead.",
      );
      return;
    }
    const session = ++voiceSessionRef.current;

    if (!canUseMediaRecorder()) {
      pushAssistantNote(
        "Cloud voice needs a browser that supports microphone recording. Please type instead.",
      );
      return;
    }

    try {
      setListening(true);
      setVoiceStatus("Listening… speak now");
      const phaseLabel = (phase: VoiceEndpointPhase) => {
        if (phase === "speech") return "Listening…";
        if (phase === "ending") return "Finishing…";
        return "Listening… speak now";
      };
      const recording = await startMediaRecording({
        maxMs: 15_000,
        onStarted: () => setVoiceStatus("Listening… speak now"),
        vad: {
          silenceMs: 1200,
          minSpeechMs: 160,
          noSpeechTimeoutMs: 12_000,
          minRms: 0.006,
          onPhaseChange: (phase) => {
            if (session === voiceSessionRef.current) {
              setVoiceStatus(phaseLabel(phase));
            }
          },
        },
      });
      if (session !== voiceSessionRef.current) {
        recording.stop();
        return;
      }
      voiceStopRef.current = () => recording.stop();
      // A quick press can release before getUserMedia resolves. Stop as soon
      // as the recorder is ready instead of leaving the microphone running.
      if (!voicePressedRef.current) {
        recording.stop();
      }

      const { blob, mimeType, hadSpeech } = await recording.done;
      voiceStopRef.current = null;
      if (session !== voiceSessionRef.current) return;

      const likelyAudio = blob.size >= 1500;
      if (!hadSpeech && !likelyAudio) {
        setListening(false);
        setVoiceStatus(null);
        setVoiceAlert(
          "No speech captured. Please speak after tapping Voice, then pause briefly when finished.",
        );
        return;
      }

      setVoiceStatus("Transcribing…");
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
      const result = await transcribeAudio(blob, undefined, `voice.${ext}`);
      if (session !== voiceSessionRef.current) return;
      setListening(false);
      setVoiceStatus(null);
      setInput(result.text);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e) {
      if (session !== voiceSessionRef.current) return;
      setListening(false);
      setVoiceStatus(null);
      voiceStopRef.current = null;
      setVoiceAlert(aiFailureMessage(e, "voice"));
    }
  }

  function beginVoicePress() {
    // Chrome still dispatches pointerdown on disabled buttons; refuse before
    // any listening UI or alert unless transcription is confirmed available.
    if (busy || listening || transcriptionAvailable !== true) return;
    voicePressedRef.current = true;
    if (!expanded) {
      openPanel();
    }
    void startVoice();
  }

  function endVoicePress() {
    voicePressedRef.current = false;
    voiceStopRef.current?.();
    voiceStopRef.current = null;
  }

  function cancelVoicePress() {
    voicePressedRef.current = false;
    stopVoiceCapture();
  }

  function runQuickAction(action: string) {
    // Route sample questions through the assistant; keep direct navigation available when chat is off.
    if (action === "Today's sales") {
      if (aiEnabled === false) {
        openWorkspace("/history/odoo", "Opened sales history.");
        return;
      }
      void runIntent("Today's sales");
      return;
    }
    const workflows: Record<string, { question: string; href: string; note: string }> = {
      "What should I restock?": {
        question: "What should I restock?",
        href: "/stock/replenishment",
        note: "Opened replenishment suggestions.",
      },
      "Which prices should I review?": {
        question: "Which prices should I review?",
        href: "/stock/capped-pricing",
        note: "Opened price suggestions for review.",
      },
      "Recommend a red wine under $30": {
        question: "Recommend a red wine under $30",
        href: "/sommelier",
        note: "Opened wine recommendations.",
      },
      "Scan this supplier invoice": {
        question: "Scan this supplier invoice",
        href: "/invoices/scan",
        note: "Opened invoice capture.",
      },
    };
    const workflow = workflows[action];
    if (workflow) {
      if (aiEnabled === false) {
        openWorkspace(workflow.href, workflow.note);
        return;
      }
      void runIntent(workflow.question);
      return;
    }
    if (action === "Products") {
      openWorkspace("/products", "Opened products.");
      return;
    }
    if (action === "Check stock") {
      openStockLookup("");
      return;
    }
    runSellAction(action);
  }

  const chatOff = aiEnabled === false;
  const composer = (
    <form
      className="flex w-full items-center gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        void submitInput();
      }}
    >
      <div
        className={cn(
          "flex h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-[var(--oh-border)] bg-white px-4 transition-[border-color,box-shadow] focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-orange-muted)]",
          (busy || chatOff) && "pointer-events-none opacity-60",
        )}
        style={{ boxShadow: FLOAT_SHADOW }}
      >
        <MessageCircle size={16} className="shrink-0 text-[var(--oh-primary)]" />
        <input
          ref={inputRef}
          aria-label="Ask Orithos AI"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submitInput();
          }}
          disabled={busy || chatOff}
          readOnly={busy || chatOff}
          placeholder={chatOff ? "AI chat is off for this store" : busy ? "Waiting for reply…" : "Ask Orithos AI…"}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="submit"
        aria-label="Send message"
        title="Send message"
        disabled={busy || chatOff || !input.trim()}
        className="flex h-[48px] w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[var(--oh-border)] bg-white text-[var(--oh-primary)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ boxShadow: FLOAT_SHADOW }}
      >
        <Send size={18} />
      </button>
      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          beginVoicePress();
        }}
        onPointerUp={endVoicePress}
        onPointerCancel={cancelVoicePress}
        onPointerLeave={() => {
          if (voicePressedRef.current) endVoicePress();
        }}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            beginVoicePress();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            endVoicePress();
          }
        }}
        onBlur={() => {
          if (voicePressedRef.current) endVoicePress();
        }}
        aria-label={
          listening
            ? "Release to stop voice input"
            : transcriptionAvailable === true
              ? "Hold to speak"
              : "Voice input"
        }
        aria-pressed={listening}
        title={
          aiEnabled === false
            ? "Voice input is disabled for this store"
            : transcriptionAvailable == null
              ? "Checking voice availability…"
              : transcriptionAvailable === false
                ? "Voice transcription is unavailable for this store"
                : "Hold to speak, release to add text"
        }
        disabled={busy || transcriptionAvailable !== true}
        className={cn(
          // disabled:pointer-events-none — Chrome still fires pointerdown on
          // disabled buttons; without this, hold-to-speak pops the alert modal.
          "flex h-[48px] w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[var(--oh-border)] bg-white transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          listening
            ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"
            : "text-[var(--oh-placeholder)] hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] hover:text-[var(--oh-primary)]",
        )}
        style={{ boxShadow: FLOAT_SHADOW }}
      >
        <Mic size={18} />
      </button>
    </form>
  );

  const panelDialogs = (
    <>
      <ConfirmDialog
        open={!!pendingAction}
        title="Confirm Action"
        message={pendingAction ? `Run "${pendingAction}"?` : ""}
        confirmLabel="Run"
        cancelLabel="Cancel"
        variant="default"
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={!!pendingEntityDelete}
        title="Confirm Delete"
        message={
          pendingEntityDelete
            ? `Delete ${pendingEntityDelete.entity.replaceAll("_", " ")} “${pendingEntityDelete.name}”? This cannot be undone from AI.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        busy={entityDeleteBusy}
        onConfirm={() => {
          void confirmEntityDelete();
        }}
        onCancel={() => {
          if (!entityDeleteBusy) setPendingEntityDelete(null);
        }}
      />
      <AlertDialog
        open={!!voiceAlert}
        title="Voice Input"
        message={voiceAlert ?? ""}
        okLabel="OK"
        variant="warning"
        onClose={() => setVoiceAlert(null)}
      />
    </>
  );

  const floatUi = (
    <div
      ref={floatRef}
      className={cn(
        "pointer-events-none fixed z-[80] flex flex-col items-end",
        dragging && "select-none",
      )}
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: "translate(-100%, -100%)",
      }}
    >
      {expanded && (
        <div
          role="dialog"
          aria-labelledby="orithos-ai-assistant-title"
          aria-modal="true"
          className="pointer-events-auto flex w-[min(100vw-2.5rem,420px)] flex-col gap-2.5"
        >
          <div
            className="flex max-h-[min(72vh,620px)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--oh-border)] bg-white"
            style={{ boxShadow: FLOAT_SHADOW }}
          >
            <div
              className={cn(
                "flex shrink-0 touch-none items-center gap-2.5 border-b border-[var(--oh-border)] bg-[var(--oh-orange-light)] px-3.5 py-3",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={beginDrag}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <AiFabIcon size={40} className="pointer-events-none shadow-sm" />
              <div className="min-w-0 flex-1">
                <span id="orithos-ai-assistant-title" className="sr-only">
                  Orithos AI assistant
                </span>
                <p aria-hidden="true" className="truncate text-[15px] font-semibold text-[var(--oh-text)]">
                  Orithos AI
                </p>
                <p className="truncate text-[13px] text-[var(--oh-muted)]">
                  {aiEnabled === false
                    ? "AI chat is off"
                    : "Ask anything about sales"}
                </p>
              </div>
              <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    if (historyOpen) setHistoryOpen(false);
                    else void openHistory();
                  }}
                  title="Chat history"
                  aria-label="Chat history"
                  disabled={busy || chatOff}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] outline-none transition-colors hover:bg-white/80 hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <History size={16} />
                </button>
                <button
                  type="button"
                  onClick={collapsePanel}
                  title="Close"
                  aria-label="Close assistant"
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] outline-none transition-colors hover:bg-white/80 hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              aria-live="polite"
              aria-atomic="false"
              className="min-h-[240px] flex-1 overflow-y-auto bg-[var(--oh-surface)]"
            >
              {historyOpen ? (
                <HistoryView
                  loading={historyLoading}
                  error={historyError}
                  threads={historyThreads}
                  onBack={() => setHistoryOpen(false)}
                  onSelect={(id) => void loadHistoryThread(id)}
                  onRefresh={() => void openHistory()}
                />
              ) : (
                <DialogueView
                  messages={messages}
                  onAction={runQuickAction}
                  onClear={clearChat}
                  busy={busy}
                  thinkingHint={thinkingHint}
                />
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--oh-border)] bg-white px-3.5 py-2">
              <div className="flex items-center justify-end gap-2">
                {aiEnabled === false ? (
                  <p className="text-[13px] text-[var(--oh-muted)]">Shortcuts still work without AI chat</p>
                ) : voiceStatus ? (
                  <p className="min-w-0 flex-1 truncate text-right text-[13px] font-medium text-[var(--oh-primary)]">
                    {voiceStatus}
                  </p>
                ) : (
                  <p className="text-[13px] text-[var(--oh-muted)]">AI chat · Enter to send</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full items-center gap-2.5">
            {composer}
            <button
              type="button"
              onClick={onMinimizeClick}
              onPointerDown={beginDrag}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label="Minimize Orithos AI"
              className={cn(
                "shrink-0 touch-none transition-transform",
                dragging ? "cursor-grabbing" : "cursor-grab hover:-translate-y-0.5",
              )}
              style={{ boxShadow: FLOAT_SHADOW, borderRadius: "9999px" }}
            >
              <AiFabIcon size={48} />
            </button>
          </div>
        </div>
      )}

      {!expanded && launcherVisible && (
        <button
          type="button"
          onClick={onFabClick}
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label="Open Orithos AI"
          className={cn(
            "pointer-events-auto shrink-0 touch-none transition-transform",
            dragging ? "cursor-grabbing" : "cursor-grab hover:-translate-y-0.5 hover:scale-105",
            !dragging && "active:scale-95",
          )}
          style={{ boxShadow: FLOAT_SHADOW, borderRadius: "9999px" }}
        >
          <AiFabIcon size={64} />
        </button>
      )}
    </div>
  );

  return (
    <>
      {mounted ? createPortal(floatUi, document.body) : null}
      {panelDialogs}
    </>
  );
}

function HistoryView({
  loading,
  error,
  threads,
  onBack,
  onSelect,
  onRefresh,
}: {
  loading: boolean;
  error: string | null;
  threads: AiChatThreadSummary[];
  onBack: () => void;
  onSelect: (id: number) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          History
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-[var(--oh-muted)] hover:bg-white hover:text-[var(--oh-text)] disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-[var(--oh-primary)] hover:bg-white"
          >
            Back
          </button>
        </div>
      </div>
      <p className="mb-2.5 text-[12px] text-[var(--oh-muted)]">
        Your chats on this store only. Opening a thread continues that conversation.
      </p>
      {error ? (
        <p role="alert" className="mb-2 rounded-md bg-rose-50 px-2.5 py-2 text-[13px] text-rose-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-[13px] text-[var(--oh-muted)]">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="text-[13px] text-[var(--oh-muted)]">No saved chats yet. Ask a question to start one.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className="w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 text-left transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)]"
              >
                <span className="block truncate text-[14px] font-medium text-[var(--oh-text)]">
                  {thread.title || "Chat"}
                </span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--oh-muted)]">
                  {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DialogueView({
  messages,
  onAction,
  onClear,
  busy,
  thinkingHint,
}: {
  messages: ChatMessage[];
  onAction: (action: string) => void;
  onClear: () => void;
  busy?: boolean;
  thinkingHint?: string | null;
}) {
  const canClear = !busy && messages.length > 1;
  const diagnosticMessages = messages.filter((message) => message.role === "assistant" && message.diagnostics);
  const successfulResponses = diagnosticMessages.filter((message) => message.diagnostics?.status === "ok").length;
  const averageLatency = diagnosticMessages.length
    ? Math.round(
        diagnosticMessages.reduce((total, message) => total + (message.diagnostics?.latencyMs ?? 0), 0)
          / diagnosticMessages.length,
      )
    : 0;
  const successRate = diagnosticMessages.length
    ? Math.round((successfulResponses / diagnosticMessages.length) * 100)
    : 0;
  return (
    <div className="flex h-full flex-col p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          Chat
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          title="Clear chat"
          aria-label="Clear chat"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--oh-muted)]"
        >
          <Eraser size={13} />
          Clear
        </button>
      </div>
      {diagnosticMessages.length > 0 ? (
        <p
          aria-label="AI session diagnostics"
          className="mb-2.5 rounded-md bg-white px-2.5 py-1.5 text-[11px] tabular-nums text-[var(--oh-muted)]"
        >
          AI session · {diagnosticMessages.length} {diagnosticMessages.length === 1 ? "response" : "responses"}
          {" · "}{successRate}% success · {averageLatency}ms avg
        </p>
      ) : null}
      <div className="min-h-0 flex-1 space-y-2.5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] rounded-[var(--oh-radius)] px-3.5 py-2.5 text-[14px] leading-relaxed",
              msg.role === "user"
                ? "ml-auto bg-[var(--oh-primary)] text-white"
                : "mr-auto border border-[var(--oh-tile-blue-border)] bg-white text-[var(--oh-text-secondary)] shadow-sm",
            )}
          >
            {msg.role === "assistant" && msg.reportId ? (
              <span className="block">
                <a
                  href={`/reports/ai/${msg.reportId}`}
                  {...(getUiMode() === "mobile"
                    ? {}
                    : { target: "_blank", rel: "noopener noreferrer" })}
                  className="inline-flex items-start gap-1.5 text-inherit no-underline hover:text-[var(--oh-primary)]"
                >
                  <span className="underline decoration-[var(--oh-primary)] underline-offset-2">
                    {msg.text || (/[\u4e00-\u9fff]/.test(msg.text) ? "查看报表" : "View report")}
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                </a>
                <span className="mt-1 block text-[13px] text-[var(--oh-muted)]">
                  {/[\u4e00-\u9fff]/.test(msg.text)
                    ? "点击在新页面查看完整报表数据"
                    : "Click to open the full report in a new page"}
                </span>
              </span>
            ) : (
              msg.text
            )}
            {msg.role === "assistant" && !msg.reportId && msg.table && msg.table.rows.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table aria-label="Assistant result table" className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {msg.table.columns.map((col) => (
                        <th
                          key={col}
                          scope="col"
                          className="border-b border-[var(--oh-border)] px-1.5 py-1 text-left font-semibold text-[var(--oh-text-secondary)]"
                        >
                          {formatReportColumnHeader(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {msg.table.rows.slice(0, 8).map((row, ri) => (
                      <tr key={ri}>
                        {msg.table!.columns.map((col) => (
                          <td key={col} className="px-1.5 py-1 text-[var(--oh-text-secondary)]">
                            {row[col] == null ? "" : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {msg.table.rows.length > 8 && (
                  <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
                    +{msg.table.rows.length - 8} more
                  </p>
                )}
              </div>
            )}
            {msg.role === "assistant" && msg.diagnostics ? (
              <span className={cn(
                "mt-2 block text-[11px] tabular-nums",
                msg.diagnostics.status === "ok" ? "text-[var(--oh-muted)]" : "text-rose-600",
              )}>
                {msg.diagnostics.status === "ok" ? "AI" : "AI error"} · {msg.diagnostics.intent} · {msg.diagnostics.latencyMs}ms
              </span>
            ) : null}
          </div>
        ))}
        {busy && (
          <div className="mr-auto max-w-[92%] rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-orange-light)] px-3.5 py-2.5 text-[14px] text-[var(--oh-primary)] shadow-sm">
            {thinkingHint ?? "Thinking…"}
          </div>
        )}
      </div>
      <div className="mt-3 shrink-0 border-t border-[var(--oh-border)] pt-3">
        <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[var(--oh-muted)]">
          Quick actions
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              className="cursor-pointer rounded-full border border-[var(--oh-border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] hover:text-[var(--oh-primary)]"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
