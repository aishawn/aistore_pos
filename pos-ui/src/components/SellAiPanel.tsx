"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Eraser, ExternalLink, History, MessageCircle, Mic, Plus, RefreshCw, Send, X } from "lucide-react";
import { cn, formatReportColumnHeader } from "@/lib/utils";
import {
  askAssistant,
  fetchAiChatThread,
  fetchAiChatThreads,
  fetchAiClientConfig,
  transcribeAudio,
  ApiError,
  type AssistantCard,
  type AiChatThreadSummary,
  type AssistantResponse,
} from "@/lib/api";
import {
  resolveEntityAction,
} from "@/lib/ai-entity-actions";
import { entityActionPage, isReadOnlyEntityOperation } from "@/lib/ai-entity-routing";
import { assistantCardCtaLabel, assistantCardTitle, assistantSaleActionHref, normalizeAssistantHref, resolveAssistantCardCta } from "@/lib/assistant-card-cta";
import { restoredAssistantCardFields, retryQuestionForAssistantCards } from "@/lib/assistant-chat-history";
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

interface ChatCta {
  label: string;
  href: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  question?: string;
  table?: { columns: string[]; rows: Record<string, unknown>[] } | null;
  reportId?: number | null;
  cards?: AssistantCard[] | null;
  /** Preferred: one or more in-chat action buttons (navigate only on tap). */
  links?: ChatCta[] | null;
  /** @deprecated prefer links — kept for single-CTA call sites */
  cta?: ChatCta | null;
  retryQuestion?: string | null;
  diagnostics?: {
    intent: string;
    latencyMs: number;
    status: "ok" | "error";
  };
}

function messageLinks(msg: ChatMessage): ChatCta[] {
  const links = msg.links && msg.links.length > 0 ? msg.links : msg.cta ? [msg.cta] : [];
  return links.flatMap((link) => {
    const href = normalizeAssistantHref(link.href);
    return href ? [{ ...link, href }] : [];
  });
}

/** Compact chip label: "Open stock list" → "Stock list". */
function shortChatLinkLabel(label: string): string {
  return label.replace(/^Open\s+/i, "").trim() || label;
}

/** Quiet text-link CTA — secondary to the answer; click when interested. */
const chatNavLinkClassName =
  "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-0.5 py-1 text-[12px] font-medium text-[var(--oh-muted)] underline decoration-[var(--oh-border)] underline-offset-2 transition-colors hover:text-[var(--oh-primary)] hover:decoration-[var(--oh-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2";

/**
 * In-chat navigation actions as quiet text links so the answer stays primary.
 */
