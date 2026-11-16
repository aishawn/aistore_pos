"use client";

import { assistantRequestTimeoutMs, assistantTimeoutMessage, operationsPreviewIntent, prefetchOperationsPreviewSnapshots, readOperationsPreview } from "@/lib/assistant-operations-preview";
import { clearOperationsPreviewSnapshots } from "@/lib/assistant-operations-snapshot-cache";
import { fallbackHrefForQuickAction, questionForQuickAction, shortcutForQuickAction, WORKSPACE_HERO_SHORTCUTS } from "@/lib/assistant-shortcuts";
import { looksLikeAssistantWriteCommand } from "@/lib/assistant-command-routing";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { AssistantComposer } from "@/components/AssistantComposer";
import { AiCommandPreviewCard } from "@/components/ai/AiCommandPreviewCard";
import { OrithosLogo } from "@/components/OrithosLogo";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Boxes, ChevronDown, Eraser, ExternalLink, History, Lightbulb, MessageCircle, MoreHorizontal, PackageSearch, Plus, RefreshCw, ShoppingCart, Sparkles, Store, X } from "lucide-react";
import { cn, formatReportColumnHeader } from "@/lib/utils";
import {
  askAssistant,
  fetchAiChatThread,
  fetchAiChatThreads,
  fetchAiClientConfig,
  parseAiCommand,
  confirmAiCommand,
  ApiError,
  type AssistantCard,
  type AiChatThreadSummary,
  type AssistantResponse,
  type AiCommandResponse,
} from "@/lib/api";
import {
  resolveEntityAction,
} from "@/lib/ai-entity-actions";
import { entityActionPage, isReadOnlyEntityOperation } from "@/lib/ai-entity-routing";
import { assistantCardCtaLabel, assistantCardTitle, assistantSaleActionHref, normalizeAssistantHref, resolveAssistantCardCta } from "@/lib/assistant-card-cta";
import { assistantCardMetadataValue, restoredAssistantCardFields, retryQuestionForAssistantCards } from "@/lib/assistant-chat-history";
import { assistantAbortOutcome, type AssistantAbortReason } from "@/lib/assistant-request-state";
import { assistantCardDisplayStatus, assistantDataTimestampLabel, assistantDisplayDataSource, assistantProvenanceFields, assistantReportDataStatus, assistantReportDateRange, assistantReturnedSalesDateSummary, assistantRouteLabel, requestedSalesDateRange } from "@/lib/assistant-provenance";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { AiFabIcon } from "@/components/AiFabIcon";
import { useOptionalAiAssistant } from "@/lib/ai-assistant";
import { useOptionalSellScreen, type LeftView } from "@/lib/sell-screen";
import { getUiMode, isMobileAllowedHref } from "@/lib/ui-mode";


const FLOAT_SHADOW =
  "0 4px 24px rgba(37, 99, 235, 0.10), 0 1px 4px rgba(15, 23, 42, 0.06)";
const FLOAT_POS_KEY = "orithos-ai-float-anchor";
const DRAG_THRESHOLD_PX = 6;

type FloatAnchor = { x: number; y: number };

function defaultAnchor(bottomInset = 88): FloatAnchor {
  if (typeof window === "undefined") return { x: 88, y: 88 };
  const mobileInset = window.matchMedia("(max-width: 767px)").matches ? bottomInset : 24;
  return { x: window.innerWidth - 24, y: window.innerHeight - mobileInset };
}

function mobileFloatBottomInset(pathname: string, compactRegister: boolean): number {
  if (pathname === "/invoices/new" || pathname === "/close") return 176;
  return compactRegister ? 108 : 88;
}

