import type { AssistantResponse, AssistantCard } from "./api";
import { storeWeekStart } from "./assistant-business-period.ts";

export type OperationsPreview = "replenishment" | "sales_week";

/** Complete catalogue/history reads have a different latency budget from a model reply. */
export function assistantRequestTimeoutMs(question: string): number {
  return operationsPreviewIntent(question) === "replenishment" ? 120_000 : 45_000;
}

export function assistantTimeoutMessage(question: string): string {
  if (operationsPreviewIntent(question) === "replenishment") {
    return "The store's replenishment data took too long to load. No quantities were generated and no purchase order was created. Open Replenishment to review the full plan, or retry.";
  }
  return "The assistant timed out. Please retry, or open the relevant business page to check the data.";
}

/** Deliberately bounded: modified parameters, follow-ups and writes go to the normal workflow. */
export function operationsPreviewIntent(question: string): OperationsPreview | null {
  const text = question.trim().toLowerCase().replace(/[?？。.!！]+$/, "").replace(/\s+/g, " ");
  if (["analyse low stock items and suggest what to reorder", "analyze low stock items and suggest what to reorder",
    "what should i restock", "哪些商品需要补货", "低库存补货建议"].includes(text)) return "replenishment";
  if (["show me this week's sales performance", "show me this week’s sales performance",
    "this week's sales", "本周销售额", "查看本周销售表现"].includes(text)) return "sales_week";
  return null;
}

type Product = {
  id: number; name: string; unit?: string; suggestedQuantity: number;
  recommendationStatus: string; leadTimeDays?: number | null;
};
type Plan = {
  products: Product[]; coverageDays: number; reviewRequiredCount: number;
  excludedProductCount?: number; generatedAt: string; company: string;
};
type Sales = {
  period: string; revenue: number; transactions: number; currency: string;
  from: string; to: string; timezone: string; company: string;
};

class PreviewReadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function storeDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isoLocalMidnight(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  return `${parts.replaceAll("/", "-")} 00:00:00`;
}

async function readReplenishmentPlan(fetcher: typeof fetch, signal?: AbortSignal): Promise<Plan> {
  const response = await fetcher("/api/supply-chain/plan", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status !== 401 && response.status !== 403);
  const body = await response.json() as {
    data?: {
      weekStart?: string;
      weekEnd?: string;
      lines?: Array<{
        productId?: number;
        productName?: string;
        orderQty?: number;
        status?: string;
        confidenceLabel?: string;
      }>;
    };
  };
  if (!body.data || !Array.isArray(body.data.lines)) throw new Error("Incomplete replenishment response");
  const lines = body.data.lines;
  const products = lines
    .filter((line) => line.productId != null)
    .map((line) => {
      const suggested = Math.max(0, Number(line.orderQty ?? 0));
      const review = String(line.status || "").toUpperCase().includes("REVIEW")
        || String(line.confidenceLabel || "").toUpperCase().includes("REVIEW");
      return {
        id: Number(line.productId),
        name: line.productName || `Product ${line.productId}`,
        unit: "units",
        suggestedQuantity: suggested,
        recommendationStatus: review ? "REVIEW_DATA" : (suggested > 0 ? "READY" : "NO_DEMAND"),
        leadTimeDays: null,
      };
    });
  return {
    company: "Orithos",
    coverageDays: 21,
    reviewRequiredCount: products.filter((item) => item.recommendationStatus === "REVIEW_DATA").length,
    products,
    generatedAt: new Date().toISOString(),
  };
}

