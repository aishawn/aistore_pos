import { OPERATIONS_PREVIEW_CANONICAL, type OperationsPreview } from "./assistant-operations-constants.ts";

export type ShortcutMode = "operations_preview" | "assistant_fast" | "navigate_only";

export type AssistantShortcut = {
  id: string;
  title: string;
  description?: string;
  /** Legacy quick-action string used in SellAiPanel handlers. */
  quickActionKey: string;
  canonicalQuestion: string;
  mode: ShortcutMode;
  fallbackHref: string;
  operationsPreview?: OperationsPreview;
};

export const WORKSPACE_HERO_SHORTCUTS: AssistantShortcut[] = [
  {
    id: "hero_stock",
    title: "Check stock levels",
    description: "Find low stock items and reorder suggestions",
    quickActionKey: "Check stock",
    canonicalQuestion: OPERATIONS_PREVIEW_CANONICAL.replenishment,
    mode: "operations_preview",
    fallbackHref: "/stock/replenishment",
    operationsPreview: "replenishment",
  },
  {
    id: "hero_sales",
    title: "Analyse sales",
    description: "Show me this week's performance",
    quickActionKey: "Today's sales",
    canonicalQuestion: OPERATIONS_PREVIEW_CANONICAL.sales_week,
    mode: "operations_preview",
    fallbackHref: "/reports/last-week-sales",
    operationsPreview: "sales_week",
  },
  {
    id: "hero_restock",
    title: "Review purchase needs",
    description: "Preview suggestions before ordering",
    quickActionKey: "What should I restock?",
    canonicalQuestion: "What should I restock?",
    mode: "operations_preview",
    fallbackHref: "/stock/replenishment",
    operationsPreview: "replenishment",
  },
  {
    id: "hero_opportunities",
    title: "Find opportunities",
    description: "Suggest ways to grow my store",
    quickActionKey: "Find opportunities",
    canonicalQuestion: "Suggest ways to grow my store",
    mode: "assistant_fast",
    fallbackHref: "/dashboard",
  },
];

const QUICK_ACTION_REGISTRY: Record<string, AssistantShortcut> = {
  "Today's sales": {
    id: "qa_today_sales",
    title: "Today's sales",
    quickActionKey: "Today's sales",
    canonicalQuestion: "Today's sales",
    mode: "assistant_fast",
    fallbackHref: "/history",
  },
  "What should I restock?": {
    id: "qa_restock",
    title: "What should I restock?",
    quickActionKey: "What should I restock?",
    canonicalQuestion: "What should I restock?",
    mode: "operations_preview",
    fallbackHref: "/stock/replenishment",
    operationsPreview: "replenishment",
  },
  "Which prices should I review?": {
    id: "qa_prices",
    title: "Which prices should I review?",
    quickActionKey: "Which prices should I review?",
    canonicalQuestion: "Which prices should I review?",
    mode: "assistant_fast",
    fallbackHref: "/stock/capped-pricing",
  },
  "Recommend a red wine under $30": {
    id: "qa_wine",
    title: "Recommend a red wine under $30",
    quickActionKey: "Recommend a red wine under $30",
    canonicalQuestion: "Recommend a red wine under $30",
    mode: "assistant_fast",
    fallbackHref: "/sommelier",
  },
  "Something in stock for a BBQ under $20": {
    id: "qa_bbq",
    title: "Something in stock for a BBQ under $20",
    quickActionKey: "Something in stock for a BBQ under $20",
    canonicalQuestion: "Something in stock for a BBQ under $20",
    mode: "assistant_fast",
    fallbackHref: "/recommend/grocery",
  },
  Products: {
    id: "qa_products",
    title: "Products",
    quickActionKey: "Products",
    canonicalQuestion: "",
    mode: "navigate_only",
    fallbackHref: "/products",
  },
  "Check stock": {
    id: "qa_check_stock",
    title: "Check stock",
    quickActionKey: "Check stock",
    canonicalQuestion: OPERATIONS_PREVIEW_CANONICAL.replenishment,
    mode: "operations_preview",
    fallbackHref: "/stock/replenishment",
    operationsPreview: "replenishment",
  },
};

export function shortcutForQuickAction(action: string): AssistantShortcut | null {
  return QUICK_ACTION_REGISTRY[action] ?? null;
}

/** Workspace hero cards prefer canonical preview questions; float mode keeps legacy phrasing where needed. */
export function questionForQuickAction(action: string, workspace: boolean): string | null {
  const hero = WORKSPACE_HERO_SHORTCUTS.find((item) => item.quickActionKey === action);
  if (workspace && hero) return hero.canonicalQuestion;
  const entry = shortcutForQuickAction(action);
  if (!entry || entry.mode === "navigate_only") return null;
  if (workspace && entry.operationsPreview) {
    return OPERATIONS_PREVIEW_CANONICAL[entry.operationsPreview];
  }
  return entry.canonicalQuestion || null;
}

export function fallbackHrefForQuickAction(action: string): string | null {
  const hero = WORKSPACE_HERO_SHORTCUTS.find((item) => item.quickActionKey === action);
  if (hero) return hero.fallbackHref;
  return shortcutForQuickAction(action)?.fallbackHref ?? null;
}