function loadAnchor(): FloatAnchor {
  try {
    const raw = sessionStorage.getItem(FLOAT_POS_KEY);
    if (!raw) return defaultAnchor();
    const parsed = JSON.parse(raw) as FloatAnchor;
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {
    /* ignore */
  }
  return defaultAnchor();
}

function clampAnchor(anchor: FloatAnchor, width: number, height: number, bottomInset = 8): FloatAnchor {
  const margin = 8;
  const minX = width + margin;
  const minY = height + margin;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const maxX = Math.max(minX, window.innerWidth - (mobile ? 0 : margin));
  const maxY = Math.max(minY, window.innerHeight - bottomInset);
  return {
    x: Math.min(Math.max(minX, anchor.x), maxX),
    y: Math.min(Math.max(minY, anchor.y), maxY),
  };
}

function findClearAnchor(anchor: FloatAnchor, width: number, height: number, bottomInset = 8): FloatAnchor {
  const preferred = clampAnchor(anchor, width, height, bottomInset);
  const mobile = window.matchMedia("(max-width: 767px)").matches;

  const margin = 8;
  const minX = width + margin;
  const maxX = Math.max(minX, window.innerWidth - (mobile ? 0 : margin));
  const minY = height + (mobile ? 64 : margin);
  const maxY = Math.max(minY, window.innerHeight - bottomInset);
  const obstacles = Array.from(document.querySelectorAll<HTMLElement>(
    "button, a, input, select, textarea, [role='button'], h1, h2, h3, p, label, dt, dd, span",
  )).flatMap((element) => {
    if (element.closest("[data-ai-fab]") || element.getClientRects().length === 0) return [];
    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") return [];
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return [];
    const interactive = element.matches("button, a, input, select, textarea, [role='button']");
    const text = element.textContent?.trim();
    const compactText = element.matches("span")
      && (style.display === "inline-flex" || style.display === "inline-block")
      && rect.width <= 180
      && rect.height <= 64
      && Boolean(text)
      && (text?.length ?? 0) <= 60;
    if (!interactive && !element.matches("h1, h2, h3, p, label, dt, dd") && !compactText) return [];
    return [{ rect, weight: interactive ? 8 : 3 }];
  });

  const score = (candidate: FloatAnchor) => {
    const left = candidate.x - width;
    const top = candidate.y - height;
    return obstacles.reduce((total, obstacle) => {
      const overlapWidth = Math.max(0, Math.min(candidate.x, obstacle.rect.right + 6) - Math.max(left, obstacle.rect.left - 6));
      const overlapHeight = Math.max(0, Math.min(candidate.y, obstacle.rect.bottom + 6) - Math.max(top, obstacle.rect.top - 6));
      return total + overlapWidth * overlapHeight * obstacle.weight;
    }, 0);
  };

  if (score(preferred) === 0) return preferred;
  // Keep the mobile launcher out of the top bar. The header gap can look empty
  // to the obstacle scanner while still colliding with the brand and menu.
  // A lower anchor is predictable and leaves navigation permanently usable.
  if (mobile) {
    const lowerBottomInset = Math.max(bottomInset, 88);
    const lowerAnchor = { x: window.innerWidth - margin, y: window.innerHeight - lowerBottomInset };
    // Only use the predictable lower position when it is genuinely clear.
    // Otherwise continue the grid search so the launcher does not cover
    // async empty states or explanatory copy near the bottom of a page.
    if (score(lowerAnchor) === 0) return clampAnchor(lowerAnchor, width, height, lowerBottomInset);
  }

  let best = preferred;
  let bestScore = score(preferred);
  let bestDistance = Number.POSITIVE_INFINITY;
  const consider = (candidate: FloatAnchor) => {
    const candidateScore = score(candidate);
    const distance = (candidate.x - preferred.x) ** 2 + (candidate.y - preferred.y) ** 2;
    if (candidateScore < bestScore || (candidateScore === bestScore && distance < bestDistance)) {
      best = candidate;
      bestScore = candidateScore;
      bestDistance = distance;
    }
  };
  for (let y = minY; y <= maxY; y += 32) {
    for (let x = minX; x <= maxX; x += 32) consider({ x, y });
  }
  // The stepped scan can miss the exact viewport edge, which is often the
  // only clear strip beside a full-width mobile card.
  for (const y of [minY, preferred.y, maxY]) consider({ x: maxX, y });
  return clampAnchor(best, width, height, bottomInset);
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
  source?: string | null;
  dataSource?: string | null;
  storeScope?: string | null;
  dataAsOf?: string | null;
  reportPeriodFrom?: string | null;
  reportPeriodTo?: string | null;
  reportPeriodRange?: string | null;
  reportTimeZone?: string | null;
  reportDataStatus?: string | null;
  requestedDateRange?: string | null;
  suggestedFollowUps?: string[] | null;
  clarificationRequired?: boolean;
  clarifyingQuestion?: string | null;
  requiresConfirmation?: boolean;
  diagnostics?: {
    intent: string;
    latencyMs: number;
    status: "ok" | "error";
  };
  command?: AiCommandResponse | null;
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
    "/customers": "Open customers",
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
    "/history": "Open sales history",
    "/purchases": "Open purchases",
    "/suppliers": "Open suppliers",
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
    error.code === 50301
  ) {
    return mode === "voice"
      ? "AI voice transcription is not enabled for this store. Type your request instead."
      : "The AI assistant is not enabled for this store. Contact your administrator. Product search and checkout are still available.";
  }
  if (error instanceof ApiError && error.code === 50210) {
    return mode === "voice"
      ? "No clear speech was detected. Speak for a moment, then pause briefly and try again."
      : "The AI service could not complete this request. Retry, or open the sales dashboard or replenishment page to check business data.";
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
  /** Dedicated AI workspace chrome used by the /assistant route. */
  workspace?: boolean;
}

/** Sell page AI chat panel — intent → frontend dispatcher. */
export function SellAiPanel({
  expanded,
  onExpandedChange,
  launcherVisible = true,
  presentation = "float",
  forceFullscreen = false,
  onRequestClose,
  workspace = false,
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
  const [busy, setBusy] = useState(false);
  const [requestCancelable, setRequestCancelable] = useState(false);
  const [orbCompleted, setOrbCompleted] = useState(false);
  const previousBusyRef = useRef(false);
  const [thinkingHint, setThinkingHint] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequestRef = useRef(false);
  const [historyThreads, setHistoryThreads] = useState<AiChatThreadSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(true);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [clientConfigReady, setClientConfigReady] = useState(false);
  const [transcriptionAvailable, setTranscriptionAvailable] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const threadLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestAbortReasonRef = useRef<AssistantAbortReason | null>(null);
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
  const [mobileViewport, setMobileViewport] = useState(false);
  const [dragging, setDragging] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const restoreFabRef = useRef(false);
  useEffect(() => {
    if (busy) {
      previousBusyRef.current = true;
      return;
    }
    if (!previousBusyRef.current) return;

    previousBusyRef.current = false;
    setOrbCompleted(true);
    const timeout = window.setTimeout(() => setOrbCompleted(false), 760);
    return () => window.clearTimeout(timeout);
  }, [busy]);

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
      if (historyOpen) {
        setHistoryOpen(false);
        return;
      }
      dismissPanel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pagePresentation, expanded, dismissPanel, historyOpen]);

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
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    setMobileViewport(mobile);
    const compactRegister = pathname === "/register/classic" && mobile;
    const size = mobile ? 44 : 64;
    const bottomInset = mobile ? mobileFloatBottomInset(pathname, compactRegister) : 8;
    const savedAnchor = mobile ? defaultAnchor(bottomInset) : loadAnchor();
    const safeAnchor = findClearAnchor(savedAnchor, size, size, bottomInset);
    setAnchor(safeAnchor);
    if (safeAnchor.x !== savedAnchor.x || safeAnchor.y !== savedAnchor.y) {
      try {
        sessionStorage.setItem(FLOAT_POS_KEY, JSON.stringify(safeAnchor));
      } catch {
        // The route-specific position still applies for this mount.
      }
    }
  }, [pathname]);

  useEffect(() => {
    // The expanded panel fills the viewport edge; its size must never move the orb.
    if (!mounted || expanded || pagePresentation || workspace || !launcherVisible) return;
    function reclamp() {
      const el = floatRef.current;
      if (!el || dragRef.current) return;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      setMobileViewport(mobile);
      setAnchor((prev) => {
        const compactRegister = pathname === "/register/classic" && mobile;
        const size = mobile ? 44 : 64;
        const bottomInset = mobile ? mobileFloatBottomInset(pathname, compactRegister) : 8;
        const next = findClearAnchor(prev, size, size, bottomInset);
        try {
          sessionStorage.setItem(FLOAT_POS_KEY, JSON.stringify(next));
        } catch {
          // Dragging still works when browser storage is unavailable.
        }
        return next;
      });
    }
    let scrollFrame = 0;
    function scheduleReposition() {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(reclamp);
    }
    reclamp();
    window.addEventListener("resize", reclamp);
    document.addEventListener("scroll", scheduleReposition, true);
    const contentObserver = new MutationObserver(scheduleReposition);
    contentObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", reclamp);
      document.removeEventListener("scroll", scheduleReposition, true);
      contentObserver.disconnect();
      cancelAnimationFrame(scrollFrame);
    };
  }, [mounted, expanded, pagePresentation, workspace, launcherVisible, pathname]);

  function beginDrag(e: React.PointerEvent) {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return;
    // A canceled drag may not generate a click. Each new press starts cleanly.
    suppressClickRef.current = false;
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
    e.preventDefault();
    suppressClickRef.current = true;
    setDragging(true);
    const el = floatRef.current;
    const w = el?.offsetWidth ?? 72;
    const h = el?.offsetHeight ?? 72;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const compactRegister = pathname === "/register/classic" && mobile;
    const bottomInset = mobile ? mobileFloatBottomInset(pathname, compactRegister) : 8;
    setAnchor(clampAnchor({ x: drag.origX + dx, y: drag.origY + dy }, w, h, bottomInset));
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
          const mobile = window.matchMedia("(max-width: 767px)").matches;
          const compactRegister = pathname === "/register/classic" && mobile;
          const bottomInset = mobile ? mobileFloatBottomInset(pathname, compactRegister) : 8;
          const next = findClearAnchor(prev, el.offsetWidth, el.offsetHeight, bottomInset);
          try {
            sessionStorage.setItem(FLOAT_POS_KEY, JSON.stringify(next));
          } catch {
            // Position remains usable for this mount without browser storage.
          }
          return next;
        });
      });
    }
    return moved;
  }

  function onFabClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current && e.detail !== 0) {
      suppressClickRef.current = false;
      return;
    }
    suppressClickRef.current = false;
    restoreFabRef.current = true;
    restoreFocusRef.current = null;
    openPanel();
  }

  useEffect(() => {
    if (messages.length <= 1 && !busy) return;
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
        setTranscriptionAvailable(config.transcriptionAvailable === true);
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
      }).finally(() => { if (!cancelled) setClientConfigReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!expanded || !ai?.launchMode) return;
    ai.clearLaunchMode();
  }, [expanded, ai]);

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
    // In-chat navigations already push a new route; do not also exit /assistant.
    if (!options?.skipRouteExit) {
      onRequestClose?.();
    }
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

  function updateChatUrl(id: number | string | null, replace = false) {
    if (!workspace || !pagePresentation) return;
    const url = id == null ? "/assistant" : `/assistant?chat=${encodeURIComponent(String(id))}`;
    if (window.location.pathname + window.location.search !== url) {
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
    }
  }

  function clearChat() {
    if (busy || busyRef.current) return;
    threadLoadRef.current += 1;
    setHistoryLoading(false);
    setHistoryError(null);
    clearOperationsPreviewSnapshots();
    updateChatUrl(null);
    setMessages([{ role: "assistant", text: greetingText(aiEnabled) }]);
    setThreadId(null);
    setInput("");
    setHistoryOpen(false);
    setQuickActionsOpen(true);
  }

  async function openHistory() {
    if (busy || busyRef.current || historyRequestRef.current) return;
    historyRequestRef.current = true;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryThreads(await fetchAiChatThreads());
    } catch (e) {
      setHistoryError(aiFailureMessage(e, "chat"));
      setHistoryThreads([]);
    } finally {
      historyRequestRef.current = false;
      setHistoryLoading(false);
    }
  }

  async function loadHistoryThread(id: number | string, syncUrl = true) {
    const request = ++threadLoadRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const detail = await fetchAiChatThread(id);
      if (request !== threadLoadRef.current) return;
      let previousQuestion: string | undefined;
      const restored: ChatMessage[] = detail.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const message: ChatMessage = {
            role: m.role as "user" | "assistant",
            text: m.text || "",
            ...(m.role === "assistant" ? { reportId: m.reportId ?? null, table: m.table ?? null } : {}),
            ...(m.role === "assistant" ? restoredAssistantCardFields(m.cards, previousQuestion, m) : {}),
            ...(m.role === "assistant" ? {
              ...assistantProvenanceFields(m),
              suggestedFollowUps: m.suggestedFollowUps ?? null,
              clarificationRequired: m.clarificationRequired === true,
              clarifyingQuestion: m.clarifyingQuestion ?? null,
              requiresConfirmation: m.requiresConfirmation === true,
            } : {}),
            ...(m.role === "assistant" && previousQuestion ? { question: previousQuestion } : {}),
            diagnostics: m.role === "assistant" && m.intent
              ? { intent: m.intent, latencyMs: 0, status: "ok" as const }
              : undefined,
          };
          previousQuestion = m.role === "user" ? m.text || "" : undefined;
          return message;
        });
      if (!restored.length) {
        setMessages([]);
        setThreadId(null);
        setHistoryError("This saved conversation has no recoverable messages. Start a new chat or open another conversation.");
        if (syncUrl) updateChatUrl(id);
        setHistoryOpen(false);
        return;
      }
      setMessages(restored);
      setThreadId(detail.sessionKey);
      setInput("");
      if (syncUrl) updateChatUrl(id);
      setQuickActionsOpen(false);
      setHistoryOpen(false);
    } catch (e) {
      if (request === threadLoadRef.current) {
        setHistoryError(aiFailureMessage(e, "chat"));
        setMessages([]);
        setThreadId(null);
      }
    } finally {
      if (request === threadLoadRef.current) setHistoryLoading(false);
    }
  }

  const restoreUrlChat = useEffectEvent(() => {
    const id = new URLSearchParams(window.location.search).get("chat");
    // Session keys include the backend tenant:user:UUID prefix.
    if (id && /^[a-zA-Z0-9_:-]{1,200}$/.test(id)) {
      void loadHistoryThread(id, false);
    } else if (id) {
      setHistoryError("Invalid chat link. Start a new chat or select one from History.");
      setMessages([]);
      setThreadId(null);
    } else {
      clearChat();
    }
  });
  useEffect(() => {
    if (!workspace || !pagePresentation || !clientConfigReady) return;
    if (new URLSearchParams(window.location.search).has("chat")) restoreUrlChat();
    const onPopState = () => restoreUrlChat();
    window.addEventListener("popstate", onPopState);
    return () => {
      threadLoadRef.current += 1;
      window.removeEventListener("popstate", onPopState);
    };
  }, [workspace, pagePresentation, clientConfigReady]);

  useEffect(() => {
    if (!workspace || !pagePresentation || !clientConfigReady || aiEnabled !== true) return;
    const controller = new AbortController();
    prefetchOperationsPreviewSnapshots(controller.signal);
    return () => controller.abort();
  }, [workspace, pagePresentation, clientConfigReady, aiEnabled]);

  function lockAndClearInput() {
    setInput("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.blur();
    }
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
    const pendingCommand = [...messages].reverse().find((message) => message.command?.status === "PREVIEWED")?.command;
    const isConfirmation = /^(?:确认|确认修改|确认执行|confirm|confirmed|execute)$/i.test(text.trim());
    if (pendingCommand && isConfirmation) {
      try {
        const command = await confirmAiCommand(pendingCommand.commandId, text.trim(), "VOICE", pendingCommand.version);
        updateCommandMessage(command);
        busyRef.current = false;
        setBusy(false);
        return;
      } catch (e) {
        appendReply({
          role: "assistant",
          question: text,
          text: e instanceof Error ? e.message : "The change could not be confirmed.",
          diagnostics: { intent: "ai_command", latencyMs: 0, status: "error" },
        });
        busyRef.current = false;
        setBusy(false);
        return;
      }
    }
    const looksLikeCommand = looksLikeAssistantWriteCommand(text);
    if (looksLikeCommand && !operationsPreviewIntent(text)) {
      try {
        const command = await parseAiCommand(text, threadId, surfaceFromPath(pathname));
        appendCommandReply(command, text, retryExistingMessage);
        busyRef.current = false;
        setBusy(false);
        return;
      } catch (e) {
        appendReply({
          role: "assistant",
          question: text,
          text: e instanceof Error ? e.message : "The change request could not be prepared.",
          diagnostics: { intent: "command", latencyMs: 0, status: "error" },
        });
        busyRef.current = false;
        setBusy(false);
        return;
      }
    }
    if (tryLocalWorkspaceIntent(text)) {
      busyRef.current = false;
      setBusy(false);
      setThinkingHint(null);
      return;
    }
    // This function runs only from user event handlers; the compiler rule cannot infer that boundary.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = performance.now();
    const hintTimers: number[] = [
      window.setTimeout(() => setThinkingHint("Still working on your question…"), 3000),
      window.setTimeout(
        () => setThinkingHint(operationsPreviewIntent(text) === "replenishment"
          ? "Reading the full store catalogue and sales history. This can take up to two minutes…"
          : "This is taking longer than usual — hang tight…"),
        8000,
      ),
    ];
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    requestControllerRef.current = controller;
    requestAbortReasonRef.current = null;
    setRequestCancelable(controller !== null);
    const hardTimeout = window.setTimeout(() => {
      if (!controller) return;
      requestAbortReasonRef.current = "timeout";
      controller.abort();
    }, assistantRequestTimeoutMs(text));
    try {
      const result = await readOperationsPreview(text, threadId, controller?.signal)
        ?? await askAssistant(text, threadId, controller?.signal, surfaceFromPath(pathname));
      if (controller?.signal.aborted && requestAbortReasonRef.current === "user") return;
      if (result.threadId) {
        setThreadId(result.threadId);
        if (!new URLSearchParams(window.location.search).has("chat")) {
          updateChatUrl(result.threadId, true);
        }
      }
      const outcome = await dispatchIntent(result);
      if (controller?.signal.aborted && requestAbortReasonRef.current === "user") return;
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
              text: result.clarificationRequired && result.clarifyingQuestion
                ? result.clarifyingQuestion
                : answerText,
              question: text,
              table: result.table ?? null,
              reportId: result.reportId ?? null,
              cards: result.cards ?? null,
              retryQuestion: retryQuestionForAssistantCards(result.cards, text) ?? null,
              ...assistantProvenanceFields(result),
              requestedDateRange: requestedSalesDateRange(result.intent, result.slots),
              suggestedFollowUps: result.suggestedFollowUps ?? null,
              clarificationRequired: result.clarificationRequired === true,
              clarifyingQuestion: result.clarifyingQuestion ?? null,
              requiresConfirmation: result.requiresConfirmation === true,
              cta,
              links: cta ? [cta] : recoveryLinks.length ? recoveryLinks : null,
              diagnostics: {
                intent: result.intent || "unknown",
                // eslint-disable-next-line react-hooks/purity
                latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
                status: result.cards?.some((card) => card.status === "unavailable") ? "error" : "ok",
              },
            });
        }
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 50301 || e.status === 503)) {
        // A transient 503 is not evidence that the store disabled AI.
        if (e.code === 50301) setAiEnabled(false);
      }
      const aborted =
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted && assistantAbortOutcome(requestAbortReasonRef.current ?? "timeout") === "cancelled") return;
      appendReply({
          role: "assistant",
          question: text,
          text: aborted
            ? assistantTimeoutMessage(text)
            : aiFailureMessage(e, "chat"),
          retryQuestion: e instanceof ApiError && (e.code === 50301 || e.status === 503) ? null : text,
          links: operationsPreviewIntent(text) === "replenishment"
            ? [{ href: "/purchases?tab=replenishment", label: "Open replenishment" }] : null,
          diagnostics: {
            intent: "unavailable",
            // eslint-disable-next-line react-hooks/purity
            latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
            status: "error",
          },
        });
    } finally {
      window.clearTimeout(hardTimeout);
      for (const id of hintTimers) window.clearTimeout(id);
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        requestAbortReasonRef.current = null;
        setRequestCancelable(false);
      }
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

  function cancelAssistantRequest() {
    const controller = requestControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    requestAbortReasonRef.current = "user";
    controller.abort();
  }

  function appendCommandReply(command: AiCommandResponse, text: string, retryExistingMessage: boolean) {
    const message: ChatMessage = {
      role: "assistant",
      text: command.summary,
      question: text,
      command,
      requiresConfirmation: command.requiresConfirmation,
      diagnostics: { intent: "ai_command", latencyMs: 0, status: "ok" },
    };
    setMessages((prev) => {
      if (!retryExistingMessage) return [...prev, message];
      const index = [...prev].reverse().findIndex((item) => item.role === "assistant" && item.retryQuestion === text);
      if (index < 0) return [...prev, message];
      const target = prev.length - 1 - index;
      const next = [...prev];
      next[target] = message;
      return next;
    });
  }

  function updateCommandMessage(command: AiCommandResponse) {
    setMessages((prev) => prev.map((message) =>
      message.command?.commandId === command.commandId ? { ...message, command, text: command.summary } : message,
    ));
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

  function runQuickAction(action: string) {
    if (busy || busyRef.current) return;
    setHistoryOpen(false);
    setQuickActionsOpen(false);
    if (action === "Products") {
      openWorkspace("/products", "Open products when you are ready.");
      return;
    }
    if (action === "Check stock" && !workspace) {
      openStockLookup("");
      return;
    }
    const shortcut = shortcutForQuickAction(action)
      ?? WORKSPACE_HERO_SHORTCUTS.find((item) => item.quickActionKey === action)
      ?? null;
    const fallbackHref = shortcut?.fallbackHref ?? fallbackHrefForQuickAction(action);
    const question = questionForQuickAction(action, workspace);
    if (question) {
      if (aiEnabled === false) {
        if (fallbackHref) {
          openWorkspace(fallbackHref, "Open the report when you are ready.", { immediate: true });
        }
        return;
      }
      void runIntent(question);
      return;
    }
    runSellAction(action);
  }

  function navigateSidebarItem(label: string) {
    const destinations: Record<string, { href: string; note: string }> = {
      "Low stock analysis": { href: "/stock/replenishment", note: "Opened replenishment." },
      "Create purchase order": { href: "/orders/new", note: "Opened a new purchase order." },
      "Sales performance": { href: "/reports/last-week-sales", note: "Opened sales performance." },
      "Top selling products": { href: "/reports/sales", note: "Opened top selling products." },
      "Customer insights": { href: "/customers", note: "Opened customer insights." },
      "Stock recommendations": { href: "/stock/replenishment", note: "Opened stock recommendations." },
      "Price optimisation": { href: "/stock/capped-pricing", note: "Opened price optimisation." },
      "Find a wine": { href: "/sommelier", note: "Opened wine recommendations." },
    };
    const destination = destinations[label];
    if (!destination || busy || busyRef.current) return;
    openWorkspace(destination.href, destination.note, { immediate: true });
  }

  const chatOff = aiEnabled === false;
  const submitPendingQuestion = useEffectEvent(() => {
    if (!pagePresentation || !clientConfigReady) return;
    const question = ai?.takePendingQuestion();
    if (!question) return;
    if (aiEnabled === false) { setInput(question); return; }
    setQuickActionsOpen(false);
    void runIntent(question);
  });
  useEffect(() => { submitPendingQuestion(); }, [pagePresentation, clientConfigReady]);

  const composer = (
    <AssistantComposer value={input} onChange={setInput} inputRef={inputRef} disabled={busy || historyLoading || (workspace && !!historyError) || chatOff || !expanded} cancelable={requestCancelable} onCancel={cancelAssistantRequest} voiceAvailable={transcriptionAvailable} placeholder={chatOff ? "AI chat is off for this store" : busy ? "Waiting for reply…" : "Ask Orithos AI…"} onSend={async question => {
      if (busyRef.current || chatOff) return;
      setQuickActionsOpen(false);
      await runIntent(question);
    }} />
  );

  const workspaceHeroUi = {
    hero_stock: { icon: BarChart3, tone: "orange" as const },
    hero_sales: { icon: BarChart3, tone: "blue" as const },
    hero_restock: { icon: Boxes, tone: "green" as const },
    hero_opportunities: { icon: Lightbulb, tone: "amber" as const },
  };
  const sidebarWorkflows = [
    { label: "Low stock analysis", icon: PackageSearch },
    { label: "Create purchase order", icon: ShoppingCart },
    { label: "Sales performance", icon: BarChart3 },
    { label: "Top selling products", icon: Boxes },
    { label: "Customer insights", icon: Store },
    { label: "Stock recommendations", icon: PackageSearch },
    { label: "Price optimisation", icon: BarChart3 },
    { label: "Find a wine", icon: Sparkles },
  ] as const;

  const workspaceUi = (
    <div className="ai-assistant-shell pointer-events-auto relative z-10 flex h-full w-full overflow-hidden bg-[var(--oh-surface)]">
      <div
        className="ai-assistant-backdrop pointer-events-none absolute inset-0 z-0 bg-[url('/images/ai-assistant-background.webp')] bg-cover bg-[center_bottom] opacity-75"
        aria-hidden="true"
      />
      <div
        className="ai-assistant-wash pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[68%] bg-gradient-to-t from-[#edf2fa]/10 via-[#edf2fa]/38 to-transparent"
        aria-hidden="true"
      />
      <aside className="relative z-10 hidden w-[256px] shrink-0 flex-col overflow-y-auto border-r border-white/70 bg-[var(--oh-surface-elevated)]/55 px-4 py-5 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-7">
          <Link href="/dashboard" aria-label="Open Dashboard" title="Dashboard" className="inline-flex min-h-11 items-center rounded-lg transition hover:bg-[var(--oh-surface-elevated)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2">
            <OrithosLogo />
          </Link>
        </div>
        <nav className="space-y-1 text-[14px]" aria-label="AI assistant navigation">
          <Link href="/" className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[var(--oh-muted)] transition hover:bg-[var(--oh-surface-elevated)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
            <ShoppingCart size={17} /> Sell
          </Link>
          <button type="button" onClick={clearChat} disabled={busy || historyLoading} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[var(--oh-muted)] transition hover:bg-[var(--oh-surface-elevated)] hover:text-[var(--oh-text)]">
            <MessageCircle size={17} /> New chat
          </button>
          <button type="button" onClick={() => void openHistory()} disabled={busy || historyLoading} aria-current={historyOpen ? "page" : undefined} className={cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 transition focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50", historyOpen ? "bg-[var(--oh-orange-light)] font-semibold text-[var(--oh-primary)]" : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface-elevated)]")}>
            <History size={17} /> History
          </button>
        </nav>
        <div className="mt-7 overflow-y-auto text-[13px] text-[var(--oh-muted)]">
          <button type="button" onClick={() => setWorkflowsOpen((open) => !open)} aria-expanded={workflowsOpen} aria-controls="assistant-workflows" className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 font-medium hover:bg-[var(--oh-surface-elevated)]">Suggested workflows <ChevronDown size={15} className={cn("transition-transform", workflowsOpen && "rotate-180")} /></button>
          <div id="assistant-workflows" hidden={!workflowsOpen} className="space-y-0.5">
            {sidebarWorkflows.map((item) => {
              const Icon = item.icon;
              return <button key={item.label} type="button" onClick={() => navigateSidebarItem(item.label)} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition hover:bg-[var(--oh-surface-elevated)] hover:text-[var(--oh-text)] disabled:cursor-not-allowed disabled:opacity-50"><Icon size={15} />{item.label}</button>;
            })}
          </div>
        </div>
      </aside>
      <section className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.82),transparent_54%),linear-gradient(180deg,rgba(237,242,250,.2),rgba(237,242,250,.55))]" aria-hidden="true" />
        <header className="relative z-10 flex h-[72px] shrink-0 items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2 md:hidden"><Link href="/dashboard" aria-label="Open Dashboard" title="Dashboard" className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2"><OrithosLogo /></Link></div>
          <div className="relative ml-auto flex items-center gap-2">
            <button type="button" onClick={() => void openHistory()} disabled={busy || historyLoading} aria-label="Chat history" title="Chat history" className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--oh-muted)] transition hover:bg-[var(--oh-surface-elevated)]/70"><MoreHorizontal size={18} /></button>
          </div>
        </header>
        {historyError && <p role="alert" className="relative z-10 px-4 py-2 text-sm text-rose-700">{historyError}</p>}
        {historyLoading && <p role="status" className="relative z-10 px-4 py-2 text-sm">Loading chat…</p>}
        <div ref={scrollRef} aria-live="polite" aria-atomic="false" className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-32 sm:px-8 lg:px-10">
          {historyOpen ? <HistoryView loading={historyLoading || busy} error={historyError} threads={historyThreads} onBack={() => setHistoryOpen(false)} onSelect={(id) => void loadHistoryThread(id)} onRefresh={() => void openHistory()} /> : (
            <div className={cn("mx-auto flex min-h-full w-full max-w-[1080px] flex-col py-6", messages.length > 1 ? "justify-start" : "justify-center sm:py-12")}>
              {messages.length <= 1 && <div className="mb-5 text-center sm:mb-10"><div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-white/80 bg-[var(--oh-surface-elevated)]/55 text-[#ef681b] shadow-[0_12px_40px_rgba(245,120,55,.16)] backdrop-blur sm:mb-5 sm:h-20 sm:w-20"><Sparkles size={32} strokeWidth={1.7} /></div><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#142239] dark:text-[var(--oh-text)] sm:text-[42px]">Hello, I’m <span className="text-[var(--oh-primary)]">Orithos AI</span></h1><p className="mt-1.5 text-[16px] text-[#52627a] dark:text-[var(--oh-text-secondary)] sm:mt-2 sm:text-[22px]">How can I help with your store today?</p></div>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{WORKSPACE_HERO_SHORTCUTS.map((item) => {
                const ui = workspaceHeroUi[item.id as keyof typeof workspaceHeroUi];
                const Icon = ui.icon;
                return <button key={item.id} type="button" onClick={() => runQuickAction(item.quickActionKey)} disabled={busy} className="group min-h-[80px] disabled:cursor-wait disabled:opacity-60 rounded-2xl border border-white/85 bg-[var(--oh-surface-elevated)]/70 p-3 text-left shadow-[0_8px_24px_rgba(77,101,145,.08)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[var(--oh-surface-elevated)]/90 hover:shadow-[0_14px_32px_rgba(77,101,145,.14)] sm:p-4"><span className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-xl sm:mb-2 sm:h-9 sm:w-9", ui.tone === "orange" && "bg-[var(--oh-orange-light)] text-[var(--oh-primary)]", ui.tone === "blue" && "bg-[#eaf1ff] text-[#3973dc]", ui.tone === "green" && "bg-[#e7f8f3] text-[#209b7d]", ui.tone === "amber" && "bg-[#fff5e8] text-[#c76a16]")}><Icon size={19} /></span><span className="flex items-start justify-between gap-2"><span><span className="block text-[15px] font-semibold text-[#18263b] dark:text-[var(--oh-text)]">{item.title}</span><span className="mt-1 block text-[13px] leading-5 text-[var(--oh-muted)]">{item.description}</span></span><span className="text-xl text-[#7c8796] dark:text-[var(--oh-muted)] transition group-hover:translate-x-0.5">›</span></span></button>;
              })}</div>
              {messages.length > 1 && <div className="mt-8"><DialogueView messages={messages} onOpenLink={followChatLink} onRetry={(question) => void runIntent(question, true)} onClear={clearChat} onCommandChange={updateCommandMessage} busy={busy} thinkingHint={thinkingHint} compact /></div>}
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-8 sm:pb-7 lg:px-10"><div className="mx-auto max-w-[1080px] rounded-[28px] border border-white/90 bg-[var(--oh-surface-elevated)]/80 p-2 shadow-[0_12px_35px_rgba(65,87,126,.14)] backdrop-blur-xl">{composer}</div></div>
      </section>
    </div>
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

    </>
  );

  const floatUi = workspace ? (
    <div className="pointer-events-none absolute inset-0 z-10 h-full w-full">
      {expanded ? workspaceUi : null}
    </div>
  ) : (
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
            !fullscreenPanel && "border-l border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]",
          )}
          style={{ boxShadow: fullscreenPanel ? "none" : FLOAT_SHADOW }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-hidden bg-[var(--oh-surface-elevated)]",
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
              <AiFabIcon
                size={40}
                className="pointer-events-none shadow-sm"
                state={busy ? "thinking" : orbCompleted ? "success" : "idle"}
              />
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
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] outline-none transition-colors hover:bg-[var(--oh-surface-elevated)]/80 hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <History size={16} />
                </button>
                <button
                  type="button"
                  onClick={dismissPanel}
                  title="Close"
                  aria-label="Close assistant"
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] outline-none transition-colors hover:bg-[var(--oh-surface-elevated)]/80 hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
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
                  loading={historyLoading || busy}
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
                  onCommandChange={updateCommandMessage}
                  busy={busy}
                  thinkingHint={thinkingHint}
                  compact={fullscreenPanel}
                />
              )}
            </div>

            {quickActionsOpen ? (
              <div
                id="orithos-ai-quick-actions"
                className="shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3.5 py-2.5"
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
              <div className="shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3.5 py-2">
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
                  ) : (
                    <p className="min-w-0 truncate text-right text-[12px] text-[var(--oh-muted)]">
                      {fullscreenPanel ? "Tap send" : "Enter to send"}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div
              className="shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3.5 py-2"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              {composer}
            </div>
          </div>
        </div>
      )}

      {!expanded && launcherVisible && !pagePresentation && (
        <button
          data-ai-fab
          type="button"
          onClick={onFabClick}
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onDragStart={(e) => e.preventDefault()}
          aria-label="Open Orithos AI assistant"
          className={cn(
            "group pointer-events-auto shrink-0 touch-none select-none border-0 bg-transparent p-0 leading-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2",
            dragging ? "cursor-grabbing" : "cursor-grab hover:-translate-y-0.5 hover:scale-105",
            !dragging && "active:scale-95",
          )}
          style={{ boxShadow: FLOAT_SHADOW, borderRadius: "9999px" }}
        >
          <AiFabIcon size={mobileViewport ? 44 : 64} state={busy ? "thinking" : orbCompleted ? "success" : "idle"} />
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
  onSelect: (id: number | string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());
  const normalizedQuery = query.trim().toLowerCase();
  const visibleThreads = normalizedQuery
    ? threads.filter((thread) => `${thread.title} ${thread.sessionKey}`.toLowerCase().includes(normalizedQuery))
    : threads;
  const groupedThreads = visibleThreads.reduce<Record<string, AiChatThreadSummary[]>>((groups, thread) => {
    const date = thread.updatedAt || thread.createdAt;
    const age = date ? Math.floor((now - new Date(date).getTime()) / 86_400_000) : 999;
    const group = age < 1 ? "Today" : age < 7 ? "Last 7 days" : "Earlier";
    (groups[group] ??= []).push(thread);
    return groups;
  }, {});
  const groupOrder = ["Today", "Last 7 days", "Earlier"];
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
            className="min-h-11 rounded-md px-2.5 py-2 text-[13px] font-medium text-[var(--oh-muted)] hover:bg-[var(--oh-surface-elevated)] hover:text-[var(--oh-text)] disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-md px-2.5 py-2 text-[13px] font-medium text-[var(--oh-primary)] hover:bg-[var(--oh-surface-elevated)]"
          >
            Back
          </button>
        </div>
      </div>
      <p className="mb-2.5 text-[12px] text-[var(--oh-muted)]">
        Your chats on this store only. Opening a thread continues that conversation.
      </p>
      {threads.length > 0 ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="mb-2.5 min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[13px] text-[var(--oh-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
        />
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 rounded-md bg-rose-50 px-2.5 py-2 text-[13px] text-rose-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-[13px] text-[var(--oh-muted)]">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="text-[13px] text-[var(--oh-muted)]">No saved chats yet. Ask a question to start one.</p>
      ) : visibleThreads.length === 0 ? (
        <p className="text-[13px] text-[var(--oh-muted)]">No chats match that search.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groupOrder.filter((group) => groupedThreads[group]?.length).map((group) => (
            <section key={group} aria-labelledby={`history-${group.replaceAll(" ", "-").toLowerCase()}`}>
              <h2 id={`history-${group.replaceAll(" ", "-").toLowerCase()}`} className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">{group}</h2>
              <ul className="space-y-1.5">
                {groupedThreads[group].map((thread) => (
                  <li key={thread.id}>
                    <button type="button" onClick={() => onSelect(thread.id)} className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">
                      <span className="block truncate text-[14px] font-medium text-[var(--oh-text)]">{thread.title || "Chat"}</span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--oh-muted)]">{thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function DialogueView({
  messages,
  onOpenLink,
  onRetry,
  onClear,
  onCommandChange,
  busy,
  thinkingHint,
  compact = false,
}: {
  messages: ChatMessage[];
  onOpenLink: (href: string) => void;
  onRetry: (question: string) => void;
  onClear: () => void;
  onCommandChange: (command: AiCommandResponse) => void;
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
          className="mb-2.5 shrink-0 rounded-md bg-[var(--oh-surface-elevated)] px-2.5 py-1.5 text-[11px] tabular-nums text-[var(--oh-muted)]"
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
              "w-full max-w-[96%] text-[14px] leading-relaxed sm:max-w-[92%]",
              msg.role === "user"
                ? "ml-auto rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-orange-light)] px-3.5 py-2.5 text-[var(--oh-text)]"
                : hasStructuredCards
                  ? "mr-auto whitespace-pre-wrap text-[var(--oh-text)]"
                  : "mr-auto whitespace-pre-wrap rounded-[var(--oh-radius)] border border-[var(--oh-tile-blue-border)] bg-[var(--oh-surface-elevated)] px-3.5 py-2.5 text-[var(--oh-text)] shadow-sm",
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
            ) : msg.command ? (
              <div className="space-y-2">
                <AiCommandPreviewCard command={msg.command} onChange={onCommandChange} />
              </div>
            ) : cards.length > 0 ? (
              <div className="space-y-2">
                {cards.map((card, cardIndex) => {
                  const cardCta = cardCtas[cardIndex];
                  const chineseCard = /[\u3400-\u9fff]/.test(`${msg.question ?? ""} ${card.summary ?? ""}`);
                  const title = assistantCardTitle(card.type, card.title, chineseCard);
                  const cardDataSource = assistantCardMetadataValue(msg, card, "dataSource");
                  const cardPeriod = assistantCardMetadataValue(msg, card, "reportPeriodFrom");
                  const cardPeriodTo = assistantCardMetadataValue(msg, card, "reportPeriodTo");
                  const cardTimeZone = assistantCardMetadataValue(msg, card, "reportTimeZone");
                  const cardDataStatus = assistantCardMetadataValue(msg, card, "reportDataStatus");
                  const cardDataAsOf = assistantCardMetadataValue(msg, card, "dataAsOf");
                  const displayStatus = assistantCardDisplayStatus(cardDataStatus, card.status, chineseCard);
                  const periodLabel = cardPeriod
                    ? assistantReportDateRange(cardPeriod, cardPeriodTo) ?? cardPeriod
                    : null;
                  return (
                  <section
                    key={`${card.type}-${cardIndex}`}
                    aria-label={title}
                    className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-[13px] text-[var(--oh-text)]">{title}</strong>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        displayStatus.tone === "unavailable"
                          ? "bg-rose-50 text-rose-700"
                          : (displayStatus.tone === "empty" || displayStatus.tone === "partial")
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700",
                      )}>
                        {displayStatus.label}
                      </span>
                    </div>
                    {card.summary ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--oh-text-secondary)]">
                        {card.summary}
                      </p>
                    ) : null}
                    {(cardDataSource || periodLabel || cardTimeZone || cardDataStatus || cardDataAsOf) ? (
                      <p className="mt-1 text-[11px] text-[var(--oh-muted)]">
                        {cardDataSource ? `${chineseCard ? "数据来源" : "Source"}: ${assistantDisplayDataSource(cardDataSource, chineseCard) ?? cardDataSource}` : ""}
                        {periodLabel ? `${cardDataSource ? " · " : ""}${chineseCard ? "期间" : "Period"}: ${periodLabel}` : ""}
                        {cardTimeZone ? `${cardDataSource || periodLabel ? " · " : ""}${chineseCard ? "时区" : "Timezone"}: ${cardTimeZone}` : ""}
                        {cardDataStatus ? `${cardDataSource || periodLabel || cardTimeZone ? " · " : ""}${chineseCard ? "数据状态" : "Data status"}: ${assistantReportDataStatus(cardDataStatus, chineseCard)}` : ""}
                        {`${cardDataSource || periodLabel || cardTimeZone || cardDataStatus ? " · " : ""}${chineseCard ? "数据时间" : "Data as of"}: ${assistantDataTimestampLabel(cardDataAsOf, chineseCard)}`}
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
                        className={cn(chatNavLinkClassName, "mt-2 min-h-11 rounded-lg border border-[var(--oh-border)] px-3 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]")}
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
                        className={cn(chatNavLinkClassName, "mt-2 min-h-11 px-3 disabled:cursor-not-allowed disabled:opacity-50")}
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
            {msg.role === "assistant" && msg.suggestedFollowUps?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggested follow-up questions">
                {msg.suggestedFollowUps.slice(0, 4).map((followUp) => (
                  <button
                    key={followUp}
                    type="button"
                    disabled={busy}
                    onClick={() => onRetry(followUp)}
                    className="min-h-10 rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--oh-muted)] transition-colors hover:border-[var(--oh-primary)] hover:bg-[var(--oh-orange-light)] hover:text-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {followUp}
                  </button>
                ))}
              </div>
            ) : null}
            {msg.role === "assistant" && (msg.dataSource || msg.source || msg.dataAsOf || msg.requestedDateRange || msg.reportPeriodRange || msg.reportTimeZone || msg.reportDataStatus || msg.storeScope) ? (
              <p className="mt-1.5 text-[11px] text-[var(--oh-muted)]">
                {msg.dataSource
                  ? /[\u3400-\u9fff]/.test(msg.question ?? msg.text)
                    ? `数据来源：${assistantDisplayDataSource(msg.dataSource, true) ?? msg.dataSource}`
                    : `Data source: ${assistantDisplayDataSource(msg.dataSource, false) ?? msg.dataSource}`
                  : ""}
                {msg.source && assistantRouteLabel(msg.source)
                  ? `${msg.dataSource ? " · " : ""}${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "查询路由" : "Query route"}: ${assistantRouteLabel(msg.source)}`
                  : ""}
                {msg.requestedDateRange
                  ? ` · ${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "查询范围" : "Requested"}: ${msg.requestedDateRange}`
                  : ""}
                {msg.reportPeriodRange
                  ? ` · ${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "报表期间" : "Report period"}: ${msg.reportPeriodRange}`
                  : ""}
                {msg.storeScope
                  ? ` · ${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "门店范围" : "Store scope"}: ${msg.storeScope}`
                  : ""}
                {msg.diagnostics?.intent === "report_sales" && msg.table?.rows?.length ? (
                  <>
                    {(msg.dataSource || msg.source || msg.requestedDateRange || msg.reportPeriodRange) ? " · " : ""}
                    {assistantReturnedSalesDateSummary(msg.table.rows, /[\u3400-\u9fff]/.test(msg.question ?? msg.text))}
                  </>
                ) : null}
                {(msg.dataAsOf || msg.dataSource || msg.reportPeriodRange) ? (
                  <>
                    {(msg.dataSource || msg.source || msg.requestedDateRange || msg.reportPeriodRange) ? " · " : ""}
                    {/[\u3400-\u9fff]/.test(msg.question ?? msg.text)
                      ? `数据时间：${assistantDataTimestampLabel(msg.dataAsOf, true)}`
                      : `Data timestamp: ${assistantDataTimestampLabel(msg.dataAsOf, false)}`}
                  </>
                ) : null}
                {msg.reportTimeZone
                  ? ` · ${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "时区" : "Timezone"}: ${msg.reportTimeZone}`
                  : ""}
                {assistantReportDataStatus(msg.reportDataStatus, /[\u3400-\u9fff]/.test(msg.question ?? msg.text))
                  ? ` · ${/[\u3400-\u9fff]/.test(msg.question ?? msg.text) ? "数据状态" : "Data status"}: ${assistantReportDataStatus(msg.reportDataStatus, /[\u3400-\u9fff]/.test(msg.question ?? msg.text))}`
                  : ""}
              </p>
            ) : null}
            {msg.role === "assistant" && msg.diagnostics ? (
              <details className="mt-2 text-[12px] text-[var(--oh-muted)]"><summary className="min-h-8 cursor-pointer">Response details</summary>
              <span className={cn(
                "mt-2 block text-[11px] tabular-nums",
                msg.diagnostics.status === "ok" ? "text-[var(--oh-muted)]" : "text-rose-600",
              )}>
                {msg.diagnostics.status === "ok" ? "AI" : "AI error"} · {msg.diagnostics.intent} · {msg.diagnostics.latencyMs}ms
              </span>
              </details>
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