function ChatActionLinks({
  links,
  onOpenLink,
  className,
}: {
  links: ChatCta[];
  onOpenLink: (href: string) => void;
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={links.length > 1 ? "Related pages" : undefined}
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1",
        className,
      )}
    >
      {links.map((link) => (
        <button
          key={`${link.href}-${link.label}`}
          type="button"
          aria-label={link.label}
          onClick={() => onOpenLink(link.href)}
          className={chatNavLinkClassName}
        >
          {links.length === 1 ? link.label : shortChatLinkLabel(link.label)}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Friendly labels for deferred navigation CTAs inside the chat. */
function labelForHref(href: string): string {
  const path = href.split("?")[0].split("#")[0] || "/";
  const known: Record<string, string> = {
    "/": "Open sell screen",
    "/products": "Open products",
    "/products/odoo": "Open products",
    "/customers": "Open customers",
    "/customers/odoo": "Open customers",
    "/promotions": "Open promotions",
    "/stock/list": "Open stock list",
    "/stock/replenishment": "Open replenishment",
    "/stock/capped-pricing": "Open price review",
    "/stock/bulk-price-edit": "Open bulk price edit",
    "/stock/buying-periods": "Open buying periods",
    "/sommelier": "Open wine recommendations",
    "/recommend": "Open recommendations",
    "/recommend/grocery": "Open grocery recommendations",
    "/invoices": "Open supplier invoices",
    "/invoices/scan": "Open supplier invoices",
    "/invoices/new": "Scan supplier invoice",
    "/history/odoo": "Open sales history",
    "/purchases/odoo": "Open purchases",
    "/suppliers/odoo": "Open suppliers",
    "/orders": "Open orders",
    "/stocktake": "Open stocktake",
    "/classifications": "Open classifications",
    "/customer-groups": "Open customer groups",
    "/pricelists": "Open pricelists",
    "/giftcards": "Open gift cards",
    "/customers/balances": "Open customer balances",
    "/reports/ai": "Open AI reports",
  };
  if (known[path]) return known[path];
  if (path.startsWith("/products/")) return "Open product";
  if (path.startsWith("/customers/")) return "Open customer";
  if (path.startsWith("/reports/ai/")) return "Open report";
  if (path.startsWith("/sommelier/")) return "Open wine recommendations";
  if (path.startsWith("/recommend/")) return "Open recommendations";
  if (path.startsWith("/invoices")) return "Open supplier invoices";
  if (path.startsWith("/stock/")) return "Open stock page";
  return "Open page";
}

function isPlaceholderNavigateAnswer(text: string): boolean {
  const t = text.trim();
  return (
    !t ||
    /^Opening(\u2026|\.\.\.|…)?$/i.test(t) ||
    /^Opening the requested workflow\.?$/i.test(t)
  );
}

function navigatePromptText(href: string, answer?: string | null): string {
  if (answer && !isPlaceholderNavigateAnswer(answer) && !isTechnicalIntentLabel(answer)) {
    return answer;
  }
  const label = labelForHref(href).replace(/^Open\s+/i, "");
  return `I found that in ${label}. Tap below when you are ready — I will not leave this chat until you do.`;
}

/** Intent display names / stubs that should never be shown as the chat answer. */
function isTechnicalIntentLabel(text: string): boolean {
  const t = text.trim();
  return /^(Entity CRUD|Report ad-hoc|Report adhoc|Navigate|Sale action|Opening…|Opening\.\.\.|OK)$/i.test(t);
}

function polishAssistantAnswer(text: string, intent?: string): string {
  const raw = (text || "").trim();
  if (!raw || isTechnicalIntentLabel(raw)) {
    if (intent === "entity_action") {
      return "I can help you find the right Inventory or Customer page, but I need a clearer request — for example “search product beer” or “open replenishment”.";
    }
    if (intent === "report_adhoc") {
      return "That custom report is not available yet. Try Today's sales, Check stock, or open Products.";
    }
    return "I can help with sales, stock, products, replenishment, pricing, or wine. Try a Quick action below.";
  }
  return raw;
}

/** Map current route to a coarse surface hint for the assistant (never a tenant key). */
function surfaceFromPath(pathname: string | null | undefined): string {
  const path = (pathname || "/").toLowerCase();
  if (path.startsWith("/products")) return "products";
  if (path.startsWith("/stock")) return "stock";
  if (path.startsWith("/customers")) return "customers";
  if (path.startsWith("/reports") || path.startsWith("/ai/reports")) return "reports";
  if (path.startsWith("/sommelier")) return "sommelier";
  if (path.startsWith("/recommend")) return "recommend";
  if (path.startsWith("/invoices")) return "invoices";
  if (path === "/" || path.startsWith("/sell")) return "sell";
  return "";
}

const ENABLED_GREETING =
  "Hi, I'm the Orithos AI assistant. Ask about sales or stock, or try restock suggestions, price reviews, or product recommendations.";
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
  "Something in stock for a BBQ under $20",
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
  "guided_action",
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
  /**
   * `page` — fill the AppShell main column (Sidebar stays visible).
   * `float` — portal FAB / dock / mobile fullscreen overlay (default).
   */
  presentation?: "float" | "page";
  /** Force the expanded float panel to cover the viewport. */
  forceFullscreen?: boolean;
  /** Called after collapse when the host should leave a dedicated route. */
  onRequestClose?: () => void;
}

/** Sell page AI chat panel — intent → frontend dispatcher. */
export function SellAiPanel({
  expanded,
  onExpandedChange,
  launcherVisible = true,
  presentation = "float",
  forceFullscreen = false,
  onRequestClose,
}: SellAiPanelProps) {
  const pagePresentation = presentation === "page";
  const mobileOnly = getUiMode() === "mobile";
  const sell = useOptionalSellScreen();
  const ai = useOptionalAiAssistant();
  const router = useRouter();
  const pathname = usePathname();
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
  const [quickActionsOpen, setQuickActionsOpen] = useState(true);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [transcriptionAvailable, setTranscriptionAvailable] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [voiceAlert, setVoiceAlert] = useState<string | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
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
  // Phone browsers on the WEB shell still need a true fullscreen assistant;
  // dedicated /m mobile mode keeps the same layout.
  // Page presentation uses the same full-bleed chat chrome inside <main>.
  const fullscreenPanel =
    pagePresentation || forceFullscreen || mobileOnly || compactViewport;

  const dismissPanel = useCallback(() => {
    if (!document.activeElement?.closest('[role="dialog"]')) {
      restoreFocusRef.current = null;
      restoreFabRef.current = false;
    }
    onExpandedChange(false);
    voicePressedRef.current = false;
    voiceSessionRef.current += 1;
    voiceStopRef.current?.();
    voiceStopRef.current = null;
    setListening(false);
    setVoiceStatus(null);
    onRequestClose?.();
  }, [onExpandedChange, onRequestClose]);
  // Page mode keeps Sidebar interactive — Escape closes, but no focus trap.
  useDialogFocus(
    expanded && !pagePresentation,
    dismissPanel,
    "assistant",
    inputRef,
  );

  useEffect(() => {
    if (!pagePresentation || !expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismissPanel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pagePresentation, expanded, dismissPanel]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompactViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Floating fullscreen assistant is a modal workspace. Keep the page underneath
  // from scrolling while it is open. Page presentation lives inside <main>.
  useEffect(() => {
    if (pagePresentation || !expanded || !fullscreenPanel) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [pagePresentation, expanded, fullscreenPanel]);

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
        document.querySelector<HTMLElement>('[aria-label="Open Orithos AI assistant"]')?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  function followChatLink(href: string) {
    const safeHref = normalizeAssistantHref(href);
    if (!safeHref) {
      pushAssistantNote("This assistant link is unavailable. Ask for the page again.");
      return;
    }
    if (mobileOnly && !isMobileAllowedHref(safeHref)) {
      pushAssistantNote("Open the WEB app to continue this action.");
      return;
    }
    collapsePanel({ skipRouteExit: true });
    router.push(safeHref);
  }

  /** Offer a page link inside chat. Only jump immediately when AI chat is off (shortcut mode). */
  function openWorkspace(href: string, note: string, options?: { immediate?: boolean }) {
    const jumpNow = options?.immediate === true || aiEnabled === false;
    if (jumpNow) {
      pushAssistantNote(note);
      collapsePanel({ skipRouteExit: true });
      router.push(href);
      return;
    }
    const link = { label: labelForHref(href), href };
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: navigatePromptText(href, note),
        cta: link,
        links: [link],
      },
    ]);
  }

  function applySellView(view: LeftView) {
    if (mobileOnly) {
      if (view === "products") {
        openWorkspace("/products", "Open products when you are ready.");
        return;
      }
      if (view === "keys" || view === "parked") {
        openWorkspace("/", "Open the sell screen when you are ready.");
        return;
      }
      pushAssistantNote("This is available in the WEB app.");
      return;
    }
    if (sell) {
      sell.setView(view);
      return;
    }
    if (view === "customers") openWorkspace("/customers", "Open the customers list when you are ready.");
    else if (view === "products") openWorkspace("/products", "Open products when you are ready.");
    else if (view === "promotions") openWorkspace("/promotions", "Open promotions when you are ready.");
    else openWorkspace("/", "Open the sell screen when you are ready.");
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
      openWorkspace("/", "Open the sell screen when you are ready.");
      return true;
    }
    if (/^(查询产品|查找产品|产品查询|look\s*up\s*products?|search\s*products?)$/i.test(t)) {
      openWorkspace("/products", "Open products when you are ready.");
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

  function collapsePanel(options?: { skipRouteExit?: boolean }) {
    // The panel can lose activeElement during Escape dispatch or portal teardown.
    // Restore the actual launcher that opened it, including the desktop header entry.
    if (!document.activeElement?.closest('[role="dialog"]')) {
      restoreFocusRef.current = null;
      restoreFabRef.current = false;
    }
    onExpandedChange(false);
    stopVoiceCapture();
    // In-chat navigations already push a new route; do not also exit /assistant.
    if (!options?.skipRouteExit) {
      onRequestClose?.();
    }
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
    setQuickActionsOpen(true);
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
      let previousQuestion: string | undefined;
      const restored: ChatMessage[] = detail.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const message: ChatMessage = {
            role: m.role as "user" | "assistant",
            text: m.text || "",
            ...(m.role === "assistant" ? { reportId: m.reportId ?? null, table: m.table ?? null } : {}),
            ...(m.role === "assistant" ? restoredAssistantCardFields(m.cards, previousQuestion) : {}),
            ...(m.role === "assistant" && previousQuestion ? { question: previousQuestion } : {}),
            diagnostics: m.role === "assistant" && m.intent
              ? { intent: m.intent, latencyMs: 0, status: "ok" as const }
              : undefined,
          };
          previousQuestion = m.role === "user" ? m.text || "" : undefined;
          return message;
        });
      setMessages(
        restored.length
          ? restored
          : [{ role: "assistant", text: greetingText(aiEnabled) }],
      );
      setThreadId(detail.sessionKey);
      setQuickActionsOpen(false);
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
    setQuickActionsOpen(false);
    await runIntent(trimmed);
  }

  async function runIntent(text: string, retryExistingMessage = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setThinkingHint(null);
    lockAndClearInput();
    if (!retryExistingMessage) {
      setMessages((prev) => [...prev, { role: "user", text }]);
    }
    const appendReply = (message: ChatMessage) => setMessages((prev) => {
      if (!retryExistingMessage) return [...prev, message];
      let retryIndex = -1;
      for (let index = prev.length - 1; index >= 0; index -= 1) {
        if (prev[index].role === "assistant" && prev[index].retryQuestion === text) {
          retryIndex = index;
          break;
        }
      }
      if (retryIndex < 0) return [...prev, message];
      const next = [...prev];
      next[retryIndex] = message;
      return next;
    });
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
      const result = await askAssistant(text, threadId, controller?.signal, surfaceFromPath(pathname));
      setThreadId(result.threadId);
      const outcome = await dispatchIntent(result);
      if (outcome.kind !== "messaged") {
        const deferredHref = outcome.kind === "deferred" ? outcome.href : null;
        const polished = polishAssistantAnswer(result.answer || "", result.intent);
        const hasBody = Boolean(
          polished || result.table || result.reportId || deferredHref,
        );
        if (hasBody) {
          const answerText = deferredHref
            ? navigatePromptText(deferredHref, polished)
            : polished;
          const cta = deferredHref
            ? { label: labelForHref(deferredHref), href: deferredHref }
            : null;
          // Dead-end ad-hoc / empty entity answers get soft recovery chips (not 3 primary CTAs).
          const recoveryLinks: ChatCta[] =
            !deferredHref &&
            (result.intent === "report_adhoc" || isTechnicalIntentLabel(result.answer || ""))
              ? [
                  { label: "Open products", href: "/products" },
                  { label: "Open stock list", href: "/stock/list" },
                  { label: "Open replenishment", href: "/stock/replenishment" },
                ]
              : [];
          appendReply({
              role: "assistant",
              text: answerText,
              question: text,
              table: result.table ?? null,
              reportId: result.reportId ?? null,
              cards: result.cards ?? null,
              retryQuestion: retryQuestionForAssistantCards(result.cards, text) ?? null,
              cta,
              links: cta ? [cta] : recoveryLinks.length ? recoveryLinks : null,
              diagnostics: {
                intent: result.intent || "unknown",
                latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
                status: "ok",
              },
            });
        }
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 50301 || e.status === 503)) {
        setAiEnabled(false);
      }
      const aborted =
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      appendReply({
          role: "assistant",
          question: text,
          text: aborted
            ? "The assistant timed out. Try a shorter question, or use Today's sales / Check stock shortcuts."
            : aiFailureMessage(e, "chat"),
          retryQuestion: e instanceof ApiError && (e.code === 50301 || e.status === 503) ? null : text,
          diagnostics: {
            intent: "unavailable",
            latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
            status: "error",
          },
        });
    } finally {
      window.clearTimeout(hardTimeout);
      for (const id of hintTimers) window.clearTimeout(id);
      busyRef.current = false;
      setBusy(false);
      setThinkingHint(null);
      // Phone: keep the keyboard down after a reply so the answer stays readable.
      // Desktop can keep focus for the next typed follow-up.
      if (!fullscreenPanel) {
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function openCustomerLookup(query: string) {
    if (mobileOnly) return;
    const q = query.trim();
    if (sell) {
      sell.setCustomerSearchQuery(q);
      sell.setView("customers");
      pushAssistantNote(q ? `Showing customers for “${q}”.` : "Showing customers.");
      return;
    }
    openWorkspace(
      q ? `/customers?q=${encodeURIComponent(q)}` : "/customers",
      q ? `Open customers for “${q}” when you are ready.` : "Open customers when you are ready.",
    );
  }

  function openProductLookup(query: string) {
    const q = query.trim();
    if (mobileOnly) {
      openWorkspace(
        q ? `/products?q=${encodeURIComponent(q)}` : "/products",
        q ? `Open products for “${q}” when you are ready.` : "Open products when you are ready.",
      );
      return;
    }
    if (sell) {
      sell.setProductSearchQuery(q);
      sell.setView("products");
      pushAssistantNote(q ? `Showing products for “${q}”.` : "Showing products.");
      return;
    }
    openWorkspace(
      q ? `/products?q=${encodeURIComponent(q)}` : "/products",
      q ? `Open products for “${q}” when you are ready.` : "Open products when you are ready.",
    );
  }

  function openStockLookup(query: string) {
    const q = query.trim();
    openWorkspace(
      q ? `/stock/list?q=${encodeURIComponent(q)}` : "/stock/list",
      q ? `Open stock list for “${q}” when you are ready.` : "Open stock list when you are ready.",
    );
  }

  type IntentDispatch =
    | { kind: "none" }
    | { kind: "deferred"; href: string }
    | { kind: "messaged" };

  /** Deferred page link keeps the user in chat until they tap the CTA. */
  async function dispatchIntent(result: AssistantResponse): Promise<IntentDispatch> {
    const ui = result.ui ?? {};
    const slots = result.slots ?? {};
    const intent = result.intent;

    if (!DISPATCHABLE_AI_INTENTS.has(intent)) return { kind: "none" };

    if (intent === "search_customer") {
      openCustomerLookup(slots.query ?? "");
      onExpandedChange(true);
      return { kind: "messaged" };
    }

    if (intent === "sale_action") {
      return { kind: "deferred", href: assistantSaleActionHref(ui.action) };
    }

    if (intent === "search_product") {
      openProductLookup(slots.query ?? "");
      return { kind: "messaged" };
    }

    if (intent === "entity_action") {
      if (!isReadOnlyEntityOperation(slots.op)) {
        const entityRoute = entityActionPage(slots.entity);
        const suggestedRoute = typeof ui.route === "string"
          && ui.route.startsWith("/")
          && !ui.route.startsWith("//")
          ? normalizeAssistantHref(ui.route)
          : null;
        const href = entityRoute ?? suggestedRoute;
        return href ? { kind: "deferred", href } : { kind: "messaged" };
      }
      await handleEntityAction(slots.entity, slots.op, slots.query);
      return { kind: "messaged" };
    }

    if (typeof intent === "string" && intent.startsWith("report_")) {
      onExpandedChange(true);
      return { kind: "none" };
    }

    if (ui.view && SELL_VIEWS.has(ui.view as LeftView)) {
      applySellView(ui.view as LeftView);
    }

    let deferred: IntentDispatch = { kind: "none" };
    const assistantRoute = normalizeAssistantHref(ui.route);
    if (assistantRoute) {
      if (!mobileOnly || isMobileAllowedHref(assistantRoute)) {
        deferred = { kind: "deferred", href: assistantRoute };
      } else {
        pushAssistantNote("Open the WEB app to continue this action.");
        return { kind: "messaged" };
      }
    }

    return deferred;
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
      if (result.kind === "navigate" || result.kind === "pick_list") {
        if (mobileOnly && !isMobileAllowedHref(result.href)) {
          pushAssistantNote(result.note ?? "Open the WEB app to continue this action.");
          return;
        }
        openWorkspace(
          result.href,
          result.note ?? navigatePromptText(result.href),
        );
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
    setQuickActionsOpen(false);
    // Route sample questions through the assistant; keep direct navigation available when chat is off.
    if (action === "Today's sales") {
      if (aiEnabled === false) {
        openWorkspace("/history/odoo", "Opened sales history.", { immediate: true });
        return;
      }
      void runIntent("Today's sales");
      return;
    }
    const workflows: Record<string, { question: string; href: string; note: string }> = {
      "What should I restock?": {
        question: "What should I restock?",
        href: "/stock/replenishment",
        note: "Open replenishment when you are ready.",
      },
      "Which prices should I review?": {
        question: "Which prices should I review?",
        href: "/stock/capped-pricing",
        note: "Open price review when you are ready.",
      },
      "Recommend a red wine under $30": {
        question: "Recommend a red wine under $30",
        href: "/sommelier",
        note: "Open wine recommendations when you are ready.",
      },
      "Something in stock for a BBQ under $20": {
        question: "Something in stock for a BBQ under $20",
        href: "/recommend/grocery",
        note: "Open grocery recommendations when you are ready.",
      },
    };
    const workflow = workflows[action];
    if (workflow) {
      if (aiEnabled === false) {
        openWorkspace(workflow.href, workflow.note, { immediate: true });
        return;
      }
      void runIntent(workflow.question);
      return;
    }
    if (action === "Products") {
      openWorkspace("/products", "Open products when you are ready.");
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
        "pointer-events-none flex flex-col",
        pagePresentation
          ? "absolute inset-0 z-10 h-full w-full"
          : "fixed z-[80]",
        !pagePresentation && expanded && fullscreenPanel && "inset-0 h-dvh w-full",
        !pagePresentation && expanded && !fullscreenPanel && "inset-y-0 right-0 h-dvh w-[min(100vw,420px)]",
        !pagePresentation && !expanded && "items-end",
        dragging && "select-none",
      )}
      style={
        pagePresentation
          ? undefined
          : expanded
            ? { left: fullscreenPanel ? 0 : undefined, top: 0, right: fullscreenPanel ? 0 : 0, transform: "none" }
            : { left: anchor.x, top: anchor.y, transform: "translate(-100%, -100%)" }
      }
    >
      {expanded && fullscreenPanel && !pagePresentation && (
        <button
          type="button"
          aria-label="Close assistant"
          className="pointer-events-auto fixed inset-0 z-0 cursor-default bg-slate-950/40"
          onClick={dismissPanel}
        />
      )}
      {expanded && (
        <div
          role="dialog"
          aria-labelledby="orithos-ai-assistant-title"
          aria-modal={pagePresentation ? undefined : true}
          className={cn(
            "pointer-events-auto relative z-10 flex h-full w-full flex-col",
            !fullscreenPanel && "border-l border-[var(--oh-border)] bg-white",
          )}
          style={{ boxShadow: fullscreenPanel ? "none" : FLOAT_SHADOW }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-hidden bg-white",
              fullscreenPanel ? "rounded-none border-0" : "rounded-none",
            )}
          >
            <div
              className={cn(
                "flex shrink-0 touch-none items-center gap-2.5 border-b border-[var(--oh-border)] bg-[var(--oh-orange-light)] px-3.5 py-3",
                fullscreenPanel && !pagePresentation && "pt-[max(0.75rem,env(safe-area-inset-top))]",
                "cursor-default",
              )}
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
              <div className="flex items-center gap-0.5">
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
                  onClick={dismissPanel}
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
              className="min-h-0 flex-1 overflow-y-auto bg-[var(--oh-surface)]"
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
                  onOpenLink={followChatLink}
                  onRetry={(question) => void runIntent(question, true)}
                  onClear={clearChat}
                  busy={busy}
                  thinkingHint={thinkingHint}
                  compact={fullscreenPanel}
                />
              )}
            </div>

            {quickActionsOpen ? (
              <div
                id="orithos-ai-quick-actions"
                className="shrink-0 border-t border-[var(--oh-border)] bg-white px-3.5 py-2.5"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-bold uppercase tracking-wider text-[var(--oh-muted)]">
                    Quick actions
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuickActionsOpen(false)}
                    aria-expanded={true}
                    aria-controls="orithos-ai-quick-actions"
                    className="inline-flex min-h-10 items-center rounded-lg px-2 text-[13px] font-medium text-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)]"
                  >
                    Hide
                  </button>
                </div>
                <div className="max-h-[min(36vh,280px)] overflow-y-auto overscroll-contain">
                  <QuickActions onAction={runQuickAction} />
                </div>
              </div>
            ) : (
              <div className="shrink-0 border-t border-[var(--oh-border)] bg-white px-3.5 py-2">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickActionsOpen(true)}
                    aria-expanded={false}
                    aria-controls="orithos-ai-quick-actions"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
                  >
                    <Plus size={15} />
                    Quick actions
                  </button>
                  {aiEnabled === false ? (
                    <p className="min-w-0 truncate text-right text-[12px] text-[var(--oh-muted)]">
                      Shortcuts still work
                    </p>
                  ) : voiceStatus ? (
                    <p className="min-w-0 flex-1 truncate text-right text-[13px] font-medium text-[var(--oh-primary)]">
                      {voiceStatus}
                    </p>
                  ) : (
                    <p className="min-w-0 truncate text-right text-[12px] text-[var(--oh-muted)]">
                      {fullscreenPanel ? "Tap send" : "Enter to send"}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div
              className="shrink-0 border-t border-[var(--oh-border)] bg-white px-3.5 py-2"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              {composer}
            </div>
          </div>
        </div>
      )}

      {!expanded && launcherVisible && !pagePresentation && (
        <button
          type="button"
          onClick={onFabClick}
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label="Open Orithos AI assistant"
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
      {pagePresentation
        ? floatUi
        : mounted
          ? createPortal(floatUi, document.body)
          : null}
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
  onOpenLink,
  onRetry,
  onClear,
  busy,
  thinkingHint,
  compact = false,
}: {
  messages: ChatMessage[];
  onOpenLink: (href: string) => void;
  onRetry: (question: string) => void;
  onClear: () => void;
  busy?: boolean;
  thinkingHint?: string | null;
  compact?: boolean;
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
    <div className="flex min-h-full flex-col p-3.5">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
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
      {diagnosticMessages.length > 0 && !compact ? (
        <p
          aria-label="AI session diagnostics"
          className="mb-2.5 shrink-0 rounded-md bg-white px-2.5 py-1.5 text-[11px] tabular-nums text-[var(--oh-muted)]"
        >
          AI session · {diagnosticMessages.length} {diagnosticMessages.length === 1 ? "response" : "responses"}
          {" · "}{successRate}% success · {averageLatency}ms avg
        </p>
      ) : null}
      <div className="space-y-2.5 pb-1">
        {messages.map((msg, i) => {
          const links = messageLinks(msg);
          const cards = msg.cards ?? [];
          const cardCtas = cards.map(resolveAssistantCardCta);
          const cardRoutes = new Set(cardCtas.flatMap((cta) => cta ? [cta.href] : []));
          const fallbackLinks = links.filter((link) => !cardRoutes.has(link.href));
          const hasStructuredCards = msg.role === "assistant" && cards.length > 0;
          return (
          <div
            key={i}
            className={cn(
              "max-w-[92%] text-[14px] leading-relaxed",
              msg.role === "user"
                ? "ml-auto rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-orange-light)] px-3.5 py-2.5 text-[var(--oh-text)]"
                : hasStructuredCards
                  ? "mr-auto whitespace-pre-wrap text-[var(--oh-text)]"
                  : "mr-auto whitespace-pre-wrap rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-white px-3.5 py-2.5 text-[var(--oh-text)] shadow-sm",
            )}
          >
            {msg.role === "assistant" && msg.reportId && cards.length === 0 ? (
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
            ) : cards.length > 0 ? (
              <div className="space-y-2">
                {cards.map((card, cardIndex) => {
                  const cardCta = cardCtas[cardIndex];
                  const chineseCard = /[\u3400-\u9fff]/.test(`${msg.question ?? ""} ${card.summary ?? ""}`);
                  const title = assistantCardTitle(card.type, card.title, chineseCard);
                  return (
                  <section
                    key={`${card.type}-${cardIndex}`}
                    aria-label={title}
                    className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-[13px] text-[var(--oh-text)]">{title}</strong>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        card.status === "unavailable"
                          ? "bg-rose-50 text-rose-700"
                          : card.status === "empty"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700",
                      )}>
                        {card.status === "unavailable"
                          ? chineseCard ? "暂不可用" : "Unavailable"
                          : card.status === "empty"
                            ? chineseCard ? "暂无匹配" : "No match"
                            : chineseCard ? "可用" : "Ready"}
                      </span>
                    </div>
                    {card.summary ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--oh-text-secondary)]">
                        {card.summary}
                      </p>
                    ) : null}
                    {card.items && card.items.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--oh-text-secondary)]">
                        {card.items.slice(0, 3).map((item, itemIndex) => (
                          <li key={itemIndex}>• {String(item.label ?? item.name ?? item.title ?? "")}</li>
                        ))}
                      </ul>
                    ) : null}
                    {card.emptyReason && !card.summary?.toLowerCase().includes(card.emptyReason.toLowerCase()) ? (
                      <p className="mt-1 text-[12px] text-[var(--oh-muted)]">{card.emptyReason}</p>
                    ) : null}
                    {cardCta ? (
                      <button
                        type="button"
                        onClick={() => onOpenLink(cardCta.href)}
                        className={cn(chatNavLinkClassName, "mt-1.5")}
                      >
                        {assistantCardCtaLabel(cardCta, chineseCard)}
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                      </button>
                    ) : null}
                    {card.status === "unavailable" && msg.retryQuestion ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRetry(msg.retryQuestion!)}
                        className={cn(chatNavLinkClassName, "mt-1.5 disabled:cursor-not-allowed disabled:opacity-50")}
                      >
                        <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
                        {chineseCard ? "重试" : "Retry"}
                      </button>
                    ) : null}
                  </section>
                  );
                })}
                {msg.reportId ? (
                  <a
                    href={`/reports/ai/${msg.reportId}`}
                    {...(getUiMode() === "mobile"
                      ? {}
                      : { target: "_blank", rel: "noopener noreferrer" })}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--oh-muted)] underline decoration-[var(--oh-border)] underline-offset-2 hover:text-[var(--oh-primary)]"
                  >
                    {/[一-鿿]/.test(msg.text)
                      ? "查看完整报表"
                      : "View full report"}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : null}
              </div>
            ) : (
              <>
                {msg.text}
                {msg.role === "assistant" && msg.retryQuestion ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRetry(msg.retryQuestion!)}
                    className={cn(chatNavLinkClassName, "mt-2 disabled:cursor-not-allowed disabled:opacity-50")}
                  >
                    <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
                    Retry
                  </button>
                ) : null}
              </>
            )}
            {msg.role === "assistant" && msg.table && msg.table.rows.length > 0 && (
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
            {msg.role === "assistant" && fallbackLinks.length > 0 ? (
              <ChatActionLinks links={fallbackLinks} onOpenLink={onOpenLink} />
            ) : null}
            {msg.role === "assistant" && msg.diagnostics ? (
              <span className={cn(
                "mt-2 block text-[11px] tabular-nums",
                msg.diagnostics.status === "ok" ? "text-[var(--oh-muted)]" : "text-rose-600",
              )}>
                {msg.diagnostics.status === "ok" ? "AI" : "AI error"} · {msg.diagnostics.intent} · {msg.diagnostics.latencyMs}ms
              </span>
            ) : null}
          </div>
          );
        })}
        {busy && (
          <div className="mr-auto max-w-[92%] rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-orange-light)] px-3.5 py-2.5 text-[14px] text-[var(--oh-primary)] shadow-sm">
            {thinkingHint ?? "Thinking…"}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickActions({ onAction }: { onAction: (action: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          className="min-h-11 cursor-pointer rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] hover:text-[var(--oh-primary)]"
        >
          {action}
        </button>
      ))}
    </div>
  );
}