async function readWeekSales(fetcher: typeof fetch, signal?: AbortSignal): Promise<Sales> {
  const timezone = "Australia/Adelaide";
  const today = storeDay(timezone);
  const weekStart = storeWeekStart(new Date(), timezone);
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(weekStart);
  const params = new URLSearchParams({ from, to: today });
  const response = await fetcher(`/api/reports/native-overview?${params}`, {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status !== 401 && response.status !== 403);
  const body = await response.json() as { data?: { source?: string; revenue?: number; transactions?: number } };
  if (!body.data || body.data.source !== "orithos_ledger" || !finite(body.data.revenue) || !finite(body.data.transactions)) {
    throw new Error("Incomplete sales response");
  }
  return {
    period: "this_week",
    revenue: Number(body.data.revenue),
    transactions: Number(body.data.transactions),
    currency: "AUD",
    from: isoLocalMidnight(weekStart, timezone),
    to: `${today} 00:00:00`,
    timezone,
    company: "Orithos",
  };
}

/** Uses the same tenant/session-scoped read endpoints as the business pages. Never sends a write. */
export async function readOperationsPreview(
  question: string, threadId?: string | null, signal?: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AssistantResponse | null> {
  const intent = operationsPreviewIntent(question);
  if (!intent) return null;
  const chinese = /[\u3400-\u9fff]/.test(question);
  const route = intent === "replenishment" ? "/purchases?tab=replenishment" : "/reports/dashboard";
  const title = intent === "replenishment" ? "Replenishment suggestions" : "This week's sales";
  const card: AssistantCard = {
    type: intent === "replenishment" ? "replenishment" : "sales",
    title, ctaRoute: route,
    ctaLabel: intent === "replenishment" ? "Review replenishment" : "Open sales dashboard",
    source: "Orithos", status: "ready",
  };
  let dataAsOf: string | undefined;
  try {
    if (intent === "replenishment") {
      const plan = await readReplenishmentPlan(fetcher, signal);
      if (!Array.isArray(plan.products) || !finite(plan.coverageDays) || !finite(plan.reviewRequiredCount)
        || !plan.generatedAt || !plan.company) throw new Error("Incomplete replenishment response");
      const eligible = plan.products.filter((item) => item.recommendationStatus === "READY"
        && finite(item.suggestedQuantity) && item.suggestedQuantity > 0);
      card.status = plan.reviewRequiredCount > 0 ? "partial" : eligible.length ? "ready" : "empty";
      card.summary = chinese
        ? `${plan.company}：${eligible.length} 个商品有补货建议，覆盖 ${plan.coverageDays} 天。${plan.reviewRequiredCount} 个商品资料需复核，已排除。仅供预览，未创建采购单。`
        : `${plan.company}: ${eligible.length} ${eligible.length === 1 ? "product has" : "products have"} suggestions for ${plan.coverageDays}-day cover. ${plan.reviewRequiredCount} products need data review and are excluded. Preview only; no purchase order created.`;
      if (eligible.some((item) => item.leadTimeDays == null)) {
        card.summary += chinese ? " 部分供应商交期未知，请在采购前核实。" : " Some supplier lead times are unknown; verify before purchasing.";
      }
      if (!eligible.length && plan.reviewRequiredCount > 0) {
        card.summary += chinese ? " 暂无可用数量，不能据此判断无需补货。" : " No eligible quantities are available; this does not mean no replenishment is needed.";
      }
      card.items = eligible.slice(0, 3).map((item) => ({
        id: item.id, label: `${item.name} — ${chinese ? "建议" : "suggested"} ${item.suggestedQuantity} ${item.unit ?? "units"}`,
      }));
      dataAsOf = plan.generatedAt;
    } else {
      const sales = await readWeekSales(fetcher, signal);
      if (sales.period !== "this_week" || !finite(sales.revenue) || !finite(sales.transactions)
        || !sales.from || !sales.to || !sales.timezone || !sales.company || !sales.currency) {
        throw new Error("Incomplete sales response");
      }
      const date = (value: string) => new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-AU", {
        timeZone: sales.timezone, day: "numeric", month: "short", year: "numeric",
      }).format(new Date(`${value.replace(" ", "T")}Z`));
      const amount = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", { style: "currency", currency: sales.currency }).format(sales.revenue);
      card.summary = chinese
        ? `${sales.company}：本周净销售额 ${amount}，${sales.transactions} 笔销售。包含已退销售金额，含适用 GST。\n${date(sales.from)} 至 ${date(sales.to)}（${sales.timezone}，截至当前）。`
        : `${sales.company}: net sales ${amount} from ${sales.transactions} sales. Net sales include refunds and applicable GST.\n${date(sales.from)} – ${date(sales.to)} (${sales.timezone}, week to date).`;
      dataAsOf = `${sales.to.replace(" ", "T")}Z`;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    card.status = "unavailable";
    const retryable = error instanceof PreviewReadError ? error.retryable : true;
    card.retryable ??= retryable;
    card.summary ??= !retryable
      ? chinese ? "登录已过期或无权查看，请重新登录或联系管理员。" : "Sign in again or ask your administrator for access."
      : chinese
        ? "业务数据暂时无法读取，未生成数值。请重试或打开业务页面核查。"
        : "Business data could not be loaded. No figures were generated. Retry or open the business page to check.";
  }
  return {
    threadId: threadId ?? "", intent: intent === "sales_week" ? "report_sales" : "navigate",
    intentSummary: title, answer: card.summary ?? title, slots: {}, ui: null, cards: [card],
    writeRequests: [], source: "Orithos · read-only", dataAsOf, fastPathId: `operations_${intent}`, llmFallback: false,
  };
}
